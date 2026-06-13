# Google Sheet UI vs Database Analysis

Source Google Sheet: `簡誼OS_重新架構_2.1`

Google Sheet ID: `1hqoyUp7zodaiQEKySjwm-uKm3XlqrxnK7nVQMLeZWuI`

Local reviewed workbook: `C:\Users\oscar\Documents\JianYiOS\reference\jianyios_google_sheet.xlsx`

Reviewed on: 2026-06-12

## Summary

The workbook mixes four kinds of sheets:

- `UI`: human-facing operating screens. These should become app pages, not one-to-one database tables.
- `Database`: structured system data. These should live in Supabase tables.
- `Hybrid`: old Google Sheet screens where the UI and stored data are combined. These need to be split into app UI plus normalized Supabase data.
- `Template`: layout reference for creating new sheets/pages. These should not be imported as business data.

Important correction after reviewing every tab: `配課表UI` is a human-facing scheduling/calendar screen, not a simple database sheet and not a task board. This fork should treat it like Google Calendar or Apple Calendar: vertical time axis, horizontal classroom/location axis, event blocks in the grid, and a real-time current-time line.

## Sheet-by-Sheet Classification

| Sheet | Type | What It Does | Current Supabase Status | New App Direction |
|---|---|---|---|---|
| `配課表UI` | UI | Main calendar-like workspace for day/time scheduling, pickup notes, and classroom/location allocation. It should record which teacher is teaching which class in each time/location cell. | Imported experimentally into `schedule_workspaces`, `schedule_sections`, `schedule_days`, `schedule_time_slots`, `schedule_assignments`, and `schedule_side_notes`. Current import excludes `英文部` and `小學堂` board-style areas. | Build as the main schedule calendar UI. Store data behind it in schedule/day/location/event tables, not a same-name table. |
| `五B5` | Hybrid | English class board. Top rows contain class metadata, buttons, roster slots, and task columns; body rows contain attendance/homework/quiz status per student. | Imported into `classes`, `class_enrollments`, `class_tasks`, and `task_buffer_entries` using legacy sheet identity. | Decide whether this is active or test/legacy. If active, show as a class detail board. If test, archive or mark non-production. |
| `AppSh_Kanban` | Database | Structured mobile Kanban bridge rows for AppSheet: student, task, status, comments, photos, sync state. | Imported into `appsh_kanban_rows` with 40 rows. | Replace with app/mobile task queue. Keep admin/debug view only if needed. |
| `_ENG_CLASS_TEMPLATE` | Template | English class sheet template with default layout, task rows, roster slots, and action button labels. | Skipped from business import. | Use as layout reference for the new class page and class creation flow. |
| `⚙️ InvoiceConfig` / `InvoiceConfig` | Database | Invoice settings: tuition rates, fee presets, season holidays. | Imported into `invoice_tuition_rates`, `invoice_fee_presets`, and `invoice_season_holidays`. | Build invoice settings page. |
| `作業` | Hybrid | Xiao class/homework board. Contains student slots, attendance rows, homework rows, quiz rows, status cells, and Xiao-specific structure. | Imported into class/enrollment/task-related tables. Xiao mobile rows also map through `appsh_xiao_daily_rows`. | Build Xiao daily input/class board UI. Split attendance, homework, quiz, and per-student results into structured records. |
| `ClassConfig` | Database | Fixed class configuration table: class ID, sheet name, code, level, class type, weekdays, sessions, status. | Imported into `classes`. | Build class settings/admin page. |
| `InvoiceData` | Database | Wide invoice records: season, student, class, session dates, attendance, tuition, fees, payment, receipt and distribution state. | Imported into `invoice_records` with 8 rows. | Build invoice list, invoice detail, payment tracking, bag/open-bag, and print/export flows. |
| `SessionCredit` | Database | Session credit/debt schema for owed sessions, rate, discount, reason, status. Currently header-only. | `session_credits` table exists; 0 imported rows. | Build later as credit/adjustment management under invoices. |
| `EngBuffer` | Database | English task buffer state used between class sheets, Kanban, writeback, and AppSheet. | Imported into `task_buffer_entries`. | Keep as backend task state. A debug/admin queue can be added later. |
| `XiaoBuffer` | Database | Xiao task buffer state with grade and loaded target fields. | Imported into `task_buffer_entries`. | Keep as backend task state. A debug/admin queue can be added later. |
| `StudentRoster` | Database | Student master list with stable student IDs, names, status, school, grade, notes, and parent fields. | Imported into `students` with 12 rows. | Build student management page. |
| `AppSh_Input` | Database | Structured Xiao daily input bridge rows for AppSheet: attendance and multiple homework/quiz inputs per student. | Imported into `appsh_xiao_daily_rows` with 3 rows. | Replace with Xiao daily mobile/input UI. |
| `發3` | Hybrid | Active English class board tied to `CLS-001`. Contains roster slots and task rows for the class. | Imported into `classes`, `class_enrollments`, and `class_tasks`. | Build as an English class detail board. |
| `F發4` | Hybrid | Active English class board tied to `CLS-002`. Contains roster slots and task rows for the class. | Imported into `classes`, `class_enrollments`, and `class_tasks`. | Build as an English class detail board. |
| `G8課` | Hybrid | English class board tied to `CLS-003`; currently mostly roster/skeleton with little or no task body data. | Imported into class/enrollment structure; little task data. | Build as a class page that can start empty and then receive tasks/students. |

## Practical Migration Buckets

### Build as Real App Screens

- `配課表UI`
- `五B5`
- `作業`
- `發3`
- `F發4`
- `G8課`
- Invoice workflows currently represented by `InvoiceData` plus invoice sidebars
- Student and class admin screens from `StudentRoster` and `ClassConfig`

### Keep Primarily as Supabase Data

- `StudentRoster`
- `ClassConfig`
- `EngBuffer`
- `XiaoBuffer`
- `AppSh_Kanban`
- `AppSh_Input`
- `InvoiceData`
- `⚙️ InvoiceConfig`
- `SessionCredit`

### Do Not Import as Business Data

- `_ENG_CLASS_TEMPLATE`

## Next Schema Gap

The current import covers the system/data sheets, class-task structures, and the first experimental data model for `配課表UI`.

Recommended next tables for `配課表UI`:

- `schedule_days`
- `schedule_time_slots`
- `schedule_rooms`
- `schedule_assignments`
- `pickup_notes`
- `workspace_sections`

These should be designed from the visual intent of `配課表UI`, not copied column-for-column.

## Workspace Import Status

`配課表UI` now has a Supabase-backed calendar prototype. It excludes the board-like `英文部` and `小學堂` regions; those should become separate board views later.

| Table | Rows |
|---|---:|
| `schedule_workspaces` | 1 |
| `schedule_sections` | 5 |
| `schedule_days` | 7 |
| `schedule_time_slots` | 280 |
| `schedule_assignments` | 74 |
| `schedule_side_notes` | 76 |

Frontend route: `/workspace`

Current behavior: `/workspace` reads Supabase first and falls back to the extracted JSON file if the Supabase schedule data is unavailable.

Current UI direction:

- Vertical axis: time.
- Horizontal axis: classroom/location.
- Grid content: schedule events, eventually with teacher and class as structured fields.
- Current-time indicator: red line, shown on the current weekday.
- Resource columns use fixed widths with horizontal scrolling instead of stretching endlessly.
- Display density supports `標準` and `緊湊`, inspired by calendar information-density controls.
- Excluded from this view: `英文部` task board and `小學堂` board.
