import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo } from './helpers.js';

// Scoped to the Holidays view: the DTR preview stays mounted (hidden) with its own Month and Year.
const showJuly2026 = async (page) => {
  const view = page.getByRole('region', { name: 'Holidays' });
  await view.getByLabel('Month', { exact: true }).selectOption('7');
  await view.getByLabel('Year', { exact: true }).fill('2026');
};

test('US-6 holidays: add, calendar, labels, edit, persist, delete', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  await importHrmo(app, page);

  await page.getByRole('button', { name: 'Holidays' }).click();
  await showJuly2026(page);
  await expect(page.getByText('No holidays this month.')).toBeVisible();

  // Add from the calendar: the day opens an add dialog with its date.
  await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
  let hd = page.getByRole('dialog', { name: 'Holiday — Add' });
  await expect(hd.getByLabel('Date')).toHaveValue('2026-07-03');
  await hd.getByLabel('Name').fill('Test Holiday');
  await hd.getByLabel('Type').selectOption('Regular Holiday');
  await hd.getByRole('button', { name: 'Save' }).click();
  await expect(hd).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'July 3, 2026', exact: true })).toContainText('Test Holiday');
  await expect(page.locator('.holiday-list')).toContainText('Test Holiday');

  // A second holiday on the same date is rejected.
  await page.getByRole('button', { name: 'Add holiday' }).click();
  hd = page.getByRole('dialog', { name: 'Holiday — Add' });
  await hd.getByLabel('Date').fill('2026-07-03');
  await hd.getByLabel('Name').fill('Duplicate');
  await hd.getByRole('button', { name: 'Save' }).click();
  await expect(hd.getByRole('alert')).toContainText('A holiday already exists on 2026-07-03');
  await page.keyboard.press('Escape');
  await expect(hd).toHaveCount(0);

  // Labels on the DTR. Clicking an employee returns to the preview.
  await page.getByRole('button', { name: /MARY ANN EGTAPEN/ }).click();
  const form = page.locator('.dtr-form');
  await expect(form.locator('tr[data-day="3"] .label-cell')).toHaveText('REGULAR HOLIDAY'); // absent on 7/03
  await expect(form.locator('tr[data-day="4"] .label-cell')).toHaveText('SATURDAY');
  await expect(form.locator('tr[data-day="5"] .label-cell')).toHaveText('SUNDAY');
  await page.getByRole('button', { name: /RELITA BARAYA/ }).click();
  // Has punches on 7/03, but the label always wins (US-6 changed 2026-11-09).
  await expect(form.locator('tr[data-day="3"] .label-cell')).toHaveText('REGULAR HOLIDAY');
  await expect(form.locator('tr[data-day="3"]').getByText('5:00')).toHaveCount(0);

  // Edit the type.
  await page.getByRole('button', { name: 'Holidays' }).click();
  await showJuly2026(page);
  await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
  hd = page.getByRole('dialog', { name: 'Holiday — Edit' });
  await expect(hd.getByLabel('Name')).toHaveValue('Test Holiday');
  await hd.getByLabel('Type').selectOption('Special Non-Working Holiday');
  await hd.getByRole('button', { name: 'Save' }).click();
  await expect(hd).toHaveCount(0);
  await app.close();

  // Persists after relaunch.
  ({ app, page } = await launch(dir));
  await page.getByRole('button', { name: /MARY ANN EGTAPEN/ }).click();
  const form2 = page.locator('.dtr-form');
  await expect(form2.locator('tr[data-day="3"] .label-cell')).toHaveText('SPECIAL NON-WORKING HOLIDAY');

  // Delete: the row goes back to blank.
  await page.getByRole('button', { name: 'Holidays' }).click();
  await showJuly2026(page);
  await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
  hd = page.getByRole('dialog', { name: 'Holiday — Edit' });
  await hd.getByRole('button', { name: 'Delete' }).click();
  await expect(hd).toHaveCount(0);
  await expect(page.getByText('No holidays this month.')).toBeVisible();
  await page.getByRole('button', { name: /MARY ANN EGTAPEN/ }).click();
  await expect(form2.locator('tr[data-day="3"] .label-cell')).toHaveCount(0);
  await expect(form2.locator('tr[data-day="3"] td').nth(1)).toHaveText('');
  await app.close();
});

test('US-6 opening Holidays keeps the DTR period and one-print override', async () => {
  const { app, page } = await launch(tmpDir());
  await importHrmo(app, page);
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('radio', { name: '16–31' }).check();
  await page.getByLabel('In charge (this print)').fill('JUAN DELA CRUZ');
  await page.getByRole('button', { name: 'Holidays' }).click();
  await page.getByRole('button', { name: 'DTR preview' }).click();
  await expect(page.getByRole('radio', { name: '16–31' })).toBeChecked();
  await expect(page.getByLabel('In charge (this print)')).toHaveValue('JUAN DELA CRUZ');
  await app.close();
});
