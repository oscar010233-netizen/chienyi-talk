-- =============================================================================
-- JianYiOS Day Entries
-- Captures the live `day_entries` table used by /api/day-entries.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.day_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_day_id uuid not null references public.schedule_days(id) on delete cascade,
  type text not null check (type in ('todo', 'dinner')),
  person text,
  content text not null,
  done boolean not null default false,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_day_entries_day_type
  on public.day_entries (tenant_id, schedule_day_id, type, sort_order);

alter table public.day_entries enable row level security;
grant select, insert, update, delete on public.day_entries to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'day_entries'
      and policyname = 'tenant members can manage'
  ) then
    create policy "tenant members can manage" on public.day_entries
      for all to authenticated
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
      );
  end if;
end;
$$;

commit;
