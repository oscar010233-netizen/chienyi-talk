import type { SupabaseClient } from '@supabase/supabase-js'

// The school currently runs as a single tenant (簡誼補習班). Resolves and
// caches the tenant id for use in server-side inserts.

let cachedTenantId: string | null = null

export async function getTenantId(supabase: SupabaseClient): Promise<string> {
  if (cachedTenantId) return cachedTenantId
  const { data } = await supabase.from('tenants').select('id').limit(1).single()
  cachedTenantId = (data?.id as string) ?? ''
  return cachedTenantId
}
