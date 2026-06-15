-- =============================================================================
-- JianYiOS Billing / Open-Bag System
-- Normalized Supabase version of the Apps Script Invoice workflow.
--
-- Slim 5-table model: actual attendance is read live from the existing
-- class_tasks + student_task_records roll-call (single source of truth),
-- so there is no separate actual_attendance table. Print/PDF events are
-- tracked by counters on payment_bags, so there is no print_events table.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.billing_seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  season_code text not null,
  year integer not null,
  quarter text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  start_date date not null,
  end_date date not null,
  label text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, season_code),
  unique (id, tenant_id)
);

create table if not exists public.billing_season_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  season_id uuid not null,
  class_id uuid,
  holiday_date date not null,
  label text,
  created_at timestamptz not null default now(),
  foreign key (season_id, tenant_id) references public.billing_seasons(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id) references public.classes(id, tenant_id) on delete cascade
);

create unique index if not exists uq_billing_holidays_all_class
  on public.billing_season_holidays (tenant_id, season_id, holiday_date)
  where class_id is null;

create unique index if not exists uq_billing_holidays_class
  on public.billing_season_holidays (tenant_id, season_id, class_id, holiday_date)
  where class_id is not null;

create table if not exists public.default_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  season_id uuid not null,
  class_id uuid not null,
  session_index integer not null check (session_index between 1 and 36),
  default_date date not null,
  original_date date not null,
  period_key text not null,
  source text not null default 'generated' check (source in ('generated', 'manual', 'imported')),
  status text not null default 'scheduled' check (status in ('scheduled', 'holiday_shifted', 'cancelled', 'manual')),
  holiday_id uuid references public.billing_season_holidays(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, tenant_id) references public.billing_seasons(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id) references public.classes(id, tenant_id) on delete cascade,
  unique (tenant_id, season_id, class_id, session_index),
  unique (id, tenant_id)
);

create table if not exists public.payment_bags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  season_id uuid not null,
  class_id uuid not null,
  bag_code text not null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'printed', 'distributed', 'closed', 'void')),
  tuition_note text,
  note text,
  print_count integer not null default 0,
  last_printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, tenant_id) references public.billing_seasons(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id) references public.classes(id, tenant_id) on delete cascade,
  unique (tenant_id, season_id, class_id),
  unique (id, tenant_id)
);

create table if not exists public.payment_bag_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bag_id uuid not null,
  student_id uuid not null,
  student_order integer not null default 0,
  session_count integer not null default 0,
  rate_per_session numeric not null default 0,
  tuition_amount numeric not null default 0,
  book_name text,
  book_fee numeric not null default 0,
  misc_label text,
  misc_fee numeric not null default 0,
  discount_label text,
  discount_amount numeric not null default 0,
  carryover_amount numeric not null default 0,
  carryover_note text,
  adjustment_label text,
  adjustment_amount numeric not null default 0,
  total_amount numeric not null default 0,
  issue_status text not null default '未發',
  paid_amount numeric,
  intro_card_received boolean not null default false,
  handler text,
  payment_status text not null default 'unpaid',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bag_id, tenant_id) references public.payment_bags(id, tenant_id) on delete cascade,
  foreign key (student_id, tenant_id) references public.students(id, tenant_id) on delete cascade,
  unique (bag_id, student_id)
);

create index if not exists idx_billing_holidays_season on public.billing_season_holidays (tenant_id, season_id, holiday_date);
create index if not exists idx_default_attendance_class_period on public.default_attendance (tenant_id, season_id, class_id, session_index);
create index if not exists idx_payment_bags_class_season on public.payment_bags (tenant_id, class_id, season_id);
create index if not exists idx_payment_bag_lines_bag on public.payment_bag_lines (bag_id, student_order);

do $$
declare
  target_table text;
  billing_tables text[] := array[
    'billing_seasons',
    'billing_season_holidays',
    'default_attendance',
    'payment_bags',
    'payment_bag_lines'
  ];
begin
  foreach target_table in array billing_tables loop
    if target_table not in ('billing_season_holidays') then
      execute format('drop trigger if exists set_%I_updated_at on public.%I', target_table, target_table);
      execute format(
        'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        target_table,
        target_table
      );
    end if;

    execute format('alter table public.%I enable row level security', target_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', target_table);

    if not exists (
      select 1
      from pg_policies
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

commit;
