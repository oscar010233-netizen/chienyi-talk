import { createServiceClient } from '@/lib/supabase/server'
import type {
  ClassWithCount,
  ClassDetail,
  ClassEnrollment,
  Task,
  TaskRecord,
  ClassRow,
  RosterStudent,
  ClassSession,
  ClassSessionRow,
  SessionDailyComment,
} from './types'

// School-wide student roster, each with the classes they're actively enrolled in.
export async function getAllStudents(): Promise<RosterStudent[]> {
  const supabase = await createServiceClient()

  const { data: students, error } = await supabase
    .from('students')
    .select('id, chinese_name, english_name, status, school, grade, note, parent_name, parent_phone')
    .order('chinese_name')

  if (error || !students) return []

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id, class:classes(class_name)')
    .eq('status', 'active')

  const classMap: Record<string, string[]> = {}
  for (const e of enrollments ?? []) {
    const cls = e.class as unknown as { class_name: string | null } | null
    const name = cls?.class_name
    if (name) (classMap[e.student_id] ??= []).push(name)
  }

  return students.map(s => ({
    ...s,
    classes: classMap[s.id] ?? [],
  })) as RosterStudent[]
}

export async function getAllClasses(): Promise<ClassWithCount[]> {
  const supabase = await createServiceClient()

  const { data: classes, error } = await supabase
    .from('classes')
    .select('id, tenant_id, class_name, class_code, department, level, class_type, weekday1, weekday2, system_sessions, status')
    .eq('status', 'active')
    .order('class_name')

  if (error || !classes) return []

  const ids = classes.map(c => c.id)
  if (ids.length === 0) return classes.map(c => ({ ...c, student_count: 0 }))

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('class_id')
    .in('class_id', ids)
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of enrollments ?? []) {
    countMap[row.class_id] = (countMap[row.class_id] ?? 0) + 1
  }

  return classes.map(c => ({ ...c, student_count: countMap[c.id] ?? 0 }))
}

export async function getClassDetail(classId: string): Promise<ClassDetail | null> {
  const supabase = await createServiceClient()

  const { data: classRow } = await supabase
    .from('classes')
    .select('*')
    .eq('id', classId)
    .single()

  if (!classRow) return null

  const [studentsResult, tasksResult, bagResult, sessionCommentsResult] = await Promise.all([
    supabase
      .from('class_enrollments')
      .select('id, class_id, student_id, slot_order, status, student:students(id, chinese_name, english_name, status, school, grade)')
      .eq('class_id', classRow.id)
      .eq('status', 'active')
      .order('slot_order'),
    supabase
      .from('class_tasks')
      .select('id, tenant_id, class_id, bag_id, slot_index, lesson_label, task_type, task_name, threshold_value, max_score, threshold_text, display_order')
      .eq('class_id', classRow.id)
      .eq('tenant_id', classRow.tenant_id)
      .neq('task_type', 'attendance')
      .order('display_order'),
    supabase
      .from('payment_bags')
      .select('id')
      .eq('class_id', classRow.id)
      .eq('tenant_id', classRow.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('session_daily_comments')
      .select('id, class_id, session_date, comment_text, status')
      .eq('class_id', classRow.id)
      .eq('tenant_id', classRow.tenant_id),
  ])

  const bag = bagResult.data
  let sessions: ClassSession[] = []
  let sessionRows: ClassSessionRow[] = []

  if (bag) {
    const { data: lineRows } = await supabase
      .from('payment_bag_lines')
      .select('id')
      .eq('bag_id', bag.id)
      .eq('tenant_id', classRow.tenant_id)
    const lineIds = (lineRows ?? []).map((r: { id: string }) => r.id)

    if (lineIds.length > 0) {
      const { data: rawRows } = await supabase
        .from('payment_bag_line_sessions')
        .select(
          'id, line_id, student_id, slot_index, session_kind, session_date, is_billable, attendance_status, absence_resolution, attendance_note, makeup_for_session_id'
        )
        .in('line_id', lineIds)
        .eq('tenant_id', classRow.tenant_id)
        .order('session_date', { ascending: true })
        .order('slot_index', { ascending: true, nullsFirst: false })

      sessionRows = (rawRows ?? []) as unknown as ClassSessionRow[]

      // Build deduplicated ClassSession list (for backward compat with other parts)
      const seen = new Set<string>()
      sessions = sessionRows
        .filter((r) => r.session_kind !== 'makeup' && r.session_date && r.slot_index !== null)
        .filter((r) => {
          const key = String(r.slot_index)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((r) => ({
          session_date: r.session_date as string,
          session_kind: r.session_kind as 'team' | 'intensive',
        }))
    }
  }

  const taskIds = (tasksResult.data ?? []).map((t: { id: string }) => t.id)

  const { data: recordsData } = taskIds.length > 0
    ? await supabase
        .from('student_task_records')
        .select('id, tenant_id, student_id, class_task_id, status, latest_result, result_history, comment_text, comment_status, teacher_note, updated_at')
        .eq('tenant_id', classRow.tenant_id)
        .in('class_task_id', taskIds)
    : { data: [] }

  return {
    class: classRow as ClassRow,
    students: (studentsResult.data ?? []) as unknown as ClassEnrollment[],
    tasks: (tasksResult.data ?? []) as Task[],
    records: (recordsData ?? []) as TaskRecord[],
    sessions,
    sessionRows,
    sessionComments: (sessionCommentsResult.data ?? []) as SessionDailyComment[],
    bag_id: bag?.id ?? null,
  }
}
