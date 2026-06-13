-- JianYiOS workspace schedule schema
-- Source sheet: 配課表UI
-- Purpose: move the human-facing schedule workspace out of Google Sheets and
-- into tenant-scoped Supabase tables that can drive the Next.js UI.

create extension if not exists pgcrypto;

create table if not exists public.schedule_workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_key text not null,
  title text not null,
  legacy_sheet_name text,
  source_workbook text,
  generated_at timestamptz,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_key)
);

create table if not exists public.schedule_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.schedule_workspaces(id) on delete cascade,
  section_key text not null,
  label text not null,
  start_col integer,
  end_col integer,
  tone text,
  display_order integer not null default 0,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_id, section_key)
);

create table if not exists public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.schedule_workspaces(id) on delete cascade,
  day_key text not null,
  label text not null,
  english_label text,
  date_serial text,
  start_row integer,
  end_row integer,
  display_order integer not null default 0,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_id, day_key)
);

create table if not exists public.schedule_time_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.schedule_workspaces(id) on delete cascade,
  day_id uuid not null references public.schedule_days(id) on delete cascade,
  slot_key text not null,
  source_row integer not null,
  hour_label text,
  minute_label text,
  start_time text,
  display_order integer not null default 0,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, day_id, slot_key)
);

create table if not exists public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.schedule_workspaces(id) on delete cascade,
  day_id uuid not null references public.schedule_days(id) on delete cascade,
  slot_id uuid not null references public.schedule_time_slots(id) on delete cascade,
  section_id uuid not null references public.schedule_sections(id) on delete cascade,
  assignment_key text not null,
  source_row integer not null,
  start_col integer,
  end_col integer,
  source_cell text,
  title text not null,
  subtitle text,
  status_marker text,
  item_kind text not null default 'note',
  raw_values text[] not null default '{}',
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_id, assignment_key)
);

create table if not exists public.schedule_side_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.schedule_workspaces(id) on delete cascade,
  day_id uuid not null references public.schedule_days(id) on delete cascade,
  note_key text not null,
  source_row integer not null,
  note_type text not null default 'note',
  note_index text,
  title text not null,
  detail text,
  amount_text text,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_id, note_key)
);

create index if not exists idx_schedule_sections_workspace
  on public.schedule_sections (tenant_id, workspace_id, display_order);

create index if not exists idx_schedule_days_workspace
  on public.schedule_days (tenant_id, workspace_id, display_order);

create index if not exists idx_schedule_time_slots_day
  on public.schedule_time_slots (tenant_id, day_id, display_order);

create index if not exists idx_schedule_assignments_slot_section
  on public.schedule_assignments (tenant_id, slot_id, section_id);

create index if not exists idx_schedule_assignments_kind
  on public.schedule_assignments (tenant_id, item_kind);

create index if not exists idx_schedule_side_notes_day
  on public.schedule_side_notes (tenant_id, day_id, note_type);

do $$
declare
  target_table text;
  tenant_tables text[] := array[
    'schedule_workspaces',
    'schedule_sections',
    'schedule_days',
    'schedule_time_slots',
    'schedule_assignments',
    'schedule_side_notes'
  ];
begin
  foreach target_table in array tenant_tables loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', target_table, target_table);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', target_table, target_table);
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
        'create policy "tenant members can manage" on public.%I for all to authenticated using (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())) with check (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))',
        target_table
      );
    end if;
  end loop;
end;
$$;
