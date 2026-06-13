-- JianYiOS Apps Script migration schema
-- Source: C:\Users\oscar\Documents\JianYiOS\apps-script
-- Purpose: preserve the Google Sheets/App Script data model in Supabase while
-- moving toward named columns, tenant scoping, and normal relational links.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.legacy_sheet_schemas (
  legacy_sheet_key text primary key,
  legacy_sheet_name text not null,
  sheet_type text,
  source text,
  target_table text,
  source_file text not null default '01_Config.js',
  headers jsonb not null default '[]'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legacy_appscript_files (
  file_name text primary key,
  file_type text not null,
  role_category text not null,
  summary text not null,
  source_tables text[] not null default '{}',
  target_tables text[] not null default '{}',
  line_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_ranges (
  range_key text primary key,
  day_key text not null,
  source text not null,
  range_name text not null,
  legacy_range_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  legacy_student_id text not null,
  chinese_name text,
  english_name text,
  status text not null default 'active',
  school text,
  grade text,
  note text,
  parent_name text,
  parent_phone text,
  legacy_row_number integer,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legacy_student_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_class_id text,
  sheet_name text,
  class_code text,
  class_name text not null,
  department text,
  level text,
  class_type text,
  weekday1 integer,
  weekday2 integer,
  system_sessions integer,
  status text not null default 'active',
  source text,
  sheet_type text,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legacy_class_id),
  unique (tenant_id, sheet_name)
);

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  legacy_class_id text,
  legacy_student_id text not null,
  class_name text,
  slot_index integer,
  source text,
  status text not null default 'active',
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, class_id, student_id)
);

create table if not exists public.class_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  legacy_class_id text,
  class_name text,
  source text not null,
  sheet_type text,
  legacy_task_id text,
  week text,
  lesson text,
  date_key text,
  task_type text,
  raw_task_name text,
  task_name text not null,
  threshold text,
  source_row integer,
  status text not null default 'active',
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, legacy_task_id)
);

create table if not exists public.task_buffer_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null,
  student_ref uuid references public.students(id) on delete set null,
  class_ref uuid references public.classes(id) on delete set null,
  class_task_ref uuid references public.class_tasks(id) on delete set null,
  student_id text not null,
  class_name text,
  eng_name text,
  chi_name text,
  task_name text not null,
  task_id text,
  latest_result text,
  status text,
  history text,
  threshold text,
  week text,
  writeback_status text,
  last_updated timestamptz,
  loaded_to text,
  loaded_to_keys text[] not null default '{}',
  legacy_row_number integer,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, student_id, task_id)
);

create table if not exists public.appsh_kanban_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mobile_kanban_task_id text not null,
  source text,
  loaded_to text,
  class_name text,
  student_id text,
  student_name text,
  chi_name text,
  eng_name text,
  task_id text,
  task_name text,
  task_type text,
  current_status text,
  current_lamp text,
  task_display text,
  history text,
  threshold text,
  latest_result text,
  score_input text,
  status_input text,
  comment_input text,
  private_note_input text,
  photo1 text,
  photo2 text,
  photo3 text,
  photo4 text,
  photo5 text,
  sync_status text,
  sync_message text,
  last_updated timestamptz,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, mobile_kanban_task_id)
);

create table if not exists public.appsh_xiao_daily_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  daily_row_id text not null,
  class_name text,
  date_key text,
  date_display text,
  student_id text,
  student_name text,
  chi_name text,
  eng_name text,
  slot_index integer,
  content_col integer,
  attendance_row integer,
  attendance_input text,
  homework_row1 integer,
  homework_task_id1 text,
  homework_input1 text,
  homework_row2 integer,
  homework_task_id2 text,
  homework_input2 text,
  homework_row3 integer,
  homework_task_id3 text,
  homework_input3 text,
  homework_row4 integer,
  homework_task_id4 text,
  homework_input4 text,
  homework_row5 integer,
  homework_task_id5 text,
  homework_input5 text,
  quiz_row1 integer,
  quiz_task_id1 text,
  quiz_input1 text,
  quiz_threshold_input1 text,
  quiz_row2 integer,
  quiz_task_id2 text,
  quiz_input2 text,
  quiz_threshold_input2 text,
  quiz_row3 integer,
  quiz_task_id3 text,
  quiz_input3 text,
  quiz_threshold_input3 text,
  sync_status text,
  sync_message text,
  last_updated timestamptz,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, daily_row_id)
);

