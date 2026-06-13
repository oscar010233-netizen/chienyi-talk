-- Read-only verification for:
-- supabase/migrations/202606130002_backfill_grade_ui_from_legacy_track.sql
--
-- Run after the backfill migration. Every row should return ok = true.

with task_type_map as (
  select *
  from (
    values
      (U&'\51FA\5E2D', 'attendance'),
      (U&'\4F5C\696D', 'homework'),
      (U&'\7DF4\7FD2', 'practice'),
      (U&'\8003\8A66', 'quiz'),
      (U&'\8A55\8AD6', 'comment')
  ) as mapped(legacy_task_type, app_task_type)
),
verification as (
  select
    'all active legacy enrollments exist in class_students'::text as check_name,
    not exists (
      select 1
      from public.class_enrollments ce
      left join public.class_students cs
        on cs.class_id = ce.class_id
       and cs.student_id = ce.student_id
      where ce.status = 'active'
        and ce.class_id is not null
        and ce.student_id is not null
        and cs.id is null
    ) as ok,
    format(
      'missing=%s',
      (
        select count(*)
        from public.class_enrollments ce
        left join public.class_students cs
          on cs.class_id = ce.class_id
         and cs.student_id = ce.student_id
        where ce.status = 'active'
          and ce.class_id is not null
          and ce.student_id is not null
          and cs.id is null
      )
    )::text as detail

  union all

  select
    'all active legacy tasks exist in tasks'::text,
    not exists (
      select 1
      from public.class_tasks ct
      left join public.tasks t
        on t.class_id = ct.class_id
       and t.task_code = ct.legacy_task_id
      where ct.status = 'active'
        and ct.class_id is not null
        and ct.legacy_task_id is not null
        and t.id is null
    ),
    format(
      'missing=%s',
      (
        select count(*)
        from public.class_tasks ct
        left join public.tasks t
          on t.class_id = ct.class_id
         and t.task_code = ct.legacy_task_id
        where ct.status = 'active'
          and ct.class_id is not null
          and ct.legacy_task_id is not null
          and t.id is null
      )
    )::text

  union all

  select
    'all active legacy task types are mapped'::text,
    not exists (
      select 1
      from public.class_tasks ct
      left join task_type_map tm on tm.legacy_task_type = ct.task_type
      where ct.status = 'active'
        and ct.class_id is not null
        and ct.legacy_task_id is not null
        and tm.app_task_type is null
    ),
    format(
      'unmapped=%s',
      (
        select count(*)
        from public.class_tasks ct
        left join task_type_map tm on tm.legacy_task_type = ct.task_type
        where ct.status = 'active'
          and ct.class_id is not null
          and ct.legacy_task_id is not null
          and tm.app_task_type is null
      )
    )::text

  union all

  select
    'backfilled task types match mapped legacy types'::text,
    not exists (
      select 1
      from public.class_tasks ct
      join task_type_map tm on tm.legacy_task_type = ct.task_type
      join public.tasks t
        on t.class_id = ct.class_id
       and t.task_code = ct.legacy_task_id
      where ct.status = 'active'
        and t.task_type is distinct from tm.app_task_type
    ),
    format(
      'mismatched=%s',
      (
        select count(*)
        from public.class_tasks ct
        join task_type_map tm on tm.legacy_task_type = ct.task_type
        join public.tasks t
          on t.class_id = ct.class_id
         and t.task_code = ct.legacy_task_id
        where ct.status = 'active'
          and t.task_type is distinct from tm.app_task_type
      )
    )::text

  union all

  select
    'class_students tenant values still match classes/students'::text,
    not exists (
      select 1
      from public.class_students cs
      join public.classes c on c.id = cs.class_id
      join public.students s on s.id = cs.student_id
      where cs.tenant_id is distinct from c.tenant_id
         or s.tenant_id is distinct from c.tenant_id
    ),
    format(
      'mismatched=%s',
      (
        select count(*)
        from public.class_students cs
        join public.classes c on c.id = cs.class_id
        join public.students s on s.id = cs.student_id
        where cs.tenant_id is distinct from c.tenant_id
           or s.tenant_id is distinct from c.tenant_id
      )
    )::text
)
select *
from verification
order by check_name;

