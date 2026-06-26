// Single source of truth for the DB-monitor page (/db).
// Reflects the live Supabase schema. Keep in sync when migrations change.
// Last verified: 2026-06-20（與 live DB 全表比對）

export interface TableMeta {
  name: string
  group: string
  note?: string
  columns: string[]
}

export const DB_TABLES: TableMeta[] = [
  { name: 'tenants', group: '共用', columns: ['id', 'name', 'created_at'] },
  { name: 'profiles', group: '共用', note: 'RLS 命脈，勿刪；勿直接讀寫', columns: ['id', 'tenant_id', 'role', 'display_name', 'created_at'] },

  { name: 'classes', group: '班級', columns: ['id', 'tenant_id', 'class_name', 'class_code', 'department', 'level', 'class_type', 'weekday1', 'weekday2', 'system_sessions', 'status', 'created_at', 'updated_at'] },
  { name: 'students', group: '班級', columns: ['id', 'tenant_id', 'chinese_name', 'english_name', 'status', 'school', 'grade', 'note', 'parent_name', 'parent_phone', 'created_at', 'updated_at'] },
  { name: 'class_enrollments', group: '班級', columns: ['id', 'tenant_id', 'class_id', 'student_id', 'status', 'slot_order', 'joined_at', 'left_at', 'created_at', 'updated_at'] },
  { name: 'class_tasks', group: '班級', columns: ['id', 'tenant_id', 'class_id', 'bag_id', 'slot_index', 'lesson_label', 'task_type', 'task_name', 'threshold_value', 'max_score', 'threshold_text', 'display_order', 'status', 'created_at', 'updated_at'] },
  { name: 'class_task_templates', group: '班級', columns: ['id', 'tenant_id', 'name', 'created_at', 'updated_at'] },
  { name: 'class_task_template_items', group: '班級', columns: ['id', 'tenant_id', 'template_id', 'task_type', 'session_position', 'sort_order', 'created_at'] },
  { name: 'student_task_records', group: '班級', columns: ['id', 'tenant_id', 'class_task_id', 'student_id', 'status', 'latest_result', 'result_history', 'teacher_note', 'comment_text', 'comment_status', 'created_at', 'updated_at'] },

  { name: 'rooms', group: '配課表', columns: ['id', 'tenant_id', 'name', 'room_type', 'display_order', 'status', 'created_at', 'updated_at'] },
  { name: 'schedule_days', group: '配課表', columns: ['id', 'tenant_id', 'date', 'weekday', 'note', 'status', 'created_at', 'updated_at'] },
  { name: 'teachers', group: '配課表', note: '授課老師主表；刪除採封存（status=archived）', columns: ['id', 'tenant_id', 'name', 'color', 'status', 'linked_profile_id', 'sort_order', 'created_at', 'updated_at'] },
  { name: 'schedule_events', group: '配課表', columns: ['id', 'tenant_id', 'schedule_day_id', 'room_id', 'class_id', 'title', 'event_type', 'start_time', 'end_time', 'color', 'note', 'status', 'created_at', 'updated_at'] },
  { name: 'schedule_event_teachers', group: '配課表', note: '配課表時段可指定授課老師；目前 UI 以整段時段為單位寫入，teacher_id FK 指向 teachers', columns: ['id', 'tenant_id', 'schedule_event_id', 'teacher_id', 'start_time', 'end_time', 'color', 'created_at', 'updated_at'] },
  { name: 'day_entries', group: '配課表', note: '晚餐備註與待辦/晚餐拖曳排序已接 UI', columns: ['id', 'tenant_id', 'schedule_day_id', 'type', 'person', 'content', 'done', 'notes', 'sort_order', 'created_at'] },

  { name: 'billing_seasons', group: '帳務', columns: ['id', 'tenant_id', 'season_code', 'year', 'quarter', 'start_date', 'end_date', 'label', 'status', 'holiday_dates', 'created_at', 'updated_at'] },
  // default_attendance：未在 live DB 建立（帳務 migration 尚未跑）
  { name: 'payment_bags', group: '帳務', columns: ['id', 'tenant_id', 'season_id', 'class_id', 'bag_code', 'issue_date', 'due_date', 'status', 'tuition_note', 'note', 'print_count', 'last_printed_at', 'created_at', 'updated_at'] },
  { name: 'payment_bag_lines', group: '帳務', columns: ['id', 'tenant_id', 'bag_id', 'student_id', 'student_order', 'session_count', 'rate_per_session', 'tuition_amount', 'book_name', 'book_fee', 'misc_label', 'misc_fee', 'discount_label', 'discount_amount', 'carryover_amount', 'carryover_note', 'adjustment_label', 'adjustment_amount', 'total_amount', 'note', 'created_at', 'updated_at'] },
  { name: 'payment_bag_line_sessions', group: '帳務', columns: ['id', 'tenant_id', 'line_id', 'student_id', 'slot_index', 'session_kind', 'session_order', 'session_date', 'legacy_mmdd', 'is_unscheduled', 'week_key', 'is_billable', 'makeup_for_session_id', 'attendance_status', 'absence_resolution', 'attendance_note', 'attendance_updated_at', 'created_at', 'updated_at'] },
  { name: 'payment_bag_line_items', group: '帳務', columns: ['id', 'tenant_id', 'line_id', 'item_type', 'label', 'amount', 'sort_order', 'preset_key', 'created_at', 'updated_at'] },
  { name: 'invoice_fee_presets', group: '帳務', columns: ['id', 'tenant_id', 'category', 'label', 'amount', 'status', 'created_at', 'updated_at'] },

  { name: 'audit_log', group: '系統', columns: ['id', 'table_name', 'op', 'row_id', 'changed_columns', 'old_data', 'new_data', 'actor', 'created_at'] },
]

