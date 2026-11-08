# Roadmap

## Part one — Import to printed DTR

### Phase 0 — Import and preview NEXT

Proves the core loop: Excel file → stored locally → computed DTR shown on screen, in Electron + React.
Covers US-1, US-2, US-3.

- Admin imports HRMO.xls (and other files) and tags each with an office
- Clicking an employee shows their computed single-copy DTR for a month or half-month

**Done when:** importing `sample_data/HRMO.xls` lists 11 employees under HRMO, the data survives a restart, and the July 1–15, 2026 DTRs show the US-2 example values.

Deliberately not built, and why: print/PDF (Phase 1), in-charge settings (Phase 1), holidays and weekend labels (Phase 2), time adjustments (Phase 3), search and filters (Phase 4), archive and backup (Phase 5).

### Phase 1 — Print, PDF, office settings LATER

Covers US-4, US-5.

- Print and export a one-page A4 PDF for one employee or a whole office
- Per-office in-charge name and grace minutes, with a per-print override for the in-charge name

**Done when:** an exported PDF is one A4 page that matches the preview and shows the office's in-charge name.

Deliberately not built, and why: holidays (Phase 2), adjustments (Phase 3).

### Phase 2 — Holidays and weekends LATER

Covers US-6.

- Holiday add/edit/delete with type and a calendar view
- Holiday and weekend labels across the DTR rows

**Done when:** adding a Regular Holiday on 7/03/2026 shows its label on employees with no punches that day, and Saturdays/Sundays show their labels.

### Phase 3 — Time adjustments LATER

Covers US-7.

- Add, edit, clear, and revert any AM/PM time with a reason

**Done when:** a work-from-home entry on a holiday shows the times, recomputes the days total, and survives a re-import.

### Phase 4 — Find and check LATER

Covers US-8, US-9, US-10.

- Office filter and live name/AC-No search
- Date lookup of who worked
- Live date and time display

**Done when:** searching "lazaro" under HRMO opens his DTR, and the 7/03/2026 lookup shows the US-9 statuses.

### Phase 5 — Archive, delete, backup LATER

Covers US-11, US-12.

- Archive/restore and delete for employees, imports, and offices
- Backup to one file and restore from it

**Done when:** a backup restored after deleting all data brings back every office, employee, adjustment, and holiday.
