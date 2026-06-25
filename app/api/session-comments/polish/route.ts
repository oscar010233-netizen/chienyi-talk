import { NextRequest, NextResponse } from 'next/server'
import { polishParentComment } from '@/lib/ai/polishComment'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const text = String(body.text ?? '').trim()

  if (!text) {
    return NextResponse.json({ error: '公告內容是空的，無法潤色' }, { status: 400 })
  }

  try {
    const polished = await polishParentComment(text)
    return NextResponse.json({ polished })
  } catch (error) {
    const message = error instanceof Error ? error.message : '潤色失敗'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
