import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo } from './helpers.js';

// US-14. Hand-derived (Phase 3 anchor): RONIE (568) July 1–15 = 2 days, undertime 20h 0m.
// Day 1: A.M. arrival 8:00 only → 4h undertime.
const form = (page) => page.locator('.main-page .dtr-form');
const day1 = (page, i) => form(page).locator('tr[data-day="1"] td').nth(i); // 1 amIn, 5 h, 6 min
const total = (page) => form(page).locator('tr.total');

async function openRonie(page) {
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('radio', { name: '1–15' }).check();
}

async function expectHidden(page) {
  await expect(day1(page, 1)).toHaveText('8:00'); // times always show
  await expect(day1(page, 5)).toHaveText('');
  await expect(day1(page, 6)).toHaveText('');
  await expect(total(page)).not.toContainText('days');
  await expect(total(page).locator('td').nth(1)).toHaveText('');
  await expect(total(page).locator('td').nth(2)).toHaveText('');
}

test('US-14 undertime and total are hidden by default, shown on demand, and hidden again after a restart', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  try {
    await importHrmo(app, page);
    await openRonie(page);
    const toggle = page.getByRole('button', { name: 'Show undertime and total' });
    await expect(toggle).toBeVisible();
    await expectHidden(page);
    // The printout uses the same page: hidden in print too, and the button itself does not print.
    await page.emulateMedia({ media: 'print' });
    await expectHidden(page);
    await expect(toggle).toBeHidden();
    await page.emulateMedia({ media: null });

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hide undertime and total' })).toBeVisible();
    await expect(day1(page, 1)).toHaveText('8:00');
    await expect(day1(page, 5)).toHaveText('4');
    await expect(total(page)).toContainText('2 days');
    await expect(total(page).locator('td').nth(1)).toHaveText('20');

    // Stays shown across employees for this session.
    await page.getByRole('button', { name: /JOHN RYAN A\. LAZARO/ }).click();
    await openRonie(page);
    await expect(total(page)).toContainText('2 days');

    // Hide again.
    await page.getByRole('button', { name: 'Hide undertime and total' }).click();
    await expectHidden(page);
    await page.getByRole('button', { name: 'Show undertime and total' }).click();
  } finally {
    await app.close();
  }

  // A restart starts hidden again.
  ({ app, page } = await launch(dir));
  try {
    await openRonie(page);
    await expectHidden(page);
  } finally {
    await app.close();
  }
});
