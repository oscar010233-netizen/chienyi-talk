import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('task_records')
    .update({ ...rest, last_updated: new Date().toISOString() })
    .eq('id', id as string)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const { student_id, task_id, class_id } = body

  if (!student_id || !task_id || !class_id) {
    return NextResponse.json({ error: 'student_id, task_id, class_id required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', class_id as string)
    .single()

  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('task_records')
    .upsert(
      { ...body, tenant_id: cls.tenant_id, last_updated: new Date().toISOString() },
      { onConflict: 'student_id,task_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
