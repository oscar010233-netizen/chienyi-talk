// Single source of truth for the DB-monitor page (/db).
// Reflects the live Supabase schema. Keep in sync when migrations change.
// Last verified: lamp column removed from student_task_records,
// schedule_event_students table dropped, audit_log + triggers added.

export interface TableMeta {
  name: string
  group: string
  note?: string
  columns: string[]
}

export const DB_TABLES: TableMeta[] = [
  { name: 'tenants', group: '共用', note: '租戶；app 只讀 id 當 tenant_id 來源', columns: ['id', 'name', 'created_at'] },
  { name: 'profiles', group: '共用', note: 'RLS 命脈，勿刪；app 程式碼不直接讀寫', columns: ['id', 'tenant_id', 'role', 'display_name', 'created_at'] },

  { name: 'classes', group: '班級', note: 'department 目前無寫入 UI（buffer 來源分類因此失效）', columns: ['id', 'tenant_id', 'class_name', 'class_code', 'department', 'level', 'class_type', 'weekday1', 'weekday2', 'system_sessions', 'status', 'created_at', 'updated_at'] },
  { name: 'students', group: '班級', note: 'note 欄無對應表單', columns: ['id', 'tenant_id', 'chinese_name', 'english_name', 'status', 'school', 'grade', 'note', 'parent_name', 'parent_phone', 'created_at', 'updated_at'] },
  { name: 'class_enrollments', group: '班級', columns: ['id', 'tenant_id', 'class_id', 'student_id', 'status', 'slot_order', 'joined_at', 'left_at', 'created_at', 'updated_at'] },
  { name: 'class_tasks', group: '班級', columns: ['id', 'tenant_id', 'class_id', 'week_label', 'lesson_label', 'task_type', 'task_name', 'threshold_value', 'max_score', 'threshold_text', 'display_order', 'status', 'created_at', 'updated_at'] },
  { name: 'student_task_records', group: '班級', note: 'lamp 欄已移除（燈號改為前端 derive）', columns: ['id', 'tenant_id', 'class_task_id', 'student_id', 'status', 'latest_result', 'result_history', 'teacher_note', 'comment_text', 'comment_status', 'created_at', 'updated_at'] },

  { name: 'rooms', group: '配課表', columns: ['id', 'tenant_id', 'name', 'room_type', 'display_order', 'status', 'created_at', 'updated_at'] },
  { name: 'schedule_days', group: '配課表', note: 'note 欄從不寫入', columns: ['id', 'tenant_id', 'date', 'weekday', 'note', 'status', 'created_at', 'updated_at'] },
  { name: 'schedule_events', group: '配課表', columns: ['id', 'tenant_id', 'schedule_day_id', 'room_id', 'class_id', 'title', 'event_type', 'start_time', 'end_time', 'color', 'note', 'status', 'created_at', 'updated_at'] },
  { name: 'schedule_event_teachers', group: '配課表', note: '多老師預留；被 events 查詢 join，但無寫入 UI', columns: ['id', 'tenant_id', 'schedule_event_id', 'teacher_id', 'start_time', 'end_time', 'color', 'created_at', 'updated_at'] },
  { name: 'day_entries', group: '配課表', note: 'notes / sort_order 欄從不寫入', columns: ['id', 'tenant_id', 'schedule_day_id', 'type', 'person', 'content', 'done', 'notes', 'sort_order', 'created_at'] },

  { name: 'billing_seasons', group: '帳務', note: 'holiday_dates 已內嵌（原 billing_season_holidays 表已移除）', columns: ['id', 'tenant_id', 'season_code', 'year', 'quarter', 'start_date', 'end_date', 'label', 'status', 'holiday_dates', 'created_at', 'updated_at'] },
  { name: 'default_attendance', group: '帳務', note: 'holiday_id 已移除（FK 參照的 billing_season_holidays 已刪）', columns: ['id', 'tenant_id', 'season_id', 'class_id', 'session_index', 'default_date', 'original_date', 'period_key', 'source', 'status', 'note', 'created_at', 'updated_at'] },
  { name: 'payment_bags', group: '帳務', columns: ['id', 'tenant_id', 'season_id', 'class_id', 'bag_code', 'issue_date', 'due_date', 'status', 'tuition_note', 'note', 'print_count', 'last_printed_at', 'created_at', 'updated_at'] },
  { name: 'payment_bag_lines', group: '帳務', note: 'issue_status/paid_amount/handler/payment_status/intro_card_received 有 API（update-line）但無 UI 觸發', columns: ['id', 'tenant_id', 'bag_id', 'student_id', 'student_order', 'session_count', 'rate_per_session', 'tuition_amount', 'book_name', 'book_fee', 'misc_label', 'misc_fee', 'discount_label', 'discount_amount', 'carryover_amount', 'carryover_note', 'adjustment_label', 'adjustment_amount', 'total_amount', 'issue_status', 'paid_amount', 'intro_card_received', 'handler', 'payment_status', 'note', 'created_at', 'updated_at'] },

  { name: 'audit_log', group: '系統', note: '變更稽核（觸發器自動寫入）', columns: ['id', 'table_name', 'op', 'row_id', 'changed_columns', 'old_data', 'new_data', 'actor', 'created_at'] },
]

export const DB_TABLE_NAMES = DB_TABLES.map((t) => t.name)
