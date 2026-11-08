import { useEffect } from 'react';

// Focuses the first field on open and closes on Escape, except while a save is running.
export default function useDialogKeys(firstRef, onCancel, busy = false) {
  useEffect(() => {
    firstRef.current?.focus();
  }, [firstRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
}
