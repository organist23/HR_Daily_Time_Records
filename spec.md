# Spec: Employees DTR Analyzer

## Goal
An Electron + React desktop app that imports biometric Excel exports per office, computes each employee's Daily Time Record (CS Form 48), lets the admin adjust times and holidays, and previews, prints, and exports the DTR as PDF, with all data stored on the local PC.

## Assumptions
- Single admin user on one Windows PC. No login, no server, no database server.
- Stack: Electron, React (Vite), SheetJS for Excel parsing. Data stored as JSON files in the app's user data folder.
- All offices' devices export the same columns as `sample_data/HRMO (3).xls`: `AC-No., Name, Date, Timetable, On duty, Off duty, Clock In, Clock Out, Late, Early, Absent`. Every cell is text. Dates are `M/DD/YYYY` and times are 24h `HH:MM`. There are two rows per employee per day. Each row goes to the A.M. cells when its `On duty` is before 12:00 and to the P.M. cells otherwise. Timetable names are not used. Changed 2026-11-10: rows used to be matched by the names `Morning`/`Afternoon`, which skipped every row of `sample_data/NIGHT_shift.xls`.
- `HRMO (3).xls` is in Excel 2.1 (BIFF2) format. `.xls` (any BIFF version) and `.xlsx` must both import.
- Employee identity = office + AC-No.
- The device's `Late`, `Early`, and `Absent` columns are ignored. The app computes them (the device reports a missing punch as `01:00`, which is wrong).
- Day employees (Morning/Afternoon) and night-shift guards (`sample_data/NIGHT_shift.xls`) are supported. Changed 2026-11-10: night shift added (US-13).
- Print layout: one DTR copy per A4 portrait page, matching `sample_data/Appendix-24-Daily-Time-Record-DTR (1).docx` (header "Civil Service Form No. 48", "DAILY TIME RECORD", name, period, official hours, Day / A.M. / P.M. / Undertime table, Total row, certification, signature over printed name, VERIFIED line, In Charge).

### Computation rules (confirmed)
- **Session hours** come from the file's `On duty`/`Off duty` (HRMO: AM 08:00–12:00, PM 13:00–17:00).
- **Displayed times** are 12h `h:mm` without AM/PM (13:02 → `1:02`), as in the reference photo.
- **Late**: if arrival is later than on-duty + grace, late = arrival − on-duty in full minutes. Otherwise 0.
  - Grace is set per office and defaults to 0 minutes, so 8:01 is 1 minute late (LGU standard). Changed 2026-11-10: the default was 15, and every existing office was set to 0 (admin decision).
  - Evidence from HRMO (3).xls: 8:08 and 13:06 were not marked late, and 8:18 was marked 18 minutes late. So the device grace is between 9 and 17 minutes, with lateness counted from 8:00 once the grace is exceeded.
  - The CSC has no legal grace period, so the office can set it to 0.
- **Early departure**: if departure is earlier than off-duty, early = off-duty − departure. There is no grace.
- **One punch missing in a session** (arrival only or departure only): that session's undertime = full session length (4h).
- **Both punches missing in a session**: absence. The cells stay blank and no undertime is added. Under the CSC Omnibus Rules on Leave, absences go to leave or no pay, not undertime. Undertime (tardiness and early departure) is charged to vacation leave.
- **Day undertime** = sum of both sessions, shown in the Hours and Minutes columns.
- **Credited minutes** for a session with both punches = session length − late − early (minimum 0). This means time outside official hours is never credited.
- **Days total** = floor(total credited minutes ÷ 480). It is printed in the Total row as `<n> days`. This matches the reference photo: 100h03m ÷ 8 = 12.5 → "12 days". The undertime total goes in the Total row's Undertime columns.
- **Holidays and weekends** are non-working days. The label always goes across the time cells, with 0 credit and no undertime, even when device punches or adjustments exist on that day. Added 2026-11-08 from the Phase 2 review. Changed 2026-11-09: the label used to give way to time entries. The admin decided non-working days always show the label and add nothing to the days total. Changed 2026-11-10: night-shift rows are the exception (see Night shift below).

