import { NextRequest, NextResponse } from 'next/server'
import {
  createBillingSeason,
  getBillingState,
  normalizeSeasonDraft,
  openPaymentBag,
  recordPaymentBagPrint,
  replaceSeasonHolidays,
  saveBillingClassConfig,
} from '@/lib/billing/service'
import { toNumber } from '@/lib/billing/calendar'
import type { OpenBagStudentInput } from '@/lib/billing/types'

function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const classId = request.nextUrl.searchParams.get('classId')
    const seasonId = request.nextUrl.searchParams.get('seasonId')
    const state = await getBillingState({ classId, seasonId })
    return NextResponse.json(state)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '')

    if (action === 'create-season') {
      const draft = normalizeSeasonDraft({
        year: body.year,
        quarter: body.quarter,
        startDate: body.start_date,
        endDate: body.end_date,
      })
      const season = await createBillingSeason({
        year: draft.year,
        quarter: draft.quarter,
        startDate: draft.startDate,
        endDate: draft.endDate,
        label: String(body.label ?? '').trim() || undefined,
      })
      return NextResponse.json({ season })
    }

    if (action === 'save-class') {
      const className = String(body.class_name ?? '').trim()
      if (!className) return jsonError('class_name required', 400)
      const cls = await saveBillingClassConfig({
        id: typeof body.id === 'string' && body.id ? body.id : null,
        classCode: typeof body.class_code === 'string' ? body.class_code : null,
        className,
        department: typeof body.department === 'string' ? body.department : null,
        level: typeof body.level === 'string' ? body.level : null,
        classType: String(body.class_type ?? 'intensive'),
        weekday1: body.weekday1 == null || body.weekday1 === '' ? null : toNumber(body.weekday1),
        weekday2: body.weekday2 == null || body.weekday2 === '' ? null : toNumber(body.weekday2),
        systemSessions: body.system_sessions == null || body.system_sessions === '' ? null : toNumber(body.system_sessions),
        status: typeof body.status === 'string' ? body.status : 'active',
      })
      return NextResponse.json({ class: cls })
    }

    if (action === 'replace-holidays') {
      const seasonId = String(body.season_id ?? '')
      if (!seasonId) return jsonError('season_id required', 400)
      const holidayDates = Array.isArray(body.holiday_dates)
        ? body.holiday_dates.map(String).filter(Boolean)
        : []
      const result = await replaceSeasonHolidays({ seasonId, holidayDates })
      return NextResponse.json(result)
    }

    if (action === 'open-bag') {
      const seasonId = String(body.season_id ?? '')
      const classId = String(body.class_id ?? '')
      const issueDate = String(body.issue_date ?? new Date().toISOString().slice(0, 10))
      if (!seasonId || !classId) return jsonError('season_id and class_id required', 400)
      const bag = await openPaymentBag({
        seasonId,
        classId,
        issueDate,
        dueDate: typeof body.due_date === 'string' && body.due_date ? body.due_date : null,
        tuitionAmount: toNumber(body.tuition_amount),
        bookName: typeof body.book_name === 'string' ? body.book_name : null,
        bookFee: toNumber(body.book_fee),
        miscLabel: typeof body.misc_label === 'string' ? body.misc_label : null,
        miscFee: toNumber(body.misc_fee),
        discountLabel: typeof body.discount_label === 'string' ? body.discount_label : null,
        discountAmount: toNumber(body.discount_amount),
        note: typeof body.note === 'string' ? body.note : null,
        selectedStudents: Array.isArray(body.selected_students)
          ? body.selected_students as OpenBagStudentInput[]
          : undefined,
      })
      return NextResponse.json({ bag })
    }

    if (action === 'record-print') {
      const bagId = String(body.bag_id ?? '')
      if (!bagId) return jsonError('bag_id required', 400)
      await recordPaymentBagPrint({ bagId, eventType: body.event_type === 'print' ? 'print' : 'pdf' })
      return NextResponse.json({ ok: true })
    }

    return jsonError(`unknown action: ${action}`, 400)
  } catch (error) {
    return jsonError(error)
  }
}
