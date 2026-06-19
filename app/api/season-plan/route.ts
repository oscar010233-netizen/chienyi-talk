import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { TaskType } from '@/lib/grade/types'

// GET /api/season-plan?class_id=xxx
export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('class_id')
  if (!classId) return NextResponse.json({ error: 'class_id required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id, class_name, class_type, weekday1, weekday2, tenant_id')
    .eq('id', classId)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data: rawSessions } = await supabase
    .from('default_attendance')
    .select('id, season_id, session_index, default_date, original_date, period_key, status, source')
    .eq('class_id', classId)
    .order('default_date', { ascending: true })

  if (!rawSessions || rawSessions.length === 0) {
    return NextResponse.json({ class: cls, sessions: [] })
  }

  const sessionIds = rawSessions.map((s) => s.id)
  const { data: tasks } = await supabase
    .from('class_tasks')
    .select('*')
    .eq('class_id', classId)
    .in('default_attendance_id', sessionIds)

  const tasksBySession = new Map<string, Record<string, unknown>[]>()
  for (const task of tasks ?? []) {
    const id = task.default_attendance_id as string
    const list = tasksBySession.get(id) ?? []
    list.push(task)
    tasksBySession.set(id, list)
  }

  const sessions = rawSessions.map((s) => {
    let sessionType: 'group' | 'intensive' | 'unknown' = 'unknown'
    if (s.source === 'weekday1') sessionType = 'group'
    else if (s.source === 'weekday2') sessionType = 'intensive'

    const sessionTasks = tasksBySession.get(s.id) ?? []
    const tasksByType: Partial<Record<TaskType, unknown>> = {}
    for (const t of sessionTasks) {
      tasksByType[t.task_type as TaskType] = t
    }

    return { ...s, session_type: sessionType, tasks: tasksByType }
  })

  return NextResponse.json({ class: cls, sessions })
}

// POST /api/season-plan
// { class_id, default_attendance_id, task_type, task_name }
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    class_id?: string
    default_attendance_id?: string
    task_type?: string
    task_name?: string | null
  }
  const { class_id, default_attendance_id, task_type, task_name } = body

  if (!class_id || !default_attendance_id || !task_type) {
    return NextResponse.json({ error: 'class_id, default_attendance_id, task_type required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const [{ data: cls }, { data: session }] = await Promise.all([
    supabase.from('classes').select('tenant_id').eq('id', class_id).single(),
    supabase.from('default_attendance').select('session_index, period_key').eq('id', default_attendance_id).single(),
  ])

  if (!cls || !session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('class_tasks')
    .select('id')
    .eq('class_id', class_id)
    .eq('default_attendance_id', default_attendance_id)
    .eq('task_type', task_type)
    .maybeSingle()

  if (existing) {
    const { data: updated, error } = await supabase
      .from('class_tasks')
      .update({ task_name: task_name?.trim() || null })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ task: updated, action: 'updated' })
  }

  const { data: siblings } = await supabase
    .from('class_tasks')
    .select('display_order')
    .eq('class_id', class_id)
  const nextOrder = (siblings ?? []).reduce((max, r) => Math.max(max, (r.display_order as number) ?? 0), 0) + 1

  const idx = session.session_index
  const { data: created, error } = await supabase
    .from('class_tasks')
    .insert({
      tenant_id: cls.tenant_id,
      class_id,
      default_attendance_id,
      task_type,
      task_name: task_name?.trim() || null,
      week_label: session.period_key,
      lesson_label: `S${String(idx).padStart(2, '0')}`,
      display_order: nextOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', class_id)
    .eq('status', 'active')

  if (created && enrollments?.length) {
    await supabase.from('student_task_records').insert(
      enrollments.map((e) => ({
        tenant_id: cls.tenant_id,
        class_task_id: created.id,
        student_id: e.student_id,
      }))
    )
  }

  return NextResponse.json({ task: created, action: 'created' })
}
