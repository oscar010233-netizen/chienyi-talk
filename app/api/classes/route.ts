import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('classes')
    .select('id, class_name, class_code')
    .order('class_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const { class_name, class_code, class_type, weekday1, weekday2, department, level, system_sessions } = body as {
    class_name?: string
    class_code?: string
    class_type?: string
    weekday1?: number | null
    weekday2?: number | null
    department?: string
    level?: string
    system_sessions?: number | null
  }

  if (!class_name?.trim()) {
    return NextResponse.json({ error: '班級名稱為必填' }, { status: 400 })
  }
  if (!class_type || !['double', 'intensive', 'single'].includes(class_type)) {
    return NextResponse.json({ error: '課型為必填' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 500 })

  const { data, error } = await supabase
    .from('classes')
    .insert({
      tenant_id: tenant.id,
      class_name: class_name.trim(),
      class_code: class_code?.trim() || null,
      class_type,
      weekday1: weekday1 || null,
      weekday2: weekday2 || null,
      department: department?.trim() || null,
      level: level?.trim() || null,
      system_sessions: system_sessions || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
