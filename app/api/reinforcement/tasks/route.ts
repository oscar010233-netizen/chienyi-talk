import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { appendHistory, resolveTaskSubmission } from '@/lib/grade/status'

const RECORD_SELECT = `
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
  updated_at,
  class_task:class_tasks(
    id,
    task_type,
    task_name,
    week_label,
    lesson_label,
    threshold_value,
    max_score,
    threshold_text,
    display_order,
    class:classes(
      id,
      class_name,
      class_code,
      department
    )
  )
`

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
  updated_at: string | null
  class_task: {
    id: string
    task_type: string | null
    task_name: string | null
    week_label: string | null
    lesson_label: string | null
    threshold_value: number | null
    max_score: number | null
    threshold_text: string | null
    display_order: number | null
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

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, chinese_name, english_name, grade')
    .or(`chinese_name.ilike.%${name}%,english_name.ilike.%${name}%`)
    .eq('status', 'active')
    .limit(5)

  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 })
  if (!students || students.length === 0) return NextResponse.json({ error: '找不到學生' }, { status: 404 })

  const exact = students.find((student) => {
    const chi = String(student.chinese_name ?? '').trim().toLowerCase()
    const eng = String(student.english_name ?? '').trim().toLowerCase()
    const needle = name.toLowerCase()
    return chi === needle || eng === needle
  })
  const student = exact ?? students[0]

  const { data: records, error: recordError } = await supabase
    .from('student_task_records')
    .select(RECORD_SELECT)
    .eq('student_id', student.id)
    .not('status', 'in', '("completed","wont_do")')
    .order('updated_at', { ascending: false })
    .limit(30)

  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 })

  return NextResponse.json({
    student,
    matches: students,
    records: records ?? [],
  })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const id = cleanText(body.id)

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: current, error: currentError } = await supabase
    .from('student_task_records')
    .select(RECORD_SELECT)
    .eq('id', id)
    .single()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'record not found' }, { status: 404 })

  const record = current as unknown as JoinedRecord
  const task = record.class_task
  const cls = task?.class

  const decision = resolveTaskSubmission({
    taskType: task?.task_type,
    taskName: task?.task_name,
    currentStatus: record.status,
    thresholdValue: task?.threshold_value,
    maxScore: task?.max_score,
    thresholdText: task?.threshold_text,
    department: cls?.department,
    source: cls?.department,
  }, {
    scoreInput: cleanText(body.score_input),
    statusInput: cleanText(body.status_input),
  })

  if (decision.blocked) {
    return NextResponse.json({ error: decision.message, decision }, { status: 422 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if ('teacher_note' in body) patch.teacher_note = cleanText(body.teacher_note)
  if ('comment_text' in body) patch.comment_text = cleanText(body.comment_text)

  if (decision.shouldWriteRecord) {
    patch.status = decision.newStatus

    if (decision.shouldWriteLatestResult) {
      patch.latest_result = decision.latestResultValue
    }

    if (decision.shouldAppendHistory) {
      patch.result_history = appendHistory(record.result_history, decision.historyValue)
    }
  }

  const { data, error } = await supabase
    .from('student_task_records')
    .update(patch)
    .eq('id', id)
    .select(RECORD_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    record: data,
    decision,
  })
}
