import { test, expect } from '@playwright/test';
import { tmpDir, launch, importHrmo, importFiles, employeeButtons, HRMO } from './helpers.js';

// HRMO (3).xls imported under two offices, so the office filter has something to filter.
const importTwice = async (app, page) => {
  await importHrmo(app, page);
  const dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByLabel('Office for HRMO (3).xls').fill('HRMO1');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('heading', { name: 'HRMO1' }).waitFor();
};

test('US-8 office filter and live search open the DTR', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    await importTwice(app, page);
    const list = employeeButtons(page);
    const nav = page.getByRole('navigation', { name: 'Employees' });
    await expect(list).toHaveCount(22);

    // Office filter limits the list to one office.
    await page.getByLabel('Office filter').selectOption('HRMO1');
    await expect(list).toHaveCount(11);
    await expect(nav.getByRole('heading', { name: 'HRMO', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('heading', { name: 'HRMO1' })).toBeVisible();
    await page.getByLabel('Office filter').selectOption('');
    await expect(list).toHaveCount(22);

    // Search filters as the admin types, case-insensitive, by name or AC-No.
    const search = page.getByLabel('Search name or AC-No');
    await search.fill('LaZaRo');
    await expect(list).toHaveCount(2); // one per office
    await search.fill('sharmaine');
    await expect(list).toHaveCount(4); // #925 and #2025204, per office
    await search.fill('20252');
    await expect(list).toHaveCount(2);
    await expect(list.first()).toContainText('#2025204');
    await search.fill('#14'); // as shown in the list
    await expect(list).toHaveCount(2);
    await expect(list.first()).toContainText('RELITA BARAYA');
    await search.fill('zzz');
    await expect(list).toHaveCount(0);
    await expect(page.getByText('No employees match.')).toBeVisible();

    // Search and office filter together, then clicking the result opens its DTR.
    await page.getByLabel('Office filter').selectOption('HRMO');
    await search.fill('lazaro');
    await expect(list).toHaveCount(1);
    await list.first().click();
    await expect(page.locator('.dtr-form .name-line').first()).toHaveText('JOHN RYAN A. LAZARO');
  } finally {
    await app.close();
  }
});

test('US-9 date check lists everyone with a status', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    await importTwice(app, page);
    await page.getByRole('button', { name: 'Date check' }).click();
    const view = page.getByRole('region', { name: 'Date check' });
    await view.getByLabel('Date', { exact: true }).fill('2026-07-03');
    await view.getByLabel('Office', { exact: true }).selectOption('HRMO');
    const rows = view.locator('tbody tr');
    const status = (acNo) => view.locator(`tr[data-key="HRMO|${acNo}"] td.status`);

    // Hand-derived from the raw 7/03 rows: 3 Present, 2 Incomplete, 6 Absent (none omitted).
    await expect(rows).toHaveCount(11);
    await expect(view.locator('td.status', { hasText: /^Present$/ })).toHaveCount(3);
    await expect(view.locator('td.status', { hasText: /^Incomplete$/ })).toHaveCount(2);
    await expect(view.locator('td.status', { hasText: /^Absent$/ })).toHaveCount(6);
    await expect(status('14')).toHaveText('Incomplete'); // RELITA: PM arrival missing
    await expect(status('783')).toHaveText('Absent'); // MARY ANN: no punches
    await expect(status('218')).toHaveText('Present'); // JOANNE
    await expect(view.locator('tr[data-key="HRMO|14"] td').nth(3)).toHaveText('7:54');
    await expect(view.locator('tr[data-key="HRMO|14"] td').nth(5)).toHaveText('');
    await expect(view.locator('tr[data-key="HRMO|14"] td').nth(6)).toHaveText('5:00');

    // Opening a DTR and coming back keeps the picked date and office.
    await view.locator('tr[data-key="HRMO|218"]').getByRole('button', { name: 'JOANNE M ESTRADA' }).click();
    await expect(page.locator('.dtr-form .name-line').first()).toHaveText('JOANNE M ESTRADA');
    await page.getByRole('button', { name: 'Date check' }).click();
    await expect(view.getByLabel('Date', { exact: true })).toHaveValue('2026-07-03');
    await expect(rows).toHaveCount(11);

    // All offices: both copies.
    await view.getByLabel('Office', { exact: true }).selectOption('');
    await expect(rows).toHaveCount(22);

    // A workday with no rows at all: everyone Absent.
    await view.getByLabel('Date', { exact: true }).fill('2026-07-13');
    await expect(view.locator('td.status', { hasText: /^Absent$/ })).toHaveCount(22);

    // A holiday shows its label.
    await page.getByRole('button', { name: 'Holidays' }).click();
    const hv = page.getByRole('region', { name: 'Holidays' });
    await hv.getByLabel('Month', { exact: true }).selectOption('7');
    await hv.getByLabel('Year', { exact: true }).fill('2026');
    await page.getByRole('button', { name: 'July 3, 2026', exact: true }).click();
    const hd = page.getByRole('dialog', { name: 'Holiday — Add' });
    await hd.getByLabel('Name').fill('Test Holiday');
    await hd.getByLabel('Type').selectOption('Regular Holiday');
    await hd.getByRole('button', { name: 'Save' }).click();
    await expect(hd).toHaveCount(0);
    await page.getByRole('button', { name: 'Date check' }).click();
    await view.getByLabel('Date', { exact: true }).fill('2026-07-03');
    await expect(status('218')).toHaveText('REGULAR HOLIDAY');
    await expect(view.locator('td.status', { hasText: /^REGULAR HOLIDAY$/ })).toHaveCount(22);

    // Clicking a name opens that DTR.
    await view.locator('tr[data-key="HRMO|14"]').getByRole('button', { name: 'RELITA BARAYA' }).click();
    await expect(page.locator('.dtr-form .name-line').first()).toHaveText('RELITA BARAYA');
  } finally {
    await app.close();
  }
});

test('US-10 clock shows the PC date and time and keeps ticking', async () => {
  const { app, page } = await launch(tmpDir());
  try {
    // The clock is the outer boundary: fix it, then let it run.
    await app.context().clock.install({ time: new Date(2026, 10, 9, 10, 0, 0) });
    await page.reload();
    const clock = page.getByLabel('Current date and time');
    await expect(clock).toHaveText('Monday, November 9, 2026 at 10:00:00 AM');
    await page.clock.runFor(2000);
    await expect(clock).toHaveText('Monday, November 9, 2026 at 10:00:02 AM');
    await page.clock.runFor(60_000);
    await expect(clock).toHaveText('Monday, November 9, 2026 at 10:01:02 AM');
  } finally {
    await app.close();
  }
});
