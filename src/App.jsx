import { useCallback, useEffect, useMemo, useState } from 'react';
import ImportDialog from './ImportDialog.jsx';
import DtrForm from './DtrForm.jsx';
import OfficeDialog from './OfficeDialog.jsx';
import HolidaysView from './HolidaysView.jsx';
import AdjustDialog from './AdjustDialog.jsx';
import ArchivedView from './ArchivedView.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { MONTHS, computeDtr, daysIn, effectivePunches, isDayKeyOf, officialHours, periodLabel } from './lib/dtr.js';

const NO_HOLIDAYS = {}; // stable empty map, so memoized pages are not rebuilt every render
const HALVES = [['full', 'Full month'], ['first', '1–15'], ['second', '16–31']];

// Electron prefixes errors thrown in main; show only the message.
const ipcError = (e) => String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const punchesOf = (data, emp) => {
  const prefix = `${emp.office}|${emp.acNo}|`;
  return Object.entries(data.punches).filter(([k]) => k.startsWith(prefix)).map(([, p]) => p);
};

const NO_ADJUSTMENTS = {};

// An employee is active unless they or their office is archived.
const isActive = (data, emp) => Boolean(emp) && !emp.archived && !data.offices[emp.office]?.archived;

// records: archive and delete actions from App. The preview uses only the archive ones.
function Preview({ data, employee, onDataChange, onNotice, records }) {
  const device = useMemo(() => punchesOf(data, employee), [data, employee]);
  const adjustments = data.adjustments ?? NO_ADJUSTMENTS;
  // Everything shown or printed uses device punches with the admin's adjustments applied.
  const punches = useMemo(
    () => effectivePunches(device, adjustments, employee.office, employee.acNo),
    [device, adjustments, employee],
  );

  const latest = device.reduce((max, p) => (p.date > max ? p.date : max), ''); // last imported date, not an adjustment
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
  const [adjusting, setAdjusting] = useState(null); // day of month being adjusted

  const graceMinutes = settings.graceMinutes ?? 15;
  const holidays = data.holidays ?? NO_HOLIDAYS;
  const result = computeDtr({ punches, year, month, half, graceMinutes, holidays });
  const periodText = periodLabel(year, month, half);
  const periodShort = periodText.replace(/^For the (month|period) of /, '');
  const closeSettings = useCallback(() => setEditing(false), []);
  const closeAdjust = useCallback(() => setAdjusting(null), []);
  const isoDay = (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayName = (day) => (day <= daysIn(year, month) ? `${MONTHS[month - 1]} ${day}, ${year}` : '');
  // Holidays and weekends always show their label, so they open no adjust dialog.
  const openAdjust = (day) => {
    const { label } = result.rows[day - 1];
    if (label) onNotice([{ ok: false, text: `${dayName(day)} is a non-working day (${label}). Its times cannot be adjusted.` }]);
    else setAdjusting(day);
  };

  const adjustCall = async (call) => {
    try {
      onDataChange(await call());
    } catch (e) {
      throw new Error(ipcError(e));
    }
    setAdjusting(null);
  };

  // Values for the adjust dialog: device punch, current (adjusted) value, and the stored adjustment.
  const dayInfo = (day) => {
    const date = isoDay(day);
    const pick = (list, s) => list.find((p) => p.date === date && p.session === s);
    const pair = (p) => ({ in: p?.in ?? '', out: p?.out ?? '' });
    const keys = ['AM', 'PM'].map((s) => `${employee.office}|${employee.acNo}|${date}|${s}`);
    const stored = keys.map((k) => adjustments[k]).filter(Boolean);
    return {
      date,
      device: { am: pair(pick(device, 'AM')), pm: pair(pick(device, 'PM')) },
      current: { am: pair(pick(punches, 'AM')), pm: pair(pick(punches, 'PM')) },
      last: stored.length ? stored.sort((a, b) => b.at.localeCompare(a.at))[0] : null,
    };
  };

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
    const adjByEmployee = new Map(); // acNo -> that employee's adjustments
    const officePrefix = `${employee.office}|`;
    for (const [k, a] of Object.entries(adjustments)) {
      if (!k.startsWith(officePrefix)) continue;
      const acNo = k.slice(officePrefix.length).split('|')[0];
      if (!adjByEmployee.has(acNo)) adjByEmployee.set(acNo, {});
      adjByEmployee.get(acNo)[k] = a;
    }
    return Object.values(data.employees)
      .filter((e) => e.office === employee.office && !e.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const p = effectivePunches(byEmployee.get(e.acNo) ?? [], adjByEmployee.get(e.acNo), e.office, e.acNo);
        return { e, p, result: computeDtr({ punches: p, year, month, half, graceMinutes, holidays }) };
      });
  }, [batch, data, employee.office, year, month, half, graceMinutes, holidays, adjustments]);

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
        <div className="record-actions">
          {/* Disabled during a print or PDF job: closing the preview mid-job would lose its result. */}
          {/* No delete here: delete is offered only in the Archived view, to avoid accidents. */}
          <button disabled={working || !!batch} onClick={() => records.archiveEmployee(employee)}>Archive employee</button>
        </div>
        <div className="print-actions">
          <button disabled={working || !!batch} onClick={() => job('print')}>Print</button>
          <button disabled={working || !!batch} onClick={() => job('pdf', employee.name)}>Export PDF</button>
          <button disabled={working || !!batch} onClick={() => setBatch({ kind: 'print' })}>Print office</button>
          <button disabled={working || !!batch} onClick={() => setBatch({ kind: 'pdf', name: employee.office })}>Export office PDF</button>
          {working && <span className="muted">Working…</span>}
        </div>
      </div>
      <p className="muted hint">Click a workday number on the form to adjust its times. Adjusted times are highlighted here, not on the printout.</p>
      <div className="page main-page">
        <DtrForm name={employee.name} periodText={periodText}
          officialHours={officialHours(punches, year, month)} half={half} result={result} inCharge={inCharge}
          onDayClick={openAdjust} dayName={dayName} />
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
      {adjusting && (() => {
        const info = dayInfo(adjusting);
        const day = { office: employee.office, acNo: employee.acNo, date: info.date };
        return (
          <AdjustDialog
            key={info.date}
            dateLabel={dayName(adjusting)}
            device={info.device}
            current={info.current}
            last={info.last}
            onSave={({ am, pm, reason }) => adjustCall(() => window.api.adjustDay({ ...day, am, pm, reason }))}
            onRevert={() => adjustCall(() => window.api.revertDay(day))}
            onCancel={closeAdjust}
          />
        );
      })()}
      {editing && (
        <OfficeDialog office={employee.office} settings={settings} onSave={saveSettings} onCancel={closeSettings}
          onArchive={() => { setEditing(false); records.archiveOffice(employee.office); }} />
      )}
    </>
  );
}

