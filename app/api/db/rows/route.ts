import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { DB_TABLES, DB_TABLE_NAMES } from '@/lib/db/schema'

// Tables that must never be deleted via this tool.
const NON_DELETABLE = new Set(['profiles', 'tenants'])

// Latest rows for a single table — drives the /db data view.
export async function GET(request: NextRequest) {
  const table = request.nextUrl.searchParams.get('table') ?? ''
  if (!DB_TABLE_NAMES.includes(table)) {
    return NextResponse.json({ error: 'unknown table' }, { status: 400 })
  }

  const meta = DB_TABLES.find((t) => t.name === table)!
  const supabase = await createServiceClient()

  // All tracked tables have created_at; order newest first.
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    table,
    columns: meta.columns,
    rows: data ?? [],
  })
}

export async function DELETE(request: NextRequest) {
  const table = request.nextUrl.searchParams.get('table') ?? ''
  const id = request.nextUrl.searchParams.get('id') ?? ''

  if (!DB_TABLE_NAMES.includes(table)) {
    return NextResponse.json({ error: 'unknown table' }, { status: 400 })
  }
  if (NON_DELETABLE.has(table)) {
    return NextResponse.json({ error: `${table} 不可刪除` }, { status: 403 })
  }
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
