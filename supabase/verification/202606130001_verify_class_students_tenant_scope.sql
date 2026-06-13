-- Read-only verification for:
-- supabase/migrations/202606130001_harden_class_students_tenant_scope.sql
--
-- Run this in Supabase SQL Editor after applying the migration. Every row
-- should return ok = true.

with verification as (
  select
    'class_students.tenant_id column exists'::text as check_name,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'class_students'
        and column_name = 'tenant_id'
        and udt_name = 'uuid'
    ) as ok,
    coalesce((
      select format('type=%s nullable=%s', udt_name, is_nullable)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'class_students'
        and column_name = 'tenant_id'
    ), 'missing')::text as detail

  union all

  select
    'class_students.tenant_id is not null'::text,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'class_students'
        and column_name = 'tenant_id'
        and is_nullable = 'NO'
    ),
    coalesce((
      select format('nullable=%s', is_nullable)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'class_students'
        and column_name = 'tenant_id'
    ), 'missing')::text

  union all

  select
    'class_students.tenant_id has no null rows'::text,
    not exists (
      select 1
      from public.class_students
      where tenant_id is null
    ),
    format(
      'null_rows=%s',
      (select count(*) from public.class_students where tenant_id is null)
    )::text

  union all

  select
    'class_students tenant values match classes/students'::text,
    not exists (
      select 1
      from public.class_students cs
      join public.classes c on c.id = cs.class_id
      join public.students s on s.id = cs.student_id
      where cs.tenant_id is distinct from c.tenant_id
         or s.tenant_id is distinct from c.tenant_id
    ),
    format(
      'mismatched_rows=%s',
      (
        select count(*)
        from public.class_students cs
        join public.classes c on c.id = cs.class_id
        join public.students s on s.id = cs.student_id
        where cs.tenant_id is distinct from c.tenant_id
           or s.tenant_id is distinct from c.tenant_id
      )
    )::text

  union all

  select
    'class_students_tenant_id_fkey exists'::text,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.class_students'::regclass
        and conname = 'class_students_tenant_id_fkey'
        and contype = 'f'
    ),
    coalesce((
      select pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid = 'public.class_students'::regclass
        and conname = 'class_students_tenant_id_fkey'
    ), 'missing')::text

  union all

  select
    'set_class_students_tenant_id trigger exists'::text,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.class_students'::regclass
        and tgname = 'set_class_students_tenant_id'
        and not tgisinternal
    ),
    coalesce((
      select pg_get_triggerdef(oid)
      from pg_trigger
      where tgrelid = 'public.class_students'::regclass
        and tgname = 'set_class_students_tenant_id'
    ), 'missing')::text

  union all

  select
    'set_class_students_tenant_id function exists'::text,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'set_class_students_tenant_id'
    ),
    coalesce((
      select format('security_definer=%s', p.prosecdef)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'set_class_students_tenant_id'
      limit 1
    ), 'missing')::text

  union all

  select
    'class_students RLS enabled'::text,
    exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'class_students'
        and c.relrowsecurity
    ),
    coalesce((
      select format('relrowsecurity=%s', c.relrowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'class_students'
    ), 'missing')::text

  union all

  select
    'class_students tenant policy exists'::text,
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'class_students'
        and policyname = 'tenant members can manage'
    ),
    coalesce((
      select format('roles=%s cmd=%s', roles, cmd)
      from pg_policies
      where schemaname = 'public'
        and tablename = 'class_students'
        and policyname = 'tenant members can manage'
    ), 'missing')::text

  union all

  select
    'idx_class_students_tenant_class_status exists'::text,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'class_students'
        and indexname = 'idx_class_students_tenant_class_status'
    ),
    coalesce((
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'class_students'
        and indexname = 'idx_class_students_tenant_class_status'
    ), 'missing')::text

  union all

  select
    'authenticated role has class_students CRUD grant'::text,
    has_table_privilege('authenticated', 'public.class_students', 'SELECT')
      and has_table_privilege('authenticated', 'public.class_students', 'INSERT')
      and has_table_privilege('authenticated', 'public.class_students', 'UPDATE')
      and has_table_privilege('authenticated', 'public.class_students', 'DELETE'),
    format(
      'select=%s insert=%s update=%s delete=%s',
      has_table_privilege('authenticated', 'public.class_students', 'SELECT'),
      has_table_privilege('authenticated', 'public.class_students', 'INSERT'),
      has_table_privilege('authenticated', 'public.class_students', 'UPDATE'),
      has_table_privilege('authenticated', 'public.class_students', 'DELETE')
    )::text
)
select *
from verification
order by check_name;

