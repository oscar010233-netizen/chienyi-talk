alter table public.teachers
  add column if not exists color text not null default '#0A84FF';
