import { useRef, useState } from 'react';
import useDialogKeys from './useDialogKeys.js';
import { HOLIDAY_TYPES } from './lib/dtr.js';

// holiday = existing holiday to edit, or null to add one on defaultDate.
export default function HolidayDialog({ holiday, defaultDate, onSave, onDelete, onCancel }) {
  const [date, setDate] = useState(holiday?.date ?? defaultDate);
  const [name, setName] = useState(holiday?.name ?? '');
  const [type, setType] = useState(holiday?.type ?? HOLIDAY_TYPES[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useDialogKeys(first, onCancel, busy);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="holiday-title"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onSave({ date, name, type }, holiday?.date));
        }}
      >
        <h2 id="holiday-title">Holiday — {holiday ? 'Edit' : 'Add'}</h2>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Name</span>
          <input ref={first} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          {holiday && (
            <button type="button" className="danger" disabled={busy} onClick={() => run(() => onDelete(holiday.date))}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
