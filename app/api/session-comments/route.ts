import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

export async function GET(request: NextRequest) {
  const classId = trimOrNull(request.nextUrl.searchParams.get('class_id'))
  if (!classId) return NextResponse.json({ error: 'class_id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: cls, error: classError } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', classId)
    .single()

  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 })
  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('session_daily_comments')
    .select('*')
    .eq('class_id', classId)
    .eq('tenant_id', cls.tenant_id)
    .order('session_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comments: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const classId = trimOrNull(body.class_id)
  const sessionDate = trimOrNull(body.session_date)
  const status = trimOrNull(body.status) ?? 'draft'

  if (!classId || !sessionDate) {
    return NextResponse.json({ error: 'class_id and session_date required' }, { status: 400 })
  }
  if (status !== 'draft' && status !== 'published') {
    return NextResponse.json({ error: 'status must be draft or published' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data: cls, error: classError } = await supabase
    .from('classes')
    .select('tenant_id')
    .eq('id', classId)
    .single()

  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 })
  if (!cls) return NextResponse.json({ error: 'class not found' }, { status: 404 })

  const row = {
    tenant_id: cls.tenant_id,
    class_id: classId,
    session_date: sessionDate,
    comment_text: trimOrNull(body.comment_text),
    status,
  }

  const { data, error } = await supabase
    .from('session_daily_comments')
    .upsert(row, { onConflict: 'tenant_id,class_id,session_date' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}