const CLOCK_FORMAT = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' };

// Its own component so the ticking re-renders only the clock.
// Each tick is scheduled for the next second boundary, so seconds are never skipped by drift.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 1000 - now.getMilliseconds());
    return () => clearTimeout(id);
  }, [now]);
  return <time className="clock muted" aria-label="Current date and time">{now.toLocaleString('en-US', CLOCK_FORMAT)}</time>;
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // file paths waiting for office names
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(null); // [{ ok, text }] shown in the status bar
  const [selected, setSelected] = useState(null); // employee key office|acNo
  const [view, setView] = useState('dtr'); // 'dtr' | 'holidays' | 'archived'
  const [officeFilter, setOfficeFilter] = useState(''); // '' = all offices
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, run } for a delete

  useEffect(() => {
    window.api.loadData().then(setData, (e) => setError(e.message));
  }, []);

  // Active offices and employees only. Archived ones are listed in the Archived view.
  const groups = useMemo(() => {
    if (!data) return [];
    const byOffice = {};
    for (const [key, emp] of Object.entries(data.employees)) {
      if (isActive(data, emp)) (byOffice[emp.office] ??= []).push({ key, ...emp });
    }
    return Object.keys(byOffice).sort().map((office) => ({
      office,
      employees: byOffice[office].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [data]);

  // Office filter and case-insensitive name or AC-No search, applied as the admin types.
  // A leading '#' is ignored, since the list shows AC-No as '#14'.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return groups
      .filter((g) => !officeFilter || g.office === officeFilter)
      .map((g) => ({ ...g, employees: g.employees.filter((e) => !q || e.name.toLowerCase().includes(q) || e.acNo.toLowerCase().includes(q)) }))
      .filter((g) => g.employees.length);
  }, [groups, officeFilter, search]);

  // An office that is archived or deleted leaves the filter, so the filter goes back to all offices.
  useEffect(() => {
    if (officeFilter && !groups.some((g) => g.office === officeFilter)) setOfficeFilter('');
  }, [groups, officeFilter]);

  const open = (key) => {
    setSelected(key);
    setView('dtr');
  };

  // The preview closes when the selected employee is archived or deleted.
  const employee = data && selected && isActive(data, data.employees[selected]) ? data.employees[selected] : null;

  // Counts for delete confirmations. Adjustments are stored per session, so they are counted as days.
  const keysOf = (obj, match) => Object.keys(obj ?? {}).filter(match);
  const days = (keys) => new Set(keys.map((k) => k.slice(0, k.lastIndexOf('|')))).size;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Archive and restore are reversible, so they run at once and report in the status bar.
  const setArchived = async (target, archived, label) => {
    try {
      setData(await window.api.setArchived({ ...target, archived }));
      setMessages([{ ok: true, text: archived ? `Archived ${label}. Restore it from Archived.` : `Restored ${label}.` }]);
    } catch (e) {
      setMessages([{ ok: false, text: `Could not ${archived ? 'archive' : 'restore'} ${label}: ${ipcError(e)}` }]);
    }
  };

  // Deletes ask first. The dialog shows failures and stays open until the delete succeeds or is cancelled.
  const askDelete = (title, message, confirmLabel, call, done) => setConfirm({
    title, message, confirmLabel,
    run: async () => {
      let next;
      try {
        next = await call();
      } catch (e) {
        throw new Error(ipcError(e));
      }
      setData(next);
      setConfirm(null);
      setMessages([{ ok: true, text: done }]);
    },
  });

  const records = {
    archiveEmployee: (e) => setArchived({ office: e.office, acNo: e.acNo }, true, `${e.name} (#${e.acNo})`),
    archiveOffice: (office) => setArchived({ office }, true, `office ${office}`),
    deleteEmployee: (e) => {
      const mine = (k) => isDayKeyOf(k, e.office, e.acNo);
      askDelete('Delete employee',
        `Delete ${e.name} (#${e.acNo}) from ${e.office}? This removes ${plural(keysOf(data.punches, mine).length, 'punch', 'punches')}`
          + ` and ${plural(days(keysOf(data.adjustments, mine)), 'adjusted day', 'adjusted days')}. This cannot be undone.`,
        'Delete employee', () => window.api.deleteEmployee({ office: e.office, acNo: e.acNo }), `Deleted ${e.name} (#${e.acNo}).`);
    },
    deleteOffice: (office) => {
      const ours = (k) => k.startsWith(`${office}|`);
      askDelete('Delete office',
        `Delete office ${office}? This removes ${plural(keysOf(data.employees, ours).length, 'employee', 'employees')}`
          + `, ${plural(keysOf(data.punches, ours).length, 'punch', 'punches')}`
          + `, ${plural(days(keysOf(data.adjustments, ours)), 'adjusted day', 'adjusted days')}, and its settings. Holidays stay. This cannot be undone.`,
        'Delete office', () => window.api.deleteOffice(office), `Deleted office ${office}.`);
    },
  };
  // A restore confirmation also tells main to drop the picked backup.
  const closeConfirm = () => {
    confirm?.onCancel?.();
    setConfirm(null);
  };

  const backup = async () => {
    try {
      const res = await window.api.backup();
      if (res) setMessages([{ ok: true, text: `Backup saved: ${res.path.split(/[\\/]/).pop()}` }]);
    } catch (e) {
      setMessages([{ ok: false, text: `Could not save the backup: ${ipcError(e)}` }]);
    }
  };

  // Main reads and checks the file first. Nothing changes until the admin confirms.
  const restore = async () => {
    let pick;
    try {
      pick = await window.api.restorePick();
    } catch (e) {
      setMessages([{ ok: false, text: `Could not restore: ${ipcError(e)}` }]);
      return;
    }
    if (!pick) return;
    const c = pick.counts;
    const saved = Number.isNaN(Date.parse(pick.savedAt)) ? 'at an unknown time' : new Date(pick.savedAt).toLocaleString('en-US');
    setConfirm({
      title: 'Restore backup',
      confirmLabel: 'Restore',
      busyLabel: 'Restoring…',
      message: `Replace all current data with the backup ${pick.file} saved ${saved}? It has `
        + `${plural(c.offices, 'office', 'offices')}, ${plural(c.employees, 'employee', 'employees')}, ${plural(c.punches, 'punch', 'punches')}, `
        + `${plural(c.adjustedDays, 'adjusted day', 'adjusted days')}, ${plural(c.holidays, 'holiday', 'holidays')}. `
        + (pick.copy ? `The current data will first be copied to ${pick.copy} in the data folder.` : 'There is no current data to copy.'),
      onCancel: () => window.api.restoreCancel(),
      run: async () => {
        let res;
        try {
          res = await window.api.restoreApply();
        } catch (e) {
          throw new Error(ipcError(e));
        }
        setData(res.data);
        setError('');
        setConfirm(null);
        setMessages([{ ok: true, text: res.copy ? `Restored the backup. Previous data copied to ${res.copy}.` : 'Restored the backup.' }]);
      },
    });
  };

  const pick = async () => {
    const paths = await window.api.pickExcelFiles();
    if (paths.length) setPending(paths);
  };

  const cancel = useCallback(() => setPending(null), []);

  // Holiday changes go through main; errors come back as plain messages for the dialog.
  const holidayCall = async (call) => {
    try {
      setData(await call());
    } catch (e) {
      throw new Error(ipcError(e));
    }
  };

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
            // Records in an archived office stay hidden, so say where they went.
            + (res.data.offices[r.office]?.archived ? `. Office ${r.office} is archived, see Archived.` : '')
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
        <div className="top-left">
          <h1>Employees DTR Analyzer</h1>
          <Clock />
        </div>
        <div className="top-actions">
          <button onClick={() => setView(view === 'archived' ? 'dtr' : 'archived')} disabled={!data}>
            {view === 'archived' ? 'DTR preview' : 'Archived'}
          </button>
          <button onClick={() => setView(view === 'holidays' ? 'dtr' : 'holidays')} disabled={!data}>
            {view === 'holidays' ? 'DTR preview' : 'Holidays'}
          </button>
          <button onClick={backup} disabled={!data}>Backup</button>
          {/* Enabled when the data file failed to load, so a backup can recover it. */}
          <button onClick={restore} disabled={busy || (!data && !error)}>Restore</button>
          <button className="primary" onClick={pick} disabled={busy || !data}>
            {busy ? 'Importing…' : 'Import Excel'}
          </button>
        </div>
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
          {data && groups.length === 0 && (
            <p className="muted">
              {Object.keys(data.employees).length ? 'All employees are archived. See Archived.' : 'No records yet. Import an Excel file to start.'}
            </p>
          )}
          {groups.length > 0 && (
            <div className="sidebar-filters">
              <select aria-label="Office filter" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
                <option value="">All offices</option>
                {groups.map((g) => <option key={g.office} value={g.office}>{g.office}</option>)}
              </select>
              <input type="search" aria-label="Search name or AC-No" placeholder="Search name or AC-No"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
          {groups.length > 0 && shown.length === 0 && <p className="muted">No employees match.</p>}
          {shown.map((g) => (
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
                      onClick={() => open(e.key)}
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
          {view === 'holidays' && data && (
            <HolidaysView
              holidays={data.holidays ?? NO_HOLIDAYS}
              onSave={(h, originalDate) => holidayCall(() => window.api.saveHoliday(h, originalDate))}
              onDelete={(date) => holidayCall(() => window.api.deleteHoliday(date))}
            />
          )}
          {view === 'archived' && data && (
            <ArchivedView data={data} onRestore={(target, label) => setArchived(target, false, label)}
              onDeleteOffice={records.deleteOffice} onDeleteEmployee={records.deleteEmployee} />
          )}
          {/* Kept mounted while hidden so the chosen period and override survive a visit to Holidays. */}
          <div hidden={view !== 'dtr'}>
            {employee ? (
              <Preview key={selected} data={data} employee={employee} onDataChange={setData} onNotice={setMessages} records={records} />
            ) : (
              <p className="muted empty-hint">Select an employee to preview their DTR.</p>
            )}
          </div>
        </main>
      </div>

      {pending && (
        <ImportDialog paths={pending} offices={Object.keys(data.offices)} onImport={runImport} onCancel={cancel} />
      )}
      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          busyLabel={confirm.busyLabel} onConfirm={confirm.run} onCancel={closeConfirm} />
      )}
    </div>
  );
}
