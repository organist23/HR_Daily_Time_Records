import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// All E2E temp folders live under one root that global-teardown.js deletes after the run.
export const E2E_ROOT = path.join(os.tmpdir(), 'dtr-e2e');
export const tmpDir = () => {
  fs.mkdirSync(E2E_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(E2E_ROOT, 'run-'));
};
export const HRMO = path.resolve('sample_data/HRMO (3).xls');

export async function launch(dataDir) {
  const env = { ...process.env, DTR_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE; // set when launched from inside VS Code; makes Electron act as plain Node
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  return { app, page };
}

// The OS file dialog is the outer boundary; replace it with fixed paths.
export async function importFiles(app, page, files) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, files);
  await page.getByRole('button', { name: 'Import Excel' }).click();
  return page.getByRole('dialog', { name: 'Import Excel files' });
}

// US-14: undertime and total are hidden at every start. Shows them (no-op when already shown).
export async function showTotals(page) {
  const toggle = page.getByRole('button', { name: /^(Show|Hide) undertime and total$/ });
  await toggle.waitFor(); // the preview toolbar has rendered
  if ((await toggle.textContent()).startsWith('Show')) await toggle.click();
  await page.getByRole('button', { name: 'Hide undertime and total' }).waitFor();
}

export const employeeButtons = (page) => page.getByRole('navigation', { name: 'Employees' }).getByRole('button');

export async function importHrmo(app, page) {
  const dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByLabel('Office for HRMO (3).xls').fill('HRMO');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('heading', { name: 'HRMO' }).waitFor();
}
