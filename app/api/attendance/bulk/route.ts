import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED = new Set(['pending', 'present', 'late', 'absent_makeup', 'absent_refund'])

interface UpdateItem {
  record_id: string
  status: string
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const classTaskId = typeof body.class_task_id === 'string' ? body.class_task_id.trim() : ''
  const updates = Array.isArray(body.updates) ? (body.updates as UpdateItem[]) : []

  if (!classTaskId) return NextResponse.json({ error: 'class_task_id required' }, { status: 400 })
  if (updates.length === 0) return NextResponse.json({ error: 'updates required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: task } = await supabase
    .from('class_tasks')
    .select('task_type')
    .eq('id', classTaskId)
    .single()

  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  if (task.task_type !== 'attendance') return NextResponse.json({ error: 'not an attendance task' }, { status: 400 })

  const valid = updates.filter(u => typeof u.record_id === 'string' && u.record_id && ALLOWED.has(u.status))
  if (valid.length === 0) return NextResponse.json({ error: 'no valid updates' }, { status: 400 })

  const now = new Date().toISOString()
  const results = await Promise.all(
    valid.map(u =>
      supabase
        .from('student_task_records')
        .update({ status: u.status, updated_at: now })
        .eq('id', u.record_id)
        .eq('class_task_id', classTaskId)
    )
  )

  const failed = results.filter(r => r.error).length
  if (failed > 0) return NextResponse.json({ error: `${failed} updates failed` }, { status: 500 })

  return NextResponse.json({ updated: valid.length })
}
