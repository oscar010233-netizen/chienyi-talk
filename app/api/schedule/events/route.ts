import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/schedule/events?date=2026-06-14
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: day } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('date', date)
    .maybeSingle()

  if (!day) return NextResponse.json([])

  const { data, error } = await supabase
    .from('schedule_events')
    .select(`
      *,
      room:rooms(id, name, display_order),
      class_info:classes(id, class_name, class_code),
      teachers:schedule_event_teachers(*, teacher:teachers(id, name, color))
    `)
    .eq('schedule_day_id', day.id)
    .order('start_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

interface TeacherSegmentInput {
  teacher_id: string
  start_time: string
  end_time: string
  color?: string | null
}

// POST /api/schedule/events
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const { date, room_id, class_id, title, event_type, start_time, end_time, color, note, teachers } = body as {
    date?: string; room_id?: string; class_id?: string
    title?: string; event_type?: string
    start_time?: string; end_time?: string
    color?: string; note?: string
    teachers?: TeacherSegmentInput[]
  }

  if (!date || !room_id || !start_time || !end_time) {
    return NextResponse.json({ error: 'date, room_id, start_time, end_time required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 500 })

  // Find or create schedule_day
  let dayId: string
  const { data: existingDay } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('date', date)
    .maybeSingle()

  if (existingDay) {
    dayId = existingDay.id
  } else {
    const d = new Date(date)
    const weekday = d.getDay() === 0 ? 7 : d.getDay()
    const { data: newDay, error: dayErr } = await supabase
      .from('schedule_days')
      .insert({ tenant_id: tenant.id, date, weekday })
      .select('id')
      .single()
    if (dayErr || !newDay) return NextResponse.json({ error: dayErr?.message ?? 'failed to create day' }, { status: 500 })
    dayId = newDay.id
  }

  const { data: event, error } = await supabase
    .from('schedule_events')
    .insert({
      tenant_id: tenant.id,
      schedule_day_id: dayId,
      room_id,
      class_id: class_id || null,
      title: title || null,
      event_type: event_type || 'class',
      start_time,
      end_time,
      color: color || null,
      note: note || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (event && teachers && teachers.length > 0) {
    const { error: teacherError } = await supabase.from('schedule_event_teachers').insert(
      teachers.map(t => ({
        tenant_id: tenant.id,
        schedule_event_id: event.id,
        teacher_id: t.teacher_id,
        start_time: t.start_time,
        end_time: t.end_time,
        color: t.color ?? null,
      }))
    )
    if (teacherError) return NextResponse.json({ error: teacherError.message }, { status: 500 })
  }

  return NextResponse.json(event)
}
