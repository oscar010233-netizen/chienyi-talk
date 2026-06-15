-- =============================================================================
-- JianYiOS Clean Core Rebuild  (DRAFT — do not auto-apply)
-- =============================================================================
-- Source intent: docs/claude-clean-db-rebuild-prompt.md
--
-- This file lives in supabase/migrations/drafts/ on purpose. The Supabase CLI
-- only applies files directly in supabase/migrations/, so a `supabase db push`
-- will NOT pick this up. Review it, then move it up one folder (and rename with
-- a fresh timestamp) when you are ready to apply it deliberately.
--
-- What it does:
--   1. Drops the legacy Google Sheet / AppSheet bridge tables.
--   2. Drops the old "core" tables that carried legacy columns
--      (legacy_student_id, sheet_name, raw_source, ...).
--   3. Recreates 5 clean tables as the real app schema:
--        students, classes, class_enrollments, class_tasks, student_task_records
--   4. Adds tenant_id + RLS + updated_at triggers (matches existing auth model).
--   5. Adds two RPC helpers for the 五B5 workflows.
--
-- Safety notes:
--   * The current DB is mockup-only, so no real data is at risk. If you ever
--     want a snapshot first, run the companion file:
--         drafts/202606140000_archive_legacy_to_archive_schema.sql
-- Tenant_id insert pattern:
--   All five tables require `tenant_id not null`. There is intentionally NO
--   column default or trigger for it — the API routes fetch it once from the
--   `tenants` table via getTenantId() and pass it explicitly on every insert.
--   This keeps the responsibility visible in server-side code and avoids
--   magic side-effects; RLS provides the enforcement boundary.
--
--   * `drop ... cascade` also removes any leftover FK constraints from the
--     billing tables (invoice_records / session_credits) that pointed at the
--     old classes/students. Re-linking billing to the new classes/students is
--     intentionally out of scope for v1 — handle it in a later migration.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- Shared updated_at trigger fn (idempotent; already exists in earlier migrations)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1 + 2. Remove legacy / bridge / colliding-core tables
-- -----------------------------------------------------------------------------
-- Google Sheet / AppSheet bridge + buffer tables
drop table if exists public.appsh_kanban_rows      cascade;
drop table if exists public.appsh_xiao_daily_rows  cascade;
drop table if exists public.task_buffer_entries    cascade;
drop table if exists public.legacy_sheet_schemas   cascade;
drop table if exists public.legacy_appscript_files cascade;
drop table if exists public.kanban_ranges          cascade;

-- Early grade-prototype tables, if present
drop table if exists public.task_records           cascade;
drop table if exists public.tasks                  cascade;
drop table if exists public.class_students         cascade;

-- Old "core" tables that carried legacy columns — recreated clean below
drop table if exists public.student_task_records   cascade;
drop table if exists public.class_tasks            cascade;
drop table if exists public.class_enrollments      cascade;
drop table if exists public.classes                cascade;
drop table if exists public.students               cascade;

-- -----------------------------------------------------------------------------
-- 3. Clean core tables
-- -----------------------------------------------------------------------------

-- 3.1 students — school-wide student master roster
create table public.students (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  chinese_name  text,
  english_name  text,
  status        text not null default 'active'
                  check (status in ('active', 'inactive')),
  school        text,
  grade         text,
  note          text,
  parent_name   text,
  parent_phone  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- referenced by composite (id, tenant_id) FKs to keep tenant scope consistent
  unique (id, tenant_id)
);

