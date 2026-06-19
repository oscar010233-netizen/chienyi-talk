-- Verify the DB pieces needed by the billing/attendance closed loop.
-- Read-only: safe to run in Supabase SQL Editor.

with table_checks(check_name, ok, detail) as (
  values
    (
      'table exists: payment_bag_line_sessions',
      to_regclass('public.payment_bag_line_sessions') is not null,
      coalesce(to_regclass('public.payment_bag_line_sessions')::text, 'missing')
    ),
    (
      'table exists: payment_bag_line_items',
      to_regclass('public.payment_bag_line_items') is not null,
      coalesce(to_regclass('public.payment_bag_line_items')::text, 'missing')
    )
),
column_checks(check_name, ok, detail) as (
  values
    (
      'payment_bag_lines has carryover fields',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payment_bag_lines'
          and column_name in ('carryover_amount', 'carryover_note')
        group by table_name
        having count(*) = 2
      ),
      'carryover_amount, carryover_note'
    ),
    (
      'student_task_records has status column',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'student_task_records'
          and column_name = 'status'
      ),
      'student_task_records.status'
    )
),
status_constraint as (
  select pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid
    and a.attnum = any(c.conkey)
  where n.nspname = 'public'
    and t.relname = 'student_task_records'
    and c.contype = 'c'
    and a.attname = 'status'
),
constraint_checks(check_name, ok, detail) as (
  select
    'student_task_records.status allows attendance values',
    exists (
      select 1
      from status_constraint
      where definition like '%present%'
        and definition like '%late%'
        and definition like '%absent_makeup%'
        and definition like '%absent_refund%'
    ),
    coalesce((select definition from status_constraint limit 1), 'missing status check constraint')
)
select * from table_checks
union all
select * from column_checks
union all
select * from constraint_checks
order by check_name;
