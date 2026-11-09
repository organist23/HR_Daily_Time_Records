import { useRef, useState } from 'react';
import useDialogKeys from './useDialogKeys.js';

// Confirmation for destructive actions (delete, restore). Cancel (or Escape) is focused first and changes nothing.
export default function ConfirmDialog({ title, message, confirmLabel, busyLabel = 'Deleting…', onConfirm, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useDialogKeys(first, onCancel, busy);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" ref={first} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="danger" onClick={confirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
