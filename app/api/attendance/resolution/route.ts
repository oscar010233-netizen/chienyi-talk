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

// PATCH /api/attendance/resolution — switch absence_resolution between makeup_pending ↔ refund
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const sessionRowId = typeof body.session_row_id === 'string' ? body.session_row_id.trim() : ''
    const newResolution = typeof body.new_resolution === 'string' ? body.new_resolution.trim() : ''
    const bagId = typeof body.bag_id === 'string' ? body.bag_id.trim() : ''

    if (!sessionRowId) return jsonError('session_row_id required', 400)
    if (!['makeup_pending', 'refund'].includes(newResolution)) {
      return jsonError('new_resolution must be makeup_pending or refund', 400)
    }
    if (!bagId) return jsonError('bag_id required', 400)

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('fn_change_absence_resolution', {
      p_session_row_id: sessionRowId,
      p_new_resolution: newResolution,
      p_bag_id: bagId,
    })

    if (error) return jsonError(error.message, rpcErrorStatus(error))
    const result = data as { ok: boolean } | null
    if (!result?.ok) return jsonError('failed to change absence resolution', 500)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500)
  }
}
