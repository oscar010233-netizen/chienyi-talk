import type { SupabaseClient } from '@supabase/supabase-js'

// The school currently runs as a single tenant (簡誼補習班). These helpers
// resolve it and mint the next sequential human-facing code for a new student
// or task, matching the legacy S### / T###### formats.

let cachedTenantId: string | null = null

export async function getTenantId(supabase: SupabaseClient): Promise<string> {
  if (cachedTenantId) return cachedTenantId
  const { data } = await supabase.from('tenants').select('id').limit(1).single()
  cachedTenantId = (data?.id as string) ?? ''
  return cachedTenantId
}

function nextCode(values: Array<string | null>, prefix: string, pad: number): string {
  let max = 0
  const re = new RegExp(`^${prefix}(\\d+)$`)
  for (const v of values) {
    const m = re.exec(v ?? '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return prefix + String(max + 1).padStart(pad, '0')
}

export async function nextStudentCode(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from('students').select('legacy_student_id')
  return nextCode((data ?? []).map(r => r.legacy_student_id as string), 'S', 3)
}

export async function nextTaskCode(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from('tasks').select('task_code')
  return nextCode((data ?? []).map(r => r.task_code as string), 'T', 6)
}
