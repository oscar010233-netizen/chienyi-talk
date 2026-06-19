import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Flow tables cleared in leaf-to-root FK order.
// Structural tables (classes, students, billing_seasons, etc.) are NOT touched.
const FLOW_TABLES = [
  'audit_log',
  'student_task_records',
  'class_tasks',
  'payment_bag_line_sessions',
  'payment_bag_line_items',
  'payment_bag_lines',
  'payment_bags',
] as const

export async function DELETE() {
  const supabase = await createServiceClient()
  const result: Record<string, number> = {}

  for (const table of FLOW_TABLES) {
    // Delete all rows — supabase requires a filter, use neq on a always-true condition
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      return NextResponse.json({ error: `Failed on ${table}: ${error.message}` }, { status: 500 })
    }
    result[table] = count ?? 0
  }

  return NextResponse.json({ cleared: result })
}
