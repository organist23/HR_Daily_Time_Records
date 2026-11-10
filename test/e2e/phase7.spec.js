import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, launch, importHrmo } from './helpers.js';

// US-5 Changed 2026-11-10: grace defaults to 0, and existing offices are set to 0 after a copy of the data.
// Hand-derived from sample_data/HRMO (3).xls raw rows:
//   RONIE (568) 7/02 in 08:01 and 13:02 → 1 + 2 = 3 min late.
//   LAZARO (611) 7/06 in 08:08 and 13:06 → 8 + 6 = 14 min late. At grace 15 both were 0.

const graceCopies = (dir) => fs.readdirSync(dir).filter((f) => f.startsWith('dtr-data-before-grace-0-'));
const dataPath = (dir) => path.join(dir, 'dtr-data.json');
const minutesCell = (page, day) => page.locator(`.dtr-form tr[data-day="${day}"] td`).nth(6);

async function openFirstHalf(page, name) {
  await page.getByRole('button', { name }).click();
  await page.getByRole('radio', { name: '1–15' }).check();
}

// Office settings shows only with an employee open.
async function graceShown(page) {
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('button', { name: 'Office settings' }).click();
  const od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
  const value = await od.getByLabel('Grace minutes').inputValue();
  await page.keyboard.press('Escape');
  await expect(od).toHaveCount(0);
  return value;
}

// A data file as the app saved it before this phase: version 1, HRMO at grace 15.
async function writeVersion1Data(dir) {
  const { app, page } = await launch(dir);
  await importHrmo(app, page);
  await app.close();
  const d = JSON.parse(fs.readFileSync(dataPath(dir), 'utf8'));
  d.version = 1;
  d.offices.HRMO.graceMinutes = 15;
  fs.writeFileSync(dataPath(dir), JSON.stringify(d));
  return fs.readFileSync(dataPath(dir));
}

test('US-5 a new office gets grace 0, so 8:01 is 1 minute late', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    await importHrmo(app, page);
    expect(await graceShown(page)).toBe('0');
    await openFirstHalf(page, /RONIE LOUISE BERMUDEZ/);
    await expect(minutesCell(page, 2)).toHaveText('3');
    await openFirstHalf(page, /JOHN RYAN A\. LAZARO/);
    await expect(minutesCell(page, 6)).toHaveText('14');
  } finally {
    await app.close();
  }
});

test('US-5 existing offices are set to grace 0 once, after a copy of the data', async () => {
  const dir = tmpDir();
  const before = await writeVersion1Data(dir);
  expect(graceCopies(dir)).toHaveLength(0);

  let { app, page } = await launch(dir);
  try {
    expect(await graceShown(page)).toBe('0');
    await openFirstHalf(page, /JOHN RYAN A\. LAZARO/);
    await expect(minutesCell(page, 6)).toHaveText('14');
  } finally {
    await app.close();
  }
  // The copy holds the file exactly as it was, and the data file is now version 2.
  const copies = graceCopies(dir);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatch(/^dtr-data-before-grace-0-\d{8}-\d{6}\.json$/);
  expect(fs.readFileSync(path.join(dir, copies[0])).equals(before)).toBe(true);
  expect(JSON.parse(fs.readFileSync(dataPath(dir), 'utf8')).version).toBe(2);

  // A grace the admin sets after the update stays, and no second copy is made.
  ({ app, page } = await launch(dir));
  try {
    await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
    await page.getByRole('button', { name: 'Office settings' }).click();
    const od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
    await od.getByLabel('Grace minutes').fill('15');
    await od.getByRole('button', { name: 'Save' }).click();
    await expect(od).toHaveCount(0);
  } finally {
    await app.close();
  }
  ({ app, page } = await launch(dir));
  try {
    expect(await graceShown(page)).toBe('15');
  } finally {
    await app.close();
  }
  expect(graceCopies(dir)).toHaveLength(1);
});

test('US-5 a broken version 1 data file shows an error and is left as it was', async () => {
  const dir = tmpDir();
  const broken = Buffer.from('{"version":1}'); // no offices map
  fs.writeFileSync(dataPath(dir), broken);
  const { app, page } = await launch(dir);
  try {
    await expect(page.getByText(/Could not update .*dtr-data\.json to grace 0/)).toBeVisible();
  } finally {
    await app.close();
  }
  expect(fs.readFileSync(dataPath(dir)).equals(broken)).toBe(true);
  expect(graceCopies(dir)).toHaveLength(0);
});

test('US-5 restoring a backup made before the update sets grace 0', async () => {
  const dir = tmpDir();
  const backup = path.join(tmpDir(), 'old-backup.json');
  const { app, page } = await launch(dir);
  try {
    await importHrmo(app, page);
    // A backup as the old app wrote it: data version 1, HRMO at grace 15.
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, backup);
    await page.getByRole('button', { name: 'Backup', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Backup saved');
    const file = JSON.parse(fs.readFileSync(backup, 'utf8'));
    file.data.version = 1;
    file.data.offices.HRMO.graceMinutes = 15;
    fs.writeFileSync(backup, JSON.stringify(file));

    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Restore backup' }).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status')).toContainText('Restored the backup.');
    expect(await graceShown(page)).toBe('0');
  } finally {
    await app.close();
  }
});
