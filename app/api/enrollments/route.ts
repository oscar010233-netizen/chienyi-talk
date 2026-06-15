import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/enrollments — enroll one or more roster students into a class.
// Reactivates anyone previously dropped; skips anyone already active.
export async function POST(request: NextRequest) {
  const body = await request.json() as { class_id?: string; student_ids?: string[] }
  const class_id = body.class_id
  const student_ids = body.student_ids ?? []

  if (!class_id || student_ids.length === 0) {
    return NextResponse.json({ error: 'class_id and student_ids required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', class_id)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  // Two separate queries:
  // (a) max slot across ALL enrollments in the class — determines the next position.
  // (b) existing rows only for the students being added — determines insert vs reactivate.
  const [{ data: allSlots }, { data: existing }] = await Promise.all([
    supabase
      .from('class_enrollments')
      .select('slot_order')
      .eq('class_id', class_id),
    supabase
      .from('class_enrollments')
      .select('id, student_id, status')
      .eq('class_id', class_id)
      .in('student_id', student_ids),
  ])

  const existingByStudent = new Map((existing ?? []).map(e => [e.student_id, e]))
  let slot = (allSlots ?? []).reduce((m, r) => Math.max(m, r.slot_order ?? 0), 0)

  const toInsert: Array<{
    tenant_id: string; class_id: string; student_id: string;
    slot_order: number; status: string; joined_at: string
  }> = []
  const toReactivate: string[] = []

  for (const student_id of student_ids) {
    const ex = existingByStudent.get(student_id)
    if (!ex) {
      toInsert.push({
        tenant_id: cls.tenant_id,
        class_id,
        student_id,
        slot_order: ++slot,
        status: 'active',
        joined_at: new Date().toISOString().slice(0, 10),
      })
    } else if (ex.status === 'dropped') {
      toReactivate.push(ex.id)
    }
    // already active — skip
  }

  if (toReactivate.length > 0) {
    const { error } = await supabase
      .from('class_enrollments')
      .update({ status: 'active', left_at: null })
      .in('id', toReactivate)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('class_enrollments').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ enrolled: toInsert.length + toReactivate.length })
}

// DELETE /api/enrollments — soft-remove a student from a class (status=dropped).
export async function DELETE(request: NextRequest) {
  const body = await request.json() as { class_id?: string; student_id?: string }
  if (!body.class_id || !body.student_id) {
    return NextResponse.json({ error: 'class_id and student_id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('class_enrollments')
    .update({ status: 'dropped', left_at: new Date().toISOString().slice(0, 10) })
    .eq('class_id', body.class_id)
    .eq('student_id', body.student_id)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
