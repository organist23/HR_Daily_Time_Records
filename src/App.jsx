import { useCallback, useEffect, useMemo, useState } from 'react';
import ImportDialog from './ImportDialog.jsx';

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
          <p className="muted">Select an employee to preview their DTR.</p>
        </main>
      </div>

      {pending && (
        <ImportDialog paths={pending} offices={Object.keys(data.offices)} onImport={runImport} onCancel={cancel} />
      )}
    </div>
  );
}
