import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type Scope = 'season' | 'team' | 'intensive'
type ConflictMode = 'overwrite' | 'skip'
type SessionPosition = 'S1' | 'S2'

const TASK_TYPES = new Set(['homework', 'practice', 'quiz', 'progress'])
const TASK_NAME_BY_TYPE = {
  homework: '作業',
  practice: '練習',
  quiz: '考試',
  progress: '進度',
} as const

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function isScope(value: string): value is Scope {
  return value === 'season' || value === 'team' || value === 'intensive'
}

function isConflictMode(value: string): value is ConflictMode {
  return value === 'overwrite' || value === 'skip'
}

function sessionPositionForKind(kind: string): SessionPosition | null {
  if (kind === 'team') return 'S1'
  if (kind === 'intensive') return 'S2'
  return null
}

interface TemplateItemRow {
  id: string
  template_id: string
  task_type: keyof typeof TASK_NAME_BY_TYPE
  session_position: SessionPosition
  sort_order: number | null
}

interface SlotRow {
  slot_index: number
  session_kind: 'team' | 'intensive'
}

interface ExistingTaskRow {
  id: string
  lesson_label: string | null
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const classId = trimOrNull(body.class_id)
  const bagId = trimOrNull(body.bag_id)
  const templateId = trimOrNull(body.template_id)
  const scope = String(body.scope ?? '').trim()
  const conflictMode = String(body.conflict_mode ?? '').trim()
  const lessonLabels = typeof body.lesson_labels === 'object' && body.lesson_labels !== null
    ? body.lesson_labels as Record<string, string | null>
    : {}

