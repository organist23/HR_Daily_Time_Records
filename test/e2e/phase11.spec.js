import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { tmpDir, launch, importHrmo, importFiles, showTotals } from './helpers.js';

// US-15. Hand-derived from HRMO (3).xls (on-duty 08:00 and 13:00), LAZARO (611) July 2026:
//   7/08 A.M. in 08:18 → 18 min late: red at grace 0 and 15.
//   7/06 A.M. in 08:08, P.M. in 13:06 → 8 and 6 min: red at grace 0, black at grace 15.
//   7/03 A.M. in 08:08 with no departure → still late: red.
//   7/01 A.M. in 07:50 (device) → on time. Adjusted to 08:30 → 30 min late.
// RONIE (568) 7/01 A.M. in 08:00 → on time. EFREN (479, NIGHT_shift.xls) 9/02 P.M. in 17:12 is late but night shift: black.
const RED = 'rgb(221, 0, 0)'; // #d00
const BLACK = 'rgb(0, 0, 0)';
const NIGHT = path.resolve('sample_data/NIGHT_shift.xls');
const form = (page) => page.locator('.main-page .dtr-form');
const cell = (page, day, i) => form(page).locator(`tr[data-day="${day}"] td`).nth(i); // 1 amIn, 2 amOut, 3 pmIn, 4 pmOut
const color = (loc) => loc.evaluate((e) => getComputedStyle(e).color);
const redCells = (page) => form(page).locator('td').evaluateAll((tds) => tds.filter((e) => getComputedStyle(e).color === 'rgb(221, 0, 0)').length);

// Red fill operators in the PDF page streams (Chromium writes them Flate-compressed).
// #d00 = 221/255 = 0.86667, which Chromium writes as `.8667 0 0 rg`.
function pdfRedOps(file) {
  const bytes = fs.readFileSync(file);
  const text = bytes.toString('latin1');
  let ops = 0;
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    let body;
    try { body = zlib.inflateSync(bytes.subarray(start, end)).toString('latin1'); } catch { continue; }
    ops += (body.match(/(?<![\d.])0?\.866[67]\d*\s+0\s+0\s+rg\b/g) || []).length;
  }
  return ops;
}

const mockSave = (app, filePath) => app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
}, filePath);

async function expectLazaroGrace0(page) {
  await expect(cell(page, 8, 1)).toHaveText('8:18');
  expect(await color(cell(page, 8, 1))).toBe(RED);
  await expect(cell(page, 6, 1)).toHaveText('8:08');
  expect(await color(cell(page, 6, 1))).toBe(RED);
  await expect(cell(page, 6, 3)).toHaveText('1:06');
  expect(await color(cell(page, 6, 3))).toBe(RED);
  await expect(cell(page, 3, 1)).toHaveText('8:08');
  expect(await color(cell(page, 3, 1))).toBe(RED);
  for (const i of [2, 4]) { // departures stay black
    expect(await color(cell(page, 6, i))).toBe(BLACK);
    expect(await color(cell(page, 8, i))).toBe(BLACK);
  }
}

