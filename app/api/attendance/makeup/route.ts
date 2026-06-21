import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// P0001 = raise_exception → 422; 23xxx = constraint violation → 409
function rpcErrorStatus(error: { code?: string }): number {
  const code = error.code ?? ''
  if (code === 'P0001' || code === 'P0002') return 422
  if (code.startsWith('23')) return 409
  return 500
}

// POST /api/attendance/makeup — schedule a makeup session date
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const originalRowId = typeof body.original_row_id === 'string' ? body.original_row_id.trim() : ''
    const makeupDate = typeof body.makeup_date === 'string' ? body.makeup_date.trim() : ''
    const bagId = typeof body.bag_id === 'string' ? body.bag_id.trim() : ''

    if (!originalRowId) return jsonError('original_row_id required', 400)
    if (!makeupDate || !/^\d{4}-\d{2}-\d{2}$/.test(makeupDate)) return jsonError('makeup_date required (YYYY-MM-DD)', 400)
    if (!bagId) return jsonError('bag_id required', 400)

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('fn_create_makeup_session', {
      p_original_row_id: originalRowId,
      p_makeup_date: makeupDate,
      p_bag_id: bagId,
    })

    if (error) return jsonError(error.message, rpcErrorStatus(error))
    const result = data as { ok: boolean; makeup_session_id?: string } | null
    if (!result?.ok) return jsonError('failed to create makeup session', 500)

    return NextResponse.json({ makeup_session_id: result.makeup_session_id })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500)
  }
}

// PATCH /api/attendance/makeup — mark a makeup session (present/late/absent/cancelled/null to clear)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const makeupRowId = typeof body.makeup_row_id === 'string' ? body.makeup_row_id.trim() : ''
    // null means "clear attendance"
    const rawStatus = body.attendance_status
    const attendanceStatus: string | null =
      rawStatus === null ? null : typeof rawStatus === 'string' ? rawStatus.trim() : ''
    const bagId = typeof body.bag_id === 'string' ? body.bag_id.trim() : ''

    if (!makeupRowId) return jsonError('makeup_row_id required', 400)
    const VALID = new Set<string | null>(['present', 'late', 'absent', 'cancelled', null])
    if (!VALID.has(attendanceStatus)) {
      return jsonError('attendance_status must be present, late, absent, cancelled, or null to clear', 400)
    }
    if (!bagId) return jsonError('bag_id required', 400)

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('fn_mark_makeup_attendance', {
      p_makeup_row_id: makeupRowId,
      p_attendance_status: attendanceStatus,
      p_bag_id: bagId,
    })

    if (error) return jsonError(error.message, rpcErrorStatus(error))
    const result = data as { ok: boolean } | null
    if (!result?.ok) return jsonError('failed to mark makeup attendance', 500)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500)
  }
}