-- 3.2 classes — class master (also consumed by billing later)
create table public.classes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  class_name       text not null,
  class_code       text,          -- optional human-readable code for billing/search; NOT a key
  department       text,
  level            text,
  class_type       text,          -- double / intensive / single
  weekday1         integer,       -- 0..6 (Sun..Sat) or your own convention
  weekday2         integer,
  system_sessions  integer,
  status           text not null default 'active'
                     check (status in ('active', 'inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- referenced by composite (id, tenant_id) FKs to keep tenant scope consistent
  unique (id, tenant_id)
);

-- class_code is for humans, not a key. Keep it unique per tenant when present so
-- billing/search can rely on it, without ever forcing it.
create unique index uq_classes_tenant_class_code
  on public.classes (tenant_id, class_code)
  where class_code is not null;

-- 3.3 class_enrollments — which student belongs to which class
create table public.class_enrollments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  class_id    uuid not null,
  student_id  uuid not null,
  status      text not null default 'active'
                check (status in ('active', 'dropped')),
  slot_order  integer,
  joined_at   date,
  left_at     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- tenant consistency: enrollment.tenant_id must equal BOTH the class's and the
  -- student's tenant_id (composite FKs reuse tenant_id in each reference).
  foreign key (class_id, tenant_id)
    references public.classes (id, tenant_id)  on delete cascade,
  foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade
);

-- A student can rejoin a class later (active -> dropped -> active), so we only
-- forbid TWO simultaneously-active rows for the same (class, student) pair.
create unique index uq_class_enrollments_active
  on public.class_enrollments (class_id, student_id)
  where status = 'active';

-- 3.4 class_tasks — a task for a class / week / lesson
create table public.class_tasks (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  class_id       uuid not null,
  week_label     text,            -- W1 / W2 ...
  lesson_label   text,            -- L1 / L2 ...
  task_type      text not null
                   check (task_type in
                     ('attendance', 'homework', 'practice', 'quiz', 'comment')),
  task_name      text,
  -- Threshold redesign (replaces the old single `threshold numeric`):
  --   threshold_value : numeric passing line, e.g. 80
  --   max_score       : numeric full marks,    e.g. 100
  --   threshold_text  : free-form fallback that preserves the original Google
  --                     Sheet format, e.g. "80/100", "B+", "通過"
  threshold_value numeric,
  max_score       numeric,
  threshold_text  text,
  display_order  integer,         -- replaces the old Google Sheet row order
  status         text not null default 'active'
                   check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- tenant consistency: task.tenant_id must equal its class's tenant_id
  foreign key (class_id, tenant_id)
    references public.classes (id, tenant_id) on delete cascade,
  -- referenced by student_task_records' composite (id, tenant_id) FK
  unique (id, tenant_id)
);

-- 3.5 student_task_records — each student's result for each task
-- (replaces the Apps Script Buffer; v1 also holds the comment row payload)
create table public.student_task_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  class_task_id   uuid not null,
  student_id      uuid not null,
  status          text not null default 'pending'
                    check (status in (
                      'pending',
                      'redo',
                      'missing',
                      'wont_do',
                      'retake_ready',
                      'retake_correcting',
                      'correcting',
                      'completed'
                    )),
  lamp            text not null default 'red'
                    check (lamp in
                      ('red','green','yellow','blue','black','white')),
  latest_result   text,
  result_history  text,
  teacher_note    text,
  comment_text    text,
  comment_status  text
                    check (comment_status in
                      ('draft','pending_publish','published','needs_republish')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- tenant consistency: record.tenant_id must equal BOTH the task's and the
  -- student's tenant_id (composite FKs reuse tenant_id in each reference).
  foreign key (class_task_id, tenant_id)
    references public.class_tasks (id, tenant_id) on delete cascade,
  foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)    on delete cascade,
  unique (class_task_id, student_id)
);

-- -----------------------------------------------------------------------------
-- 4. Indexes
-- -----------------------------------------------------------------------------
create index idx_students_tenant_status
  on public.students (tenant_id, status);
create index idx_students_tenant_names
  on public.students (tenant_id, chinese_name, english_name);

create index idx_classes_tenant_status
  on public.classes (tenant_id, status);

create index idx_class_enrollments_class
  on public.class_enrollments (class_id, status);
create index idx_class_enrollments_student
  on public.class_enrollments (student_id, status);

create index idx_class_tasks_class_order
  on public.class_tasks (class_id, display_order);

create index idx_student_task_records_task
  on public.student_task_records (class_task_id);
create index idx_student_task_records_student
  on public.student_task_records (student_id);

