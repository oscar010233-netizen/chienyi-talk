import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Recent change feed from the audit_log trigger table.
// Supports ?table= filter and ?sinceId= for incremental polling.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const table = sp.get('table')?.trim()
  const sinceId = sp.get('sinceId')
  const limitRaw = Number(sp.get('limit') ?? 80)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 80

  const supabase = await createServiceClient()
  let query = supabase
    .from('audit_log')
    .select('id, table_name, op, row_id, changed_columns, old_data, new_data, actor, created_at')
    .order('id', { ascending: false })
    .limit(limit)

  if (table && table !== 'all') query = query.eq('table_name', table)
  if (sinceId && /^\d+$/.test(sinceId)) query = query.gt('id', Number(sinceId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data ?? [] })
}
