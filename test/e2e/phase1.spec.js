import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo } from './helpers.js';

test('US-5 in-charge name and grace per office, one-print override', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  await importHrmo(app, page);
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('radio', { name: '1–15' }).check();
  const form = page.locator('.dtr-form');
  const inChargeLine = form.locator('.in-charge-name');
  await expect(inChargeLine).toHaveText('');
  // RONIE 7/02: arrivals 8:01 and 1:02 are inside the default 15-minute grace.
  await expect(form.locator('tr[data-day="2"] td').nth(6)).toHaveText('');

  await page.getByRole('button', { name: 'Office settings' }).click();
  let od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
  await expect(od.getByLabel('Grace minutes')).toHaveValue('15');
  await od.getByLabel('In-charge name').fill('MARIVIC P. SARINAS');
  await od.getByLabel('Grace minutes').fill('0');
  await od.getByRole('button', { name: 'Save' }).click();
  await expect(od).toHaveCount(0);
  await expect(inChargeLine).toHaveText('MARIVIC P. SARINAS');
  await expect(page.getByLabel('In charge (this print)')).toHaveValue('MARIVIC P. SARINAS');
  // Grace 0: 1 + 2 = 3 minutes late on 7/02.
  await expect(form.locator('tr[data-day="2"] td').nth(6)).toHaveText('3');

  await page.getByLabel('In charge (this print)').fill('JUAN DELA CRUZ');
  await expect(inChargeLine).toHaveText('JUAN DELA CRUZ');

  await page.getByRole('button', { name: 'Office settings' }).click();
  await expect(od.getByLabel('In-charge name')).toHaveValue('MARIVIC P. SARINAS');
  await od.getByLabel('Grace minutes').fill('-5');
  await od.getByRole('button', { name: 'Save' }).click();
  await expect(od.getByRole('alert')).toContainText('0 to 60');
  await page.keyboard.press('Escape');
  await expect(od).toHaveCount(0);
  await app.close();

  ({ app, page } = await launch(dir));
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await expect(page.locator('.dtr-form .in-charge-name')).toHaveText('MARIVIC P. SARINAS');
  await page.getByRole('button', { name: 'Office settings' }).click();
  od = page.getByRole('dialog', { name: 'Office settings — HRMO' }); // bound to the relaunched window
  await expect(od.getByLabel('In-charge name')).toHaveValue('MARIVIC P. SARINAS');
  await expect(od.getByLabel('Grace minutes')).toHaveValue('0');
  await app.close();
});
