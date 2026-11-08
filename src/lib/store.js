import fs from 'node:fs';
import path from 'node:path';

const FILE = 'dtr-data.json';

export function emptyData() {
  return { version: 1, offices: {}, employees: {}, punches: {} };
}

export function resolveOffice(data, typed) {
  const name = String(typed ?? '').trim();
  if (!name) throw new Error('Office name is required');
  if (name.includes('|')) throw new Error('Office name cannot contain |');
  return Object.keys(data.offices).find((o) => o.toLowerCase() === name.toLowerCase()) ?? name;
}

export function mergeImport(data, office, records) {
  // Own-key check and object-literal define, so names like "__proto__" are stored as plain keys.
  if (!Object.hasOwn(data.offices, office)) data.offices = { ...data.offices, [office]: { name: office, graceMinutes: 15 } };
  let added = 0;
  let updated = 0;
  for (const r of records) {
    data.employees[`${office}|${r.acNo}`] = { office, acNo: r.acNo, name: r.name };
    const key = `${office}|${r.acNo}|${r.date}|${r.session}`;
    if (data.punches[key]) updated++;
    else added++;
    data.punches[key] = { ...r, office };
  }
  return { added, updated };
}

export function loadData(dir) {
  const file = path.join(dir, FILE);
  if (!fs.existsSync(file)) return emptyData();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Write to a temp file, then rename, so a crash mid-write keeps the previous file.
export function saveData(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}
