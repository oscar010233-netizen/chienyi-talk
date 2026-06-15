import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { DB_TABLES } from '@/lib/db/schema'

// Row counts for every tracked table — drives the /db table list.
export async function GET() {
  const supabase = await createServiceClient()

  const tables = await Promise.all(
    DB_TABLES.map(async (meta) => {
      const { count, error } = await supabase
        .from(meta.name)
        .select('*', { count: 'exact', head: true })
      return {
        name: meta.name,
        group: meta.group,
        note: meta.note ?? null,
        columns: meta.columns,
        count: error ? null : count ?? 0,
        error: error?.message ?? null,
      }
    })
  )

  return NextResponse.json({ tables, generatedAt: new Date().toISOString() })
}
