import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { loadData, saveData, mergeImport, resolveOffice } from '../src/lib/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DTR_DATA_DIR || app.getPath('userData');
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
  for (const { path: file, office: typed } of items) {
    const result = { file: path.basename(String(file)), office: '', ok: false, added: 0, updated: 0, skipped: 0, error: '' };
    try {
      if (!picked.has(file) || !/\.xlsx?$/i.test(file)) throw new Error('File was not selected for import');
      const { records, skipped } = parseRows(readSheetRows(fs.readFileSync(file)));
      const office = resolveOffice(data, typed);
      Object.assign(result, { office, ok: true, skipped }, mergeImport(data, office, records));
      changed = true;
    } catch (e) {
      result.error = e.message;
    }
    results.push(result);
  }
  if (changed) saveData(dataDir, data);
  return { results, data };
});

app.whenReady().then(() => {
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
