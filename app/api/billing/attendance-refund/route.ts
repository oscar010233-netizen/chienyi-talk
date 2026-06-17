import { NextRequest, NextResponse } from 'next/server'
import { computeAttendanceRefunds, getPreviousSeasonRefunds } from '@/lib/billing/service'

function jsonError(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: message }, { status })
}

// GET ?bag_id=X          → current season's absent_refund preview (for BagPreview display)
// GET ?class_id=X&season_id=Y → previous season refunds to carry into new bag
export async function GET(request: NextRequest) {
  const bagId = request.nextUrl.searchParams.get('bag_id') ?? ''
  const classId = request.nextUrl.searchParams.get('class_id') ?? ''
  const seasonId = request.nextUrl.searchParams.get('season_id') ?? ''

  try {
    if (bagId) {
      const preview = await computeAttendanceRefunds(bagId)
      return NextResponse.json({ preview })
    }
    if (classId && seasonId) {
      const refunds = await getPreviousSeasonRefunds({ classId, currentSeasonId: seasonId })
      return NextResponse.json({ refunds })
    }
    return NextResponse.json({ error: 'bag_id or class_id+season_id required' }, { status: 400 })
  } catch (err) {
    return jsonError(err)
  }
}
