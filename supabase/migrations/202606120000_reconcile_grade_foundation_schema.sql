-- Reconcile the early grade prototype schema with the Apps Script migration.
--
-- Why this exists:
-- 001_grade_system.sql created early app-facing tables with names like
-- students.student_code / students.chi_name / classes.class_code.
-- 202606120001_appscript_core_schema.sql later expects canonical legacy
-- columns like students.legacy_student_id / students.chinese_name /
-- classes.legacy_class_id. Because both files use `create table if not exists`,
-- a fresh database can keep the early shape and then fail later.
--
-- This migration is intentionally ordered between those two files. It preserves
-- existing prototype columns, adds the canonical columns, and keeps aliases in
-- sync so both old seed data and new imports can work.

create extension if not exists pgcrypto;

alter table public.students
  add column if not exists student_code text,
  add column if not exists chi_name text,
  add column if not exists eng_name text,
  add column if not exists profile_id uuid,
  add column if not exists legacy_student_id text,
  add column if not exists chinese_name text,
  add column if not exists english_name text,
  add column if not exists legacy_row_number integer,
  add column if not exists raw_source jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.students
  alter column student_code drop not null,
  alter column chi_name drop not null,
  alter column eng_name drop not null;

update public.students
set
  legacy_student_id = coalesce(nullif(legacy_student_id, ''), nullif(student_code, ''), id::text),
  student_code = coalesce(nullif(student_code, ''), nullif(legacy_student_id, ''), id::text),
  chinese_name = coalesce(chinese_name, chi_name),
  chi_name = coalesce(chi_name, chinese_name),
  english_name = coalesce(english_name, eng_name),
  eng_name = coalesce(eng_name, english_name),
  raw_source = coalesce(raw_source, '{}'::jsonb),
  updated_at = coalesce(updated_at, now());

alter table public.students
  alter column legacy_student_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_profile_id_fkey'
  ) then
    alter table public.students
      add constraint students_profile_id_fkey
      foreign key (profile_id)
      references public.profiles(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.students'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_student_id)'
  ) then
    alter table public.students
      add constraint students_tenant_legacy_student_id_key
      unique (tenant_id, legacy_student_id);
  end if;
end;
$$;

create or replace function public.sync_students_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.legacy_student_id := coalesce(nullif(new.legacy_student_id, ''), nullif(new.student_code, ''), new.id::text);
  new.student_code := coalesce(nullif(new.student_code, ''), nullif(new.legacy_student_id, ''));
  new.chinese_name := coalesce(new.chinese_name, new.chi_name);
  new.chi_name := coalesce(new.chi_name, new.chinese_name);
  new.english_name := coalesce(new.english_name, new.eng_name);
  new.eng_name := coalesce(new.eng_name, new.english_name);
  new.raw_source := coalesce(new.raw_source, '{}'::jsonb);
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists sync_students_legacy_columns on public.students;
create trigger sync_students_legacy_columns
  before insert or update
  on public.students
  for each row
  execute function public.sync_students_legacy_columns();

alter table public.classes
  add column if not exists legacy_class_id text,
  add column if not exists department text,
  add column if not exists sheet_type text,
  add column if not exists raw_source jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.classes
  alter column class_code drop not null,
  alter column source drop not null,
  alter column class_type drop not null,
  alter column system_sessions drop not null;

alter table public.classes drop constraint if exists classes_source_check;
alter table public.classes drop constraint if exists classes_class_type_check;

update public.classes
set
  legacy_class_id = coalesce(nullif(legacy_class_id, ''), nullif(class_code, ''), nullif(sheet_name, ''), id::text),
  class_code = coalesce(nullif(class_code, ''), nullif(legacy_class_id, '')),
  raw_source = coalesce(raw_source, '{}'::jsonb),
  updated_at = coalesce(updated_at, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.classes'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, legacy_class_id)'
  ) then
    alter table public.classes
      add constraint classes_tenant_legacy_class_id_key
      unique (tenant_id, legacy_class_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.classes'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, sheet_name)'
  ) then
    alter table public.classes
      add constraint classes_tenant_sheet_name_key
      unique (tenant_id, sheet_name);
  end if;
end;
$$;

create or replace function public.sync_classes_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.legacy_class_id := coalesce(nullif(new.legacy_class_id, ''), nullif(new.class_code, ''), nullif(new.sheet_name, ''), new.id::text);
  new.class_code := coalesce(nullif(new.class_code, ''), nullif(new.legacy_class_id, ''));
  new.raw_source := coalesce(new.raw_source, '{}'::jsonb);
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists sync_classes_legacy_columns on public.classes;
create trigger sync_classes_legacy_columns
  before insert or update
  on public.classes
  for each row
  execute function public.sync_classes_legacy_columns();

create index if not exists idx_students_tenant_legacy_student_id
  on public.students (tenant_id, legacy_student_id);

create index if not exists idx_classes_tenant_legacy_class_id
  on public.classes (tenant_id, legacy_class_id);
