export type Lamp = 'red' | 'yellow' | 'green' | 'blue' | 'black' | 'white' | 'orange'
export type TaskType = 'attendance' | 'homework' | 'practice' | 'quiz' | 'comment'

export interface Student {
  id: string
  legacy_student_id: string | null
  chinese_name: string
  english_name: string
  status: string
  school: string | null
  grade: string | null
}

export interface ClassRow {
  id: string
  tenant_id: string
  legacy_class_id: string | null
  sheet_name: string | null
  class_name: string
  source: 'ENG' | 'XIAO' | string
  level: string | null
  class_type: 'double' | 'intensive' | 'single' | string
  weekday1: number | null
  weekday2: number | null
  system_sessions: number
  status: string
}

export interface ClassStudent {
  id: string
  class_id: string
  student_id: string
  slot_order: number
  status: string
  student: Student
}

export interface Task {
  id: string
  tenant_id: string
  class_id: string
  task_code: string
  week: string
  lesson_number: string
  task_type: TaskType
  task_name: string | null
  threshold: number | null
  display_order: number
}

export interface TaskRecord {
  id: string
  tenant_id: string
  student_id: string
  task_id: string
  class_id: string
  status: string
  lamp: Lamp
  latest_result: number | null
  result_history: string | null
  comment_text: string | null
  comment_status: 'draft' | 'published' | null
  private_note: string | null
  last_updated: string
}

export interface ClassDetail {
  class: ClassRow
  students: ClassStudent[]
  tasks: Task[]
  records: TaskRecord[]
}

export interface ClassWithCount extends ClassRow {
  student_count: number
}

export interface RosterStudent {
  id: string
  legacy_student_id: string
  chinese_name: string | null
  english_name: string | null
  status: string
  school: string | null
  grade: string | null
  parent_name: string | null
  parent_phone: string | null
  classes: string[]
}
