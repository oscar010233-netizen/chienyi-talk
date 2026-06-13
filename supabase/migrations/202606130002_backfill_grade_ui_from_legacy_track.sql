-- Backfill the current Next.js grade UI track from the legacy import track.
--
-- This migration intentionally copies only structural rows:
-- - class_enrollments -> class_students
-- - class_tasks -> tasks
--
-- It does not create task_records. The current app already has an explicit
-- dispatch flow that creates per-student task_records after teachers review a
-- class's roster and task list.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_students'
      and column_name = 'tenant_id'
  ) then
    raise exception 'Run 202606130001_harden_class_students_tenant_scope.sql before this backfill.';
  end if;
end;
$$;

do $$
begin
  if exists (
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
    )
    select 1
    from public.class_tasks ct
    left join public.tasks existing_same_class
      on existing_same_class.class_id = ct.class_id
     and existing_same_class.task_code = ct.legacy_task_id
    left join task_type_map tm on tm.legacy_task_type = ct.task_type
    where ct.status = 'active'
      and ct.class_id is not null
      and ct.legacy_task_id is not null
      and existing_same_class.id is null
      and tm.app_task_type is null
  ) then
    raise exception 'Some legacy class_tasks have unmapped task_type values.';
  end if;

  if exists (
    select 1
    from public.class_tasks ct
    join public.tasks existing_same_tenant
      on existing_same_tenant.tenant_id = ct.tenant_id
     and existing_same_tenant.task_code = ct.legacy_task_id
     and existing_same_tenant.class_id is distinct from ct.class_id
    left join public.tasks existing_same_class
      on existing_same_class.class_id = ct.class_id
     and existing_same_class.task_code = ct.legacy_task_id
    where ct.status = 'active'
      and ct.class_id is not null
      and ct.legacy_task_id is not null
      and existing_same_class.id is null
  ) then
    raise exception 'Some legacy class_tasks would collide with existing tasks.task_code values.';
  end if;
end;
$$;

insert into public.class_students (
  tenant_id,
  class_id,
  student_id,
  slot_order,
  status
)
select
  ce.tenant_id,
  ce.class_id,
  ce.student_id,
  coalesce(ce.slot_index, 0),
  'active'
from public.class_enrollments ce
where ce.status = 'active'
  and ce.class_id is not null
  and ce.student_id is not null
  and not exists (
    select 1
    from public.class_students cs
    where cs.class_id = ce.class_id
      and cs.student_id = ce.student_id
  )
on conflict (class_id, student_id) do nothing;

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
)
insert into public.tasks (
  tenant_id,
  class_id,
  task_code,
  week,
  lesson_number,
  task_type,
  task_name,
  threshold,
  display_order
)
select
  ct.tenant_id,
  ct.class_id,
  ct.legacy_task_id,
  coalesce(nullif(ct.week, ''), 'W1'),
  coalesce(nullif(ct.lesson, ''), 'L1'),
  tm.app_task_type,
  nullif(ct.task_name, ''),
  case
    when regexp_replace(coalesce(ct.threshold, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
      then regexp_replace(coalesce(ct.threshold, ''), '[^0-9.]', '', 'g')::numeric
    else null
  end,
  coalesce(ct.source_row, 0)
from public.class_tasks ct
join task_type_map tm on tm.legacy_task_type = ct.task_type
where ct.status = 'active'
  and ct.class_id is not null
  and ct.legacy_task_id is not null
  and not exists (
    select 1
    from public.tasks existing_same_class
    where existing_same_class.class_id = ct.class_id
      and existing_same_class.task_code = ct.legacy_task_id
  )
  and not exists (
    select 1
    from public.tasks existing_same_tenant
    where existing_same_tenant.tenant_id = ct.tenant_id
      and existing_same_tenant.task_code = ct.legacy_task_id
      and existing_same_tenant.class_id is distinct from ct.class_id
  )
on conflict (tenant_id, task_code) do nothing;
