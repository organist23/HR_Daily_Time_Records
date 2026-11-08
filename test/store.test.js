import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSheetRows, parseRows } from '../src/lib/parse.js';
import { emptyData, resolveOffice, mergeImport, loadData, saveData } from '../src/lib/store.js';

const hrmo = () => parseRows(readSheetRows(fs.readFileSync('sample_data/HRMO.xls'))).records;
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dtr-'));

describe('mergeImport', () => {
  it('adds then updates without duplicates', () => {
    const data = emptyData();
    expect(mergeImport(data, 'HRMO', hrmo())).toEqual({ added: 154, updated: 0 });
    expect(mergeImport(data, 'HRMO', hrmo())).toEqual({ added: 0, updated: 154 });
    expect(Object.keys(data.punches)).toHaveLength(154);
    expect(Object.keys(data.employees)).toHaveLength(11);
    expect(data.offices.HRMO).toEqual({ name: 'HRMO', graceMinutes: 15 });
    expect(data.punches['HRMO|14|2026-07-01|AM']).toMatchObject({ office: 'HRMO', in: '07:58' });
  });

  it('latest import name wins', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    const renamed = hrmo().filter((r) => r.acNo === '14').map((r) => ({ ...r, name: 'RELITA B. BARAYA' }));
    mergeImport(data, 'HRMO', renamed);
    expect(data.employees['HRMO|14'].name).toBe('RELITA B. BARAYA');
  });

  it('keeps an office grace setting on re-import', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    data.offices.HRMO.graceMinutes = 0;
    mergeImport(data, 'HRMO', hrmo());
    expect(data.offices.HRMO.graceMinutes).toBe(0);
  });
});

describe('resolveOffice', () => {
  it('trims and matches existing office case-insensitively', () => {
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    expect(resolveOffice(data, ' hrmo ')).toBe('HRMO');
    expect(resolveOffice(data, ' Accounting ')).toBe('Accounting');
    expect(() => resolveOffice(data, '   ')).toThrow();
  });
});

describe('loadData / saveData', () => {
  it('returns empty data when no file exists', () => {
    expect(loadData(tmpDir())).toEqual(emptyData());
  });

  it('round-trips and leaves no temp file', () => {
    const dir = tmpDir();
    const data = emptyData();
    mergeImport(data, 'HRMO', hrmo());
    saveData(dir, data);
    expect(loadData(dir)).toEqual(data);
    expect(fs.readdirSync(dir)).toEqual(['dtr-data.json']);
  });

  it('throws on a corrupt file and does not touch it', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'dtr-data.json');
    fs.writeFileSync(file, '{bad');
    expect(() => loadData(dir)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{bad');
  });
});
