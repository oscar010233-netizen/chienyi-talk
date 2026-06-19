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

  // Get the latest bag for this class
  const { data: bag } = await supabase
    .from('payment_bags')
    .select('id, class_id')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bag) {
    return NextResponse.json({ class: cls, sessions: [] })
  }

  // Get all line IDs for this bag
  const { data: lineRows } = await supabase
    .from('payment_bag_lines')
    .select('id')
    .eq('bag_id', bag.id)
  const lineIds = (lineRows ?? []).map((r: { id: string }) => r.id)

  if (lineIds.length === 0) {
    return NextResponse.json({ class: cls, sessions: [] })
  }

  // Get unique sessions from payment_bag_line_sessions
  const { data: sessionRows } = await supabase
    .from('payment_bag_line_sessions')
    .select('session_date, session_kind, slot_index')
    .in('line_id', lineIds)
    .not('session_date', 'is', null)
    .order('slot_index')

  // Deduplicate by (session_date, session_kind)
  const seen = new Set<string>()
  const uniqueSessions = (sessionRows ?? []).filter(
    (s: { session_date: string | null; session_kind: string }) => {
      const key = `${s.session_date}:${s.session_kind}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }
  )

  if (uniqueSessions.length === 0) {
    return NextResponse.json({ class: cls, sessions: [] })
  }

  // Get class_tasks for this class+bag
  const { data: tasks } = await supabase
    .from('class_tasks')
    .select('*')
    .eq('class_id', classId)
    .eq('bag_id', bag.id)

  // Group tasks by (session_date, session_kind)
  const tasksBySession = new Map<string, Record<string, unknown>[]>()
  for (const task of tasks ?? []) {
    const key = `${task.session_date}:${task.session_kind}`
    const list = tasksBySession.get(key) ?? []
    list.push(task)
    tasksBySession.set(key, list)
  }

  // Build sessions array
  const sessions = uniqueSessions.map((s: { session_date: string; session_kind: string }) => {
    const key = `${s.session_date}:${s.session_kind}`
    const sessionTasks = tasksBySession.get(key) ?? []
    const tasksByType: Partial<Record<TaskType, unknown>> = {}
    for (const t of sessionTasks) {
      tasksByType[t.task_type as TaskType] = t
    }
    return {
      session_date: s.session_date,
      session_kind: s.session_kind,
      tasks: tasksByType,
    }
  })

  return NextResponse.json({ class: cls, bag_id: bag.id, sessions })
}

// POST /api/season-plan
// { class_id, bag_id, session_date, session_kind, task_type, task_name }
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    class_id?: string
    bag_id?: string
    session_date?: string
    session_kind?: string
    task_type?: string
    task_name?: string | null
  }
  const { class_id, bag_id, session_date, session_kind, task_type, task_name } = body

  if (!class_id || !bag_id || !session_date || !session_kind || !task_type) {
    return NextResponse.json(
      { error: 'class_id, bag_id, session_date, session_kind, task_type required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', class_id)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  // Look up existing task
  const { data: existing } = await supabase
    .from('class_tasks')
    .select('id')
    .eq('class_id', class_id)
    .eq('bag_id', bag_id)
    .eq('session_date', session_date)
    .eq('session_kind', session_kind)
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
  const nextOrder = (siblings ?? []).reduce(
    (max: number, r: { display_order: number | null }) => Math.max(max, r.display_order ?? 0),
    0
  ) + 1

  const { data: created, error } = await supabase
    .from('class_tasks')
    .insert({
      tenant_id: cls.tenant_id,
      class_id,
      bag_id,
      session_date,
      session_kind,
      task_type,
      task_name: task_name?.trim() || null,
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
      enrollments.map((e: { student_id: string }) => ({
        tenant_id: cls.tenant_id,
        class_task_id: created.id,
        student_id: e.student_id,
      }))
    )
  }

  return NextResponse.json({ task: created, action: 'created' })
}
