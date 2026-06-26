import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_SCHEDULE_COLOR, normalizeScheduleHexColor } from '@/lib/schedule/colors'

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// GET /api/teachers
export async function GET(request: NextRequest) {
  const includeArchived = request.nextUrl.searchParams.get('include') === 'archived'
  const supabase = await createServiceClient()

  let query = supabase
    .from('teachers')
    .select('id, name, color, status, sort_order')
    .order('sort_order')
    .order('name')

  if (!includeArchived) {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/teachers
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const name = normalizeName(body.name)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const color = body.color == null
    ? DEFAULT_SCHEDULE_COLOR
    : normalizeScheduleHexColor(body.color)
  if (!color) return NextResponse.json({ error: 'color must be a hex value like #RRGGBB' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .limit(1)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: tenantError?.message ?? 'tenant not found' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('teachers')
    .insert({
      tenant_id: tenant.id,
      name,
      color,
    })
    .select('id, name, color, status, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
