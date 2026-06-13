import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { class_id } = await request.json() as { class_id?: string }

  if (!class_id) {
    return NextResponse.json({ error: 'class_id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id, tenant_id')
    .eq('id', class_id)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const [enrollmentsResult, tasksResult, existingResult] = await Promise.all([
    supabase
      .from('class_students')
      .select('student_id')
      .eq('class_id', class_id)
      .eq('status', 'active'),
    supabase
      .from('tasks')
      .select('id')
      .eq('class_id', class_id),
    supabase
      .from('task_records')
      .select('student_id, task_id')
      .eq('class_id', class_id),
  ])

  const students = enrollmentsResult.data ?? []
  const tasks = tasksResult.data ?? []
  const existing = existingResult.data ?? []

  if (students.length === 0) return NextResponse.json({ dispatched: 0, message: '班上沒有學生' })
  if (tasks.length === 0) return NextResponse.json({ dispatched: 0, message: '班上沒有任務' })

  const existingKeys = new Set(existing.map(r => `${r.student_id}:${r.task_id}`))

  const rows = []
  for (const { student_id } of students) {
    for (const { id: task_id } of tasks) {
      if (!existingKeys.has(`${student_id}:${task_id}`)) {
        rows.push({
          tenant_id: cls.tenant_id,
          student_id,
          task_id,
          class_id,
          status: 'pending',
          lamp: 'red',
          last_updated: new Date().toISOString(),
        })
      }
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ dispatched: 0, message: '所有任務已派發完畢' })
  }

  const { error } = await supabase.from('task_records').insert(rows)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ dispatched: rows.length })
}
