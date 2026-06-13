-- Read-only preview for converging the legacy import grade track into the
-- current Next.js grade UI track.
--
-- This does not insert, update, or delete anything. It only shows what would
-- need attention before making `/classes` show the imported legacy classes.

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
class_summary as (
  select
    c.id as class_id,
    coalesce(c.legacy_class_id, c.class_code, c.sheet_name, c.id::text) as class_key,
    c.class_name,
    (
      select count(*)
      from public.class_students cs
      where cs.class_id = c.id
        and cs.status = 'active'
    ) as app_enrollments,
    (
      select count(*)
      from public.class_enrollments ce
      where ce.class_id = c.id
        and ce.status = 'active'
    ) as legacy_enrollments,
    (
      select count(*)
      from public.tasks t
      where t.class_id = c.id
    ) as app_tasks,
    (
      select count(*)
      from public.class_tasks ct
      where ct.class_id = c.id
        and ct.status = 'active'
    ) as legacy_tasks
  from public.classes c
),
missing_enrollments as (
  select
    coalesce(c.legacy_class_id, c.class_code, c.sheet_name, c.id::text) as class_key,
    ce.legacy_student_id as item_key,
    jsonb_build_object(
      'class_id', ce.class_id,
      'student_id', ce.student_id,
      'legacy_student_id', ce.legacy_student_id,
      'legacy_slot_index', ce.slot_index,
      'proposed_slot_order', ce.slot_index,
      'legacy_source', ce.source
    ) as detail
  from public.class_enrollments ce
  join public.classes c on c.id = ce.class_id
  left join public.class_students cs
    on cs.class_id = ce.class_id
   and cs.student_id = ce.student_id
  where ce.status = 'active'
    and ce.class_id is not null
    and ce.student_id is not null
    and cs.id is null
),
legacy_tasks_normalized as (
  select
    coalesce(c.legacy_class_id, c.class_code, c.sheet_name, c.id::text) as class_key,
    ct.*,
    tm.app_task_type,
    case
      when regexp_replace(coalesce(ct.threshold, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        then regexp_replace(coalesce(ct.threshold, ''), '[^0-9.]', '', 'g')::numeric
      else null
    end as threshold_numeric
  from public.class_tasks ct
  join public.classes c on c.id = ct.class_id
  left join task_type_map tm on tm.legacy_task_type = ct.task_type
  where ct.status = 'active'
    and ct.class_id is not null
),
missing_tasks as (
  select
    ltn.class_key,
    ltn.legacy_task_id as item_key,
    case
      when ltn.app_task_type is null then 'blocked_unmapped_task_type'
      when existing_same_class.id is not null then 'already_exists_same_class'
      when existing_same_tenant.id is not null then 'blocked_duplicate_task_code'
      else 'candidate'
    end as preview_status,
    jsonb_build_object(
      'class_id', ltn.class_id,
      'legacy_task_id', ltn.legacy_task_id,
      'legacy_task_type', ltn.task_type,
      'mapped_task_type', ltn.app_task_type,
      'week', ltn.week,
      'lesson', ltn.lesson,
      'task_name', ltn.task_name,
      'raw_task_name', ltn.raw_task_name,
      'threshold_text', ltn.threshold,
      'threshold_numeric', ltn.threshold_numeric,
      'source_row', ltn.source_row,
      'proposed_display_order', ltn.source_row
    ) as detail
  from legacy_tasks_normalized ltn
  left join public.tasks existing_same_class
    on existing_same_class.class_id = ltn.class_id
   and existing_same_class.task_code = ltn.legacy_task_id
  left join public.tasks existing_same_tenant
    on existing_same_tenant.tenant_id = ltn.tenant_id
   and existing_same_tenant.task_code = ltn.legacy_task_id
   and existing_same_tenant.class_id is distinct from ltn.class_id
  where existing_same_class.id is null
)
select
  'class_summary'::text as section,
  class_key,
  'counts'::text as item_key,
  case
    when app_enrollments = legacy_enrollments and app_tasks = legacy_tasks then 'aligned'
    else 'diff'
  end as preview_status,
  jsonb_build_object(
    'class_name', class_name,
    'app_enrollments', app_enrollments,
    'legacy_enrollments', legacy_enrollments,
    'missing_enrollments', greatest(legacy_enrollments - app_enrollments, 0),
    'app_tasks', app_tasks,
    'legacy_tasks', legacy_tasks,
    'missing_tasks', greatest(legacy_tasks - app_tasks, 0)
  ) as detail
from class_summary

union all

select
  'missing_enrollment'::text as section,
  class_key,
  item_key,
  'candidate'::text as preview_status,
  detail
from missing_enrollments

union all

select
  'missing_task'::text as section,
  class_key,
  item_key,
  preview_status,
  detail
from missing_tasks

order by section, class_key, item_key;

