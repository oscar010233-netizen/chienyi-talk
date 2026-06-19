import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/profiles - returns all profiles for teacher pickers.
export async function GET() {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .order('display_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