test('US-15 late day-shift arrivals are red on screen, print, and PDF', async () => {
  const dir = tmpDir();
  const { app, page } = await launch(dir);
  try {
    await importHrmo(app, page);

    // An arrival at on-duty is not red.
    await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
    await page.getByRole('radio', { name: '1–15' }).check();
    await expect(cell(page, 1, 1)).toHaveText('8:00');
    expect(await color(cell(page, 1, 1))).toBe(BLACK);

    await page.getByRole('button', { name: /JOHN RYAN A\. LAZARO/ }).click();
    await page.getByRole('radio', { name: '1–15' }).check();
    // Totals hidden (default), on screen and in print.
    await expectLazaroGrace0(page);
    await page.emulateMedia({ media: 'print' });
    await expectLazaroGrace0(page);
    await page.emulateMedia({ media: null });
    // Totals shown: same red, same computed values.
    await showTotals(page);
    await expectLazaroGrace0(page);
    await expect(cell(page, 6, 6)).toHaveText('14');
    await expect(cell(page, 8, 6)).toHaveText('18');

    // Export PDF carries the red. RELITA (all on time) has none.
    const out = path.join(dir, 'out');
    fs.mkdirSync(out);
    const status = page.getByRole('status');
    await mockSave(app, path.join(out, 'lazaro.pdf'));
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await expect(status).toContainText('Saved lazaro.pdf');
    expect(pdfRedOps(path.join(out, 'lazaro.pdf'))).toBeGreaterThan(0);
    await page.getByRole('button', { name: /RELITA BARAYA/ }).click();
    await page.getByRole('radio', { name: '1–15' }).check();
    await expect(redCells(page)).resolves.toBe(0);
    await mockSave(app, path.join(out, 'relita.pdf'));
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await expect(status).toContainText('Saved relita.pdf');
    expect(pdfRedOps(path.join(out, 'relita.pdf'))).toBe(0);

    // Print office: the batch pages carry the red too (system print dialog mocked).
    await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.print = async (opts, cb) => {
        globalThis.redInBatch = await wc.executeJavaScript(
          `[...document.querySelectorAll('.print-batch td')].filter((e) => getComputedStyle(e).color === 'rgb(221, 0, 0)').map((e) => e.textContent)`);
        cb(true, '');
      };
    });
    await page.getByRole('button', { name: 'Print office' }).click();
    await expect.poll(() => app.evaluate(() => globalThis.redInBatch)).toEqual(expect.arrayContaining(['8:18', '8:08', '1:06']));

    // An adjusted late arrival is red and keeps its tint.
    await page.getByRole('button', { name: /JOHN RYAN A\. LAZARO/ }).click();
    await page.getByRole('radio', { name: '1–15' }).check();
    expect(await color(cell(page, 1, 1))).toBe(BLACK);
    await page.getByRole('button', { name: 'Adjust July 1, 2026' }).click();
    const dlg = page.getByRole('dialog', { name: 'Adjust time — July 1, 2026' });
    await dlg.getByLabel('A.M. arrival').fill('08:30');
    await dlg.getByLabel('Reason').fill('Late, corrected');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(cell(page, 1, 1)).toHaveText('8:30');
    await expect(cell(page, 1, 1)).toHaveClass(/adjusted/);
    expect(await color(cell(page, 1, 1))).toBe(RED);
    expect(await cell(page, 1, 1).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 241, 184)');

    // Grace 15: 7/06 arrivals are within it, 7/08 is still late.
    await page.getByRole('button', { name: 'Office settings' }).click();
    const od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
    await od.getByLabel('Grace minutes').fill('15');
    await od.getByRole('button', { name: 'Save' }).click();
    await expect(od).toHaveCount(0);
    await expect(cell(page, 6, 6)).toHaveText(''); // undertime recomputed
    expect(await color(cell(page, 6, 1))).toBe(BLACK);
    expect(await color(cell(page, 6, 3))).toBe(BLACK);
    expect(await color(cell(page, 8, 1))).toBe(RED);

    // Night shift: EFREN's 9/02 5:12 arrival is 12 min late but stays black, like every night cell.
    const nd = await importFiles(app, page, [NIGHT]);
    await nd.getByLabel('Office for NIGHT_shift.xls').fill('SECURITY');
    await nd.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('status')).toContainText('NIGHT_shift.xls: 30 added');
    await page.getByRole('button', { name: /EFREN ALCANTARA/ }).click();
    await page.getByLabel('Month', { exact: true }).selectOption('9');
    await page.getByLabel('Year', { exact: true }).fill('2026');
    await page.getByRole('radio', { name: '1–15' }).check();
    await expect(cell(page, 2, 3)).toHaveText('5:12');
    await expect(cell(page, 2, 6)).toHaveText('12');
    await expect(redCells(page)).resolves.toBe(0);
  } finally {
    await app.close();
  }
});