### Night shift (added 2026-11-10, US-13)
- **A night shift** starts on a P.M. row whose `Off duty` is `23:59` and ends on the next day's A.M. row. In `NIGHT_shift.xls` the device splits it into 17:00–23:59 (Clock In only) and 01:00–06:00 next day (Clock Out only). There is never a midnight punch.
- **Display** follows the handwritten reference photo: the arrival shows in the start day's P.M. Arrival cell, and the departure in the next day's A.M. Departure cell. Times show as punched.
- **Shift hours** run from the P.M. row's `On duty` to the next A.M. row's `Off duty`, straight through midnight (17:00 → 06:00 = 13h).
- **Credited minutes** = time from arrival to departure inside the shift hours, split at midnight: start-day row up to 24:00, next-day row from 00:00. Example: 17:12 → 06:01 credits 408 + 360 = 768 min.
- **Late** = arrival − P.M. `On duty`, with the office grace. **Early** = A.M. `Off duty` − departure.
- **Early-morning punch filed as Clock In**: the A.M. row of a night shift only ever holds the departure. When it has a Clock In but no Clock Out, that Clock In is the departure and shows in the A.M. Departure cell. Evidence from `sample_data/GSO_.xls`: RENATO NUESTRO JR 10/06 `night guard 2` Clock In 05:57, REYGAN SANNIE 10/10 Clock In 05:58, both with a blank Clock Out. The device files a punch before the 06:00 Off duty under Clock In. Added 2026-11-10 (US-13 changed).
- **Missing arrival or departure**: the shift credits 0 and its undertime is the whole shift (13h), on the start-day row. The admin fixes it with an adjustment.
- **Weekends and holidays**: a row with night-shift times shows the times and counts like any day. A row with no night-shift times still shows the label.
- **Days total** uses the same rule as day employees: floor(credited ÷ 480).

## User Stories

### US-1: Import Excel files per office
Changed 2026-11-10: rows are placed by `On duty` time, so night-shift files import (US-13).
**As** admin, **I want** to select one or more Excel files and assign each to an office, **so that** punches are stored locally under the right office.

**Accepts when:**
- [ ] Admin can select multiple `.xls`/`.xlsx` files in one import, including the BIFF2 `HRMO (3).xls`.
- [ ] Each file's office defaults to its file name without extension (`HRMO (3).xls` → `HRMO (3)`) and can be changed to a new or existing office before saving.
- [ ] After import, employees appear under the office with AC-No and name. HRMO (3).xls yields 11 employees.
- [ ] Imported data is still there after the app is closed and reopened.
- [ ] Re-importing a file with rows already stored (same office, AC-No, date, session) updates those rows and creates no duplicates.

**Rejects when:**
- [ ] A file is missing any required column: the import shows which columns are missing and saves nothing from that file.
- [ ] A file is unreadable or not Excel: an error is shown naming the file, and the other files in the same import still import.
- [ ] A row has an invalid date or time: the row is skipped and the import summary shows the skipped count.

### US-2: Compute the DTR
Changed 2026-11-10: night-shift computation added (US-13). Day-employee rules unchanged.
**As** admin, **I want** each employee's DTR computed automatically for a chosen month or half-month, **so that** I don't fill it by hand.

**Accepts when:**
- [ ] Arrival, departure, undertime, and days total follow the computation rules above.
- [ ] RONIE LOUISE BERMUDEZ, 7/01/2026: AM shows `8:00` and blank departure, undertime 4h 0m (missing punch). The PM cells are blank (absence).
- [ ] JOHN RYAN A. LAZARO, 7/08/2026 AM `8:18`: undertime 0h 18m. 7/06/2026 AM `8:08` and PM `1:06`: undertime 0h 14m at grace 0, and 0 at grace 15.
- [ ] The days total for an employee present in full 8–12 and 1–5 for 7 days = `7 days`.

**Rejects when:**
- [ ] The device's own Late/Early/Absent values are used in any computed number.
- [ ] Minutes before on-duty or after off-duty are credited.

### US-3: Preview the DTR
**As** admin, **I want** to click an employee and see their DTR as a copy of the reference form, **so that** I can check it before printing.

