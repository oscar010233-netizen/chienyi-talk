-- =============================================================================
-- JianYiOS Schedule Tables
-- rooms / schedule_days / schedule_events / schedule_event_teachers / schedule_event_students
-- =============================================================================

begin;

-- 1. rooms — 教室 / 區域清單
create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  room_type     text,
  display_order integer not null default 0,
  status        text not null default 'active'
                  check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. schedule_days — 哪一天
create table public.schedule_days (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  date        date not null,
  weekday     integer not null, -- 1=一 2=二 ... 7=日
  note        text,
  status      text not null default 'active'
                check (status in ('active', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, date)
);

-- 3. schedule_events — 那天那間教室幾點到幾點排了什麼（核心表）
create table public.schedule_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  schedule_day_id  uuid not null references public.schedule_days(id) on delete cascade,
  room_id          uuid not null references public.rooms(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete set null,
  title            text,
  event_type       text not null default 'class'
                     check (event_type in ('class', 'makeup', 'other')),
  start_time       time not null,
  end_time         time not null,
  color            text,
  note             text,
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'cancelled', 'completed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 4. schedule_event_teachers — 這個事件哪位老師教、幾點到幾點（支援多老師切時段）
create table public.schedule_event_teachers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  start_time        time not null,
  end_time          time not null,
  color             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 5. schedule_event_students — 補課 / 個別安排才用，整班上課不需要
create table public.schedule_event_students (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  role              text,
  status            text not null default 'active'
                      check (status in ('active', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (schedule_event_id, student_id)
);

-- Indexes
create index idx_schedule_days_tenant_date       on public.schedule_days (tenant_id, date);
create index idx_schedule_events_day             on public.schedule_events (schedule_day_id);
create index idx_schedule_events_room            on public.schedule_events (room_id);
create index idx_schedule_events_class           on public.schedule_events (class_id);
create index idx_schedule_event_teachers_event   on public.schedule_event_teachers (schedule_event_id);
create index idx_schedule_event_students_event   on public.schedule_event_students (schedule_event_id);

-- updated_at triggers + RLS
do $$
declare
  t text;
  tables text[] := array[
    'rooms',
    'schedule_days',
    'schedule_events',
    'schedule_event_teachers',
    'schedule_event_students'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = t
        and policyname = 'tenant members can manage'
    ) then
      execute format(
        'create policy "tenant members can manage" on public.%I
           for all to authenticated
           using      (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))
           with check (tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid()))',
        t);
    end if;
  end loop;
end;
$$;

commit;
