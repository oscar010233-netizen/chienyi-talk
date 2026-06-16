import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const seasonId = request.nextUrl.searchParams.get('seasonId')
  if (!seasonId) return NextResponse.json({ error: 'seasonId required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('billing_season_holidays')
    .select('holiday_date')
    .eq('season_id', seasonId)
    .is('class_id', null)
    .order('holiday_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dates: (data ?? []).map((row) => row.holiday_date) })
}
