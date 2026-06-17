import { NextRequest, NextResponse } from 'next/server'
import { applyAttendanceRefunds, computeAttendanceRefunds } from '@/lib/billing/service'

function jsonError(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  const bagId = request.nextUrl.searchParams.get('bag_id') ?? ''
  if (!bagId) return NextResponse.json({ error: 'bag_id required' }, { status: 400 })
  try {
    const preview = await computeAttendanceRefunds(bagId)
    return NextResponse.json({ preview })
  } catch (err) {
    return jsonError(err)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { bag_id?: string }
  const bagId = typeof body.bag_id === 'string' ? body.bag_id.trim() : ''
  if (!bagId) return NextResponse.json({ error: 'bag_id required' }, { status: 400 })
  try {
    const updated = await applyAttendanceRefunds(bagId)
    return NextResponse.json({ updated })
  } catch (err) {
    return jsonError(err)
  }
}
