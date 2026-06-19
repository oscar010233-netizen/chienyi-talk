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
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
  if (!tenant) return NextResponse.json([])

  const { data: day } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('tenant_id', tenant.id)
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
  const { data: latestEntry } = await supabase
    .from('day_entries')
    .select('sort_order')
    .eq('schedule_day_id', scheduleDayId)
    .eq('type', type)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = typeof latestEntry?.sort_order === 'number' ? latestEntry.sort_order + 1 : 0

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
      sort_order: sortOrder,
    })
    .select('id, type, person, content, done, notes, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/day-entries?id=xxx  { done?, content?, person?, notes?, sort_order? }
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json() as Record<string, unknown>
  const allowed = ['done', 'content', 'person', 'notes', 'sort_order']
  const update: Record<string, unknown> = {}
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { error } = await supabase
    .from('day_entries')
    .update(update)
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
