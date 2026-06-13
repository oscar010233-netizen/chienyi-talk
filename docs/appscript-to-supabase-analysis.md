# Apps Script to Supabase Analysis

Date: 2026-06-12

Source folder: `C:\Users\oscar\Documents\JianYiOS\apps-script`

Migration file: `supabase/migrations/202606120001_appscript_core_schema.sql`

## Execution Status

Executed in Supabase SQL Editor on 2026-06-12.

Created and verified tables:

- `legacy_sheet_schemas` with 11 schema rows
- `legacy_appscript_files` with 60 file-analysis rows
- `kanban_ranges` with 14 range rows
- `students`
- `classes`
- `class_enrollments`
- `class_tasks`
- `task_buffer_entries`
- `appsh_kanban_rows`
- `appsh_xiao_daily_rows`
- `invoice_tuition_rates`
- `invoice_fee_presets`
- `invoice_season_holidays`
- `invoice_records`
- `session_credits`

Existing tables before migration were `tenants` and `profiles`.

## Data Model Summary

The Apps Script system is a Google Sheets operating system for the cram school. The sheets are not just storage; they also encode UI state, workflow state, and writeback status.

The Supabase migration keeps two layers:

- Exact legacy mapping: `legacy_sheet_schemas`, `kanban_ranges`, and raw JSON columns preserve how the Apps Script sheets were shaped.
- Usable product tables: `students`, `classes`, `class_tasks`, `task_buffer_entries`, `appsh_kanban_rows`, `appsh_xiao_daily_rows`, `invoice_records`, and invoice config tables give the Next.js app named columns and tenant scoping.

## Core Sheets and Supabase Targets

| Apps Script Sheet | Purpose | Supabase Target |
|---|---|---|
| `StudentRoster` | Student master list and stable `studentId` source | `students` |
| `ClassConfig` | Class metadata for invoice and class setup | `classes` |
| Eng/Xiao class sheets | Dynamic class rosters, tasks, results, notes | `classes`, `class_enrollments`, `class_tasks` |
| `EngBuffer` / `XiaoBuffer` | Pending/completed task state between class sheets and Kanban | `task_buffer_entries` |
| Named Kanban ranges | Desktop Kanban boards by day/source | `kanban_ranges` plus task tables |
| `AppSh_Kanban` | Mobile AppSheet task bridge | `appsh_kanban_rows` |
| `AppSh_Input` | Mobile Xiao daily input bridge | `appsh_xiao_daily_rows` |
| `InvoiceData` | Seasonal invoice records, session dates, attendance, payment state | `invoice_records` |
| `SessionCredit` | Owed/credited sessions | `session_credits` |
| `InvoiceConfig` tuition section | Tuition plans | `invoice_tuition_rates` |
| `InvoiceConfig` fee section | Preset fees | `invoice_fee_presets` |
| `InvoiceConfig` holiday section | Season holidays | `invoice_season_holidays` |

## File-by-File Role Map

### System Entry and Configuration

| File | Role | Supabase Relevance |
|---|---|---|
| `00_Main.js` | Main menu, `onEdit`, routing by sheet type/source, lock wrapper for installable edit trigger. | Becomes app/server routing and background actions. No table by itself. |
| `01_Config.js` | Canonical constants: sheet names, sheet types, sources, Kanban ranges, buffer headers, AppSheet headers, invoice headers. | Primary source for migration schema. |
| `90_Setup.js` | Creates core sheets, writes meta cells, installs edit triggers, initializes class sheet controls. | Supabase replaces sheet creation with migrations and seed rows. |
| `99_Utils.js` | Reads sheet meta and finds sheets by type/source. | Replaced by table names, `source`, and `sheet_type` columns. |

### Student Roster and Class Student Sync

| File | Role | Supabase Relevance |
|---|---|---|
| `10_StudentRoster Core.js` | Defines `StudentRoster` layout, student status, ID format. Also contains older `getOrCreateStudentId_` logic. | Maps to `students.legacy_student_id`, names, status, school, grade, parent fields. |
| `10_StudentSync_Core.js` | Syncs visible class-sheet students into `StudentRoster`, matching by ID/name and asking user on duplicates. | Maps to `students` and `class_enrollments`. |
| `11_StudentSync_EngAdapter.js` | Reads/writes English class student slots: 2-column blocks from G onward. | Maps dynamic class sheet slots to `class_enrollments`. |
| `12_StudentSync_XiaoAdapter.js` | Reads/writes Xiao class student slots: 3-column blocks from D onward, including grade circle. | Maps Xiao slots to `class_enrollments.raw_source`. |
| `19_StudentSync_MatcherService.js` | Name normalization, student ID formatting, ID lookup. | Becomes uniqueness and lookup logic on `students`. |
| `19_StudentSync_RosterService.js` | Reads `StudentRoster`, builds student objects, creates/updates roster rows. | Direct map to `students`. |

### Class Sheet Task Dispatch

