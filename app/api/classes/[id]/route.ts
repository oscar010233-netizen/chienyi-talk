import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json() as {
    class_name?: string
    class_code?: string | null
    class_type?: string
    weekday1?: number | null
    weekday2?: number | null
  }

  const { class_name, class_code, class_type, weekday1, weekday2 } = body

  if (class_name !== undefined && !class_name.trim()) {
    return NextResponse.json({ error: '班級名稱不能為空' }, { status: 400 })
  }
  if (class_type !== undefined && !['double', 'intensive', 'single'].includes(class_type)) {
    return NextResponse.json({ error: '無效的課型' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const update: Record<string, unknown> = {}
  if (class_name !== undefined) update.class_name = class_name.trim()
  if ('class_code' in body) update.class_code = class_code?.trim() || null
  if (class_type !== undefined) update.class_type = class_type
  if ('weekday1' in body) update.weekday1 = weekday1 ?? null
  if ('weekday2' in body) update.weekday2 = weekday2 ?? null

  const { data, error } = await supabase
    .from('classes')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
