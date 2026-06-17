import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const seasonId = request.nextUrl.searchParams.get('seasonId')
  const supabase = await createServiceClient()

  if (seasonId) {
    const { data, error } = await supabase
      .from('billing_seasons')
      .select('holiday_dates')
      .eq('id', seasonId)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dates: (data?.holiday_dates ?? []) as string[] })
  }

  // No seasonId → return holiday counts grouped by season
  const { data, error } = await supabase
    .from('billing_seasons')
    .select('id, holiday_dates')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.id] = (row.holiday_dates as string[] | null)?.length ?? 0
  }
  return NextResponse.json({ counts })
}