create table if not exists public.invoice_tuition_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rate_key text not null,
  label text not null,
  sessions integer,
  price numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rate_key)
);

create table if not exists public.invoice_fee_presets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null,
  label text not null,
  amount numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category, label)
);

create table if not exists public.invoice_season_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  season text not null,
  holidays text[] not null default '{}',
  raw_holidays text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, season)
);

create table if not exists public.invoice_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  record_id text not null,
  student_ref uuid references public.students(id) on delete set null,
  class_ref uuid references public.classes(id) on delete set null,
  student_id text,
  student_name text,
  class_id text,
  class_code text,
  class_name text,
  season text,
  weekday integer,
  holidays text,
  makeup01 text,
  makeup02 text,
  makeup03 text,
  makeup04 text,
  makeup05 text,
  makeup06 text,
  s01_date text,
  s02_date text,
  s03_date text,
  s04_date text,
  s05_date text,
  s06_date text,
  s07_date text,
  s08_date text,
  s09_date text,
  s10_date text,
  s11_date text,
  s12_date text,
  s13_date text,
  s14_date text,
  s15_date text,
  s16_date text,
  s17_date text,
  s18_date text,
  s19_date text,
  s20_date text,
  s21_date text,
  s22_date text,
  s23_date text,
  s24_date text,
  s25_date text,
  s26_date text,
  s27_date text,
  s28_date text,
  s29_date text,
  s30_date text,
  s31_date text,
  s32_date text,
  s33_date text,
  s34_date text,
  s35_date text,
  s36_date text,
  s01_attend text,
  s02_attend text,
  s03_attend text,
  s04_attend text,
  s05_attend text,
  s06_attend text,
  s07_attend text,
  s08_attend text,
  s09_attend text,
  s10_attend text,
  s11_attend text,
  s12_attend text,
  s13_attend text,
  s14_attend text,
  s15_attend text,
  s16_attend text,
  s17_attend text,
  s18_attend text,
  s19_attend text,
  s20_attend text,
  s21_attend text,
  s22_attend text,
  s23_attend text,
  s24_attend text,
  s25_attend text,
  s26_attend text,
  s27_attend text,
  s28_attend text,
  s29_attend text,
  s30_attend text,
  s31_attend text,
  s32_attend text,
  s33_attend text,
  s34_attend text,
  s35_attend text,
  s36_attend text,
  tuition numeric,
  book_fee numeric,
  book_name text,
  misc_fee numeric,
  misc_note text,
  discount numeric,
  discount_note text,
  final_amount numeric,
  issue_date text,
  paid_amount numeric,
  handler text,
  paid_date text,
  print_count integer,
  notes text,
  last_printed_at timestamptz,
  distribute_status text,
  carryover numeric,
  carryover_note text,
  adj1_amount numeric,
  adj1_name text,
  balance numeric,
  payment_status text,
  receipt_status text,
  system_sessions integer,
  level text,
  season_year text,
  season_quarter text,
  legacy_row_number integer,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, record_id)
);

create table if not exists public.session_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_ref uuid references public.students(id) on delete set null,
  student_id text not null,
  season text not null,
  date text,
  sessions_owed integer,
  rate_per_session numeric,
  discount_amount numeric,
  reason text,
  status text not null default 'pending',
  legacy_row_number integer,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.kanban_ranges (range_key, day_key, source, range_name, legacy_range_name)
