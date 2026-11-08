import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { readSheetRows } from '../../src/lib/parse.js';
import { tmpDir, HRMO, launch, importFiles, employeeButtons } from './helpers.js';

test('US-1 import per office, persist, re-import, bad files', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  await expect(page.getByText('No records yet. Import an Excel file to start.')).toBeVisible();

  let dlg = await importFiles(app, page, [HRMO]);
  await expect(dlg.getByLabel('Office for HRMO.xls')).toHaveValue('HRMO');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('status')).toContainText('HRMO.xls: 154 added, 0 updated, 0 skipped');
  await expect(page.getByRole('heading', { name: 'HRMO' })).toBeVisible();
  await expect(employeeButtons(page)).toHaveCount(11);

  await app.close();
  ({ app, page } = await launch(dir));
  await expect(employeeButtons(page)).toHaveCount(11);

  dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('status')).toContainText('HRMO.xls: 0 added, 154 updated, 0 skipped');
  await expect(employeeButtons(page)).toHaveCount(11);

  const bad = path.join(tmpDir(), 'bad.xls');
  fs.writeFileSync(bad, Buffer.from([0, 1, 2, 3, 255, 254, 9, 9, 0]));
  const rows = readSheetRows(fs.readFileSync(HRMO));
  const noOut = path.join(tmpDir(), 'noout.xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.map((r) => r.filter((_, i) => i !== 7))), 'Sheet1');
  fs.writeFileSync(noOut, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  dlg = await importFiles(app, page, [bad, HRMO, noOut]);
  await dlg.getByLabel('Office for noout.xlsx').fill('Accounting');
  await dlg.getByRole('button', { name: 'Import' }).click();
  const status = page.getByRole('status');
  await expect(status.locator('.err', { hasText: 'bad.xls:' })).toHaveCount(1);
  await expect(status).toContainText('HRMO.xls: 0 added, 154 updated');
  await expect(status).toContainText('noout.xlsx: Missing columns: Clock Out');
  await expect(employeeButtons(page)).toHaveCount(11);
  await expect(page.getByRole('heading', { name: 'Accounting' })).toHaveCount(0);
  await app.close();
});

test('US-1 cancel import with Escape saves nothing', async () => {
  const { app, page } = await launch(tmpDir());
  const dlg = await importFiles(app, page, [HRMO]);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText('No records yet. Import an Excel file to start.')).toBeVisible();
  await app.close();
});

test('US-3 preview single-copy DTR for a period', async () => {
  const { app, page } = await launch(tmpDir());
  await expect(page.getByText('No records yet. Import an Excel file to start.')).toBeVisible();
  const dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Select an employee to preview their DTR.')).toBeVisible();

  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  const form = page.locator('.dtr-form');
  await expect(form).toHaveCount(1);
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('7');
  await expect(page.getByLabel('Year', { exact: true })).toHaveValue('2026');
  // Partial year while typing must not change the period.
  await page.getByLabel('Year', { exact: true }).fill('20');
  await expect(form).toContainText('July 2026');
  await page.getByLabel('Year', { exact: true }).fill('2026');
  await page.getByRole('radio', { name: '1–15' }).check();
  await expect(form).toContainText('For the period of July 1-15, 2026');
  await expect(form).toContainText('RONIE LOUISE BERMUDEZ');
  await expect(form).toContainText('8:00-12:00, 1:00-5:00');
  const day1 = form.locator('tr[data-day="1"] td');
  await expect(day1.nth(1)).toHaveText('8:00');
  await expect(day1.nth(2)).toHaveText('');
  await expect(day1.nth(5)).toHaveText('4');
  await expect(form.locator('tr[data-day]')).toHaveCount(15);

  await page.getByRole('radio', { name: '16–31' }).check();
  await expect(form).toContainText('For the period of July 16-31, 2026');
  await expect(form.locator('tr[data-day="1"]')).toHaveCount(0);
  await expect(form.locator('tr[data-day]')).toHaveCount(16);

  await page.getByRole('radio', { name: 'Full month' }).check();
  await expect(form).toContainText('For the month of July 2026');
  await expect(form.locator('tr[data-day]')).toHaveCount(31);
  expect((await form.boundingBox()).height).toBeLessThanOrEqual(10.69 * 96 + 1);

  await page.getByRole('button', { name: /RELITA BARAYA/ }).click();
  await page.getByRole('radio', { name: '1–15' }).check();
  await expect(form.locator('tr.total')).toContainText('6 days');
  await expect(form.locator('tr.total td').nth(1)).toHaveText('4');
  // Total undertime must sit in the Hours column, not shift left.
  const hoursHead = await form.locator('th', { hasText: /^Hours$/ }).boundingBox();
  const hoursTotal = await form.locator('tr.total td').nth(1).boundingBox();
  expect(Math.abs(hoursTotal.x - hoursHead.x)).toBeLessThan(2);

  // One A4 page: content height = 11.69in - 1in margins at 96px/in.
  const box = await form.boundingBox();
  expect(box.height).toBeLessThanOrEqual(10.69 * 96 + 1);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1300, 1300));
  await page.locator('.page').screenshot({ path: 'test-results/phase0-preview.png' });
  await app.close();
});
