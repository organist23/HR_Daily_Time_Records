import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo, showTotals } from './helpers.js';

const openRonieFirstHalf = async (page) => {
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await showTotals(page);
  await page.getByRole('radio', { name: '1–15' }).check();
};

test('US-7 adjust, mark, validate, survive re-import and relaunch, revert', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  await importHrmo(app, page);
  await openRonieFirstHalf(page);
  let form = page.locator('.dtr-form');
  // Before: 7/01 has only the 8:00 arrival; July 1-15 = 2 days, 20h undertime (hand-derived in dtr.test.js).
  await expect(form.locator('tr.total')).toContainText('2 days');
  await expect(form.locator('tr.total td').nth(1)).toHaveText('20');

  await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
  let dlg = page.getByRole('dialog', { name: 'Adjust time — July 1, 2026' });
  await expect(dlg.getByLabel('A.M. arrival')).toHaveValue('08:00');
  await expect(dlg.getByLabel('A.M. departure')).toHaveValue('');
  await expect(dlg).toContainText('Device: none');

  // Rejected: no reason, then departure before arrival.
  await dlg.getByLabel('A.M. departure').fill('12:00');
  await dlg.getByLabel('P.M. arrival').fill('13:00');
  await dlg.getByLabel('P.M. departure').fill('12:30');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg.getByRole('alert')).toContainText('P.M. departure must be later than arrival');
  await dlg.getByLabel('P.M. departure').fill('17:00');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Reason is required');

  await dlg.getByLabel('Reason').fill('Work from home');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg).toHaveCount(0);
  const day1 = form.locator('tr[data-day="1"] td');
  await expect(day1.nth(2)).toHaveText('12:00');
  await expect(day1.nth(3)).toHaveText('1:00');
  await expect(day1.nth(4)).toHaveText('5:00');
  await expect(day1.nth(5)).toHaveText('');
  await expect(form.locator('tr[data-day="1"] td.adjusted')).toHaveCount(3);
  await expect(form.locator('tr.total')).toContainText('3 days');
  await expect(form.locator('tr.total td').nth(1)).toHaveText('16');

  // Marked on screen only.
  const tint = () => form.locator('tr[data-day="1"] td.adjusted').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await tint()).not.toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({ media: 'print' });
  expect(await tint()).toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({ media: null });

  // A day with no device rows at all (Monday 7/13).
  await page.getByRole('button', { name: 'Adjust July 13, 2026' }).click();
  dlg = page.getByRole('dialog', { name: 'Adjust time — July 13, 2026' });
  await dlg.getByLabel('A.M. arrival').fill('08:00');
  await dlg.getByLabel('A.M. departure').fill('12:00');
  await dlg.getByLabel('Reason').fill('Work from home');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(form.locator('tr[data-day="13"] td').nth(1)).toHaveText('8:00');

  // Re-import does not undo it.
  await importHrmo(app, page);
  await expect(page.getByRole('status')).toContainText('0 added, 154 updated');
  await expect(day1.nth(2)).toHaveText('12:00');
  await app.close();

  // Relaunch keeps it; then revert to device times.
  ({ app, page } = await launch(dir));
  await openRonieFirstHalf(page);
  form = page.locator('.dtr-form');
  const row1 = form.locator('tr[data-day="1"] td');
  await expect(row1.nth(2)).toHaveText('12:00');
  await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
  dlg = page.getByRole('dialog', { name: 'Adjust time — July 1, 2026' });
  await expect(dlg).toContainText('Work from home');
  await dlg.getByRole('button', { name: 'Revert to device times' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(row1.nth(1)).toHaveText('8:00');
  await expect(row1.nth(2)).toHaveText('');
  await expect(row1.nth(5)).toHaveText('4');
  await expect(form.locator('tr[data-day="1"] td.adjusted')).toHaveCount(0);
  await app.close();
});
