import { test, expect } from '@playwright/test';
import path from 'node:path';
import { tmpDir, launch, importFiles, showTotals } from './helpers.js';

// US-13 night shift. Hand-derived from sample_data/NIGHT_shift.xls (EFREN ALCANTARA #479), grace 0 (default):
//   a shift is P.M. 17:00-23:59 (Clock In) on day D + A.M. 01:00-06:00 (Clock Out) on D+1, credited through midnight.
//   9/02 17:12 → 9/03 06:01 = 408 + 360, 12 late.  9/04 16:44 → 9/05 (Sat) 06:00 = 420 + 360.
//   9/06 17:19 → 9/07 = 401 + 360.  9/08 16:52 → 9/09 = 420 + 360.  9/10 17:30 → 9/11 06:02 = 390 + 360.
//   9/12 17:06 → 9/13 = 414 + 360.  9/14 17:11 → no 9/15 departure: 0 credit, 780 undertime on 9/14.
//   9/01 06:00 has no 8/31 start: day rule, 300 undertime.
//   Credit 4,613 → 9 days. Undertime 300 + 12 + 19 + 30 + 6 + 780 = 1,147 = 19h 7m.
const NIGHT = path.resolve('sample_data/NIGHT_shift.xls');
const cell = (page, day, i) => page.locator(`.dtr-form tr[data-day="${day}"] td`).nth(i); // 1 amIn … 4 pmOut, 5 h, 6 min
const total = (page) => page.locator('.dtr-form tr.total');

async function openEfren(page) {
  await page.getByRole('button', { name: /EFREN ALCANTARA/ }).click();
  await showTotals(page);
  await page.getByLabel('Month', { exact: true }).selectOption('9');
  await page.getByLabel('Year', { exact: true }).fill('2026');
  await page.getByRole('radio', { name: '1–15' }).check();
}

test('US-13 night shift imports, credits across midnight, shows weekends and holidays, and adjusts', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    const dlg = await importFiles(app, page, [NIGHT]);
    await dlg.getByLabel('Office for NIGHT_shift.xls').fill('SECURITY');
    await dlg.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('status')).toContainText('NIGHT_shift.xls: 30 added, 0 updated, 0 skipped');

    await openEfren(page);
    await expect(page.locator('.dtr-form')).toContainText('1:00-6:00, 5:00-11:59');
    await expect(cell(page, 2, 3)).toHaveText('5:12'); // 9/02 P.M. arrival
    await expect(cell(page, 2, 6)).toHaveText('12'); // 12 min late
    await expect(cell(page, 3, 2)).toHaveText('6:01'); // 9/03 A.M. departure
    // Saturday 9/05 and Sunday 9/06 show the guard's times, not the label.
    await expect(cell(page, 5, 2)).toHaveText('6:00');
    await expect(page.locator('.dtr-form tr[data-day="5"]')).not.toContainText('SATURDAY');
    await expect(cell(page, 6, 3)).toHaveText('5:19');
    // 9/14 arrival with no departure: the whole 13h shift is undertime.
    await expect(cell(page, 14, 3)).toHaveText('5:11');
    await expect(cell(page, 14, 5)).toHaveText('13');
    await expect(total(page)).toContainText('9 days');
    await expect(total(page).locator('td').nth(1)).toHaveText('19');
    await expect(total(page).locator('td').nth(2)).toHaveText('7');

    // A holiday on 9/08 keeps the night times and the total.
    // 9/15 also becomes a holiday: its row has no times yet, so it shows the label (adjusted below).
    await page.getByRole('button', { name: 'Holidays' }).click();
    const view = page.getByRole('region', { name: 'Holidays' });
    await view.getByLabel('Month', { exact: true }).selectOption('9');
    await view.getByLabel('Year', { exact: true }).fill('2026');
    const hd = page.getByRole('dialog', { name: 'Holiday — Add' });
    for (const day of [8, 15]) {
      await page.getByRole('button', { name: `September ${day}, 2026`, exact: true }).click();
      await hd.getByLabel('Name').fill('Test Holiday');
      await hd.getByLabel('Type').selectOption('Regular Holiday');
      await hd.getByRole('button', { name: 'Save' }).click();
      await expect(hd).toHaveCount(0);
    }
    await openEfren(page);
    await expect(cell(page, 8, 3)).toHaveText('4:52');
    await expect(page.locator('.dtr-form tr[data-day="8"]')).not.toContainText('REGULAR HOLIDAY');
    await expect(total(page)).toContainText('9 days');

    // A weekend night row opens the adjust dialog.
    await page.getByRole('button', { name: 'Adjust September 5, 2026' }).click();
    const sat = page.getByRole('dialog', { name: 'Adjust time — September 5, 2026' });
    await expect(sat.getByLabel('A.M. departure')).toHaveValue('06:00');
    await page.keyboard.press('Escape');
    await expect(sat).toHaveCount(0);

    // Adding the missing 9/15 departure completes the 9/14 shift: 409 + 360 = 769 more, 5,382 → 11 days.
    // 9/14 keeps only its 11 min late. Undertime 1,147 − 780 + 11 = 378 = 6h 18m.
    // 9/15 is a holiday with a label, but as the end of the 9/14 night shift it can still be adjusted.
    await expect(page.locator('.dtr-form tr[data-day="15"]')).toContainText('REGULAR HOLIDAY');
    await page.getByRole('button', { name: 'Adjust September 15, 2026' }).click();
    const adj = page.getByRole('dialog', { name: 'Adjust time — September 15, 2026' });
    await adj.getByLabel('A.M. departure').fill('06:00');
    await adj.getByLabel('Reason').fill('Guard logbook');
    await adj.getByRole('button', { name: 'Save' }).click();
    await expect(adj).toHaveCount(0);
    await expect(cell(page, 14, 5)).toHaveText('0'); // DtrForm prints 0 hours when a row has undertime under an hour
    await expect(cell(page, 14, 6)).toHaveText('11');
    await expect(total(page)).toContainText('11 days');
    await expect(total(page).locator('td').nth(1)).toHaveText('6');
    await expect(total(page).locator('td').nth(2)).toHaveText('18');
  } finally {
    await app.close();
  }
});