values
  ('MON_ENG_KB', 'MON', 'ENG', 'Mon_EngKB', 'Eng_Kanban'),
  ('MON_XIAO_KB', 'MON', 'XIAO', 'Mon_XiaoKB', 'Xiao_Kanban'),
  ('TUE_ENG_KB', 'TUE', 'ENG', 'Tue_EngKB', null),
  ('TUE_XIAO_KB', 'TUE', 'XIAO', 'Tue_XiaoKB', null),
  ('WED_ENG_KB', 'WED', 'ENG', 'Wed_EngKB', null),
  ('WED_XIAO_KB', 'WED', 'XIAO', 'Wed_XiaoKB', null),
  ('THU_ENG_KB', 'THU', 'ENG', 'Thu_EngKB', null),
  ('THU_XIAO_KB', 'THU', 'XIAO', 'Thu_XiaoKB', null),
  ('FRI_ENG_KB', 'FRI', 'ENG', 'Fri_EngKB', null),
  ('FRI_XIAO_KB', 'FRI', 'XIAO', 'Fri_XiaoKB', null),
  ('SAT_ENG_KB', 'SAT', 'ENG', 'Sat_EngKB', null),
  ('SAT_XIAO_KB', 'SAT', 'XIAO', 'Sat_XiaoKB', null),
  ('SUN_ENG_KB', 'SUN', 'ENG', 'Sun_EngKB', null),
  ('SUN_XIAO_KB', 'SUN', 'XIAO', 'Sun_XiaoKB', null)
on conflict (range_key) do update set
  day_key = excluded.day_key,
  source = excluded.source,
  range_name = excluded.range_name,
  legacy_range_name = excluded.legacy_range_name,
  updated_at = now();

insert into public.legacy_sheet_schemas
  (legacy_sheet_key, legacy_sheet_name, sheet_type, source, target_table, headers, layout, notes)
values
  ('STUDENT_ROSTER', 'StudentRoster', 'STUDENT_ROSTER', null, 'students',
    '["studentId","chineseName","englishName","status","school","grade","note","updatedAt","parentName","parentPhone"]'::jsonb,
    '{"headerRow":2,"dataStartRow":3}'::jsonb,
    'Student master data. StudentID is the stable legacy key.'),
  ('CLASS_CONFIG', 'ClassConfig', 'CLASS_CONFIG', 'INVOICE', 'classes',
    '["classId","sheetName","classCode","className","department","level","classType","weekday1","weekday2","systemSessions","status"]'::jsonb,
    '{}'::jsonb,
    'Class metadata used by invoice and class sheet setup.'),
  ('ENG_BUFFER', 'EngBuffer', 'BUFFER', 'ENG', 'task_buffer_entries',
    '["studentId","className","engName","chiName","taskName","taskId","latestResult","status","history","threshold","week","writebackStatus","lastUpdated","loadedTo"]'::jsonb,
    '{}'::jsonb,
    'English task buffer.'),
  ('XIAO_BUFFER', 'XiaoBuffer', 'BUFFER', 'XIAO', 'task_buffer_entries',
    '["studentId","className","engName","chiName","taskName","taskId","latestResult","status","history","threshold","week","writebackStatus","lastUpdated","loadedTo"]'::jsonb,
    '{}'::jsonb,
    'Xiao task buffer.'),
  ('APP_SH_KANBAN', 'AppSh_Kanban', 'APP_SHEET_BRIDGE', null, 'appsh_kanban_rows',
    '["mobileKanbanTaskId","source","loadedTo","className","studentId","studentName","chiName","engName","taskId","taskName","taskType","currentStatus","currentLamp","taskDisplay","history","threshold","latestResult","scoreInput","statusInput","commentInput","privateNoteInput","photo1","photo2","photo3","photo4","photo5","syncStatus","syncMessage","lastUpdated"]'::jsonb,
    '{}'::jsonb,
    'AppSheet mobile task bridge.'),
  ('APP_SH_INPUT', 'AppSh_Input', 'APP_SHEET_BRIDGE', 'XIAO', 'appsh_xiao_daily_rows',
    '["dailyRowId","className","dateKey","dateDisplay","studentId","studentName","chiName","engName","slotIndex","contentCol","attendanceRow","attendanceInput","homeworkRow1","homeworkTaskId1","homeworkInput1","homeworkRow2","homeworkTaskId2","homeworkInput2","homeworkRow3","homeworkTaskId3","homeworkInput3","homeworkRow4","homeworkTaskId4","homeworkInput4","homeworkRow5","homeworkTaskId5","homeworkInput5","quizRow1","quizTaskId1","quizInput1","quizThresholdInput1","quizRow2","quizTaskId2","quizInput2","quizThresholdInput2","quizRow3","quizTaskId3","quizInput3","quizThresholdInput3","syncStatus","syncMessage","lastUpdated"]'::jsonb,
    '{}'::jsonb,
    'AppSheet daily Xiao input bridge.'),
  ('INVOICE_DATA', 'InvoiceData', 'INVOICE_DATA', 'INVOICE', 'invoice_records',
    '[]'::jsonb,
    '{"maxSessions":36,"maxMakeups":6}'::jsonb,
    'Invoice records preserve 36 date slots and 36 attendance slots.'),
  ('SESSION_CREDIT', 'SessionCredit', 'SESSION_CREDIT', 'INVOICE', 'session_credits',
    '["studentId","season","date","sessionsOwed","ratePerSession","discountAmount","reason","status"]'::jsonb,
    '{}'::jsonb,
    'Owed or credited sessions.'),
  ('INVOICE_CONFIG_TUITION', 'InvoiceConfig.tuition', 'INVOICE_CONFIG', 'INVOICE', 'invoice_tuition_rates',
    '["key","label","sessions","price"]'::jsonb,
    '{"sectionRow":1,"headerRow":2,"dataStartRow":3}'::jsonb,
    'Tuition rate section in InvoiceConfig.'),
  ('INVOICE_CONFIG_FEES', 'InvoiceConfig.fees', 'INVOICE_CONFIG', 'INVOICE', 'invoice_fee_presets',
    '["category","label","amount"]'::jsonb,
    '{"sectionRow":8,"headerRow":9,"dataStartRow":10}'::jsonb,
    'Fee preset section in InvoiceConfig.'),
  ('INVOICE_CONFIG_HOLIDAYS', 'InvoiceConfig.holidays', 'INVOICE_CONFIG', 'INVOICE', 'invoice_season_holidays',
    '["season","holidays"]'::jsonb,
    '{"sectionRow":18,"headerRow":19,"dataStartRow":20}'::jsonb,
    'Season holiday section in InvoiceConfig.')
