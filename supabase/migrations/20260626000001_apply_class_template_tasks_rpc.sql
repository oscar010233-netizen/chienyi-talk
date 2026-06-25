create or replace function public.fn_apply_class_template_tasks(
  p_tenant_id uuid,
  p_task_ids_to_delete uuid[],
  p_task_rows jsonb,
  p_student_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_rows jsonb := coalesce(p_task_rows, '[]'::jsonb);
begin
  if p_tenant_id is null then
    raise exception 'p_tenant_id required';
  end if;

  if jsonb_typeof(v_task_rows) <> 'array' then
    raise exception 'p_task_rows must be a json array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_task_rows) as task_row(
      tenant_id uuid,
      class_id uuid,
      bag_id uuid,
      slot_index integer,
      lesson_label text,
      task_type text,
      task_name text,
      threshold_value numeric,
      threshold_text text,
      max_score numeric,
      display_order integer
    )
    where task_row.tenant_id is distinct from p_tenant_id
  ) then
    raise exception 'task row tenant mismatch';
  end if;

  if coalesce(array_length(p_task_ids_to_delete, 1), 0) > 0 then
    delete from public.student_task_records
    where tenant_id = p_tenant_id
      and class_task_id = any(p_task_ids_to_delete);

    delete from public.class_tasks
    where tenant_id = p_tenant_id
      and id = any(p_task_ids_to_delete);
  end if;

  if jsonb_array_length(v_task_rows) = 0 then
    return;
  end if;

  with task_rows as (
    select
      task_row.tenant_id,
      task_row.class_id,
      task_row.bag_id,
      task_row.slot_index,
      task_row.lesson_label,
      task_row.task_type,
      task_row.task_name,
      task_row.threshold_value,
      task_row.max_score,
      task_row.threshold_text,
      task_row.display_order
    from jsonb_to_recordset(v_task_rows) as task_row(
      tenant_id uuid,
      class_id uuid,
      bag_id uuid,
      slot_index integer,
      lesson_label text,
      task_type text,
      task_name text,
      threshold_value numeric,
      threshold_text text,
      max_score numeric,
      display_order integer
    )
  ),
  inserted_tasks as (
    insert into public.class_tasks (
      tenant_id,
      class_id,
      bag_id,
      slot_index,
      lesson_label,
      task_type,
      task_name,
      threshold_value,
      threshold_text,
      max_score,
      display_order
    )
    select
      tenant_id,
      class_id,
      bag_id,
      slot_index,
      lesson_label,
      task_type,
      task_name,
      threshold_value,
      threshold_text,
      max_score,
      display_order
    from task_rows
    returning id, tenant_id
  )
  insert into public.student_task_records (
    tenant_id,
    class_task_id,
    student_id
  )
  select
    inserted_tasks.tenant_id,
    inserted_tasks.id,
    student_ids.student_id
  from inserted_tasks
  cross join unnest(coalesce(p_student_ids, array[]::uuid[])) as student_ids(student_id);
end;
$$;
