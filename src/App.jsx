import { useCallback, useEffect, useMemo, useState } from 'react';
import ImportDialog from './ImportDialog.jsx';
import DtrForm from './DtrForm.jsx';
import { MONTHS, computeDtr, formatTime, periodLabel } from './lib/dtr.js';

const HALVES = [['full', 'Full month'], ['first', '1–15'], ['second', '16–31']];

function Preview({ data, employee }) {
  const punches = useMemo(() => {
    const prefix = `${employee.office}|${employee.acNo}|`;
    return Object.entries(data.punches).filter(([k]) => k.startsWith(prefix)).map(([, p]) => p);
  }, [data, employee]);

  const latest = punches.reduce((max, p) => (p.date > max ? p.date : max), '');
  const today = new Date();
  const [year, setYear] = useState(latest ? Number(latest.slice(0, 4)) : today.getFullYear());
  const [yearText, setYearText] = useState(String(year)); // year applies only once 4 digits are typed
  const [month, setMonth] = useState(latest ? Number(latest.slice(5, 7)) : today.getMonth() + 1);
  const [half, setHalf] = useState('full');

  const graceMinutes = data.offices[employee.office]?.graceMinutes ?? 15;
  const result = computeDtr({ punches, year, month, half, graceMinutes });
  // Official hours from the shown month's punches; fall back to any punch for an empty month.
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const inMonth = punches.filter((p) => p.date.startsWith(monthPrefix));
  const pickSession = (s) => inMonth.find((p) => p.session === s) ?? punches.find((p) => p.session === s);
  const am = pickSession('AM');
  const pm = pickSession('PM');
  const officialHours = [am, pm].filter(Boolean)
    .map((p) => `${formatTime(p.onDuty)}-${formatTime(p.offDuty)}`).join(', ');

  return (
    <>
      <div className="controls">
        <label>
          Month{' '}
          <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label>
          Year{' '}
          <input aria-label="Year" type="number" min="2000" max="2100" value={yearText}
            onChange={(e) => {
              setYearText(e.target.value);
              const y = Number(e.target.value);
              if (y >= 2000 && y <= 2100) setYear(y);
            }} />
        </label>
        <fieldset className="halves">
          <legend className="sr-only">Period</legend>
          {HALVES.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="half" value={value} checked={half === value} onChange={() => setHalf(value)} />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="page">
        <DtrForm name={employee.name} periodText={periodLabel(year, month, half)}
          officialHours={officialHours} half={half} result={result} />
      </div>
    </>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // file paths waiting for office names
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null); // employee key office|acNo

  useEffect(() => {
    window.api.loadData().then(setData, (e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const byOffice = {};
    for (const [key, emp] of Object.entries(data.employees)) (byOffice[emp.office] ??= []).push({ key, ...emp });
    return Object.keys(byOffice).sort().map((office) => ({
      office,
      employees: byOffice[office].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [data]);

  const employee = data && selected ? data.employees[selected] : null;

  const pick = async () => {
    const paths = await window.api.pickExcelFiles();
    if (paths.length) setPending(paths);
  };

  const cancel = useCallback(() => setPending(null), []);

  const runImport = async (items) => {
    setPending(null);
    setBusy(true);
    try {
      const res = await window.api.importFiles(items);
      setData(res.data);
      setResults(res.results);
    } catch (e) {
      setResults([{ file: 'Import', ok: false, error: e.message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Employees DTR Analyzer</h1>
        <button className="primary" onClick={pick} disabled={busy || !data}>
          {busy ? 'Importing…' : 'Import Excel'}
        </button>
      </header>

      {results && (
        <div className="results" role="status">
          {results.map((r, i) => (
            <div key={i} className={r.ok ? 'ok' : 'err'}>
              {r.ok
                ? `${r.file}: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped (office ${r.office})`
                : `${r.file}: ${r.error}`}
            </div>
          ))}
          <button className="link" onClick={() => setResults(null)} aria-label="Dismiss import results">×</button>
        </div>
      )}

      <div className="body">
        <nav className="sidebar" aria-label="Employees">
          {error && <p className="err">{error}</p>}
          {!error && !data && <p className="muted">Loading…</p>}
          {data && groups.length === 0 && <p className="muted">No records yet. Import an Excel file to start.</p>}
          {groups.map((g) => (
            <section key={g.office}>
              <div className="office-head">
                <h2>{g.office}</h2>
                <span className="muted">{g.employees.length}</span>
              </div>
              <ul>
                {g.employees.map((e) => (
                  <li key={e.key}>
                    <button
                      className={selected === e.key ? 'emp active' : 'emp'}
                      aria-pressed={selected === e.key}
                      onClick={() => setSelected(e.key)}
                    >
                      <span>{e.name}</span>
                      <span className="muted">#{e.acNo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <main className="preview">
          {employee ? (
            <Preview key={selected} data={data} employee={employee} />
          ) : (
            <p className="muted">Select an employee to preview their DTR.</p>
          )}
        </main>
      </div>

      {pending && (
        <ImportDialog paths={pending} offices={Object.keys(data.offices)} onImport={runImport} onCancel={cancel} />
      )}
    </div>
  );
}
