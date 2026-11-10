import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
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
  // RONIE 7/02: arrivals 8:01 and 1:02. Default grace 0 (US-5 Changed 2026-11-10): 1 + 2 = 3 minutes late.
  await expect(form.locator('tr[data-day="2"] td').nth(6)).toHaveText('3');

  await page.getByRole('button', { name: 'Office settings' }).click();
  let od = page.getByRole('dialog', { name: 'Office settings — HRMO' });
  await expect(od.getByLabel('Grace minutes')).toHaveValue('0');
  await od.getByLabel('In-charge name').fill('MARIVIC P. SARINAS');
  await od.getByLabel('Grace minutes').fill('15');
  await od.getByRole('button', { name: 'Save' }).click();
  await expect(od).toHaveCount(0);
  await expect(inChargeLine).toHaveText('MARIVIC P. SARINAS');
  await expect(page.getByLabel('In charge (this print)')).toHaveValue('MARIVIC P. SARINAS');
  // Grace 15: both 7/02 arrivals are within it.
  await expect(form.locator('tr[data-day="2"] td').nth(6)).toHaveText('');

  await page.getByLabel('In charge (this print)').fill('JUAN DELA CRUZ');
  await expect(inChargeLine).toHaveText('JUAN DELA CRUZ');

  // Saving settings without changing the in-charge name keeps the one-print override.
  await page.getByRole('button', { name: 'Office settings' }).click();
  await od.getByLabel('Grace minutes').fill('15');
  await od.getByRole('button', { name: 'Save' }).click();
  await expect(od).toHaveCount(0);
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
  await expect(od.getByLabel('Grace minutes')).toHaveValue('15');
  await app.close();
});

// Page objects and page sizes, read straight from the PDF bytes.
function pdfInfo(file) {
  const text = fs.readFileSync(file).toString('latin1');
  return {
    pages: (text.match(/\/Type\s*\/Page(?![a-z])/g) || []).length,
    sizes: [...text.matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [+m[1], +m[2]]),
  };
}

// The OS save dialog is the outer boundary. null = the admin cancels.
const mockSave = (app, filePath) => app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async () => (p ? { canceled: false, filePath: p } : { canceled: true, filePath: '' });
}, filePath);

test('US-4 print and export PDF, single and whole office', async () => {
  const { app, page } = await launch(tmpDir());
  await importHrmo(app, page);
  await page.getByRole('button', { name: 'Dismiss messages' }).click();
  await page.getByRole('button', { name: /RONIE LOUISE BERMUDEZ/ }).click();
  await page.getByRole('radio', { name: '1–15' }).check();

  // Print media shows the DTR page only, no app UI.
  await page.emulateMedia({ media: 'print' });
  for (const sel of ['.topbar', '.sidebar', '.controls']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('.page:visible')).toHaveCount(1);
  await page.emulateMedia({ media: null }); // 'screen' would also force screen styles while printing

  const out = tmpDir();
  const status = page.getByRole('status');

  await mockSave(app, path.join(out, 'ronie.pdf'));
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(status).toContainText('Saved ronie.pdf');
  let info = pdfInfo(path.join(out, 'ronie.pdf'));
  expect(info.pages).toBe(1);
  for (const [w, h] of info.sizes) {
    expect(Math.abs(w - 595.28)).toBeLessThan(1);
    expect(Math.abs(h - 841.89)).toBeLessThan(1);
  }

  await mockSave(app, path.join(out, 'hrmo.pdf'));
  await page.getByRole('button', { name: 'Export office PDF' }).click();
  await expect(status).toContainText('Saved hrmo.pdf');
  // Only #2025204 has no time records in July 1-15 (every row in the device file is empty).
  await expect(status.locator('.err')).toHaveText('1 of 11 employees have no time records for July 1-15, 2026: SHARMAINE BANAO (#2025204)');
  info = pdfInfo(path.join(out, 'hrmo.pdf'));
  expect(info.pages).toBe(11);
  await expect(page.locator('.page:visible')).toHaveCount(1); // batch pages are gone after export

  // Cancelled save: no file, no message, buttons usable again.
  await page.getByRole('button', { name: 'Dismiss messages' }).click();
  await mockSave(app, null);
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  await expect(status).toHaveCount(0);
  expect(fs.readdirSync(out).sort()).toEqual(['hrmo.pdf', 'ronie.pdf']);

  // Unwritable target (a folder): error shown.
  await mockSave(app, out);
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(status.locator('.err')).toContainText('Could not save PDF');

  // Print goes to the system print dialog (mocked) on A4, with 1 page or the whole office.
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.print = async (opts, cb) => {
      const pages = await wc.executeJavaScript(
        "document.querySelector('.print-batch') ? document.querySelectorAll('.print-batch .page').length : document.querySelectorAll('.page').length");
      globalThis.printCalls = [...(globalThis.printCalls || []), { pageSize: opts.pageSize, landscape: opts.landscape, pages }];
      cb(true, '');
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.getByRole('button', { name: 'Print office' }).click();
  await expect(status.locator('.err')).toContainText('1 of 11 employees have no time records');
  await expect.poll(() => app.evaluate(() => globalThis.printCalls)).toEqual([
    { pageSize: 'A4', landscape: false, pages: 1 },
    { pageSize: 'A4', landscape: false, pages: 11 },
  ]);
  await app.close();
});
