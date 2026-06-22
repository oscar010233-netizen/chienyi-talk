import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const RECORD_COLUMNS = `
  id,
  tenant_id,
  student_id,
  class_task_id,
  status,
  latest_result,
  result_history,
  teacher_note,
  comment_text,
  comment_status,
  created_at,
  updated_at,
  student:students(
    id,
    chinese_name,
    english_name
  ),
  class_task:class_tasks(
    id,
    task_type,
    task_name,
    lesson_label,
    threshold_value,
    threshold_text,
    class:classes(
      id,
      class_name,
      class_code,
      department
    )
  )
`

const EDITABLE_FIELDS = [
  'status',
  'latest_result',
  'result_history',
  'teacher_note',
  'comment_text',
  'comment_status',
] as const

type EditableField = (typeof EDITABLE_FIELDS)[number]

interface JoinedRecord {
  id: string
  tenant_id: string
  student_id: string
  class_task_id: string
  status: string | null
  latest_result: string | null
  result_history: string | null
  teacher_note: string | null
  comment_text: string | null
  comment_status: string | null
  created_at: string | null
  updated_at: string | null
  student: {
    id: string
    chinese_name: string | null
    english_name: string | null
  } | null
  class_task: {
    id: string
    task_type: string | null
    task_name: string | null
    lesson_label: string | null
    threshold_value: number | null
    threshold_text: string | null
    class: {
      id: string
      class_name: string | null
      class_code: string | null
      department: string | null
    } | null
  } | null
}

function cleanText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function sourceFromDepartment(department: string | null | undefined) {
  const value = String(department ?? '').toLowerCase()
  if (value.includes('xiao') || value.includes('小')) return 'XIAO'
  return 'ENG'
}

function thresholdText(record: JoinedRecord) {
  const value = record.class_task?.threshold_value
  if (value != null) return String(value)
  return record.class_task?.threshold_text ?? null
}

function weekText(record: JoinedRecord) {
  return record.class_task?.lesson_label ?? null
}

function mapRecord(record: JoinedRecord) {
  const cls = record.class_task?.class

  return {
    id: record.id,
    source: sourceFromDepartment(cls?.department),
    student_id: record.student_id,
    class_task_id: record.class_task_id,
    task_type: record.class_task?.task_type ?? null,
    class_name: cls?.class_code || cls?.class_name || null,
    eng_name: record.student?.english_name ?? null,
    chi_name: record.student?.chinese_name ?? null,
    task_name: record.class_task?.task_name ?? null,
    task_id: record.class_task_id,
    latest_result: record.latest_result,
    status: record.status,
    history: record.result_history,
    threshold: thresholdText(record),
    week: weekText(record),
    teacher_note: record.teacher_note,
    comment_text: record.comment_text,
    comment_status: record.comment_status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status')?.trim()
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 500)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 500

  const supabase = await createServiceClient()
  let query = supabase
    .from('student_task_records')
    .select(RECORD_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    rows: ((data ?? []) as unknown as JoinedRecord[]).map(mapRecord),
  })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const id = cleanText(body.id)

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: current, error: currentError } = await supabase
    .from('student_task_records')
    .select('class_task:class_tasks(task_type)')
    .eq('id', id)
    .single()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })

  const patch: Partial<Record<EditableField | 'updated_at', unknown>> = {
    updated_at: new Date().toISOString(),
  }

  if ('history' in body && !('result_history' in body)) {
    body.result_history = body.history
  }

  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = cleanText(body[field])
  }

  const { data, error } = await supabase
    .from('student_task_records')
    .update(patch)
    .eq('id', id)
    .select(RECORD_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(mapRecord(data as unknown as JoinedRecord))
}