| File | Role | Supabase Relevance |
|---|---|---|
| `03_Eng_Task_Adapter.js` | Reads English class task rows by week, creates task IDs, builds buffer task names, detects terminal results. | Maps to `class_tasks` and `task_buffer_entries`. |
| `03_Xiao_Task_Adapter.js` | Reads Xiao task rows by date/week, task type, content/result/note blocks, threshold from notes. | Maps to `class_tasks` and `task_buffer_entries`. |
| `05_ClassDay_Insert.js` | Inserts new day/task rows and new student columns into class sheets. | In Supabase this becomes insert rows in `class_tasks` and `class_enrollments`. |
| `20_Task_to_Buffer Core.js` | Dispatches class tasks into `EngBuffer`/`XiaoBuffer`, validates missing thresholds, writes pending lamps back to class sheets. | Main producer for `task_buffer_entries`. |
| `29_TaskIdService.js` | Generates sequential `T000001` style task IDs through script properties. | Supabase can keep `legacy_task_id`; future IDs can use sequences or UUIDs. |

### Buffer to Kanban

| File | Role | Supabase Relevance |
|---|---|---|
| `40_BufferToKanban_Core.js` | Largest workflow: loads buffer tasks to Kanban blocks, handles locks, duplicate student picker, overflow picker, loadedTo updates, AppSheet refresh. | Maps `loaded_to`, board placement, and mobile refresh logic to `task_buffer_entries`, `appsh_kanban_rows`, and `kanban_ranges`. |
| `41_BufferToKanban_EngAdapter.js` | English-specific sorting, lamp/status rendering, closed status detection. | Status/lamp display logic for English tasks. |
| `42_BufferToKanban_XiaoAdapter.js` | Xiao-specific loading, overflow rows, quiz/homework lamp logic, grade circle display. | Status/lamp display logic for Xiao tasks. |
| `45_BufferCleanup.js` | Deletes closed written rows from buffers on trigger. | In Supabase prefer status filtering/archive, not physical deletion. |
| `48_KanbanRowRefresh_Core.js` | Refreshes visible Kanban task row from buffer state. | Becomes UI refresh query from `task_buffer_entries`. |
| `49_BufferToKanban_Helper.js` | Overflow task display helpers. | UI-only helper logic. |

### Kanban to Buffer and Class Sheet Writeback

| File | Role | Supabase Relevance |
|---|---|---|
| `50_KanbanToBuffer_Core.js` | Reads Kanban input, validates, updates buffer rows, clears inputs, appends history. | Maps to updates on `task_buffer_entries` and history fields. |
| `51_KanbanToBuffer_EngAdapter.js` | English decision adapter and input blocking rules. | English task decision logic. |
| `51_KanbanToBuffer_EngCommentWriteback.js` | Writes public parent-facing comments back to English class sheet. | Future `task_comments` table or `task_buffer_entries.comment_input`. |
| `51_KanbanToBuffer_EngPrivateNoteWriteback.js` | Writes teacher private notes back to English class sheet notes. | Future `student_notes` or private-note history. |
| `51_KanbanToBuffer_EngStatusMachine.js` | English homework/quiz/non-quiz scoring state machine. | Important business rules for future server-side validation. |
| `52_KanbanToBuffer_XiaoAdapter.js` | Xiao decision adapter, quiz/homework lamp rules, private note identity notes. | Xiao task decision logic. |
| `59_KanbanToBuffer_HwDrillStatusMachine.js` | Shared homework/drill status handling. | Shared task status rule source. |
| `60_BufferToClassSheet_Core.js` | Generic writeback core from buffer to class sheets. | Becomes Supabase updates plus optional audit logs. |
| `61_BufferToClassSheet_EngAdapter.js` | English class sheet writeback adapter. | English display/result conversion. |
| `62_BufferToClassSheet_XiaoAdapter.js` | Xiao class sheet writeback adapter plus comments/private notes. | Xiao display/result conversion. |

### AI Comment Polishing

| File | Role | Supabase Relevance |
|---|---|---|
| `06_AIComment.js` | Older in-sheet AI comment polishing and status controls. | Future AI draft/review workflow. |
| `70_CommentPolish_Core.js` | Selection-based comment polish flow. | Future `ai_comment_drafts`. |
| `71_CommentPolish_EngAdapter.js` | English selection validation and writeback. | English comment context extraction. |
| `72_CommentPolish_XiaoAdapter.js` | Xiao selection validation and writeback. | Xiao comment context extraction. |
| `79_CommentPolish_ApiService.js` | Gemini API call using Apps Script properties. | Move API key to server env and never client. |

### Parent Portal

| File | Role | Supabase Relevance |
|---|---|---|
| `07_ParentPortal.js` | Web app endpoint/search. Reads roster, EngBuffer, XiaoBuffer, and filters private notes. | Future parent-facing queries over `students` and `task_buffer_entries`. |
| `ParentIndex.html` | Parent portal UI and rendering. | Rebuild as Next.js parent portal later. |

