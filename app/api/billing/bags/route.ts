import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/grade/codes'

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('classId')
  const seasonId = request.nextUrl.searchParams.get('seasonId')

  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)

  let query = supabase
    .from('payment_bags')
    .select(`
      id, class_id, season_id, bag_code, issue_date, due_date, status, created_at,
      classes!inner(class_name, class_code),
      billing_seasons!inner(season_code, year, quarter),
      payment_bag_lines(id)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (classId) query = query.eq('class_id', classId)
  if (seasonId) query = query.eq('season_id', seasonId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bags = (data ?? []).map((bag) => {
    const cls = bag.classes as unknown as { class_name: string; class_code: string | null }
    const season = bag.billing_seasons as unknown as { season_code: string; year: number; quarter: string }
    return {
      id: bag.id,
      class_id: bag.class_id,
      season_id: bag.season_id,
      bag_code: bag.bag_code,
      issue_date: bag.issue_date,
      due_date: bag.due_date,
      status: bag.status,
      created_at: bag.created_at,
      class_name: cls?.class_name ?? '',
      class_code: cls?.class_code ?? null,
      season_code: season?.season_code ?? '',
      year: season?.year ?? 0,
      quarter: season?.quarter ?? '',
      line_count: (bag.payment_bag_lines as { id: string }[]).length,
    }
  })

  return NextResponse.json({ bags })
}