on conflict (legacy_sheet_key) do update set
  legacy_sheet_name = excluded.legacy_sheet_name,
  sheet_type = excluded.sheet_type,
  source = excluded.source,
  target_table = excluded.target_table,
  headers = excluded.headers,
  layout = excluded.layout,
  notes = excluded.notes,
  updated_at = now();

create index if not exists idx_students_tenant_status on public.students (tenant_id, status);
create index if not exists idx_students_tenant_names on public.students (tenant_id, chinese_name, english_name);
create index if not exists idx_classes_tenant_status on public.classes (tenant_id, status);
create index if not exists idx_class_enrollments_student on public.class_enrollments (tenant_id, legacy_student_id);
create index if not exists idx_class_tasks_class_source on public.class_tasks (tenant_id, class_id, source);
create index if not exists idx_task_buffer_student_status on public.task_buffer_entries (tenant_id, student_id, status);
create index if not exists idx_task_buffer_task_id on public.task_buffer_entries (tenant_id, task_id);
create index if not exists idx_appsh_kanban_student on public.appsh_kanban_rows (tenant_id, student_id, sync_status);
create index if not exists idx_appsh_xiao_daily_student_date on public.appsh_xiao_daily_rows (tenant_id, student_id, date_key);
create index if not exists idx_invoice_records_student_season on public.invoice_records (tenant_id, student_id, season);
create index if not exists idx_invoice_records_class_season on public.invoice_records (tenant_id, class_id, season);
create index if not exists idx_session_credits_student_status on public.session_credits (tenant_id, student_id, status);

do $$
declare
  target_table text;
  tenant_tables text[] := array[
    'students',
    'classes',
    'class_enrollments',
    'class_tasks',
    'task_buffer_entries',
    'appsh_kanban_rows',
    'appsh_xiao_daily_rows',
    'invoice_tuition_rates',
    'invoice_fee_presets',
    'invoice_season_holidays',
    'invoice_records',
    'session_credits'
  ];
  public_metadata_tables text[] := array[
    'legacy_sheet_schemas',
    'legacy_appscript_files',
    'kanban_ranges'
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

  foreach target_table in array public_metadata_tables loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', target_table, target_table);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', target_table, target_table);
    execute format('grant select on public.%I to authenticated', target_table);
  end loop;
end;
$$;
