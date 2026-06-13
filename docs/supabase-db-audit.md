# Supabase DB Audit

Date: 2026-06-13

Scope: JianYiOS `webapp` Supabase project `pmoyvpnbbitnigchvluz`.

Evidence used:

- Chrome Supabase Table Editor for the live `public` schema.
- Supabase REST OpenAPI schema from the project API.
- Live row counts through the Supabase service role API.
- Local migrations in `supabase/migrations`.
- Current Next.js queries in `lib/grade`, `lib/workspace`, and `app/api`.

No schema or data changes were applied during this audit.

## Current Live Tables

### Foundation

| Table | Rows | Notes |
|---|---:|---|
| `tenants` | 1 | Single-school tenant root. |
| `profiles` | 1 | User-to-tenant profile table. |

### Shared School Data

| Table | Rows | Notes |
|---|---:|---|
| `students` | 12 | Canonical roster table with `legacy_student_id`, names, parent fields, and `tenant_id`. |
| `classes` | 5 | Canonical class table shared by both current grade UI and legacy imports. |

### Current Next.js Grade UI Track

These tables are currently used by `/classes`, `/students`, `/api/enrollments`, `/api/tasks`, `/api/dispatch`, and `/api/task-records`.

| Table | Rows | Current role |
|---|---:|---|
| `class_students` | 7 | App-facing class roster slots. Does not currently have `tenant_id`. |
| `tasks` | 8 | App-facing class tasks. |
| `task_records` | 29 | App-facing per-student task state. |

### Legacy Import / Bridge Track

These tables are populated by `scripts/import-legacy-xlsx-to-supabase.py` and map the Google Sheets + Apps Script system more directly.

| Table | Rows | Current role |
|---|---:|---|
| `class_enrollments` | 16 | Imported class roster slots from legacy sheets. |
| `class_tasks` | 40 | Imported class task rows from legacy sheets. |
| `task_buffer_entries` | 42 | Imported Eng/Xiao buffer state. |
| `appsh_kanban_rows` | 40 | Imported AppSheet mobile Kanban bridge. |
| `appsh_xiao_daily_rows` | 3 | Imported Xiao daily input bridge. |

### Workspace Schedule

| Table | Rows | Current role |
|---|---:|---|
| `schedule_workspaces` | 1 | Schedule workspace root. |
| `schedule_sections` | 5 | Workspace horizontal sections/resources. |
| `schedule_days` | 7 | Weekday/date blocks. |
| `schedule_time_slots` | 280 | Time grid rows. |
| `schedule_assignments` | 74 | Grid assignments/events. |
| `schedule_side_notes` | 76 | Pickup/payment/side notes. |

### Billing / Invoice Staging

| Table | Rows | Current role |
|---|---:|---|
| `invoice_tuition_rates` | 3 | Imported invoice config. |
| `invoice_fee_presets` | 5 | Imported invoice config. |
| `invoice_season_holidays` | 2 | Imported invoice config. |
| `invoice_records` | 8 | Wide first-pass invoice import. Keep as staging until invoice UI is rebuilt. |
| `session_credits` | 0 | Schema exists, no imported rows yet. |

### Legacy Metadata

| Table | Rows | Current role |
|---|---:|---|
| `legacy_sheet_schemas` | 11 | Legacy sheet metadata. |
| `legacy_appscript_files` | 60 | Apps Script file role inventory. |
| `kanban_ranges` | 14 | Legacy desktop Kanban range metadata. |

## Class-Level Split

The live DB currently has two task/enrollment tracks. Counts by class:

| Class | Name | `class_students` | `class_enrollments` | `tasks` | `class_tasks` | `task_records` | `task_buffer_entries` |
|---|---|---:|---:|---:|---:|---:|---:|
| `CLS-001` | `發3` | 0 | 4 | 0 | 10 | 0 | 0 |
| `CLS-002` | `基礎發音班` | 0 | 4 | 0 | 10 | 0 | 0 |
| `CLS-003` | `G8課` | 0 | 1 | 0 | 0 | 0 | 0 |
| `ENG-五B5` | `五B5 英文班` | 4 | 4 | 5 | 10 | 20 | 32 |
| `XIAO-作業` | `小學堂` | 3 | 3 | 3 | 10 | 9 | 10 |

This means the current Next.js grade pages will show operational data for `ENG-五B5` and `XIAO-作業`, but `CLS-001`, `CLS-002`, and `CLS-003` only have imported legacy rows in `class_enrollments` / `class_tasks`.

## Current Relationships

Shared:

- `students.tenant_id -> tenants.id`
- `classes.tenant_id -> tenants.id`
- `profiles.tenant_id -> tenants.id`

Next.js grade UI track:

- `class_students.class_id -> classes.id`
- `class_students.student_id -> students.id`
- `tasks.class_id -> classes.id`
- `task_records.student_id -> students.id`
- `task_records.task_id -> tasks.id`
- `task_records.class_id -> classes.id`

Legacy import / bridge track:

- `class_enrollments.tenant_id -> tenants.id`
- `class_enrollments.class_id -> classes.id`
- `class_enrollments.student_id -> students.id`
- `class_tasks.tenant_id -> tenants.id`
- `class_tasks.class_id -> classes.id`
- `task_buffer_entries.tenant_id -> tenants.id`
- `task_buffer_entries.student_ref -> students.id`
- `task_buffer_entries.class_ref -> classes.id`
- `task_buffer_entries.class_task_ref -> class_tasks.id`

Workspace schedule:

- All `schedule_*` tables are tenant-scoped.
- Schedule child tables point back to `schedule_workspaces`.
- Assignments point to day, slot, and section.

## Findings

### 1. Two Grade Models Are Live

