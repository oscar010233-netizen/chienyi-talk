import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const WRITABLE_COLUMNS = [
  'latest_result',
  'result_history',
  'teacher_note',
  'comment_text',
  'comment_status',
] as const

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id.trim() : ''

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const column of WRITABLE_COLUMNS) {
    if (column in body) patch[column] = body[column]
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('student_task_records')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const studentId = typeof body.student_id === 'string' ? body.student_id.trim() : ''
  const classTaskId = typeof body.class_task_id === 'string' ? body.class_task_id.trim() : ''

  if (!studentId || !classTaskId) {
    return NextResponse.json({ error: 'student_id and class_task_id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data: task } = await supabase
    .from('class_tasks')
    .select('tenant_id')
    .eq('id', classTaskId)
    .single()

  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  const payload: Record<string, unknown> = {
    tenant_id: task.tenant_id,
    student_id: studentId,
    class_task_id: classTaskId,
  }

  for (const column of WRITABLE_COLUMNS) {
    if (column in body) payload[column] = body[column]
  }

  const { data, error } = await supabase
    .from('student_task_records')
    .upsert(payload, { onConflict: 'class_task_id,student_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
