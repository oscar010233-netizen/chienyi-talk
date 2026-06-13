-- 成績追蹤系統：5 張核心資料表
-- 在 Supabase SQL Editor 執行

-- 1. 學生主檔
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  student_code text not null,
  chi_name text not null,
  eng_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  school text,
  grade text,
  note text,
  parent_name text,
  parent_phone text,
  created_at timestamptz default now(),
  unique (tenant_id, student_code)
);

-- 2. 班級
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  class_code text not null,
  sheet_name text,
  class_name text not null,
  source text not null default 'ENG' check (source in ('ENG', 'XIAO')),
  level text,
  class_type text not null default 'double' check (class_type in ('double', 'intensive', 'single')),
  weekday1 int,
  weekday2 int,
  system_sessions int not null default 24,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  unique (tenant_id, class_code)
);

-- 3. 學生↔班級 enrollment
create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  slot_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'dropped')),
  unique (class_id, student_id)
);

-- 4. 任務定義（老師排的每週課程任務）
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  class_id uuid not null references public.classes(id) on delete cascade,
  task_code text not null,
  week text not null default 'W1',
  lesson_number text not null default 'L1',
  task_type text not null check (task_type in ('attendance', 'homework', 'practice', 'quiz', 'comment')),
  task_name text,
  threshold numeric,
  display_order int not null default 0,
  created_at timestamptz default now(),
  unique (tenant_id, task_code)
);

-- 5. 學生×任務狀態（燈號 + 分數 + 評語）
create table if not exists public.task_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  student_id uuid not null references public.students(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  status text not null default 'pending',
  lamp text not null default 'red' check (lamp in ('red', 'yellow', 'green', 'blue', 'black', 'white', 'orange')),
  latest_result numeric,
  result_history text,
  comment_text text,
  comment_status text default 'draft' check (comment_status in ('draft', 'published')),
  private_note text,
  last_updated timestamptz default now(),
  created_at timestamptz default now(),
  unique (student_id, task_id)
);

-- RLS：啟用，service_role 自動繞過，M6 再加業務層 policy
alter table public.students enable row level security;
alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.tasks enable row level security;
alter table public.task_records enable row level security;
