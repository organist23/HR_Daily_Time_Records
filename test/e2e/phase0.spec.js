import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
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
  const rows = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(HRMO)).Sheets.Sheet1, { header: 1, raw: false, defval: '' });
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
