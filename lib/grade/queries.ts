import { createServiceClient } from '@/lib/supabase/server'
import type { ClassWithCount, ClassDetail, ClassStudent, Task, TaskRecord, ClassRow } from './types'

export async function getAllClasses(): Promise<ClassWithCount[]> {
  const supabase = await createServiceClient()

  const { data: classes, error } = await supabase
    .from('classes')
    .select('id, tenant_id, legacy_class_id, sheet_name, class_name, source, level, class_type, weekday1, weekday2')
    .not('legacy_class_id', 'is', null)
    .order('legacy_class_id')

  if (error || !classes) return []

  const ids = classes.map(c => c.id)
  if (ids.length === 0) return classes.map(c => ({ ...c, status: 'active', system_sessions: 24, student_count: 0 }))

  const { data: enrollments } = await supabase
    .from('class_students')
    .select('class_id')
    .in('class_id', ids)
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of enrollments ?? []) {
    countMap[row.class_id] = (countMap[row.class_id] ?? 0) + 1
  }

  return classes.map(c => ({ ...c, status: 'active', system_sessions: 24, student_count: countMap[c.id] ?? 0 }))
}

export async function getClassDetail(classId: string): Promise<ClassDetail | null> {
  const supabase = await createServiceClient()

  // classId is the legacy_class_id (URL segment)
  const { data: classRow } = await supabase
    .from('classes')
    .select('*')
    .eq('legacy_class_id', classId)
    .single()

  if (!classRow) return null

  const [studentsResult, tasksResult, recordsResult] = await Promise.all([
    supabase
      .from('class_students')
      .select('id, class_id, student_id, slot_order, status, student:students(id, legacy_student_id, chinese_name, english_name, status, school, grade)')
      .eq('class_id', classRow.id)
      .eq('status', 'active')
      .order('slot_order'),
    supabase
      .from('tasks')
      .select('*')
      .eq('class_id', classRow.id)
      .order('display_order'),
    supabase
      .from('task_records')
      .select('*')
      .eq('class_id', classRow.id),
  ])

  return {
    class: classRow as ClassRow,
    students: (studentsResult.data ?? []) as unknown as ClassStudent[],
    tasks: (tasksResult.data ?? []) as Task[],
    records: (recordsResult.data ?? []) as TaskRecord[],
  }
}
