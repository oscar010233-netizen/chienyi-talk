import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeScheduleHexColor } from '@/lib/schedule/colors'

function normalizePatch(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { error: 'name required', update: null }
    update.name = name
  }

  if ('sort_order' in body) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      return { error: 'sort_order must be an integer', update: null }
    }
    update.sort_order = body.sort_order
  }

  if ('status' in body) {
    if (body.status !== 'active' && body.status !== 'archived') {
      return { error: 'status must be active or archived', update: null }
    }
    update.status = body.status
  }

  if ('color' in body) {
    const color = normalizeScheduleHexColor(body.color)
    if (!color) {
      return { error: 'color must be a hex value like #RRGGBB', update: null }
    }
    update.color = color
  }

  return { error: null, update }
}

// PATCH /api/teachers/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const { error: validationError, update } = normalizePatch(body)

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }
  if (!update || Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('teachers')
    .update(update)
    .eq('id', id)
    .select('id, name, color, status, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/teachers/[id]
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('teachers')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('id, name, color, status, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
