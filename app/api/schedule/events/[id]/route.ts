import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface TeacherSegmentInput {
  teacher_id: string
  start_time: string
  end_time: string
  color?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const supabase = await createServiceClient()

  const allowed = ['room_id', 'class_id', 'title', 'event_type', 'start_time', 'end_time', 'color', 'note', 'status']
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const { data, error } = await supabase
    .from('schedule_events')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync teacher segments: delete all, then re-insert
  if ('teachers' in body) {
    const teachers = body.teachers as TeacherSegmentInput[] | null

    const { error: deleteTeachersError } = await supabase
      .from('schedule_event_teachers')
      .delete()
      .eq('schedule_event_id', id)

    if (deleteTeachersError) return NextResponse.json({ error: deleteTeachersError.message }, { status: 500 })

    if (teachers && teachers.length > 0 && data) {
      const tenantId = (data as { tenant_id?: string }).tenant_id
      if (!tenantId) return NextResponse.json({ error: 'event tenant_id not found' }, { status: 500 })

      const { error: insertTeachersError } = await supabase.from('schedule_event_teachers').insert(
        teachers.map(t => ({
          tenant_id: tenantId,
          schedule_event_id: id,
          teacher_id: t.teacher_id,
          start_time: t.start_time,
          end_time: t.end_time,
          color: t.color ?? null,
        }))
      )

      if (insertTeachersError) return NextResponse.json({ error: insertTeachersError.message }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServiceClient()

  // Delete teacher segments first (in case FK has no CASCADE)
  await supabase.from('schedule_event_teachers').delete().eq('schedule_event_id', id)

  const { error } = await supabase.from('schedule_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
