-- =============================================================================
-- Attendance status values
--
-- The roll-call UI stores attendance-specific statuses in student_task_records:
-- present / late / absent_makeup / absent_refund.
-- Keep the existing grade workflow statuses valid as well.
-- =============================================================================

begin;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.student_task_records') is null then
    raise notice 'public.student_task_records does not exist; skipping status constraint update';
    return;
  end if;

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid
      and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'student_task_records'
      and c.contype = 'c'
      and a.attname = 'status'
  loop
    execute format('alter table public.student_task_records drop constraint %I', constraint_name);
  end loop;

  alter table public.student_task_records
    add constraint student_task_records_status_check
    check (status in (
      'pending',
      'redo',
      'missing',
      'wont_do',
      'retake_ready',
      'retake_correcting',
      'correcting',
      'completed',
      'present',
      'late',
      'absent_makeup',
      'absent_refund'
    ));

  comment on constraint student_task_records_status_check
    on public.student_task_records
    is 'Grade workflow statuses plus attendance roll-call statuses used by billing carryover.';
end;
$$;

commit;
