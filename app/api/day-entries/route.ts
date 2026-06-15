import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Find or create the schedule_days row for a given date
async function resolveScheduleDay(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  tenantId: string,
  date: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('date', date)
    .maybeSingle()

  if (existing) return existing.id

  const d = new Date(date)
  const weekday = d.getDay() === 0 ? 7 : d.getDay()
  const { data: created, error } = await supabase
    .from('schedule_days')
    .insert({ tenant_id: tenantId, date, weekday })
    .select('id')
    .single()

  if (error || !created) throw new Error(error?.message ?? 'failed to create schedule_day')
  return created.id
}

// GET /api/day-entries?date=2026-06-14&type=dinner|todo
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  const type = request.nextUrl.searchParams.get('type')
  if (!date || !type) return NextResponse.json({ error: 'date and type required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: day } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('date', date)
    .maybeSingle()

  if (!day) return NextResponse.json([])

  const { data, error } = await supabase
    .from('day_entries')
    .select('id, type, person, content, done, notes, sort_order')
    .eq('schedule_day_id', day.id)
    .eq('type', type)
    .order('sort_order')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/day-entries  { date, type, content, person?, notes? }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, type, content, person, notes } = body

  if (!date || !type || !content)
    return NextResponse.json({ error: 'date, type, content required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 500 })

  const scheduleDayId = await resolveScheduleDay(supabase, tenant.id, date)

  const { data, error } = await supabase
    .from('day_entries')
    .insert({
      tenant_id: tenant.id,
      schedule_day_id: scheduleDayId,
      type,
      content,
      person: person ?? null,
      notes: notes ?? null,
      done: false,
    })
    .select('id, type, person, content, done, notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/day-entries?id=xxx  { done?, content?, notes? }
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from('day_entries')
    .update(body)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/day-entries?id=xxx
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { error } = await supabase.from('day_entries').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
