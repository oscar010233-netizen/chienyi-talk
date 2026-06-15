import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const TASK_TYPES = ['attendance', 'homework', 'practice', 'quiz', 'comment'] as const

type TaskTypeValue = (typeof TASK_TYPES)[number]

interface TaskInput {
  task_type?: string
  task_name?: string | null
  week_label?: string | null
  lesson_label?: string | null
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

function normalizeTaskInput(input: TaskInput, fallbackWeek: string, fallbackLesson: string) {
  const taskType = String(input.task_type ?? '').trim()
  if (!isTaskType(taskType)) {
    throw new Error('valid task_type required')
  }

  const thresholdSource = input.threshold_value ?? input.threshold

  return {
    task_type: taskType,
    task_name: trimOrNull(input.task_name),
    week_label: trimOrNull(input.week_label) ?? fallbackWeek,
    lesson_label: trimOrNull(input.lesson_label) ?? fallbackLesson,
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

  const { error: recError } = await supabase
    .from('student_task_records')
    .delete()
    .eq('class_task_id', taskId)

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })

  const { error } = await supabase
    .from('class_tasks')
    .delete()
    .eq('id', taskId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}

// POST /api/tasks
// - Single task: { class_id, task_type, task_name, week_label, lesson_label }
// - Weekly batch: { class_id, week_label, lesson_label, tasks: [...] }
// Every created class_task is immediately fanned out to active enrollments.
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const classId = body.class_id as string | undefined

  if (!classId) return NextResponse.json({ error: 'class_id required' }, { status: 400 })

  const fallbackWeek = trimOrNull(body.week_label) ?? 'W1'
  const fallbackLesson = trimOrNull(body.lesson_label) ?? 'L1'
  const rawTasks = Array.isArray(body.tasks)
    ? body.tasks as TaskInput[]
    : [body as TaskInput]

  if (rawTasks.length === 0) {
    return NextResponse.json({ error: 'tasks required' }, { status: 400 })
  }

  let normalizedTasks
  try {
    normalizedTasks = rawTasks.map(task => normalizeTaskInput(task, fallbackWeek, fallbackLesson))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid task payload' },
      { status: 400 }
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

  const firstOrder = (siblings ?? []).reduce((max, row) => Math.max(max, row.display_order ?? 0), 0) + 1

  const rows = normalizedTasks.map((task, index) => ({
    tenant_id: cls.tenant_id,
    class_id: classId,
    ...task,
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
