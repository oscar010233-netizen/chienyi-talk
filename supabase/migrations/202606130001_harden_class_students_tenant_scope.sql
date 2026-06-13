-- Harden the current Next.js grade UI enrollment table.
--
-- `class_students` belongs to the app-facing grade track
-- (`class_students` / `tasks` / `task_records`). It originally relied on
-- `classes.tenant_id` indirectly. This migration adds direct tenant scope so
-- RLS can use the same policy shape as the other business tables.

alter table public.class_students
  add column if not exists tenant_id uuid;

update public.class_students cs
set tenant_id = c.tenant_id
from public.classes c
where cs.class_id = c.id
  and cs.tenant_id is distinct from c.tenant_id;

create or replace function public.set_class_students_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_tenant_id uuid;
  student_tenant_id uuid;
begin
  select c.tenant_id
    into class_tenant_id
    from public.classes c
    where c.id = new.class_id;

  if class_tenant_id is null then
    raise exception 'class_students.class_id % does not exist', new.class_id;
  end if;

  select s.tenant_id
    into student_tenant_id
    from public.students s
    where s.id = new.student_id;

  if student_tenant_id is null then
    raise exception 'class_students.student_id % does not exist', new.student_id;
  end if;

  if student_tenant_id <> class_tenant_id then
    raise exception 'class_students class/student tenant mismatch';
  end if;

  if new.tenant_id is null then
    new.tenant_id := class_tenant_id;
  elsif new.tenant_id <> class_tenant_id then
    raise exception 'class_students.tenant_id must match classes.tenant_id';
  end if;

  return new;
end;
$$;

drop trigger if exists set_class_students_tenant_id on public.class_students;
create trigger set_class_students_tenant_id
  before insert or update of class_id, student_id, tenant_id
  on public.class_students
  for each row
  execute function public.set_class_students_tenant_id();

do $$
begin
  if exists (
    select 1
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    join public.students s on s.id = cs.student_id
    where cs.tenant_id is distinct from c.tenant_id
       or s.tenant_id is distinct from c.tenant_id
  ) then
    raise exception 'class_students contains tenant mismatches';
  end if;
end;
$$;

alter table public.class_students
  alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.class_students'::regclass
      and conname = 'class_students_tenant_id_fkey'
  ) then
    alter table public.class_students
      add constraint class_students_tenant_id_fkey
      foreign key (tenant_id)
      references public.tenants(id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists idx_class_students_tenant_class_status
  on public.class_students (tenant_id, class_id, status);

alter table public.class_students enable row level security;
grant select, insert, update, delete on public.class_students to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_students'
      and policyname = 'tenant members can manage'
  ) then
    execute '
      create policy "tenant members can manage"
        on public.class_students
        for all
        to authenticated
        using (
          tenant_id in (
            select p.tenant_id
            from public.profiles p
            where p.id = auth.uid()
          )
        )
        with check (
          tenant_id in (
            select p.tenant_id
            from public.profiles p
            where p.id = auth.uid()
          )
        )
    ';
  end if;
end;
$$;
