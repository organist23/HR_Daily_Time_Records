import { useCallback, useEffect, useMemo, useState } from 'react';
import ImportDialog from './ImportDialog.jsx';
import DtrForm from './DtrForm.jsx';
import OfficeDialog from './OfficeDialog.jsx';
import { MONTHS, computeDtr, officialHours, periodLabel } from './lib/dtr.js';

const HALVES = [['full', 'Full month'], ['first', '1–15'], ['second', '16–31']];

// Electron prefixes errors thrown in main; show only the message.
const ipcError = (e) => String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const punchesOf = (data, emp) => {
  const prefix = `${emp.office}|${emp.acNo}|`;
  return Object.entries(data.punches).filter(([k]) => k.startsWith(prefix)).map(([, p]) => p);
};

function Preview({ data, employee, onDataChange, onNotice }) {
  const punches = useMemo(() => punchesOf(data, employee), [data, employee]);

  const latest = punches.reduce((max, p) => (p.date > max ? p.date : max), '');
  const today = new Date();
  const [year, setYear] = useState(latest ? Number(latest.slice(0, 4)) : today.getFullYear());
  const [yearText, setYearText] = useState(String(year)); // year applies only once 4 digits are typed
  const [month, setMonth] = useState(latest ? Number(latest.slice(5, 7)) : today.getMonth() + 1);
  const [half, setHalf] = useState('full');
  const settings = data.offices[employee.office] ?? {};
  const [inCharge, setInCharge] = useState(settings.inCharge ?? ''); // one-print override, never saved
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [batch, setBatch] = useState(null); // { kind: 'print'|'pdf', name } while an office job renders

  const graceMinutes = settings.graceMinutes ?? 15;
  const holidays = data.holidays ?? {};
  const result = computeDtr({ punches, year, month, half, graceMinutes, holidays });
  const periodText = periodLabel(year, month, half);
  const periodShort = periodText.replace(/^For the (month|period) of /, '');
  const closeSettings = useCallback(() => setEditing(false), []);

  const saveSettings = async (patch) => {
    let next;
    try {
      next = await window.api.updateOffice(employee.office, patch);
    } catch (e) {
      throw new Error(ipcError(e));
    }
    onDataChange(next);
    // Follow the saved name only when it changed; otherwise keep a typed one-print override.
    if (next.offices[employee.office].inCharge !== (settings.inCharge ?? '')) setInCharge(next.offices[employee.office].inCharge);
    setEditing(false);
  };

  // Prints or exports whatever pages are rendered right now.
  // `afterDone` lines are shown only when the print or export actually went through.
  const job = async (kind, name, afterDone = []) => {
    setWorking(true);
    const lines = [];
    let done = false;
    try {
      if (kind === 'print') {
        const res = await window.api.print();
        done = res.ok;
        if (!res.ok && res.error !== 'cancelled') lines.push({ ok: false, text: `Could not print: ${res.error}` });
      } else {
        const res = await window.api.exportPdf(`DTR - ${name} - ${periodShort}.pdf`);
        done = Boolean(res);
        if (res) lines.push({ ok: true, text: `Saved ${res.path.split(/[\\/]/).pop()}` });
      }
    } catch (e) {
      lines.push({ ok: false, text: `Could not ${kind === 'print' ? 'print' : 'save PDF'}: ${ipcError(e)}` });
    } finally {
      setWorking(false);
    }
    if (done) lines.push(...afterDone);
    if (lines.length) onNotice(lines);
  };

  // Office jobs render every employee's page first, then print or export once.
  useEffect(() => {
    if (!batch) return;
    // Blank pages usually mean a missing import, or leave the admin should confirm.
    const blank = officePages.filter(({ result: r }) => !r.rows.some((x) => x.amIn || x.amOut || x.pmIn || x.pmOut));
    const warning = blank.length
      ? [{ ok: false, text: `${blank.length} of ${officePages.length} employees have no time records for ${periodShort}: ${blank.map(({ e }) => `${e.name} (#${e.acNo})`).join(', ')}` }]
      : [];
    job(batch.kind, batch.name, warning).finally(() => setBatch(null));
  }, [batch]); // eslint-disable-line react-hooks/exhaustive-deps

  // One pass over all punches per batch, grouped by employee.
  const officePages = useMemo(() => {
    if (!batch) return [];
    const byEmployee = new Map();
    for (const p of Object.values(data.punches)) {
      if (p.office !== employee.office) continue;
      if (!byEmployee.has(p.acNo)) byEmployee.set(p.acNo, []);
      byEmployee.get(p.acNo).push(p);
    }
    return Object.values(data.employees)
      .filter((e) => e.office === employee.office)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const p = byEmployee.get(e.acNo) ?? [];
        return { e, p, result: computeDtr({ punches: p, year, month, half, graceMinutes, holidays }) };
      });
  }, [batch, data, employee.office, year, month, half, graceMinutes, holidays]);

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
        <label>
          In charge (this print){' '}
          <input aria-label="In charge (this print)" value={inCharge} maxLength={100}
            onChange={(e) => setInCharge(e.target.value)} />
        </label>
        <button onClick={() => setEditing(true)}>Office settings</button>
        <div className="print-actions">
          <button disabled={working || !!batch} onClick={() => job('print')}>Print</button>
          <button disabled={working || !!batch} onClick={() => job('pdf', employee.name)}>Export PDF</button>
          <button disabled={working || !!batch} onClick={() => setBatch({ kind: 'print' })}>Print office</button>
          <button disabled={working || !!batch} onClick={() => setBatch({ kind: 'pdf', name: employee.office })}>Export office PDF</button>
          {working && <span className="muted">Working…</span>}
        </div>
      </div>
      <div className="page">
        <DtrForm name={employee.name} periodText={periodText}
          officialHours={officialHours(punches, year, month)} half={half} result={result} inCharge={inCharge} />
      </div>
      {batch && (
        <div className="print-batch" aria-hidden="true">
          {officePages.map(({ e, p, result: r }) => (
            <div className="page" key={`${e.office}|${e.acNo}`}>
              <DtrForm name={e.name} periodText={periodText} officialHours={officialHours(p, year, month)}
                half={half} result={r} inCharge={inCharge} />
            </div>
          ))}
        </div>
      )}
      {editing && (
        <OfficeDialog office={employee.office} settings={settings} onSave={saveSettings} onCancel={closeSettings} />
      )}
    </>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // file paths waiting for office names
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(null); // [{ ok, text }] shown in the status bar
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
      setMessages(res.results.map((r) => ({
        ok: r.ok,
        text: r.ok
          ? `${r.file}: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped (office ${r.office})`
          : `${r.file}: ${r.error}`,
      })));
    } catch (e) {
      setMessages([{ ok: false, text: `Import: ${ipcError(e)}` }]);
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

      {messages && (
        <div className="results" role="status">
          {messages.map((m, i) => <div key={i} className={m.ok ? 'ok' : 'err'}>{m.text}</div>)}
          <button className="link" onClick={() => setMessages(null)} aria-label="Dismiss messages">×</button>
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
            <Preview key={selected} data={data} employee={employee} onDataChange={setData} onNotice={setMessages} />
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
