import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const TASK_TYPES = ['homework', 'practice', 'quiz', 'comment', 'progress'] as const

type TaskTypeValue = (typeof TASK_TYPES)[number]

interface TaskInput {
  task_type?: string
  task_name?: string | null
  lesson_label?: string | null
  slot_index?: string | number | null
  threshold?: string | number | null
  threshold_value?: string | number | null
  threshold_text?: string | null
  max_score?: string | number | null
}

function isTaskType(value: string | undefined): value is TaskTypeValue {
  return !!value && TASK_TYPES.includes(value as TaskTypeValue)
}

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function numericOrNull(value: unknown): number | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function integerOrNull(value: unknown): number | null {
  const number = numericOrNull(value)
  return number != null ? Math.trunc(number) : null
}

function normalizeTaskInput(input: TaskInput, fallbackSlotIndex: number | null, fallbackLesson: string | null) {
  const taskType = String(input.task_type ?? '').trim()
  if (!isTaskType(taskType)) {
    throw new Error('valid task_type required')
  }

  const thresholdSource = input.threshold_value ?? input.threshold

  return {
    task_type: taskType,
    task_name: trimOrNull(input.task_name),
    lesson_label: trimOrNull(input.lesson_label) ?? fallbackLesson,
    slot_index: integerOrNull(input.slot_index) ?? fallbackSlotIndex,
    threshold_value: taskType === 'quiz' ? numericOrNull(thresholdSource) : null,
    threshold_text: trimOrNull(input.threshold_text),
    max_score: numericOrNull(input.max_score),
  }
}

// DELETE /api/tasks?task_id=xxx
// Removes student_task_records then the class_task itself.
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('task_id')?.trim()
  if (!taskId) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: taskRow, error: taskError } = await supabase
    .from('class_tasks')
    .select('id, tenant_id')
    .eq('id', taskId)
    .maybeSingle()

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 })
  if (!taskRow) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  const { error: recError } = await supabase
    .from('student_task_records')
    .delete()
    .eq('class_task_id', taskId)
    .eq('tenant_id', taskRow.tenant_id)

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })

  const { error } = await supabase
    .from('class_tasks')
    .delete()
    .eq('id', taskId)
    .eq('tenant_id', taskRow.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}

// PATCH /api/tasks
// - Rename task: { task_id, task_name }
// - Update slot lesson label: { class_id, bag_id, slot_index, lesson_label }
export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const taskId = trimOrNull(body.task_id ?? body.id)
  const supabase = await createServiceClient()

  if (taskId) {
    const { data: taskRow, error: taskError } = await supabase
      .from('class_tasks')
      .select('id, tenant_id')
      .eq('id', taskId)
      .maybeSingle()

    if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 })
    if (!taskRow) return NextResponse.json({ error: 'task not found' }, { status: 404 })

    const { data: updated, error } = await supabase
      .from('class_tasks')
      .update({ task_name: trimOrNull(body.task_name) })
      .eq('id', taskId)
      .eq('tenant_id', taskRow.tenant_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ task: updated, updated: 1 })
  }

  const classId = trimOrNull(body.class_id)
  const bagId = trimOrNull(body.bag_id)
  const slotIndex = integerOrNull(body.slot_index)

  if (!classId || !bagId || slotIndex === null) {
    return NextResponse.json({ error: 'task_id or class_id + bag_id + slot_index required' }, { status: 400 })
  }

  const { data: cls, error: classError } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', classId)
    .single()

  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 })
  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data: updated, error } = await supabase
    .from('class_tasks')
    .update({ lesson_label: trimOrNull(body.lesson_label) })
    .eq('tenant_id', cls.tenant_id)
    .eq('class_id', classId)
    .eq('bag_id', bagId)
    .eq('slot_index', slotIndex)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    tasks: updated ?? [],
    updated: updated?.length ?? 0,
  })
}

// POST /api/tasks
// - Single task: { class_id, bag_id, slot_index, lesson_label, task_type, task_name }
// - Batch task insert: { class_id, bag_id, slot_index, lesson_label, tasks: [...] }
// Every created class_task is immediately fanned out to active enrollments.
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const classId = body.class_id as string | undefined

  if (!classId) return NextResponse.json({ error: 'class_id required' }, { status: 400 })

  const fallbackLesson = trimOrNull(body.lesson_label)
  const fallbackBagId = trimOrNull(body.bag_id)
  const fallbackSlotIndex = integerOrNull(body.slot_index)
  const rawTasks = Array.isArray(body.tasks)
    ? body.tasks as TaskInput[]
    : [body as TaskInput]

  if (rawTasks.length === 0) {
    return NextResponse.json({ error: 'tasks required' }, { status: 400 })
  }

  let normalizedTasks
  try {
    normalizedTasks = rawTasks.map((task) => normalizeTaskInput(task, fallbackSlotIndex, fallbackLesson))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid task payload' },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', classId)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data: siblings } = await supabase
    .from('class_tasks')
    .select('display_order')
    .eq('class_id', classId)
    .eq('tenant_id', cls.tenant_id)

  const firstOrder = (siblings ?? []).reduce((max, row) => Math.max(max, row.display_order ?? 0), 0) + 1

  const rows = normalizedTasks.map((task, index) => ({
    tenant_id: cls.tenant_id,
    class_id: classId,
    bag_id: fallbackBagId,
    slot_index: task.slot_index,
    lesson_label: task.lesson_label,
    task_type: task.task_type,
    task_name: task.task_name,
    threshold_value: task.threshold_value,
    threshold_text: task.threshold_text,
    max_score: task.max_score,
    display_order: firstOrder + index,
  }))

  const { data: createdTasks, error } = await supabase
    .from('class_tasks')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('tenant_id', cls.tenant_id)
    .eq('status', 'active')

  const recordRows = []
  for (const task of createdTasks ?? []) {
    for (const enrollment of enrollments ?? []) {
      recordRows.push({
        tenant_id: cls.tenant_id,
        class_task_id: task.id,
        student_id: enrollment.student_id,
      })
    }
  }

  if (recordRows.length > 0) {
    const { error: recError } = await supabase
      .from('student_task_records')
      .insert(recordRows)

    if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })
  }

  return NextResponse.json({
    created: createdTasks?.length ?? 0,
    tasks: createdTasks ?? [],
    task: createdTasks?.[0] ?? null,
    records_created: recordRows.length,
  })
}
