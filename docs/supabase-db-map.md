# Supabase DB Map

Date: 2026-06-15

Project: `pmoyvpnbbitnigchvluz`

This is the current live-facing DB map for JianYiOS. The detailed cleanup notes
and next steps live in `docs/db-relationship-cleanup-plan.md`. The generated
live schema and row-count snapshot lives in `docs/supabase-live-snapshot.md`.

## Current Decision

Use `class_enrollments` / `class_tasks` / `student_task_records` as the
canonical grade track.

The older prototype tables `class_students`, `tasks`, and `task_records` are no
longer in live DB. The older Google Sheet bridge/import tables are also no
longer in live DB.

## Table Groups

| Group | Tables | Role |
|---|---|---|
| Tenant/core | `tenants`, `profiles` | Tenant boundary and staff profile. |
| School core | `students`, `classes`, `class_enrollments` | Student master, class master, roster membership. |
| Grade/task | `class_tasks`, `student_task_records` | Class tasks and each student's record/result. |
| Billing/open bag | `billing_seasons`, `billing_season_holidays`, `default_attendance`, `payment_bags`, `payment_bag_lines` | Open-bag billing workflow. |
| Schedule | `rooms`, `schedule_days`, `schedule_events`, `schedule_event_teachers`, `schedule_event_students` | Calendar schedule workflow. |
| Day workspace | `day_entries` | Todo/dinner/day notes attached to `schedule_days`. |

## Grade Relationships

```mermaid
erDiagram
  tenants ||--o{ students : owns
  tenants ||--o{ classes : owns
  tenants ||--o{ profiles : owns

  classes ||--o{ class_enrollments : roster
  students ||--o{ class_enrollments : roster

  classes ||--o{ class_tasks : tasks
  class_tasks ||--o{ student_task_records : per_student_results
  students ||--o{ student_task_records : per_student_results
```

## Billing Relationships

```mermaid
erDiagram
  billing_seasons ||--o{ billing_season_holidays : has
  classes ||--o{ billing_season_holidays : optional_scope

  billing_seasons ||--o{ default_attendance : planned_sessions
  classes ||--o{ default_attendance : planned_sessions
  billing_season_holidays ||--o{ default_attendance : shifted_by

  billing_seasons ||--o{ payment_bags : has
  classes ||--o{ payment_bags : opened_for
  payment_bags ||--o{ payment_bag_lines : contains
  students ||--o{ payment_bag_lines : billed_student
```

Billing actual attendance is intentionally not a separate table. It is derived
from `class_tasks.task_type = 'attendance'` plus `student_task_records`.

## Schedule Relationships

```mermaid
erDiagram
  rooms ||--o{ schedule_events : hosts
  schedule_days ||--o{ schedule_events : has
  classes ||--o{ schedule_events : optional_class

  schedule_events ||--o{ schedule_event_teachers : has
  profiles ||--o{ schedule_event_teachers : teaches

  schedule_events ||--o{ schedule_event_students : has
  students ||--o{ schedule_event_students : attends

  schedule_days ||--o{ day_entries : has
```

## Cleanup Notes

| Issue | Action |
|---|---|
| `day_entries` existed live but had no migration | Added `supabase/migrations/202606150002_day_entries.sql`. |
| Old map referenced removed grade tables | This file now uses `class_enrollments/class_tasks/student_task_records`. |
| `20260614000001_clean_core_rebuild.sql` header still says draft | Correct the header before the next handoff. |
| Old workspace schedule migration conflicts with calendar-style `schedule_days` | Mark `202606120002_workspace_schedule_schema.sql` as superseded or archive it. |

