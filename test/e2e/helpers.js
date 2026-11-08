import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dtr-e2e-'));
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

export const employeeButtons = (page) => page.getByRole('navigation', { name: 'Employees' }).getByRole('button');

export async function importHrmo(app, page) {
  const dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByLabel('Office for HRMO (3).xls').fill('HRMO');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('heading', { name: 'HRMO' }).waitFor();
}