There are two active-looking grade/task models:

- App-facing model: `class_students`, `tasks`, `task_records`.
- Legacy import model: `class_enrollments`, `class_tasks`, `task_buffer_entries`.

Both contain real rows. This is acceptable during migration, but it must be explicit. Right now the code and import scripts disagree about which tables are the source of truth.

Recommended near-term rule:

- Treat `students` and `classes` as shared canonical tables.
- Treat `class_students` / `tasks` / `task_records` as the current Next.js UI track.
- Treat `class_enrollments` / `class_tasks` / `task_buffer_entries` as the legacy import and bridge track.
- Do not write new business workflows against the legacy bridge tables unless the goal is specifically Google Sheets/AppSheet migration.

### 2. Migration Chain Is Not Reproducible From Zero

`supabase/migrations/001_grade_system.sql` creates early versions of `students`, `classes`, `class_students`, `tasks`, and `task_records`.

`supabase/migrations/202606120001_appscript_core_schema.sql` later assumes a different `students` / `classes` shape, for example:

- `students.legacy_student_id`, `students.chinese_name`, `students.english_name`
- `classes.legacy_class_id`, `classes.raw_source`, `classes.updated_at`

Because both migrations use `create table if not exists`, a fresh DB that applies `001_grade_system.sql` first can keep the early table shape and then fail when the later migration tries to create indexes or import data against missing columns.

Recommended fix before relying on migrations for a fresh environment:

- Either replace the early migration with the canonical 2026-06-12 schema, or
- Add a reconciliation migration that upgrades the early `students` / `classes` shape before the 2026-06-12 migration assumptions are used.

### 3. `class_students` Is Missing Tenant Scope

`class_students` is exposed through the API and used by the current app, but it has no `tenant_id` column. It can be tenant-scoped indirectly through `classes`, but the current RLS pattern in this project expects direct `tenant_id` on business tables.

Recommended fix:

- Add `class_students.tenant_id`.
- Backfill it from `classes.tenant_id`.
- Add an index on `(tenant_id, class_id, status)`.
- Add the same tenant-member RLS policy used by the other business tables.

### 4. Service Role Routes Bypass RLS

The app uses `createServiceClient()` for grade and workspace reads/writes. That is useful during internal migration, but it means RLS is not the only safety boundary for app behavior.

Recommended fix before broader user access:

- Keep service role only inside server-only routes.
- Add explicit tenant filtering in queries.
- Move browser/client reads to the anon client only after RLS policies are verified.

### 5. Invoice Tables Are Staging, Not Final Shape

`invoice_records` intentionally preserves the wide `InvoiceData` shape. This is useful for first import but should not become the final billing model.

Recommended future model:

- `billing_seasons`
- `invoices`
- `invoice_sessions`
- `invoice_line_items`
- `payments`
- `session_credits`
- `invoice_print_events`

### 6. Legacy Metadata Tables Look Public

The Table Editor marks `legacy_sheet_schemas`, `legacy_appscript_files`, and `kanban_ranges` as unrestricted. They appear to contain metadata, not student records.

Recommended decision:

- Keep them unrestricted only if they remain non-sensitive metadata.
- If app file summaries or sheet names become sensitive, enable RLS or restrict grants.

## Recommended Cleanup Order

1. Freeze the naming rule for grade tables:
   - Short-term: keep both tracks, but document which features use which one.
   - Medium-term: converge `class_students` into `class_enrollments`.
   - Medium-term: converge `tasks` / `class_tasks` into one final task table.

2. Fix migration reproducibility:
   - Decide whether `001_grade_system.sql` is an old prototype migration or still part of the canonical chain.
   - Make a fresh DB reset path that creates the same shape as the live DB.

3. Harden `class_students`:
   - Add direct tenant scope and RLS.
   - Keep the current `class_id, student_id` uniqueness.

4. Backfill the current UI track or switch UI queries:
   - Option A: backfill `class_students` / `tasks` from `class_enrollments` / `class_tasks`, then use the current pages as-is.
   - Option B: change the current pages to read `class_enrollments` / `class_tasks` directly.
   - Option C: create final tables `student_tasks` / `task_attempts` and migrate both tracks into them.

5. Keep invoice normalization for later:
   - The current invoice import is useful staging data.
   - Normalize only when building the actual invoice workflow.

## Local Migration Drafts

`supabase/migrations/202606130001_harden_class_students_tenant_scope.sql`

Status: drafted locally, not applied to the live Supabase project during this audit.

Purpose:

- Adds `class_students.tenant_id`.
- Backfills it from `classes.tenant_id`.
- Adds a trigger that derives and validates tenant scope from `class_id` and `student_id`.
- Stops with an error if existing `class_students` rows contain class/student tenant mismatches.
- Adds an index on `(tenant_id, class_id, status)`.
- Enables RLS and adds the project-standard tenant-member policy.

Why this comes first:

- It hardens a table the current Next.js grade UI already uses.
- It does not force a decision yet about whether the final enrollment table should be `class_students` or `class_enrollments`.
- It keeps existing app writes working because the trigger can fill `tenant_id` when the API only sends `class_id` and `student_id`.

## Suggested Next SQL Work

Do not run these against production without reviewing first:

- Review and apply `202606130001_harden_class_students_tenant_scope.sql` if the current Next.js grade UI track should continue to be used.
- Create a one-time backfill from `class_enrollments` to `class_students` for `CLS-001`, `CLS-002`, and `CLS-003` if the current Next.js class pages should show those classes now.
- Create a one-time backfill from `class_tasks` to `tasks` if the current class matrix should use the imported task rows now.
- Generate a clean schema-only dump from live Supabase after cleanup and use it as the fresh-environment baseline.