  if (!classId || !bagId || !templateId) {
    return NextResponse.json({ error: 'class_id, bag_id, template_id required' }, { status: 400 })
  }
  if (!isScope(scope)) {
    return NextResponse.json({ error: 'valid scope required' }, { status: 400 })
  }
  if (!isConflictMode(conflictMode)) {
    return NextResponse.json({ error: 'valid conflict_mode required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: cls, error: classError } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', classId)
    .maybeSingle()

  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 })
  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data: bag, error: bagError } = await supabase
    .from('payment_bags')
    .select('id')
    .eq('id', bagId)
    .eq('tenant_id', cls.tenant_id)
    .eq('class_id', classId)
    .maybeSingle()

  if (bagError) return NextResponse.json({ error: bagError.message }, { status: 500 })
  if (!bag) return NextResponse.json({ error: 'bag not found' }, { status: 404 })

  const { data: template, error: templateError } = await supabase
    .from('class_task_templates')
    .select('id')
    .eq('id', templateId)
    .eq('tenant_id', cls.tenant_id)
    .maybeSingle()

  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 })
  if (!template) return NextResponse.json({ error: 'template not found' }, { status: 404 })

  const [{ data: templateItems, error: templateItemError }, { data: lineRows, error: lineError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase
      .from('class_task_template_items')
      .select('id, template_id, task_type, session_position, sort_order')
      .eq('tenant_id', cls.tenant_id)
      .eq('template_id', templateId)
      .order('sort_order'),
    supabase
      .from('payment_bag_lines')
      .select('id')
      .eq('tenant_id', cls.tenant_id)
      .eq('bag_id', bagId),
    supabase
      .from('class_enrollments')
      .select('student_id')
      .eq('tenant_id', cls.tenant_id)
      .eq('class_id', classId)
      .eq('status', 'active'),
  ])

  if (templateItemError) return NextResponse.json({ error: templateItemError.message }, { status: 500 })
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 })
  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 })

  const validTemplateItems = ((templateItems ?? []) as TemplateItemRow[])
    .filter((item) => TASK_TYPES.has(item.task_type))

  if (validTemplateItems.length === 0) {
    return NextResponse.json({ error: 'template has no applicable items' }, { status: 400 })
  }

  const lineIds = (lineRows ?? []).map((row: { id: string }) => row.id)
  if (lineIds.length === 0) {
    return NextResponse.json({ error: 'bag has no lines' }, { status: 400 })
  }

  const { data: sessionRows, error: sessionError } = await supabase
    .from('payment_bag_line_sessions')
    .select('slot_index, session_kind')
    .eq('tenant_id', cls.tenant_id)
    .in('line_id', lineIds)
    .neq('session_kind', 'makeup')
    .not('slot_index', 'is', null)
    .order('slot_index', { ascending: true, nullsFirst: false })

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  const slotMap = new Map<number, SlotRow>()
  for (const row of (sessionRows ?? []) as Array<{ slot_index: number | null; session_kind: 'team' | 'intensive' | 'makeup' }>) {
    if (row.slot_index == null || slotMap.has(row.slot_index) || row.session_kind === 'makeup') continue
    if (scope === 'team' && row.session_kind !== 'team') continue
    if (scope === 'intensive' && row.session_kind !== 'intensive') continue
    const sessionPosition = sessionPositionForKind(row.session_kind)
    if (!sessionPosition) continue
    const itemsForSlot = validTemplateItems.filter((item) => item.session_position === sessionPosition)
    if (itemsForSlot.length === 0) continue
    slotMap.set(row.slot_index, {
      slot_index: row.slot_index,
      session_kind: row.session_kind,
    })
  }

  const targetSlots = Array.from(slotMap.values()).sort((a, b) => a.slot_index - b.slot_index)
  if (targetSlots.length === 0) {
    return NextResponse.json({ error: 'template has no applicable slots for this scope' }, { status: 400 })
  }

  const targetSlotIndexes = targetSlots.map((slot) => slot.slot_index)
  const { data: existingTasks, error: existingTaskError } = await supabase
    .from('class_tasks')
    .select('id, tenant_id, class_id, bag_id, slot_index, lesson_label, task_type, task_name, threshold_value, max_score, threshold_text, display_order')
    .eq('tenant_id', cls.tenant_id)
    .eq('class_id', classId)
    .eq('bag_id', bagId)
    .in('slot_index', targetSlotIndexes)
    .neq('task_type', 'attendance')
    .neq('task_type', 'comment')
    .order('display_order')

  if (existingTaskError) return NextResponse.json({ error: existingTaskError.message }, { status: 500 })

  const existingTasksBySlot = new Map<number, ExistingTaskRow[]>()
  for (const task of existingTasks ?? []) {
    const slotIndex = task.slot_index as number | null
    if (slotIndex == null) continue
    const list = existingTasksBySlot.get(slotIndex) ?? []
    list.push({
      id: task.id,
      lesson_label: task.lesson_label,
    })
    existingTasksBySlot.set(slotIndex, list)
  }

  const slotsToApply = targetSlots.filter((slot) => (
    conflictMode === 'overwrite'
      ? true
      : (existingTasksBySlot.get(slot.slot_index)?.length ?? 0) === 0
  ))

  if (slotsToApply.length === 0) {
    return NextResponse.json({ slots: [], updated: 0 })
  }

  const taskIdsToDelete = conflictMode === 'overwrite'
    ? slotsToApply.flatMap((slot) => (existingTasksBySlot.get(slot.slot_index) ?? []).map((task) => task.id))
    : []

  const { data: siblingTasks, error: siblingTaskError } = await supabase
    .from('class_tasks')
    .select('display_order')
    .eq('tenant_id', cls.tenant_id)
    .eq('class_id', classId)
    .eq('bag_id', bagId)

  if (siblingTaskError) return NextResponse.json({ error: siblingTaskError.message }, { status: 500 })

  let nextDisplayOrder = (siblingTasks ?? []).reduce((max, row: { display_order: number | null }) => Math.max(max, row.display_order ?? 0), 0) + 1

  const rowsToInsert: Array<Record<string, unknown>> = []
  for (const slot of slotsToApply) {
    const sessionPosition = sessionPositionForKind(slot.session_kind)
    if (!sessionPosition) continue
    const itemsForSlot = validTemplateItems
      .filter((item) => item.session_position === sessionPosition)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const lessonLabelKey = String(slot.slot_index)
    const fallbackLessonLabel = (existingTasksBySlot.get(slot.slot_index) ?? [])
      .map((task) => task.lesson_label)
      .find((value) => value != null) ?? null
    const lessonLabel = Object.prototype.hasOwnProperty.call(lessonLabels, lessonLabelKey)
      ? trimOrNull(lessonLabels[lessonLabelKey])
      : fallbackLessonLabel

    for (const item of itemsForSlot) {
      rowsToInsert.push({
        tenant_id: cls.tenant_id,
        class_id: classId,
        bag_id: bagId,
        slot_index: slot.slot_index,
        lesson_label: lessonLabel,
        task_type: item.task_type,
        task_name: TASK_NAME_BY_TYPE[item.task_type],
        threshold_value: null,
        threshold_text: null,
        max_score: null,
        display_order: nextDisplayOrder,
      })
      nextDisplayOrder += 1
    }
  }

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ slots: [], updated: 0 })
  }

  const studentIds = (enrollments ?? []).map((row: { student_id: string }) => row.student_id)
  const { error: applyError } = await supabase.rpc('fn_apply_class_template_tasks', {
    p_tenant_id: cls.tenant_id,
    p_task_ids_to_delete: taskIdsToDelete,
    p_task_rows: rowsToInsert,
    p_student_ids: studentIds,
  })

  if (applyError) return NextResponse.json({ error: applyError.message }, { status: 500 })

  const changedSlotIndexes = slotsToApply.map((slot) => slot.slot_index)
  const { data: latestTasks, error: latestTaskError } = await supabase
    .from('class_tasks')
    .select('id, tenant_id, class_id, bag_id, slot_index, lesson_label, task_type, task_name, threshold_value, max_score, threshold_text, display_order')
    .eq('tenant_id', cls.tenant_id)
    .eq('class_id', classId)
    .eq('bag_id', bagId)
    .in('slot_index', changedSlotIndexes)
    .neq('task_type', 'attendance')
    .neq('task_type', 'comment')
    .order('display_order')

  if (latestTaskError) return NextResponse.json({ error: latestTaskError.message }, { status: 500 })

  const latestTasksBySlot = new Map<number, typeof latestTasks>()
  for (const task of latestTasks ?? []) {
    const slotIndex = task.slot_index as number | null
    if (slotIndex == null) continue
    const list = latestTasksBySlot.get(slotIndex) ?? []
    list.push(task)
    latestTasksBySlot.set(slotIndex, list)
  }

  return NextResponse.json({
    slots: changedSlotIndexes.map((slotIndex) => ({
      slot_index: slotIndex,
      tasks: latestTasksBySlot.get(slotIndex) ?? [],
    })),
    updated: changedSlotIndexes.length,
  })
}
