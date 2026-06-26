-- Migration: 20260626000002_create_teachers_table
-- Applied: 2026-06-26 via Supabase SQL Editor (Harness 9)
-- Purpose: 方案 A — 獨立 teachers 名單表，schedule_event_teachers.teacher_id 由 profiles 改指 teachers

-- 1) 建表
create table if not exists public.teachers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  name              text not null,
  status            text not null default 'active',          -- active / archived（停用不刪）
  linked_profile_id uuid references public.profiles(id) on delete set null,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2) RLS + tenant policy（比照業務表慣例）
alter table public.teachers enable row level security;
create policy "tenant members can manage teachers" on public.teachers
  for all to authenticated
  using      (tenant_id = (select tenant_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- 3) updated_at + zz_audit triggers
create trigger set_teachers_updated_at before update on public.teachers
  for each row execute function set_updated_at();
create trigger zz_audit after insert or update or delete on public.teachers
  for each row execute function audit_trigger();

-- 4) 種既有老師（簡誼），linked_profile_id 連回她的 profile
-- 結果：teachers.id = e4e311c9-5004-4822-9e9b-5db58b165096
insert into public.teachers (tenant_id, name, linked_profile_id)
values ('5b2f677e-8488-4f65-89fc-ebed4a5f8924', '簡誼老師', '4167a5b6-c6b3-4467-aeae-0b6f4b30c4bb');

-- 5) DROP 舊 FK（teacher_id 舊指 profiles）
alter table public.schedule_event_teachers
  drop constraint if exists schedule_event_teachers_teacher_id_fkey;

-- 6) 回填：schedule_event_teachers.teacher_id 從 profiles.id → teachers.id
update public.schedule_event_teachers se
set    teacher_id = t.id
from   public.teachers t
where  t.linked_profile_id = se.teacher_id;

-- 7) ADD 新 FK 指向 teachers
alter table public.schedule_event_teachers
  add constraint schedule_event_teachers_teacher_id_fkey
  foreign key (teacher_id) references public.teachers(id) on delete restrict;
