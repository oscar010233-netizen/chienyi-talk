import { createServiceClient } from '@/lib/supabase/server'
import type { ClassWithCount, ClassDetail, ClassEnrollment, Task, TaskRecord, ClassRow, RosterStudent } from './types'

// School-wide student roster, each with the classes they're actively enrolled in.
export async function getAllStudents(): Promise<RosterStudent[]> {
  const supabase = await createServiceClient()

  const { data: students, error } = await supabase
    .from('students')
    .select('id, chinese_name, english_name, status, school, grade, parent_name, parent_phone')
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

  // classId is the uuid from the URL param
  const { data: classRow } = await supabase
    .from('classes')
    .select('*')
    .eq('id', classId)
    .single()

  if (!classRow) return null

  const [studentsResult, tasksResult] = await Promise.all([
    supabase
      .from('class_enrollments')
      .select('id, class_id, student_id, slot_order, status, student:students(id, chinese_name, english_name, status, school, grade)')
      .eq('class_id', classRow.id)
      .eq('status', 'active')
      .order('slot_order'),
    supabase
      .from('class_tasks')
      .select('id, tenant_id, class_id, week_label, lesson_label, task_type, task_name, threshold_value, max_score, threshold_text, display_order')
      .eq('class_id', classRow.id)
      .order('display_order'),
  ])

  const taskIds = (tasksResult.data ?? []).map(t => t.id)

  const { data: recordsData } = taskIds.length > 0
    ? await supabase
        .from('student_task_records')
        .select('id, tenant_id, student_id, class_task_id, status, lamp, latest_result, result_history, comment_text, comment_status, teacher_note, updated_at')
        .in('class_task_id', taskIds)
    : { data: [] }

  return {
    class: classRow as ClassRow,
    students: (studentsResult.data ?? []) as unknown as ClassEnrollment[],
    tasks: (tasksResult.data ?? []) as Task[],
    records: (recordsData ?? []) as TaskRecord[],
  }
}