**Accepts when:**
- [ ] Clicking an employee shows a single-copy A4 DTR with all the form text from the reference .docx, the employee name, and the period.
- [ ] Period options: full month ("For the month of July 2026", rows 1–31) or half-month ("For the period of July 1-15, 2026" with rows 1–15, or 16–31).
- [ ] Rows for days that don't exist in the month (e.g. 31 in September) are blank.
- [ ] Official hours show the office's regular-day hours (e.g. `8:00-12:00, 1:00-5:00`).

**Rejects when:**
- [ ] The preview shows two copies on one page.
- [ ] Days outside the selected period show data.

### US-4: Print and export PDF
**As** admin, **I want** to print the DTR or save it as PDF, **so that** I can submit reports.

**Accepts when:**
- [ ] Print opens the system print dialog with the same page as the preview, on A4 portrait.
- [ ] Export PDF saves a one-page A4 PDF to a location the admin picks. Its layout matches the preview.
- [ ] Admin can print or export all employees of an office for a period in one action, one page per employee.

**Rejects when:**
- [ ] Any app UI (buttons, sidebar) appears in the printed page or PDF.
- [ ] A single DTR spills onto a second page.

### US-5: In-charge name per office
Changed 2026-11-10: grace minutes default to 0, and existing offices were set to 0 (admin decision, LGU counts 8:01 as late).
**As** admin, **I want** to set a default in-charge name per office and change it before printing, **so that** the VERIFIED signature line is correct when the person in charge changes.

**Accepts when:**
- [ ] Each office has an editable in-charge name and grace minutes (default 0).
- [ ] After the update, every existing office shows grace minutes 0, whatever it was before, and a copy of the data is saved first.
- [ ] The preview shows the office's in-charge name above "In Charge".
- [ ] The admin can override the in-charge name for one print without changing the office default.

**Rejects when:**
- [ ] A one-print override changes the saved office default.

### US-6: Holidays and weekends
Changed 2026-11-10: night-shift rows with times show the times and count on weekends and holidays (admin decision, guards work those days). Day employees unchanged.
Changed 2026-11-09: labels always win over time entries, and non-working days add no credit (admin decision, reverses the 2026-11-08 rule).

**As** admin, **I want** to add, edit, and delete holidays with a type, and have weekends labeled, **so that** those rows are filled correctly.

**Accepts when:**
- [ ] Admin can add, edit, and delete a holiday with date, name, and type (Regular Holiday, Special Non-Working Holiday, Local Holiday, Work Suspension).
- [ ] Holidays show on a calendar view.
- [ ] In the DTR, a holiday shows its type label across the A.M./P.M. cells, with 0 credit and no undertime, even when punches exist that day.
- [ ] Saturdays and Sundays show `SATURDAY` / `SUNDAY` across the cells, with 0 credit and no undertime, even when punches exist that day.
- [ ] Adding a holiday on a past date changes that day's row to the label right away.
- [ ] Deleting a holiday makes that day's row show its punches or blank again.

**Rejects when:**
- [ ] Two holidays can be saved on the same date.
- [ ] A holiday or weekend row shows times or adds credit to the days total.

### US-7: Adjust times
Changed 2026-11-10: night-shift rows can be adjusted on weekends and holidays, so a missing guard punch can be fixed.
Changed 2026-11-09: adjustments are limited to workdays, since holiday and weekend rows always show their label (see US-6).

**As** admin, **I want** to add, edit, or clear any AM/PM arrival or departure for an employee's day with a reason (e.g. work from home), **so that** the DTR shows approved adjustments.

**Accepts when:**
- [ ] Admin can set or clear each of the 4 time cells for any workday in the period, including days with no punches.
- [ ] Clicking a holiday, Saturday, or Sunday row shows a message that it is a non-working day and opens no adjust dialog.
- [ ] Each adjustment stores a reason and the date it was made. Undertime and days total recompute right away.
- [ ] The original imported punch is kept, and the admin can revert an adjustment to it.
- [ ] Adjusted cells are marked in the app view and are not marked on the printed page.

**Rejects when:**
- [ ] An invalid time is saved (e.g. `25:00`, or a departure earlier than the arrival in the same session).
- [ ] A later re-import overwrites a manual adjustment.
- [ ] An adjustment is saved for a holiday, Saturday, or Sunday.

