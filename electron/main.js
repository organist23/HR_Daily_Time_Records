import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import {
  loadData, saveData, migrateGrace, mergeImport, resolveOffice, updateOffice, setHoliday, deleteHoliday, adjustDay, revertDay,
  setArchived, deleteEmployee, deleteOffice, makeBackup, readBackup,
} from '../src/lib/store.js';
import { adjustedDayCount } from '../src/lib/dtr.js';

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

// Applies a change to a copy, saves it, and only then makes it the current data.
function mutate(change) {
  if (loadError) throw new Error(loadError);
  const next = structuredClone(data);
  change(next);
  saveData(dataDir, next);
  data = next;
  return data;
}

ipcMain.handle('update-office', (_event, office, patch) => mutate((d) => updateOffice(d, String(office), patch ?? {})));
ipcMain.handle('save-holiday', (_event, holiday, originalDate) =>
  mutate((d) => setHoliday(d, holiday ?? {}, originalDate ? String(originalDate) : undefined)));
ipcMain.handle('delete-holiday', (_event, date) => mutate((d) => deleteHoliday(d, String(date))));
// The adjustment time comes from main's clock, not the renderer.
ipcMain.handle('adjust-day', (_event, day) => mutate((d) => adjustDay(d, day ?? {}, new Date().toISOString())));
ipcMain.handle('revert-day', (_event, day) => mutate((d) => revertDay(d, day ?? {})));
// Archive or restore an employee (acNo given) or an office. Arguments are coerced: the renderer is not trusted.
ipcMain.handle('set-archived', (_event, target) => {
  const { office, acNo, archived } = target ?? {};
  return mutate((d) => setArchived(d, { office: String(office), acNo: acNo == null ? undefined : String(acNo), archived: archived === true }));
});
ipcMain.handle('delete-employee', (_event, target) => {
  const { office, acNo } = target ?? {};
  return mutate((d) => deleteEmployee(d, { office: String(office), acNo: String(acNo) }));
});
ipcMain.handle('delete-office', (_event, office) => mutate((d) => deleteOffice(d, String(office))));

const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

// Backup and restore. Main writes only to the path picked in the save dialog and to a copy inside the data folder.
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const pad = (n) => String(n).padStart(2, '0');
let pendingRestore = null; // { data, copy } checked by readBackup; the renderer never sends data to restore
const currentFile = path.join(dataDir, 'dtr-data.json');
const copyName = (t, what = 'restore') => `dtr-data-before-${what}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}.json`;
// Copies the data file byte for byte. Never overwrites an earlier copy: adds -2, -3, … when the name is taken.
const copyCurrent = (name) => {
  const base = name.replace(/\.json$/, '');
  let copy = `${base}.json`;
  for (let n = 2; fs.existsSync(path.join(dataDir, copy)); n++) copy = `${base}-${n}.json`;
  fs.copyFileSync(currentFile, path.join(dataDir, copy), fs.constants.COPYFILE_EXCL);
  return copy;
};

// Grace default 0 (US-5, 2026-11-10): version 1 data is copied first, then every office is set to 0 once.
// Only the instance holding the lock writes. migrateGrace returns true only for data read from currentFile.
if (hasLock && data) {
  try {
    if (migrateGrace(data)) {
      copyCurrent(copyName(new Date(), 'grace-0'));
      saveData(dataDir, data);
    }
  } catch (e) {
    data = null;
    loadError = `Could not update ${currentFile} to grace 0: ${e.message}`;
  }
}

ipcMain.handle('backup', async (event) => {
  if (loadError) throw new Error(loadError);
  const t = new Date();
  const res = await dialog.showSaveDialog(windowOf(event), {
    defaultPath: path.join(app.getPath('documents'), `DTR-backup-${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}.json`),
    filters: [{ name: 'DTR backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, makeBackup(data, t.toISOString()));
  return { path: res.filePath };
});

// Reads and checks the picked file. Nothing changes until restore-apply.
ipcMain.handle('restore-pick', async (event) => {
  pendingRestore = null;
  const res = await dialog.showOpenDialog(windowOf(event), {
    properties: ['openFile'],
    filters: [{ name: 'DTR backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const file = res.filePaths[0];
  if (fs.statSync(file).size > MAX_BACKUP_BYTES) throw new Error('Invalid backup: file is larger than 50 MB');
  const { data: restored, savedAt } = readBackup(fs.readFileSync(file, 'utf8'));
  // The copy name shown in the confirmation. No copy when there is no data file yet (first run).
  const copy = fs.existsSync(currentFile) ? copyName(new Date()) : null;
  pendingRestore = { data: restored, copy };
  const count = (m) => Object.keys(restored[m]).length;
  return {
    file: path.basename(file), savedAt, copy,
    counts: {
      offices: count('offices'), employees: count('employees'), punches: count('punches'),
      adjustedDays: adjustedDayCount(Object.keys(restored.adjustments)), holidays: count('holidays'),
    },
  };
});

ipcMain.handle('restore-cancel', () => {
  pendingRestore = null;
});

// Copies the current data file byte for byte, then replaces the data with the checked backup.
// The picked backup stays until the restore succeeds, so a failed one can be retried.
ipcMain.handle('restore-apply', () => {
  if (!pendingRestore) throw new Error('No backup picked');
  let copy = null;
  if (fs.existsSync(currentFile)) { // checked now, not at pick time
    copy = copyCurrent(pendingRestore.copy ?? copyName(new Date()));
  }
  saveData(dataDir, pendingRestore.data);
  data = pendingRestore.data;
  pendingRestore = null;
  loadError = null;
  return { data, copy };
});

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
