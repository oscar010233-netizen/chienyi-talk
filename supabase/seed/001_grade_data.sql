-- 成績系統：示範資料
-- 在 001_grade_system.sql 之後執行

do $$
declare
  v_tenant uuid;
  cls001 uuid; cls002 uuid; cls003 uuid; cls004 uuid;
  s001 uuid; s002 uuid; s003 uuid; s004 uuid;
  s005 uuid; s006 uuid; s007 uuid;
  s008 uuid; s009 uuid; s010 uuid;
  t_att01 uuid; t_hw01 uuid; t_pr01 uuid; t_qz01 uuid; t_qz02 uuid;
  t_hw24 uuid; t_hw25 uuid; t_qz26 uuid;
begin
  select id into v_tenant from public.tenants limit 1;

  -- ======= 班級 =======
  insert into public.classes (tenant_id, class_code, sheet_name, class_name, source, level, class_type, weekday1, weekday2, system_sessions)
  values (v_tenant, 'CLS-001', '五B5', '五B5 英文班', 'ENG', '初級', 'double', 2, 4, 24)
  on conflict (tenant_id, class_code) do nothing
  returning id into cls001;

  if cls001 is null then
    select id into cls001 from public.classes where tenant_id=v_tenant and class_code='CLS-001';
  end if;

  insert into public.classes (tenant_id, class_code, sheet_name, class_name, source, level, class_type, weekday1, weekday2, system_sessions)
  values (v_tenant, 'CLS-002', 'F發4', '基礎發音班', 'ENG', '初級', 'double', 2, 5, 24)
  on conflict (tenant_id, class_code) do nothing
  returning id into cls002;

  if cls002 is null then
    select id into cls002 from public.classes where tenant_id=v_tenant and class_code='CLS-002';
  end if;

  insert into public.classes (tenant_id, class_code, sheet_name, class_name, source, level, class_type, weekday1, weekday2, system_sessions)
  values (v_tenant, 'CLS-003', 'G8課', 'G8 強化班', 'ENG', '中級', 'intensive', 3, null, 24)
  on conflict (tenant_id, class_code) do nothing
  returning id into cls003;

  if cls003 is null then
    select id into cls003 from public.classes where tenant_id=v_tenant and class_code='CLS-003';
  end if;

  insert into public.classes (tenant_id, class_code, sheet_name, class_name, source, level, class_type, weekday1, weekday2, system_sessions)
  values (v_tenant, 'CLS-004', '作業', '小學堂', 'XIAO', null, 'single', null, null, 24)
  on conflict (tenant_id, class_code) do nothing
  returning id into cls004;

  if cls004 is null then
    select id into cls004 from public.classes where tenant_id=v_tenant and class_code='CLS-004';
  end if;

  -- ======= 學生 =======
  insert into public.students (tenant_id, student_code, chi_name, eng_name, status)
  values
    (v_tenant, 'S001', '王靖昀', 'Roy', 'active'),
    (v_tenant, 'S002', '王大海', 'Turtle', 'active'),
    (v_tenant, 'S003', '歐斯卡', 'Oscar', 'active'),
    (v_tenant, 'S004', '林小明', 'Kelvin', 'active'),
    (v_tenant, 'S005', '黃艾倫', 'Allen', 'active'),
    (v_tenant, 'S006', '夜卡', 'Alvin', 'active'),
    (v_tenant, 'S007', '洪苡安', 'Ruby', 'active'),
    (v_tenant, 'S008', '陳雷', 'Ray', 'active'),
    (v_tenant, 'S009', '王文建', 'Dick', 'active'),
    (v_tenant, 'S010', '葉偉強', 'Ipman', 'active')
  on conflict (tenant_id, student_code) do nothing;

  select id into s001 from public.students where tenant_id=v_tenant and student_code='S001';
  select id into s002 from public.students where tenant_id=v_tenant and student_code='S002';
  select id into s003 from public.students where tenant_id=v_tenant and student_code='S003';
  select id into s004 from public.students where tenant_id=v_tenant and student_code='S004';
  select id into s005 from public.students where tenant_id=v_tenant and student_code='S005';
  select id into s006 from public.students where tenant_id=v_tenant and student_code='S006';
  select id into s007 from public.students where tenant_id=v_tenant and student_code='S007';
  select id into s008 from public.students where tenant_id=v_tenant and student_code='S008';
  select id into s009 from public.students where tenant_id=v_tenant and student_code='S009';
  select id into s010 from public.students where tenant_id=v_tenant and student_code='S010';

  -- ======= 班級學生 =======
  insert into public.class_students (class_id, student_id, slot_order)
  values
    (cls001, s001, 1), (cls001, s002, 2), (cls001, s003, 3), (cls001, s004, 4),
    (cls002, s008, 1), (cls002, s009, 2), (cls002, s010, 3),
    (cls004, s005, 1), (cls004, s006, 2), (cls004, s007, 3)
  on conflict (class_id, student_id) do nothing;

  -- ======= 任務（CLS-001 W1/L1）=======
  insert into public.tasks (tenant_id, class_id, task_code, week, lesson_number, task_type, task_name, threshold, display_order)
  values
    (v_tenant, cls001, 'CLS001-ATT-W1L1', 'W1', 'L1', 'attendance', '出席', null, 1),
    (v_tenant, cls001, 'T000001', 'W1', 'L1', 'homework',   '交單字本', null, 2),
    (v_tenant, cls001, 'T000002', 'W1', 'L1', 'practice',   '課文朗讀', null, 3),
    (v_tenant, cls001, 'T000005', 'W1', 'L1', 'quiz',       '單字測驗', 90,   4),
    (v_tenant, cls001, 'T000006', 'W1', 'L1', 'quiz',       '聽力測驗', 88,   5)
  on conflict (tenant_id, task_code) do nothing;

  select id into t_att01 from public.tasks where tenant_id=v_tenant and task_code='CLS001-ATT-W1L1';
  select id into t_hw01  from public.tasks where tenant_id=v_tenant and task_code='T000001';
  select id into t_pr01  from public.tasks where tenant_id=v_tenant and task_code='T000002';
  select id into t_qz01  from public.tasks where tenant_id=v_tenant and task_code='T000005';
  select id into t_qz02  from public.tasks where tenant_id=v_tenant and task_code='T000006';

  -- ======= 任務（CLS-004 XIAO）=======
  insert into public.tasks (tenant_id, class_id, task_code, week, lesson_number, task_type, task_name, threshold, display_order)
  values
    (v_tenant, cls004, 'T000024', 'W1', 'HW', 'homework', '交甲', null, 1),
    (v_tenant, cls004, 'T000025', 'W1', 'HW', 'homework', '交數習', null, 2),
    (v_tenant, cls004, 'T000026', 'W1', 'QZ', 'quiz',     '數學測驗', 90, 3)
  on conflict (tenant_id, task_code) do nothing;

  select id into t_hw24 from public.tasks where tenant_id=v_tenant and task_code='T000024';
  select id into t_hw25 from public.tasks where tenant_id=v_tenant and task_code='T000025';
  select id into t_qz26 from public.tasks where tenant_id=v_tenant and task_code='T000026';

  -- ======= 示範紀錄（CLS-001）=======
  insert into public.task_records (tenant_id, student_id, task_id, class_id, status, lamp, latest_result, result_history)
  values
    -- Roy
    (v_tenant, s001, t_att01, cls001, 'completed', 'green',  null, null),
    (v_tenant, s001, t_hw01,  cls001, 'completed', 'green',  null, null),
    (v_tenant, s001, t_pr01,  cls001, 'correcting','yellow', null, null),
    (v_tenant, s001, t_qz01,  cls001, 'redo',      'red',    75,   '60,75'),
    (v_tenant, s001, t_qz02,  cls001, 'missing',   'black',  null, null),
    -- Turtle
    (v_tenant, s002, t_att01, cls001, 'completed', 'green',  null, null),
    (v_tenant, s002, t_hw01,  cls001, 'completed', 'green',  null, null),
    (v_tenant, s002, t_pr01,  cls001, 'completed', 'green',  null, null),
    (v_tenant, s002, t_qz01,  cls001, 'passed',    'green',  90,   '80,90'),
    (v_tenant, s002, t_qz02,  cls001, 'correcting','yellow', 70,   '70'),
    -- Oscar
    (v_tenant, s003, t_att01, cls001, 'completed', 'green',  null, null),
    (v_tenant, s003, t_hw01,  cls001, 'pending',   'red',    null, null),
    (v_tenant, s003, t_pr01,  cls001, 'pending',   'red',    null, null),
    (v_tenant, s003, t_qz01,  cls001, 'testing',   'blue',   null, null),
    (v_tenant, s003, t_qz02,  cls001, 'pending',   'red',    null, null),
    -- Kelvin
    (v_tenant, s004, t_att01, cls001, 'exempt',    'white',  null, null),
    (v_tenant, s004, t_hw01,  cls001, 'exempt',    'white',  null, null),
    (v_tenant, s004, t_pr01,  cls001, 'exempt',    'white',  null, null),
    (v_tenant, s004, t_qz01,  cls001, 'passed',    'green',  95,   '88,92,95'),
    (v_tenant, s004, t_qz02,  cls001, 'passed',    'green',  92,   '88,92')
  on conflict (student_id, task_id) do nothing;

  -- ======= 示範紀錄（CLS-004 XIAO）=======
  insert into public.task_records (tenant_id, student_id, task_id, class_id, status, lamp, latest_result, result_history)
  values
    (v_tenant, s005, t_hw24, cls004, 'completed', 'green', null, null),
    (v_tenant, s005, t_hw25, cls004, 'pending',   'red',   null, null),
    (v_tenant, s005, t_qz26, cls004, 'passed',    'green', 95,   '90,95'),
    (v_tenant, s006, t_hw24, cls004, 'missing',   'black', null, null),
    (v_tenant, s006, t_hw25, cls004, 'completed', 'green', null, null),
    (v_tenant, s006, t_qz26, cls004, 'correcting','yellow',75,   '60,75'),
    (v_tenant, s007, t_hw24, cls004, 'completed', 'green', null, null),
    (v_tenant, s007, t_hw25, cls004, 'completed', 'green', null, null),
    (v_tenant, s007, t_qz26, cls004, 'passed',    'green', 100,  '95,100')
  on conflict (student_id, task_id) do nothing;

end $$;
