import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/grade/codes'

// GET /api/schedule/day-note?date=2026-06-19
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ note: null })

  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('schedule_days')
    .select('note')
    .eq('date', date)
    .maybeSingle()

  return NextResponse.json({ note: data?.note ?? null })
}

// PATCH /api/schedule/day-note  { date, note }
export async function PATCH(request: NextRequest) {
  const { date, note } = await request.json() as { date?: string; note?: string | null }
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const trimmed = note?.trim() || null

  // Upsert the schedule_days row
  const { data: existing } = await supabase
    .from('schedule_days')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    await supabase.from('schedule_days').update({ note: trimmed }).eq('id', existing.id)
  } else {
    const d = new Date(date)
    const weekday = d.getDay() === 0 ? 7 : d.getDay()
    await supabase.from('schedule_days').insert({ tenant_id: tenantId, date, weekday, note: trimmed })
  }

  return NextResponse.json({ note: trimmed })
}
