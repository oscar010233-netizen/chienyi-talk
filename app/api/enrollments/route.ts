import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/enrollments — enroll one or more roster students into a class.
// Appends them after the current roster (slot_order) and re-activates anyone
// previously dropped. Dispatching their task records is a separate step.
export async function POST(request: NextRequest) {
  const body = await request.json() as { class_id?: string; student_ids?: string[] }
  const class_id = body.class_id
  const student_ids = body.student_ids ?? []

  if (!class_id || student_ids.length === 0) {
    return NextResponse.json({ error: 'class_id and student_ids required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: existing } = await supabase
    .from('class_students')
    .select('slot_order')
    .eq('class_id', class_id)

  let slot = (existing ?? []).reduce((m, r) => Math.max(m, r.slot_order ?? 0), 0)

  const rows = student_ids.map(student_id => ({
    class_id,
    student_id,
    slot_order: ++slot,
    status: 'active',
  }))

  // onConflict re-activates a previously dropped enrollment instead of erroring.
  const { error } = await supabase
    .from('class_students')
    .upsert(rows, { onConflict: 'class_id,student_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enrolled: rows.length })
}

// DELETE /api/enrollments — remove a student from a class (soft: status=dropped).
export async function DELETE(request: NextRequest) {
  const body = await request.json() as { class_id?: string; student_id?: string }
  if (!body.class_id || !body.student_id) {
    return NextResponse.json({ error: 'class_id and student_id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('class_students')
    .update({ status: 'dropped' })
    .eq('class_id', body.class_id)
    .eq('student_id', body.student_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