export const DB_TABLE_NAMES = DB_TABLES.map((t) => t.name)

// 欄位中文對照（DB 監看頁表頭第二行）
export const COL_LABELS: Record<string, string> = {
  // 通用
  id: 'ID',
  tenant_id: '租戶',
  created_at: '建立時間',
  updated_at: '更新時間',
  status: '狀態',
  note: '備注',
  notes: '備注',
  name: '名稱',
  display_order: '排序',
  color: '顏色',

  // profiles / tenants
  role: '角色',
  display_name: '顯示名稱',

  // classes
  class_id: '班級',
  class_name: '班級名稱',
  class_code: '班級代號',
  department: '部門',
  level: '級別',
  class_type: '班型',
  weekday1: '上課日1',
  weekday2: '上課日2',
  system_sessions: '預設堂數',

  // students
  student_id: '學生',
  chinese_name: '中文名',
  english_name: '英文名',
  school: '學校',
  grade: '年級',
  parent_name: '家長姓名',
  parent_phone: '家長電話',

  // class_enrollments
  slot_order: '座位順序',
  joined_at: '加入時間',
  left_at: '離開時間',

  // class_tasks
  bag_id: '帳袋',
  lesson_label: '課標',
  task_type: '任務類型',
  task_name: '任務名稱',
  threshold_value: '門檻值',
  max_score: '滿分',
  threshold_text: '門檻文字',

  // class_task_templates
  template_id: '模板',
  session_position: '堂位',

  // student_task_records
  class_task_id: '課程任務',
  latest_result: '最新結果',
  result_history: '結果歷史',
  teacher_note: '老師備注',
  comment_text: '評語文字',
  comment_status: '評語狀態',

  // rooms
  room_type: '教室類型',

  // schedule
  schedule_day_id: '排課日',
  room_id: '教室',
  date: '日期',
  weekday: '星期',
  title: '標題',
  event_type: '事件類型',
  start_time: '開始時間',
  end_time: '結束時間',

  // schedule_event_teachers
  schedule_event_id: '課程事件',
  teacher_id: '老師',

  // day_entries
  type: '類型',
  person: '人員',
  content: '內容',
  done: '完成',
  sort_order: '排序',

  // billing_seasons
  season_id: '學期',
  season_code: '季代號',
  year: '年',
  quarter: '季',
  start_date: '開始日',
  end_date: '結束日',
  label: '標籤',
  holiday_dates: '放假日期',

  // payment_bags
  bag_code: '帳袋代號',
  issue_date: '開立日',
  due_date: '到期日',
  tuition_note: '學費備注',
  print_count: '列印次數',
  last_printed_at: '最後列印',

  // payment_bag_lines
  student_order: '學生順序',
  session_count: '堂數',
  rate_per_session: '每堂費率',
  tuition_amount: '學費',
  book_name: '書名',
  book_fee: '書費',
  misc_label: '雜費標籤',
  misc_fee: '雜費',
  discount_label: '折扣標籤',
  discount_amount: '折扣',
  carryover_amount: '延遞金額',
  carryover_note: '延遞備注',
  adjustment_label: '調整標籤',
  adjustment_amount: '調整金額',
  total_amount: '總金額',

  // payment_bag_line_sessions
  line_id: '帳行',
  slot_index: '堂次',
  session_order: '課堂順序',
  legacy_mmdd: '舊月日',
  is_unscheduled: '未排課',
  week_key: '週鍵',
  is_billable: '計費',
  makeup_for_session_id: '補課原課',
  attendance_status: '出席狀態',
  absence_resolution: '缺席處理',
  attendance_note: '出席備注',
  attendance_updated_at: '出席更新時間',

  // payment_bag_line_items
  item_type: '項目類型',
  amount: '金額',
  preset_key: '預設鍵',

  // invoice_fee_presets
  category: '費用類型',

  // audit_log
  table_name: '表名',
  op: '操作',
  row_id: '資料ID',
  changed_columns: '變更欄位',
  old_data: '舊資料',
  new_data: '新資料',
  actor: '執行者',
}
