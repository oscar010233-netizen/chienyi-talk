-- =============================================================================
-- Optional: snapshot legacy tables before the clean rebuild  (DRAFT)
-- =============================================================================
-- Run this BEFORE drafts/202606140001_clean_core_rebuild.sql ONLY if you want a
-- copy of the current (mockup) data kept around. Since the DB is mockup-only,
-- this is usually unnecessary — it exists so the rebuild stays non-destructive
-- if you ever point it at real data.
--
-- It copies each table into a separate `legacy_archive` schema via
-- CREATE TABLE AS (data only, no constraints/RLS), so it never touches or moves
-- the live tables themselves. Safe to skip.
-- =============================================================================

begin;

create schema if not exists legacy_archive;

do $$
declare
  t text;
  legacy_tables text[] := array[
    'students',
    'classes',
    'class_enrollments',
    'class_tasks',
    'task_buffer_entries',
    'appsh_kanban_rows',
    'appsh_xiao_daily_rows',
    'legacy_sheet_schemas',
    'legacy_appscript_files',
    'kanban_ranges',
    'tasks',
    'task_records',
    'class_students'
  ];
begin
  foreach t in array legacy_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop table if exists legacy_archive.%I', t);
      execute format(
        'create table legacy_archive.%I as table public.%I', t, t);
    end if;
  end loop;
end;
$$;

commit;
