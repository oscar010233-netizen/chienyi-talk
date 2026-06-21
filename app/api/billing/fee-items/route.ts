import { NextRequest, NextResponse } from 'next/server'
import {
  deleteBillingFeeCatalogItem,
  listBillingFeeCatalog,
  saveBillingFeeCatalogItem,
} from '@/lib/billing/service'
import { toNumber } from '@/lib/billing/calendar'
import type { BillingFeeCategory } from '@/lib/billing/types'

const categories = new Set<BillingFeeCategory>(['tuition', 'book', 'misc', 'discount'])

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    return NextResponse.json({ items: await listBillingFeeCatalog() })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const category = String(body.category ?? '') as BillingFeeCategory
    const label = String(body.label ?? '').trim()
    if (!categories.has(category)) return jsonError('不支援的費用類型', 400)
    if (!label) return jsonError('費用名稱不可空白', 400)

    const item = await saveBillingFeeCatalogItem({
      id: typeof body.id === 'string' && body.id ? body.id : null,
      category,
      label,
      amount: toNumber(body.amount),
    })
    return NextResponse.json({ item })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return jsonError('id required', 400)
    await deleteBillingFeeCatalogItem(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