### US-8: Find employees
**As** admin, **I want** to filter by office and search by name or AC-No, **so that** I reach an employee's DTR fast.

**Accepts when:**
- [ ] Office filter limits the employee list to that office.
- [ ] Typing part of a name or AC-No filters the list as the admin types, case-insensitive.
- [ ] Clicking a result opens its DTR preview.

**Rejects when:**
- [ ] Archived employees appear in the default list.

### US-9: Check a specific date
Withdrawn 2026-11-09: the sidebar office filter and search (US-8) are enough. Never shipped.

**As** admin, **I want** to pick a date and see who worked that day, **so that** I can verify attendance.

**Accepts when:**
- [ ] Picking a date lists employees (filterable by office) with their 4 times and a status: Present, Incomplete (a punch missing), Absent, or the holiday label.
- [ ] 7/03/2026 for HRMO shows RELITA BARAYA as Incomplete and MARY ANN EGTAPEN as Absent.

**Rejects when:**
- [ ] Employees with no data for that date are omitted instead of shown as Absent.

### US-10: Show current date and time
**As** admin, **I want** to see the current date and time in the app, **so that** I know today's date while working.

**Accepts when:**
- [ ] The date and time are always visible and update every second from the PC clock.

**Rejects when:**
- [ ] The clock stops updating while the app is open.

### US-11: Archive and delete records
Changed 2026-11-09: delete-import dropped (punches are not tracked per import, and re-importing a corrected file already overwrites them). Archiving an office hides its employees too (admin decision).
Changed 2026-11-09: Delete is offered only in the Archived view, so a record must be archived first. No delete button on the DTR screen or in Office settings (admin decision, to avoid accidental deletes).

**As** admin, **I want** to archive or delete employees and offices, **so that** old or duplicate data does not clutter the list (e.g. duplicate AC 2025204 "SHARMAINE BANAO").

**Accepts when:**
- [ ] Archiving an employee hides them from the sidebar and from office print/PDF. An "Archived" view shows them and allows restoring.
- [ ] Archiving an office hides the office and all its employees from the sidebar, the office filter, and office print/PDF. Restoring the office brings them all back.
- [ ] Re-importing into an archived office or for an archived employee keeps them archived.
- [ ] Deleting an archived employee from the Archived view asks for confirmation naming the employee and how many punches and adjusted days go with them, then removes all of it.
- [ ] Deleting an archived office from the Archived view asks for confirmation naming the office and its employee count, then removes the office, its employees, punches, adjustments, and settings. Holidays stay.

**Rejects when:**
- [ ] Delete runs without confirmation, or Cancel changes anything.
- [ ] A delete button appears on the DTR screen or in Office settings.
- [ ] Archived employees appear in the default list (also US-8).

### US-12: Backup and restore
**As** admin, **I want** to back up all data to a file and restore it, **so that** records survive a PC failure or reinstall.

**Accepts when:**
- [ ] Backup saves one file with all offices, employees, punches, adjustments, holidays, and settings to a location the admin picks.
- [ ] Restore from that file replaces current data after confirmation, and the app shows the restored data.
- [ ] Before replacing, the current data is saved as a dated copy in the data folder, and the confirmation names that copy. (Changed 2026-11-09: admin decision, so a wrong restore can be undone.)

**Rejects when:**
- [ ] Restoring an invalid or corrupt file changes any current data.

### US-13: Night shift
Changed 2026-11-10: a lone Clock In on the A.M. row of a night shift is the departure (device files punches before 06:00 under Clock In).
**As** admin, **I want** night-shift guards' files imported and computed, **so that** guards get a correct DTR like day employees.

