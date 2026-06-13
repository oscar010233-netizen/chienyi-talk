# Supabase DB Cleanup Runbook

Date: 2026-06-13

Project: `pmoyvpnbbitnigchvluz`

This runbook is the operational checklist for the local SQL drafts created during the Supabase DB audit. It separates read-only checks from write migrations so live database changes are deliberate.

For table groups and relationships, see `docs/supabase-db-map.md`.

## Current Rule

Do not apply write migrations to the live Supabase project until the matching read-only preview or verification query has been reviewed.

## Snapshot Command

Before and after any live write migration, generate a read-only snapshot:

```powershell
npm run audit:supabase
```

This writes `docs/supabase-live-snapshot.md`. The snapshot contains public schema metadata, row counts, and class-level aggregate counts only. It does not output API keys or student-level rows.

## Fast Path Bundles

Generate copy/paste SQL bundles with:

```powershell
npm run build:supabase-bundles
```

Output files:

| File | Type | When to use |
|---|---|---|
| `supabase/bundles/live_cleanup_preflight.sql` | Read-only | Run before live writes. |
| `supabase/bundles/live_cleanup_apply.sql` | Write | Run only after reviewing preflight output. |
| `supabase/bundles/live_cleanup_verify.sql` | Read-only | Run after the live apply bundle. |
| `supabase/bundles/fresh_db_apply.sql` | Write | Clean Supabase project or local reset. |
| `supabase/bundles/fresh_db_verify.sql` | Read-only | Verify clean project or local reset. |

## Files

Write migrations:

| Order | File | Purpose |
|---:|---|---|
| 1 | `supabase/migrations/202606120000_reconcile_grade_foundation_schema.sql` | Fresh-DB compatibility between the early grade schema and the Apps Script schema. |
| 2 | `supabase/migrations/202606130001_harden_class_students_tenant_scope.sql` | Add direct tenant scope, trigger validation, RLS, and index to `class_students`. |
| 3 | `supabase/migrations/202606130002_backfill_grade_ui_from_legacy_track.sql` | Copy missing legacy-track enrollments/tasks into the current Next.js grade UI track. |

Read-only verification and preview:

| Step | File | Expected result |
|---:|---|---|
| A | `supabase/verification/202606120000_verify_grade_foundation_reconciliation.sql` | Every returned row has `ok = true`. |
| B | `supabase/verification/202606130001_verify_class_students_tenant_scope.sql` | Every returned row has `ok = true`. |
| C | `supabase/verification/202606130002_preview_grade_track_backfill.sql` | Review candidate rows before writing backfill. |
| D | `supabase/verification/202606130003_verify_grade_track_backfill.sql` | Every returned row has `ok = true`. |

## Live Project Path

Use this path for the current Supabase project after reviewing the audit. The live project already appears to have canonical `students` and `classes` columns, so the foundation reconciliation migration is usually not needed for live unless verification or schema inspection says otherwise.

1. Optional schema inspection:
   - Run `202606120000_verify_grade_foundation_reconciliation.sql` only if you want to confirm whether the live project has both canonical columns and old aliases.
   - If it fails only because old aliases are missing, that does not necessarily mean live is broken. The aliases are mainly for fresh-DB compatibility.

2. Apply tenant hardening:
   - Run `202606130001_harden_class_students_tenant_scope.sql`.
   - This is a write migration.

3. Verify tenant hardening:
   - Run `202606130001_verify_class_students_tenant_scope.sql`.
   - Continue only if every row has `ok = true`.

4. Preview grade-track convergence:
   - Run `202606130002_preview_grade_track_backfill.sql`.
   - Confirm `missing_task.preview_status` rows are `candidate`.
   - Stop if any row is `blocked_unmapped_task_type` or `blocked_duplicate_task_code`.

5. Apply grade-track backfill:
   - Run `202606130002_backfill_grade_ui_from_legacy_track.sql`.
   - This is a write migration.
   - It copies structure only. It does not create `task_records`.

6. Verify grade-track backfill:
   - Run `202606130003_verify_grade_track_backfill.sql`.
   - Continue only if every row has `ok = true`.

7. Create `task_records` through the app:
   - Open each affected class in the Next.js class page.
   - Review roster and task list.
   - Use the existing dispatch action to create per-student `task_records`.

## Fresh DB / Reset Path

Use this path for a clean Supabase project or a local reset.

1. Apply migrations in filename order:
   - `001_grade_system.sql`
   - `202606120000_reconcile_grade_foundation_schema.sql`
   - `202606120001_appscript_core_schema.sql`
   - `202606120002_workspace_schedule_schema.sql`
   - `202606130001_harden_class_students_tenant_scope.sql`
   - `202606130002_backfill_grade_ui_from_legacy_track.sql`

2. Run verification in this order:
   - `202606120000_verify_grade_foundation_reconciliation.sql`
   - `202606130001_verify_class_students_tenant_scope.sql`
   - `202606130003_verify_grade_track_backfill.sql`

3. Import legacy data only after the schema verifies:
   - Use `scripts/import-legacy-xlsx-to-supabase.py`.
   - Then rerun `202606130002_preview_grade_track_backfill.sql`.
   - If needed, rerun `202606130002_backfill_grade_ui_from_legacy_track.sql`.

## Stop Conditions

Stop and inspect before continuing if any of these happen:

- A verification row returns `ok = false`.
- The backfill preview shows `blocked_unmapped_task_type`.
- The backfill preview shows `blocked_duplicate_task_code`.
- `class_students tenant values match classes/students` fails.
- A write migration raises an exception.

## Notes

- The backfill migration is idempotent for existing `(class_id, student_id)` and `(tenant_id, task_code)` rows.
- The backfill migration intentionally does not create `task_records`.
- The final model is still undecided: the current safe path keeps `class_students` / `tasks` / `task_records` as the Next.js grade UI track while preserving `class_enrollments` / `class_tasks` / `task_buffer_entries` as the legacy import track.
