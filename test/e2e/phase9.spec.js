import { test, expect } from '@playwright/test';
import path from 'node:path';
import { tmpDir, launch, importFiles, showTotals } from './helpers.js';

// US-13 Changed 2026-11-10. Hand-derived from sample_data/GSO_.xls raw rows (RENATO NUESTRO JR #519), grace 0:
//   10/05 night guard 1 In 16:04. 10/06 night guard 2 In 05:57, Out blank (device files a pre-06:00 punch as Clock In).
//   The 05:57 is the departure: 17:00 → 24:00 = 420, 00:00 → 05:57 = 357, 3 min early. Before the fix 10/05 had 13h undertime.
const GSO = path.resolve('sample_data/GSO_.xls');
const cell = (page, day, i) => page.locator(`.dtr-form tr[data-day="${day}"] td`).nth(i); // 1 amIn … 4 pmOut, 5 h, 6 min

test('US-13 a night A.M. Clock In before 06:00 counts as the departure', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    const dlg = await importFiles(app, page, [GSO]);
    await dlg.getByLabel('Office for GSO_.xls').fill('GSO');
    await dlg.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('status')).toContainText('GSO_.xls: 2851 added, 0 updated, 0 skipped');

    await page.getByRole('button', { name: /RENATO NUESTRO JR/ }).click();
    await showTotals(page);
    await page.getByLabel('Month', { exact: true }).selectOption('10');
    await page.getByLabel('Year', { exact: true }).fill('2026');
    await page.getByRole('radio', { name: '1–15' }).check();
    await expect(cell(page, 5, 3)).toHaveText('4:04');
    await expect(cell(page, 5, 5)).toHaveText(''); // no 13h missing-departure undertime
    await expect(cell(page, 6, 1)).toHaveText('');
    await expect(cell(page, 6, 2)).toHaveText('5:57');
    await expect(cell(page, 6, 6)).toHaveText('3');
    // The Adjust dialog sees the same departure as the form (fixed at import, not only on screen).
    await page.getByRole('button', { name: 'Adjust October 6, 2026' }).click();
    const adj = page.getByRole('dialog', { name: 'Adjust time — October 6, 2026' });
    await expect(adj.getByLabel('A.M. arrival')).toHaveValue('');
    await expect(adj.getByLabel('A.M. departure')).toHaveValue('05:57');
    await page.keyboard.press('Escape');
    await expect(adj).toHaveCount(0);
  } finally {
    await app.close();
  }
});
