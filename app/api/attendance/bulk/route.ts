import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface UpdateItem {
  session_row_id: string
  attendance_status: string | null   // null = clear attendance
  absence_resolution?: string | null
}

// Map PostgreSQL SQLSTATE to HTTP status.
// P0001 = raise_exception (app logic) → 422; 23xxx = constraint violations → 409.
function rpcErrorStatus(error: { code?: string }): number {
  const code = error.code ?? ''
  if (code === 'P0001' || code === 'P0002') return 422
  if (code.startsWith('23')) return 409
  return 500
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const bagId = typeof body.bag_id === 'string' ? body.bag_id.trim() : ''
  const updates = Array.isArray(body.updates) ? (body.updates as UpdateItem[]) : []

  if (!bagId) return NextResponse.json({ error: 'bag_id required' }, { status: 400 })
  if (updates.length === 0) return NextResponse.json({ error: 'updates required' }, { status: 400 })

  const VALID_STATUS = new Set<string | null>(['present', 'late', 'absent', 'cancelled', null])
  const VALID_RESOLUTION = new Set<string | null | undefined>(['makeup_pending', 'refund', null, undefined])

  for (const u of updates) {
    if (!u.session_row_id) return NextResponse.json({ error: 'session_row_id required per update' }, { status: 400 })
    if (!VALID_STATUS.has(u.attendance_status)) {
      return NextResponse.json({ error: `invalid attendance_status: ${u.attendance_status}` }, { status: 400 })
    }
    if (!VALID_RESOLUTION.has(u.absence_resolution)) {
      return NextResponse.json({ error: `invalid absence_resolution: ${u.absence_resolution}` }, { status: 400 })
    }
    if (u.attendance_status === 'absent' && !u.absence_resolution) {
      return NextResponse.json({ error: 'absence_resolution required when attendance_status=absent' }, { status: 400 })
    }
  }

  const supabase = await createServiceClient()

  const { data: rpcResult, error } = await supabase.rpc('fn_bulk_mark_attendance', {
    p_bag_id: bagId,
    p_updates: updates.map(u => ({
      session_row_id: u.session_row_id,
      attendance_status: u.attendance_status ?? null,
      absence_resolution: u.absence_resolution ?? null,
    })),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error) })
  }

  const result = rpcResult as { ok: boolean; updated?: number } | null
  if (!result?.ok) return NextResponse.json({ error: 'RPC returned not ok' }, { status: 500 })

  return NextResponse.json({ updated: result.updated ?? updates.length })
}
