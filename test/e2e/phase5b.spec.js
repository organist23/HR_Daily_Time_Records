import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, launch, importHrmo, employeeButtons } from './helpers.js';

// The OS dialogs are the outer boundary.
const mockSave = (app, p) => app.evaluate(({ dialog }, file) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
}, p);
const mockOpen = (app, p) => app.evaluate(({ dialog }, file) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
}, p);
const copies = (dir) => fs.readdirSync(dir).filter((f) => f.startsWith('dtr-data-before-restore-'));
const dataFile = (dir) => fs.readFileSync(path.join(dir, 'dtr-data.json'), 'utf8');

const openRonieFirstHalf = async (page) => {
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('radio', { name: '1–15' }).check();
};
const julyHolidays = async (page) => {
  await page.getByRole('button', { name: 'Holidays' }).click();
  const view = page.getByRole('region', { name: 'Holidays' });
  await view.getByLabel('Month', { exact: true }).selectOption('7');
  await view.getByLabel('Year', { exact: true }).fill('2026');
};

test('US-12 backup, delete everything, restore with a copy first, reject bad files', async () => {
  const dir = tmpDir();
  const out = tmpDir(); // where the admin keeps backups
  let { app, page } = await launch(dir);
  try {
    await importHrmo(app, page);
    const status = page.getByRole('status');
    const form = page.locator('.dtr-form');

    // Data to bring back: a holiday, an adjustment, an in-charge name, and an archived employee.
    await julyHolidays(page);
    await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
    let hd = page.getByRole('dialog', { name: 'Holiday — Add' });
    await hd.getByLabel('Name').fill('Test Holiday');
    await hd.getByLabel('Type').selectOption('Regular Holiday');
    await hd.getByRole('button', { name: 'Save' }).click();
    await openRonieFirstHalf(page);
    await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
    const adj = page.getByRole('dialog', { name: 'Adjust time — July 1, 2026' });
    await adj.getByLabel('A.M. departure').fill('12:00');
    await adj.getByLabel('P.M. arrival').fill('13:00');
    await adj.getByLabel('P.M. departure').fill('17:00');
    await adj.getByLabel('Reason').fill('Work from home');
    await adj.getByRole('button', { name: 'Save' }).click();
    // RONIE July 1-15 with the fix: 3 days (Phase 3). The 7/03 holiday drops 7/03's 480 → 1200 → 2 days.
    await expect(form.locator('tr.total')).toContainText('2 days');
    await page.getByRole('button', { name: 'Office settings' }).click();
    const od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
    await od.getByLabel('In-charge name').fill('JUAN DELA CRUZ');
    await od.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: /#2025204/ }).click();
    await page.getByRole('button', { name: 'Archive employee' }).click();
    await expect(employeeButtons(page)).toHaveCount(10);

    // Backup to a file the admin picks.
    const backupPath = path.join(out, 'backup.json');
    await mockSave(app, backupPath);
    await page.getByRole('button', { name: 'Backup', exact: true }).click();
    await expect(status).toContainText('Backup saved: backup.json');
    const saved = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    expect(Object.keys(saved.data.offices)).toEqual(['HRMO']);
    expect(Object.keys(saved.data.employees)).toHaveLength(11);
    expect(Object.keys(saved.data.punches)).toHaveLength(154);

    // Delete everything: the office (archive, then delete in Archived) and the holiday.
    await page.getByRole('button', { name: /RELITA BARAYA/ }).click();
    await page.getByRole('button', { name: 'Office settings' }).click();
    await page.getByRole('dialog', { name: 'Office settings — HRMO' }).getByRole('button', { name: 'Archive office' }).click();
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    await page.getByRole('region', { name: 'Archived' }).getByRole('button', { name: 'Delete office HRMO' }).click();
    await page.getByRole('alertdialog', { name: 'Delete office' }).getByRole('button', { name: 'Delete office' }).click();
    await julyHolidays(page);
    await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
    hd = page.getByRole('dialog', { name: 'Holiday — Edit' });
    await hd.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No holidays this month.')).toBeVisible();
    await expect(page.getByText('No records yet. Import an Excel file to start.')).toBeVisible();
    const before = dataFile(dir);

    // Restore asks first, naming what comes back and the copy. Cancel changes nothing and writes no copy.
    await mockOpen(app, backupPath);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    const dlg = page.getByRole('alertdialog', { name: 'Restore backup' });
    await expect(dlg).toContainText('Replace all current data with the backup backup.json saved');
    await expect(dlg).toContainText('It has 1 office, 11 employees, 154 punches, 1 adjusted day, 1 holiday.');
    await expect(dlg).toContainText(/The current data will first be copied to dtr-data-before-restore-\d{8}-\d{6}\.json in the data folder\./);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toHaveCount(0);
    expect(copies(dir)).toEqual([]);
    expect(dataFile(dir)).toBe(before);
    await expect(page.getByText('No records yet. Import an Excel file to start.')).toBeVisible();

    // Confirm: the old file is copied byte for byte, then everything comes back.
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await dlg.getByRole('button', { name: 'Restore' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(status).toContainText(/Restored the backup\. Previous data copied to dtr-data-before-restore-\d{8}-\d{6}\.json\./);
    expect(copies(dir)).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, copies(dir)[0]), 'utf8')).toBe(before);
    await expect(employeeButtons(page)).toHaveCount(10); // #2025204 still archived
    await openRonieFirstHalf(page);
    await expect(form.locator('tr.total')).toContainText('2 days');
    await expect(form.locator('tr[data-day="1"] td').nth(2)).toHaveText('12:00'); // the 7/01 adjustment is back
    await expect(form.locator('tr[data-day="3"] .label-cell')).toHaveText('REGULAR HOLIDAY');
    await expect(page.getByLabel('In charge (this print)')).toHaveValue('JUAN DELA CRUZ');
    await app.close();

    // It persists after a relaunch.
    ({ app, page } = await launch(dir));
    await expect(employeeButtons(page)).toHaveCount(10);
    const restored = dataFile(dir);

    // Invalid and truncated files: an error, no dialog, no copy, data unchanged.
    const bad = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    bad.data.punches['HRMO|14|2026-07-01|AM'].in = '25:00';
    const badPath = path.join(out, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify(bad));
    await mockOpen(app, badPath);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Could not restore: Invalid backup: punch (HRMO|14|2026-07-01|AM)');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    const cutPath = path.join(out, 'cut.json');
    fs.writeFileSync(cutPath, fs.readFileSync(backupPath, 'utf8').slice(0, 500));
    await mockOpen(app, cutPath);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Could not restore: Invalid backup: not a JSON file');
    expect(copies(dir)).toHaveLength(1);
    expect(dataFile(dir)).toBe(restored);
    await expect(employeeButtons(page)).toHaveCount(10);

    // A second restore adds a second copy and never overwrites the first.
    const firstCopy = copies(dir)[0];
    const firstCopyText = fs.readFileSync(path.join(dir, firstCopy), 'utf8');
    await mockOpen(app, backupPath);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Restore backup' }).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status')).toContainText('Restored the backup.');
    expect(copies(dir)).toHaveLength(2);
    expect(fs.readFileSync(path.join(dir, firstCopy), 'utf8')).toBe(firstCopyText);
  } finally {
    await app.close();
  }
});
