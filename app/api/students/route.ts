import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantId, nextStudentCode } from '@/lib/grade/codes'

// GET /api/students?q=...  — search the school-wide roster.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const supabase = await createServiceClient()

  let query = supabase
    .from('students')
    .select('id, legacy_student_id, chinese_name, english_name, school, grade, status, parent_name, parent_phone')
    .order('legacy_student_id')

  if (q) {
    query = query.or(
      `chinese_name.ilike.%${q}%,english_name.ilike.%${q}%,legacy_student_id.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/students — create a roster student with an auto-generated code.
export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const chinese_name = String(body.chinese_name ?? '').trim()
  const english_name = String(body.english_name ?? '').trim()

  if (!chinese_name && !english_name) {
    return NextResponse.json({ error: '至少需要中文名或英文名' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const tenant_id = await getTenantId(supabase)
  const legacy_student_id = await nextStudentCode(supabase)

  const { data, error } = await supabase
    .from('students')
    .insert({
      tenant_id,
      legacy_student_id,
      chinese_name: chinese_name || null,
      english_name: english_name || null,
      school: (body.school as string)?.trim() || null,
      grade: (body.grade as string)?.trim() || null,
      parent_name: (body.parent_name as string)?.trim() || null,
      parent_phone: (body.parent_phone as string)?.trim() || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/students — edit a roster student's basic info.
const EDITABLE = ['chinese_name', 'english_name', 'school', 'grade', 'parent_name', 'parent_phone', 'status'] as const

export async function PATCH(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const id = body.id as string | undefined
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) {
    if (k in body) {
      const v = body[k]
      patch[k] = typeof v === 'string' ? (v.trim() || null) : v
    }
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('students')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