**Accepts when:**
- [ ] Importing `sample_data/NIGHT_shift.xls` stores all 30 rows for EFREN ALCANTARA (AC 479), with 0 skipped.
- [ ] 9/02/2026 shows P.M. Arrival `5:12` and 9/03/2026 shows A.M. Departure `6:01`. The shift credits 768 min (408 + 360), 12 min late at grace 0.
- [ ] 9/04/2026 (16:44 → 9/05 06:00) credits 780 min. Saturday 9/05 shows A.M. Departure `6:00`, not `SATURDAY`.
- [ ] 9/14/2026 arrival `5:11` with no 9/15 departure: the shift credits 0 and shows 13h undertime on 9/14.
- [ ] 9/01/2026 departure `6:00` with no 8/31 data imported: shown, credits 0. With 8/31 imported, it pairs with the 8/31 arrival.
- [ ] EFREN September 1–15, 2026 at grace 0 = `9 days` (4,613 credited min, hand-derived).
- [ ] Official hours print from the data: `1:00-6:00, 5:00-11:59`.
- [ ] Day-employee DTRs (HRMO) are unchanged.
- [ ] `GSO_.xls` RENATO NUESTRO JR (519): 10/05 arrival `4:04` and 10/06 Clock In 05:57 make one shift. 10/06 shows A.M. Departure `5:57` (Arrival blank), and the shift credits 777 min (420 + 357) with 3 min early. Added 2026-11-10.

**Rejects when:**
- [ ] A night-shift row is skipped on import.
- [ ] A night-shift row with times on a weekend or holiday shows the label instead of the times.
- [ ] Minutes before the P.M. `On duty` or after the A.M. `Off duty` are credited.

### US-14: Show or hide undertime and total
Added 2026-11-10 (admin request).
**As** admin, **I want** a button that hides the undertime and total values on the DTR, **so that** I can print DTRs without them.

**Accepts when:**
- [ ] The DTR toolbar has a **Show undertime and total** / **Hide undertime and total** button. It is a screen control and does not print.
- [ ] Hidden is the default every time the app starts: each day's undertime Hours and Minutes cells and the Total row's `N days` and undertime cells are blank. The Undertime columns and the Total row stay, so the form layout does not change.
- [ ] Print, Export PDF, Print office, and Export office PDF use the same state as the screen.
- [ ] The state applies to every employee and office until the app is closed. Nothing is saved to the data file.
- [ ] Showing brings back the computed values (RONIE July 1–15: `2 days`, undertime 20h).

**Rejects when:**
- [ ] Hiding changes any computed value.
- [ ] Arrival or departure times are hidden.

### US-15: Red late arrivals
Added 2026-11-11 (admin request).
**As** admin, **I want** late arrival times shown in red, **so that** I can see tardiness at a glance on screen and on paper.

**Accepts when:**
- [ ] A day-shift A.M. or P.M. Arrival is red when it is later than on-duty + office grace, with or without a departure.
- [ ] Red shows on screen, in Print, in Export PDF, and in Print office and Export office PDF.
- [ ] Red shows whether undertime and total are shown or hidden.
- [ ] An adjusted arrival that is late is red and keeps its yellow tint on screen.
- [ ] JOHN RYAN A. LAZARO July 2026: 7/08 A.M. `8:18` is red. 7/06 `8:08` and `1:06` are red at grace 0 and black at grace 15.

**Rejects when:**
- [ ] A departure is red.
- [ ] An arrival that is not late is red (`8:00`, or `8:10` at grace 15).
- [ ] A night-shift arrival or departure is red. Night-shift times stay black.
- [ ] Red changes any computed value.

## Out of Scope
- Shift patterns other than day (Morning/Afternoon) and night (P.M. start ending on the next A.M.). Changed 2026-11-10: night shift moved into scope (US-13).
- Leave management (leave credits, leave applications). Absences are shown blank, not converted to leave.
- Login, multiple users, network sync, cloud storage.
- Automatic merging of duplicate employees across AC-Nos. The admin archives the duplicate (US-11).
- Payroll, salary deductions, habitual-tardiness reports.
- Editing the DTR form wording.

## Open Questions
- None.

## Sources for the rules
- CSC Omnibus Rules on Leave (tardiness and undertime charged to vacation leave, absence without leave is unpaid and not deducted from credits): https://www.respicio.ph/commentaries/government-employee-timekeeping-rules-time-in-time-out-and-attendance-compliance
- No legal basis for a grace period, agencies set their own rules: https://www.scribd.com/document/441991258/Absenteeism26Tardiness-doc, https://batasnatin.com/laws/csc-mc-mc-no-01-s-2017
