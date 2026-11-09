import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, launch, importHrmo, importFiles, employeeButtons, HRMO } from './helpers.js';

// HRMO (3).xls under two offices: 22 employees, 14 punch rows each (308).
const importTwice = async (app, page) => {
  await importHrmo(app, page);
  const dlg = await importFiles(app, page, [HRMO]);
  await dlg.getByLabel('Office for HRMO (3).xls').fill('HRMO1');
  await dlg.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('heading', { name: 'HRMO1' }).waitFor();
};
const pdfPages = (file) => (fs.readFileSync(file).toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
const mockSave = (app, filePath) => app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
}, filePath);
const group = (page, office) => page.getByRole('navigation', { name: 'Employees' })
  .locator('section', { has: page.getByRole('heading', { name: office, exact: true }) });

test('US-11 archive, restore, and delete employees and offices', async () => {
  const dir = tmpDir();
  let { app, page } = await launch(dir);
  try {
    await importTwice(app, page);
    const list = employeeButtons(page);
    const status = page.getByRole('status');
    await expect(list).toHaveCount(22);

    // Archive the duplicate SHARMAINE BANAO #2025204 in HRMO: no confirmation, the preview closes.
    await group(page, 'HRMO').getByRole('button', { name: /#2025204/ }).click();
    await page.getByRole('button', { name: 'Archive employee' }).click();
    await expect(status).toContainText('Archived SHARMAINE BANAO (#2025204). Restore it from Archived.');
    await expect(page.getByText('Select an employee to preview their DTR.')).toBeVisible();
    await expect(group(page, 'HRMO').getByRole('button')).toHaveCount(10);
    await expect(list).toHaveCount(21);

    // Office PDF skips the archived employee: 10 pages, and #2025204 (the only blank one) is no longer warned about.
    await group(page, 'HRMO').getByRole('button', { name: /RELITA BARAYA/ }).click();
    await page.getByRole('radio', { name: '1–15' }).check();
    await mockSave(app, path.join(dir, 'hrmo.pdf'));
    await page.getByRole('button', { name: 'Export office PDF' }).click();
    await expect(status).toContainText('Saved hrmo.pdf');
    await expect(status.locator('.err')).toHaveCount(0);
    expect(pdfPages(path.join(dir, 'hrmo.pdf'))).toBe(10);

    // A re-import keeps them archived.
    const again = await importFiles(app, page, [HRMO]);
    await again.getByLabel('Office for HRMO (3).xls').fill('HRMO');
    await again.getByRole('button', { name: 'Import' }).click();
    await expect(status).toContainText('0 added, 154 updated');
    await expect(group(page, 'HRMO').getByRole('button')).toHaveCount(10);

    // The Archived view lists them, and Restore brings them back.
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    const archived = page.getByRole('region', { name: 'Archived' });
    await expect(archived).toContainText('SHARMAINE BANAO (#2025204)');
    await archived.getByRole('button', { name: 'Restore SHARMAINE BANAO (#2025204)' }).click();
    await expect(status).toContainText('Restored SHARMAINE BANAO (#2025204).');
    await expect(archived).toContainText('No archived employees.');
    await expect(list).toHaveCount(22);

    // Archive office HRMO1 from its settings, with the sidebar filtered to it.
    await page.getByLabel('Office filter').selectOption('HRMO1');
    await group(page, 'HRMO1').getByRole('button', { name: /RELITA BARAYA/ }).click();
    await page.getByRole('button', { name: 'Office settings' }).click();
    const od = page.getByRole('dialog', { name: 'Office settings — HRMO1' });
    // Unsaved edits block Archive and Delete, so they are never dropped silently.
    await od.getByLabel('Grace minutes').fill('10');
    await expect(od.getByRole('button', { name: 'Archive office' })).toBeDisabled();
    await od.getByLabel('Grace minutes').fill('15');
    await od.getByRole('button', { name: 'Archive office' }).click();
    await expect(status).toContainText('Archived office HRMO1. Restore it from Archived.');
    // The group and the filter option go away, and the filter goes back to all offices.
    await expect(page.getByRole('heading', { name: 'HRMO1' })).toHaveCount(0);
    await expect(page.getByLabel('Office filter').locator('option')).toHaveText(['All offices', 'HRMO']);
    await expect(page.getByLabel('Office filter')).toHaveValue('');
    await expect(list).toHaveCount(11);
    // Importing into the archived office keeps it hidden and says so.
    const intoArchived = await importFiles(app, page, [HRMO]);
    await intoArchived.getByLabel('Office for HRMO (3).xls').fill('hrmo1');
    await intoArchived.getByRole('button', { name: 'Import' }).click();
    await expect(status).toContainText('0 added, 154 updated, 0 skipped (office HRMO1). Office HRMO1 is archived, see Archived.');
    await expect(list).toHaveCount(11);
    // Restore brings the office back, and the filter stays on all offices.
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    await expect(archived).toContainText('HRMO1 (11 employees)');
    await archived.getByRole('button', { name: 'Restore office HRMO1' }).click();
    await expect(list).toHaveCount(22);

    // Main refuses a null target with the store's own error, not a crash.
    const err = await page.evaluate(() => window.api.setArchived(null).then(() => 'saved', (e) => String(e.message)));
    expect(err).toContain('Unknown office: undefined');

    // No delete on the DTR screen or in Office settings: delete is offered only in Archived.
    await group(page, 'HRMO1').getByRole('button', { name: /#2025204/ }).click();
    await expect(page.getByRole('button', { name: 'Delete employee' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Office settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Office settings — HRMO1' }).getByRole('button', { name: /Delete/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Delete an archived employee from Archived: Cancel and Escape change nothing, Confirm removes them.
    await page.getByRole('button', { name: 'Archive employee' }).click();
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    const delEmp = archived.getByRole('button', { name: 'Delete SHARMAINE BANAO (#2025204)' });
    await delEmp.click();
    let dlg = page.getByRole('alertdialog', { name: 'Delete employee' });
    await expect(dlg).toContainText('Delete SHARMAINE BANAO (#2025204) from HRMO1? This removes 14 punches and 0 adjusted days. This cannot be undone.');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(archived).toContainText('SHARMAINE BANAO (#2025204)');
    await delEmp.click();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(archived).toContainText('SHARMAINE BANAO (#2025204)');
    await delEmp.click();
    await dlg.getByRole('button', { name: 'Delete employee' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(status).toContainText('Deleted SHARMAINE BANAO (#2025204).');
    await expect(archived).toContainText('No archived employees.');
    await expect(group(page, 'HRMO1').getByRole('button')).toHaveCount(10);
    await expect(group(page, 'HRMO').getByRole('button')).toHaveCount(11);

    // Delete office HRMO1 (10 employees left, 140 punches): archive it, then delete from Archived.
    await group(page, 'HRMO1').getByRole('button', { name: /RELITA BARAYA/ }).click();
    await page.getByRole('button', { name: 'Office settings' }).click();
    await page.getByRole('dialog', { name: 'Office settings — HRMO1' }).getByRole('button', { name: 'Archive office' }).click();
    await page.getByRole('button', { name: 'Archived', exact: true }).click();
    await expect(archived).toContainText('HRMO1 (10 employees)');
    await archived.getByRole('button', { name: 'Delete office HRMO1' }).click();
    dlg = page.getByRole('alertdialog', { name: 'Delete office' });
    await expect(dlg).toContainText('Delete office HRMO1? This removes 10 employees, 140 punches, 0 adjusted days, and its settings. Holidays stay. This cannot be undone.');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(archived).toContainText('HRMO1 (10 employees)');
    await archived.getByRole('button', { name: 'Delete office HRMO1' }).click();
    await dlg.getByRole('button', { name: 'Delete office' }).click();
    await expect(status).toContainText('Deleted office HRMO1.');
    await expect(archived).toContainText('No archived offices.');
    await expect(page.getByRole('heading', { name: 'HRMO1' })).toHaveCount(0);
    await expect(list).toHaveCount(11);
    await app.close();

    // Deletes persist after a relaunch.
    ({ app, page } = await launch(dir));
    await expect(employeeButtons(page)).toHaveCount(11);
    await expect(page.getByRole('heading', { name: 'HRMO1' })).toHaveCount(0);
    await expect(page.getByLabel('Office filter').locator('option')).toHaveText(['All offices', 'HRMO']);
  } finally {
    await app.close();
  }
});
