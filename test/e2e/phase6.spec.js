import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo } from './helpers.js';

// Holidays view helpers. Scoped to the view: the hidden DTR preview has its own Month and Year.
const openJuly2026Holidays = async (page) => {
  await page.getByRole('button', { name: 'Holidays' }).click();
  const view = page.getByRole('region', { name: 'Holidays' });
  await view.getByLabel('Month', { exact: true }).selectOption('7');
  await view.getByLabel('Year', { exact: true }).fill('2026');
};
const addJuly1Holiday = async (page) => {
  await openJuly2026Holidays(page);
  await page.getByRole('button', { name: 'July 1, 2026', exact: true }).click();
  const hd = page.getByRole('dialog', { name: 'Holiday — Add' });
  await hd.getByLabel('Name').fill('araw ng patay');
  await hd.getByLabel('Type').selectOption('Special Non-Working Holiday');
  await hd.getByRole('button', { name: 'Save' }).click();
  await expect(hd).toHaveCount(0);
};
const deleteJuly1Holiday = async (page) => {
  await openJuly2026Holidays(page);
  await page.getByRole('button', { name: 'July 1, 2026', exact: true }).click();
  const hd = page.getByRole('dialog', { name: 'Holiday — Edit' });
  await hd.getByRole('button', { name: 'Delete' }).click();
  await expect(hd).toHaveCount(0);
};

test('US-6 a holiday on a past date with punches shows its label and drops the credit', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    await importHrmo(app, page);
    const joanne = page.getByRole('button', { name: /JOANNE M ESTRADA/ });
    await joanne.click();
    const form = page.locator('.dtr-form');
    const row1 = form.locator('tr[data-day="1"]');
    // JOANNE full July: 6 full days (2880) + 7/09 PM (240) = 3120 → 6 days. 7/09 AM has no departure → 4h.
    await expect(row1.locator('td').nth(1)).toHaveText('7:34');
    await expect(form.locator('tr.total')).toContainText('6 days');
    await expect(form.locator('tr.total td').nth(1)).toHaveText('4');

    // Adding the holiday on 7/01 replaces her punches with the label: 3120 - 480 = 2640 → 5 days.
    await addJuly1Holiday(page);
    await joanne.click();
    await expect(row1.locator('.label-cell')).toHaveText('SPECIAL NON-WORKING HOLIDAY');
    await expect(row1.getByText('7:34')).toHaveCount(0);
    await expect(form.locator('tr.total')).toContainText('5 days');
    await expect(form.locator('tr.total td').nth(1)).toHaveText('4');
    // Weekends stay labeled.
    await expect(form.locator('tr[data-day="4"] .label-cell')).toHaveText('SATURDAY');
    await expect(form.locator('tr[data-day="5"] .label-cell')).toHaveText('SUNDAY');

    // Deleting it brings the punches back.
    await deleteJuly1Holiday(page);
    await joanne.click();
    await expect(row1.locator('.label-cell')).toHaveCount(0);
    await expect(row1.locator('td').nth(1)).toHaveText('7:34');
    await expect(form.locator('tr.total')).toContainText('6 days');
  } finally {
    await app.close();
  }
});

test('US-7 holidays and weekends cannot be adjusted, and earlier adjustments stay hidden', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    await importHrmo(app, page);
    const ronie = page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ });
    await ronie.click();
    await page.getByRole('radio', { name: '1–15' }).check();
    const form = page.locator('.dtr-form');
    const row1 = form.locator('tr[data-day="1"]');

    // Work-from-home fix on 7/01 (a workday): 2 → 3 days (1680 min, Phase 3).
    await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
    const dlg = page.getByRole('dialog', { name: 'Adjust time — July 1, 2026' });
    await dlg.getByLabel('A.M. departure').fill('12:00');
    await dlg.getByLabel('P.M. arrival').fill('13:00');
    await dlg.getByLabel('P.M. departure').fill('17:00');
    await dlg.getByLabel('Reason').fill('Work from home');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(form.locator('tr.total')).toContainText('3 days');

    // A holiday on 7/01 hides the adjustment: 1680 - 480 = 1200 → 2 days.
    await addJuly1Holiday(page);
    await ronie.click();
    await expect(row1.locator('.label-cell')).toHaveText('SPECIAL NON-WORKING HOLIDAY');
    await expect(form.locator('tr.total')).toContainText('2 days');

    // Clicking a holiday or weekend shows a message, not the adjust dialog.
    await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
    await expect(page.getByRole('status')).toContainText(
      'July 1, 2026 is a non-working day (SPECIAL NON-WORKING HOLIDAY). Its times cannot be adjusted.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Adjust July 4, 2026' }).click();
    await expect(page.getByRole('status')).toContainText('July 4, 2026 is a non-working day (SATURDAY).');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Main refuses it too, even when called directly.
    const err = await page.evaluate(() => window.api.adjustDay({
      office: 'HRMO', acNo: '568', date: '2026-07-04', am: { in: '08:00', out: '12:00' }, pm: {}, reason: 'x',
    }).then(() => 'saved', (e) => String(e.message)));
    expect(err).toContain('2026-07-04 is a non-working day');

    // Deleting the holiday shows the kept adjustment again.
    await deleteJuly1Holiday(page);
    await ronie.click();
    await expect(row1.locator('td').nth(2)).toHaveText('12:00');
    await expect(form.locator('tr.total')).toContainText('3 days');
  } finally {
    await app.close();
  }
});