### AppSheet Bridges

| File | Role | Supabase Relevance |
|---|---|---|
| `80_AppShKanban_Bridge.js` | Builds/upserts `AppSh_Kanban` rows from buffers; deletes stale mobile rows. | Direct map to `appsh_kanban_rows`. |
| `80_AppShKanban_Submit.js` | Handles AppSheet task submissions, photos, comments, private notes, buffer updates, class sheet writeback. | Maps mobile submissions to `appsh_kanban_rows`, `task_buffer_entries`, and future file storage. |
| `81_AppShInput_XiaoDailyBridge.js` | Builds and submits `AppSh_Input` daily Xiao attendance/homework/quiz rows. | Direct map to `appsh_xiao_daily_rows`. |

### Invoice System

| File | Role | Supabase Relevance |
|---|---|---|
| `91_Invoice_Setup.js` | Creates `ClassConfig`, `InvoiceData`, `SessionCredit`, and `InvoiceConfig` sections. | Main source for invoice schema. |
| `92_Invoice_Season.js` | Initializes season invoice rows, generates weekly session dates, shifts closed days. | Inserts/updates `invoice_records`. |
| `93_Invoice_UI.js` | Invoice dialogs, tracking, open-bag workflow, holiday saving, class config saving. | Updates invoice config and invoice records. |
| `94_Invoice_Print.js` | Renders yellow/triplicate invoice sheets, marks printed/distributed. | Future print/export workflow; updates `print_count`, `last_printed_at`, `distribute_status`. |
| Invoice HTML files | Modal/sidebar UIs for invoice workflow. | Rebuild as Next.js pages or dialogs. |

### UI and Dialog Files

| File | Role | Supabase Relevance |
|---|---|---|
| `96_UI.js` | Opens sidebars/dialogs and receives picker confirmations. | UI-only, informs future workflows. |
| `Sidebar.html` | Older Kanban control sidebar with game/pet UI. | UI-only. |
| `KanbanControlSidebar.html` | Current board action sidebar for load/sync/clear/overview. | Rebuild as teacher operations UI. |
| `KanbanStudentPicker.html` | Duplicate-student picker. | Rebuild as disambiguation modal. |
| `KanbanOverflowTaskPicker.html` | Overflow task picker. | Rebuild as task selection modal. |
| `StudentPicker.html` | Generic student picker. | Rebuild as shared component. |
| `TaskPicker.html` | Generic task picker. | Rebuild as shared component. |
| `DayLoadQueue.html` | Multi-step queue for daily load. | Rebuild as guided workflow. |
| `InvoiceBagTrackingModal.html` | Invoice bag/payment tracking modal. | Rebuild over `invoice_records`. |
| `InvoiceClassConfigSidebar.html` | Class config editor. | Rebuild over `classes`. |
| `InvoiceOpenBagSidebar.html` | Full invoice bag creation wizard. | Rebuild over invoice config, classes, students, and invoice records. |
| `InvoiceSeasonHolidaySidebar.html` | Season holiday editor. | Rebuild over `invoice_season_holidays`. |
| `InvoiceSeasonSidebar.html` | Season initialization/apply closed days UI. | Rebuild as invoice season workflow. |
| `InvoiceYellowRenderModal.html` | Yellow sheet render dialog. | Rebuild as export action. |

## Migration Notes

- `studentId`, `taskId`, `classId`, and `recordId` are retained as legacy IDs because they appear across many flows.
- Class sheets are dynamic in Google Sheets, so Supabase separates roster slots (`class_enrollments`) from tasks (`class_tasks`) and task state (`task_buffer_entries`).
- `InvoiceData` intentionally remains wide in `invoice_records` for the first migration. This preserves the working Apps Script shape before any later normalization.
- Every business table has `tenant_id` and RLS policies matching the existing `profiles.tenant_id` model.
- Existing Supabase tables before this migration were only `tenants` and `profiles`.

## Import Status

Source workbook: `C:\Users\oscar\Documents\JianYiOS\reference\jianyios_google_sheet.xlsx`

Import script: `C:\Users\oscar\Documents\JianYiOS\webapp\scripts\import-legacy-xlsx-to-supabase.py`

Verified in Supabase on 2026-06-12:

| Table | Rows |
|---|---:|
| `students` | 12 |
| `classes` | 5 |
| `class_enrollments` | 16 |
| `class_tasks` | 40 |
| `task_buffer_entries` | 42 |
| `appsh_kanban_rows` | 40 |
| `appsh_xiao_daily_rows` | 3 |
| `invoice_tuition_rates` | 3 |
| `invoice_fee_presets` | 5 |
| `invoice_season_holidays` | 2 |
| `invoice_records` | 8 |
| `session_credits` | 0 |
| `legacy_sheet_schemas` | 11 |
| `legacy_appscript_files` | 60 |
| `kanban_ranges` | 14 |
