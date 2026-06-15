# Codex Review: Clean Core Schema v2

This is a supervision note for Claude Code. The current clean-core draft is directionally good, but it should not be applied to live Supabase yet.

## Pass

- Keep the 5-table core model:
  - `students`
  - `classes`
  - `class_enrollments`
  - `class_tasks`
  - `student_task_records`
- Do not use old Google Sheet / AppSheet keys as core keys:
  - no `legacy_student_id`
  - no `legacy_class_id`
  - no `task_code`
  - no `sheet_name`
- `class_code` is acceptable as a nullable human-readable field, but it must not be a primary key.
- Tenant consistency is now handled well with composite foreign keys.
- Threshold design is improved with `threshold_value`, `max_score`, and `threshold_text`.
- The draft is safely placed under `supabase/migrations/drafts/`, so it will not auto-run.

## Must Fix Before Moving On

1. Update app code to use the new schema before applying the migration.

   Current app code still reads/writes old tables and fields:

   - `class_students` should become `class_enrollments`
   - `tasks` should become `class_tasks`
   - `task_records` should become `student_task_records`
   - `legacy_student_id`, `legacy_class_id`, `task_code`, and `sheet_name` should be removed from app queries and UI types

   Important files:

   - `app/api/students/route.ts`
   - `app/api/enrollments/route.ts`
   - `app/api/tasks/route.ts`
   - `app/api/task-records/route.ts`
   - `lib/grade/queries.ts`
   - `lib/grade/types.ts`
   - `components/grade/*.tsx`
   - `components/students/StudentRoster.tsx`

2. Fix documentation inconsistency in `docs/clean-core-schema.md`.

   The document currently says `class_code` is not included, but the table and SQL include it. Keep `class_code`, and update the sentence to say:

   > `class_code` is optional, human-readable, and not a key.

3. Decide tenant insert behavior.

   The docs say the frontend should not manually provide `tenant_id`, but the SQL currently defines `tenant_id` as `not null` without a default. Either:

   - keep the current app/server pattern where API routes fetch and provide `tenant_id`, or
   - add a DB helper/default/trigger for tenant_id.

   Do not leave the documentation saying one thing and the implementation requiring another.

4. Make `student_task_records.lamp` `not null default 'red'`.

   Current SQL has `lamp text default 'red'`, but a manual insert can still store null. Prefer:

   ```sql
   lamp text not null default 'red'
   ```

5. Add explicit grants for RPC functions.

   After creating:

   - `enroll_student_in_class`
   - `create_class_task_with_records`

   explicitly grant execute to `authenticated`, and consider revoking from `public`.

## Recommended Next Step

Do not move the draft migration into `supabase/migrations/` yet.

First update the Next.js app to the new schema, then run typecheck/build against the new table names and fields. Only after the app no longer references the removed legacy tables should the migration be promoted from draft to real migration.
