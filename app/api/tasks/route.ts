import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nextTaskCode } from '@/lib/grade/codes'

const TASK_TYPES = ['attendance', 'homework', 'practice', 'quiz', 'comment']

// POST /api/tasks — add a task to a class. task_code is auto-generated and the
// new task is appended (display_order = max + 1). Existing students still need
// a dispatch run to get their task_records for this task.
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const class_id = body.class_id as string | undefined
  const task_type = body.task_type as string | undefined

  if (!class_id) return NextResponse.json({ error: 'class_id required' }, { status: 400 })
  if (!task_type || !TASK_TYPES.includes(task_type)) {
    return NextResponse.json({ error: 'valid task_type required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', class_id)
    .single()
  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data: siblings } = await supabase
    .from('tasks')
    .select('display_order')
    .eq('class_id', class_id)
  const display_order = (siblings ?? []).reduce((m, r) => Math.max(m, r.display_order ?? 0), 0) + 1

  const task_code = await nextTaskCode(supabase)
  const threshold = body.threshold != null && String(body.threshold).trim() !== ''
    ? Number(body.threshold)
    : null

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      tenant_id: cls.tenant_id,
      class_id,
      task_code,
      task_type,
      task_name: (body.task_name as string)?.trim() || null,
      threshold: task_type === 'quiz' ? threshold : null,
      week: (body.week as string)?.trim() || 'W1',
      lesson_number: (body.lesson_number as string)?.trim() || 'L1',
      display_order,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
