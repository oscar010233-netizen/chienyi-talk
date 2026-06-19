export type Lamp = 'red' | 'yellow' | 'green' | 'blue' | 'black' | 'white' | 'orange'
export type TaskType = 'attendance' | 'homework' | 'practice' | 'quiz' | 'comment' | 'progress'

export interface Student {
  id: string
  chinese_name: string
  english_name: string
  status: string
  school: string | null
  grade: string | null
}

export interface ClassRow {
  id: string
  tenant_id: string
  class_name: string
  class_code: string | null
  department: string | null
  level: string | null
  class_type: 'double' | 'intensive' | 'single' | string
  weekday1: number | null
  weekday2: number | null
  system_sessions: number | null
  status: string
}

export interface ClassEnrollment {
  id: string
  class_id: string
  student_id: string
  slot_order: number | null
  status: string
  student: Student
}

export interface Task {
  id: string
  tenant_id: string
  class_id: string
  week_label: string | null
  lesson_label: string | null
  task_type: TaskType
  task_name: string | null
  threshold_value: number | null
  max_score: number | null
  threshold_text: string | null
  display_order: number | null
  bag_id: string | null
  session_date: string | null
  session_kind: 'team' | 'intensive' | null
}

export interface SeasonSession {
  session_date: string
  session_kind: 'team' | 'intensive'
  tasks: Partial<Record<TaskType, Task>>
}

export interface TaskRecord {
  id: string
  tenant_id: string
  student_id: string
  class_task_id: string
  status: string
  latest_result: string | null
  result_history: string | null
  comment_text: string | null
  comment_status: 'draft' | 'pending_publish' | 'published' | 'needs_republish' | null
  teacher_note: string | null
  updated_at: string
}

export interface ClassDetail {
  class: ClassRow
  students: ClassEnrollment[]
  tasks: Task[]
  records: TaskRecord[]
}

export interface ClassWithCount extends ClassRow {
  student_count: number
}

export interface RosterStudent {
  id: string
  chinese_name: string | null
  english_name: string | null
  status: string
  school: string | null
  grade: string | null
  note: string | null
  parent_name: string | null
  parent_phone: string | null
  classes: string[]
}
