-- Read-only verification for:
-- supabase/migrations/202606120000_reconcile_grade_foundation_schema.sql
--
-- Run after the reconciliation migration in a fresh or existing database.
-- Every row should return ok = true.

with verification as (
  select
    'students canonical columns exist'::text as check_name,
    not exists (
      select 1
      from (
        values
          ('legacy_student_id'),
          ('chinese_name'),
          ('english_name'),
          ('profile_id'),
          ('legacy_row_number'),
          ('raw_source'),
          ('updated_at')
      ) as required(column_name)
      where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'students'
          and c.column_name = required.column_name
      )
    ) as ok,
    'required canonical student columns'::text as detail

  union all

  select
    'students legacy aliases exist'::text,
    not exists (
      select 1
      from (
        values
          ('student_code'),
          ('chi_name'),
          ('eng_name')
      ) as required(column_name)
      where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'students'
          and c.column_name = required.column_name
      )
    ),
    'student_code, chi_name, eng_name'

  union all

  select
    'students legacy_student_id is not null'::text,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'students'
        and column_name = 'legacy_student_id'
        and is_nullable = 'NO'
    ),
    coalesce((
      select format('nullable=%s', is_nullable)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'students'
        and column_name = 'legacy_student_id'
    ), 'missing')::text

  union all

  select
    'students old aliases are nullable'::text,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'students'
        and column_name in ('student_code', 'chi_name', 'eng_name')
        and is_nullable = 'NO'
    ),
    coalesce((
      select string_agg(format('%s nullable=%s', column_name, is_nullable), ', ' order by column_name)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'students'
        and column_name in ('student_code', 'chi_name', 'eng_name')
    ), 'missing')::text

  union all

  select
    'students tenant legacy_student_id unique exists'::text,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.students'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_student_id)'
    ),
    coalesce((
      select conname
      from pg_constraint
      where conrelid = 'public.students'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_student_id)'
      limit 1
    ), 'missing')::text

  union all

  select
    'students sync trigger exists'::text,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.students'::regclass
        and tgname = 'sync_students_legacy_columns'
        and not tgisinternal
    ),
    coalesce((
      select pg_get_triggerdef(oid)
      from pg_trigger
      where tgrelid = 'public.students'::regclass
        and tgname = 'sync_students_legacy_columns'
    ), 'missing')::text

  union all

  select
    'classes canonical columns exist'::text,
    not exists (
      select 1
      from (
        values
          ('legacy_class_id'),
          ('department'),
          ('sheet_type'),
          ('raw_source'),
          ('updated_at')
      ) as required(column_name)
      where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'classes'
          and c.column_name = required.column_name
      )
    ),
    'required canonical class columns'

  union all

  select
    'classes import-facing columns are nullable'::text,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'classes'
        and column_name in ('class_code', 'source', 'class_type', 'system_sessions')
        and is_nullable = 'NO'
    ),
    coalesce((
      select string_agg(format('%s nullable=%s', column_name, is_nullable), ', ' order by column_name)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'classes'
        and column_name in ('class_code', 'source', 'class_type', 'system_sessions')
    ), 'missing')::text

  union all

  select
    'classes restrictive source/class_type checks removed'::text,
    not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.classes'::regclass
        and contype = 'c'
        and conname in ('classes_source_check', 'classes_class_type_check')
    ),
    coalesce((
      select string_agg(conname, ', ' order by conname)
      from pg_constraint
      where conrelid = 'public.classes'::regclass
        and contype = 'c'
        and conname in ('classes_source_check', 'classes_class_type_check')
    ), 'none')::text

  union all

  select
    'classes tenant legacy_class_id unique exists'::text,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.classes'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_class_id)'
    ),
    coalesce((
      select conname
      from pg_constraint
      where conrelid = 'public.classes'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_class_id)'
      limit 1
    ), 'missing')::text

  union all

  select
    'classes sync trigger exists'::text,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.classes'::regclass
        and tgname = 'sync_classes_legacy_columns'
        and not tgisinternal
    ),
    coalesce((
      select pg_get_triggerdef(oid)
      from pg_trigger
      where tgrelid = 'public.classes'::regclass
        and tgname = 'sync_classes_legacy_columns'
    ), 'missing')::text
)
select *
from verification
order by check_name;

