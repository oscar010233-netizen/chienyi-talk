import { NextRequest, NextResponse } from 'next/server'
import { deleteFeePreset, listFeePresets, saveFeePreset } from '@/lib/billing/service'

function jsonError(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: message }, { status })
}

// GET ?class_id=X  → list class-specific + global presets
export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('class_id') ?? undefined
  try {
    const presets = await listFeePresets({ classId })
    return NextResponse.json({ presets })
  } catch (err) {
    return jsonError(err)
  }
}

// POST { action:'save', ...fields }  → create or update
// POST { action:'delete', id }       → delete
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === 'delete') {
      const id = String(body.id ?? '')
      if (!id) return jsonError('id required', 400)
      await deleteFeePreset(id)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'save') {
      const preset = await saveFeePreset({
        id: body.id ? String(body.id) : undefined,
        classId: body.class_id ? String(body.class_id) : null,
        name: String(body.name ?? ''),
        tuitionAmount: Number(body.tuition_amount ?? 0),
        bookRows: (body.book_rows as Array<{ note: string; amount: number }>) ?? [],
        miscRows: (body.misc_rows as Array<{ note: string; amount: number }>) ?? [],
        discountRows: (body.discount_rows as Array<{ note: string; amount: number }>) ?? [],
        isDefault: Boolean(body.is_default),
      })
      return NextResponse.json({ preset })
    }

    return jsonError('action must be save or delete', 400)
  } catch (err) {
    return jsonError(err)
  }
}
