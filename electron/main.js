import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { loadData, saveData, mergeImport, resolveOffice, updateOffice } from '../src/lib/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The single-instance lock is per userData folder, so it guards exactly this data file.
if (process.env.DTR_DATA_DIR) app.setPath('userData', process.env.DTR_DATA_DIR);
const dataDir = app.getPath('userData');
const picked = new Set(); // only files the admin chose in the OS dialog may be read
let data = null;
let loadError = null;

try {
  data = loadData(dataDir);
} catch (e) {
  loadError = `Could not read ${path.join(dataDir, 'dtr-data.json')}: ${e.message}`;
}

ipcMain.handle('load-data', () => {
  if (loadError) throw new Error(loadError);
  return data;
});

ipcMain.handle('pick-excel-files', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }],
  });
  if (res.canceled) return [];
  res.filePaths.forEach((p) => picked.add(p));
  return res.filePaths;
});

ipcMain.handle('import-files', (_event, items) => {
  if (loadError) throw new Error(loadError);
  const results = [];
  let changed = false;
  const next = structuredClone(data); // memory changes only after the save succeeds
  for (const { path: file, office: typed } of items) {
    const result = { file: path.basename(String(file)), office: '', ok: false, added: 0, updated: 0, skipped: 0, error: '' };
    try {
      if (!picked.has(file) || !/\.xlsx?$/i.test(file)) throw new Error('File was not selected for import');
      const { records, skipped } = parseRows(readSheetRows(fs.readFileSync(file)));
      const office = resolveOffice(next, typed);
      Object.assign(result, { office, ok: true, skipped }, mergeImport(next, office, records));
      changed = true;
    } catch (e) {
      result.error = e.message;
    }
    results.push(result);
  }
  if (changed) {
    saveData(dataDir, next);
    data = next;
  }
  return { results, data };
});

// A second instance would hold its own copy of the data and overwrite this one's saves.
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

ipcMain.handle('update-office', (_event, office, patch) => {
  if (loadError) throw new Error(loadError);
  const next = structuredClone(data);
  updateOffice(next, String(office), patch ?? {});
  saveData(dataDir, next);
  data = next;
  return data;
});

const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

ipcMain.handle('print', (event) => new Promise((resolve) => {
  windowOf(event).webContents.print(
    { printBackground: true, pageSize: 'A4', landscape: false, margins: { marginType: 'none' } },
    (ok, reason) => resolve({ ok, error: ok ? '' : reason }),
  );
}));

// Writes only to the path the admin picks in the save dialog.
ipcMain.handle('export-pdf', async (event, suggestedName) => {
  const win = windowOf(event);
  // Replace path and reserved characters first, so a name like "HR/Admin" stays whole.
  const name = String(suggestedName || 'DTR.pdf').replace(/[\\/:*?"<>|]/g, '-');
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return null;
  // printToPDF takes margins in inches (marginType is a print() option); the .page box holds the form margins.
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  fs.writeFileSync(res.filePath, pdf);
  return { path: res.filePath };
});

app.whenReady().then(() => {
  if (!hasLock) return; // quitting: the running instance gets focus instead
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Employees DTR Analyzer',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(here, '..', 'dist', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
