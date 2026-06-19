-- Repair environments where the normalized payment bag detail tables were
-- skipped while later billing migrations were applied.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_bag_lines_id_tenant_unique'
  ) then
    alter table public.payment_bag_lines
      add constraint payment_bag_lines_id_tenant_unique unique (id, tenant_id);
  end if;
end;
$$;

create table if not exists public.payment_bag_line_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  line_id uuid not null,
  student_id uuid not null,
  slot_index integer not null check (slot_index between 1 and 36),
  session_kind text not null check (session_kind in ('team', 'intensive')),
  session_order integer not null default 0,
  session_date date,
  legacy_mmdd text,
  is_unscheduled boolean not null default false,
  week_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (line_id, tenant_id)
    references public.payment_bag_lines(id, tenant_id) on delete cascade,
  foreign key (student_id, tenant_id)
    references public.students(id, tenant_id) on delete cascade,
  unique (line_id, slot_index)
);

create index if not exists idx_payment_bag_line_sessions_line
  on public.payment_bag_line_sessions (line_id, slot_index);

create table if not exists public.payment_bag_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  line_id uuid not null,
  item_type text not null check (
    item_type in ('tuition', 'book', 'misc', 'discount', 'carryover', 'adjustment')
  ),
  label text,
  amount numeric not null default 0,
  sort_order integer not null default 0,
  preset_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (line_id, tenant_id)
    references public.payment_bag_lines(id, tenant_id) on delete cascade
);

create index if not exists idx_payment_bag_line_items_line
  on public.payment_bag_line_items (line_id, sort_order);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'payment_bag_line_sessions',
    'payment_bag_line_items'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', target_table, target_table);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      target_table,
      target_table
    );

    execute format('alter table public.%I enable row level security', target_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', target_table);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'tenant members can manage'
    ) then
      execute format(
        'create policy "tenant members can manage" on public.%I
           for all to authenticated
           using (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))
           with check (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))',
        target_table
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
