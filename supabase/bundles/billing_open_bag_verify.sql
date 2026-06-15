-- Generated bundle for Supabase SQL Editor.
-- Purpose: verify the slim billing/open-bag tables used by /billing.

-- =====================================================================
-- supabase/verification/202606150001_verify_billing_open_bag.sql
-- =====================================================================

with expected_tables(table_name) as (
  values
    ('billing_seasons'),
    ('billing_season_holidays'),
    ('default_attendance'),
    ('payment_bags'),
    ('payment_bag_lines')
),
table_checks as (
  select
    'table exists: ' || e.table_name as check_name,
    exists (
      select 1
      from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_name = e.table_name
    ) as ok
  from expected_tables e
),
column_checks(check_name, ok) as (
  values
    (
      'default_attendance has UUID class/season linkage',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'default_attendance'
          and column_name in ('season_id', 'class_id', 'session_index', 'default_date', 'period_key')
        group by table_name
        having count(*) = 5
      )
    ),
    (
      'payment_bag_lines has yellow-sheet fee columns',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payment_bag_lines'
          and column_name in (
            'session_count',
            'rate_per_session',
            'tuition_amount',
            'book_name',
            'book_fee',
            'misc_fee',
            'discount_amount',
            'carryover_amount',
            'total_amount'
          )
        group by table_name
        having count(*) = 9
      )
    )
),
policy_checks as (
  select
    'rls policy exists: ' || e.table_name as check_name,
    exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = e.table_name
        and p.policyname = 'tenant members can manage'
    ) as ok
  from expected_tables e
)
select * from table_checks
union all
select * from column_checks
union all
select * from policy_checks
order by check_name;