-- -----------------------------------------------------------------------------
-- 5. updated_at triggers + RLS (tenant-scoped, matches existing policies)
-- -----------------------------------------------------------------------------
do $$
declare
  target_table text;
  core_tables text[] := array[
    'students',
    'classes',
    'class_enrollments',
    'class_tasks',
    'student_task_records'
  ];
begin
  foreach target_table in array core_tables loop
    execute format(
      'drop trigger if exists set_%I_updated_at on public.%I',
      target_table, target_table);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      target_table, target_table);

    execute format('alter table public.%I enable row level security', target_table);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      target_table);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'tenant members can manage'
    ) then
      execute format(
        'create policy "tenant members can manage" on public.%I
           for all to authenticated
           using (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))
           with check (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))',
        target_table);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Workflow RPCs (五B5)
-- -----------------------------------------------------------------------------

-- 6.1 加入學生: enroll an EXISTING student into a class.
-- (Search-or-create lives in the app: search students first; if none, insert a
--  student row, then call this with the new id. See docs/clean-core-schema.md.)
-- Returns the active enrollment id (existing one if already enrolled).
create or replace function public.enroll_student_in_class(
  p_class_id   uuid,
  p_student_id uuid,
  p_slot_order integer default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id     uuid;
  v_enrollment_id uuid;
begin
  select tenant_id into v_tenant_id from public.classes where id = p_class_id;
  if v_tenant_id is null then
    raise exception 'class % not found', p_class_id;
  end if;

  -- already actively enrolled? return it (idempotent)
  select id into v_enrollment_id
  from public.class_enrollments
  where class_id = p_class_id
    and student_id = p_student_id
    and status = 'active'
  limit 1;

  if v_enrollment_id is not null then
    return v_enrollment_id;
  end if;

  insert into public.class_enrollments
    (tenant_id, class_id, student_id, status, slot_order, joined_at)
  values
    (v_tenant_id, p_class_id, p_student_id, 'active', p_slot_order, current_date)
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

-- 6.2 建立任務 + 為每位 active 學生建立紀錄.
-- Creates one class_task, then fans out one pending student_task_record per
-- active enrollment. Returns the new class_task id.
create or replace function public.create_class_task_with_records(
  p_class_id        uuid,
  p_task_type       text,
  p_week_label      text    default null,
  p_lesson_label    text    default null,
  p_task_name       text    default null,
  p_threshold_value numeric default null,
  p_max_score       numeric default null,
  p_threshold_text  text    default null,
  p_display_order   integer default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id uuid;
  v_task_id   uuid;
begin
  select tenant_id into v_tenant_id from public.classes where id = p_class_id;
  if v_tenant_id is null then
    raise exception 'class % not found', p_class_id;
  end if;

  insert into public.class_tasks
    (tenant_id, class_id, task_type, week_label, lesson_label,
     task_name, threshold_value, max_score, threshold_text, display_order)
  values
    (v_tenant_id, p_class_id, p_task_type, p_week_label, p_lesson_label,
     p_task_name, p_threshold_value, p_max_score, p_threshold_text, p_display_order)
  returning id into v_task_id;

  -- status defaults to 'pending' and lamp to 'red' at the column level
  insert into public.student_task_records
    (tenant_id, class_task_id, student_id)
  select v_tenant_id, v_task_id, e.student_id
  from public.class_enrollments e
  where e.class_id = p_class_id
    and e.status = 'active';

  return v_task_id;
end;
$$;

-- 7. RPC grants — restrict both helpers to authenticated users only
-- (public has no business calling them; service-role bypasses grants anyway)
revoke execute on function public.enroll_student_in_class(uuid, uuid, integer) from public;
grant  execute on function public.enroll_student_in_class(uuid, uuid, integer) to authenticated;

revoke execute on function public.create_class_task_with_records(uuid, text, text, text, text, numeric, numeric, text, integer) from public;
grant  execute on function public.create_class_task_with_records(uuid, text, text, text, text, numeric, numeric, text, integer) to authenticated;

commit;
