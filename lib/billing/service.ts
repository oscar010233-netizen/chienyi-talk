import { createServiceClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/grade/codes'
import {
  MAX_BILLING_SESSIONS,
  type BillingQuarter,
  buildSeasonCode,
  compareDate,
  dateOnly,

  parseSeasonCode,

  quarterDates,
  toNumber,
} from './calendar'
import type {
  ActualAttendance,
  ActualAttendanceStatus,
  BillingClass,
  BillingFeeCatalogItem,
  BillingFeeCategory,
  BillingSeason,
  BillingState,
  BillingStudent,
  OpenBagInput,
  OpenBagStudentInput,
  PaymentBag,
  PaymentBagLine,
  PaymentBagLineItem,
  PaymentBagLineSession,
  PaymentBagWithLines,
  ReconciliationStatus,
} from './types'

type Supabase = Awaited<ReturnType<typeof createServiceClient>>

// ---------------------------------------------------------------------------
// Attendance model note
// ---------------------------------------------------------------------------
// payment_bag_line_sessions is the single source of truth for both billing
// schedule AND attendance. attendance_status / absence_resolution columns are
// written directly onto these rows; class_tasks / student_task_records are
// no longer used for attendance.
// ---------------------------------------------------------------------------

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message)
  return value
}

function statusToReconciliation(status: ActualAttendanceStatus): ReconciliationStatus {
  if (status === 'attended') return 'matched'
  if (status === 'absent') return 'missed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'makeup') return 'makeup'
  return 'extra'
}


function isMissingTable(error: unknown): boolean {
  const maybe = error as { code?: string; message?: string } | null | undefined
  return maybe?.code === 'PGRST205' || /Could not find the table/i.test(maybe?.message ?? '')
}

async function assertPaymentBagDetailTables(supabase: Supabase): Promise<void> {
  for (const table of ['payment_bag_line_sessions', 'payment_bag_line_items'] as const) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      if (isMissingTable(error)) {
        throw new Error(`Billing schema incomplete: missing ${table}. Apply the latest Supabase migrations.`)
      }
      throw new Error(error.message)
    }
  }
}

function mdToDate(year: number, mmdd: string): string | null {
  const match = String(mmdd).match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null
  return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
}

function dateToLegacyMd(date: string | null | undefined): string | null {
  if (!date) return null
  const [, month, day] = date.slice(0, 10).split('-')
  if (!month || !day) return null
  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}`
}

function bagCode(seasonCode: string, cls: Pick<BillingClass, 'class_code' | 'class_name' | 'id'>): string {
  return `${seasonCode.replace('-', '')}-${cls.class_code || cls.class_name || cls.id.slice(0, 8)}`
}

async function getClassOrThrow(supabase: Supabase, classId: string): Promise<BillingClass> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, tenant_id, class_name, class_code, department, level, class_type, weekday1, weekday2, system_sessions, status')
    .eq('id', classId)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'class not found')
  return data as BillingClass
}

async function getSeasonOrThrow(supabase: Supabase, seasonId: string): Promise<BillingSeason> {
  const { data, error } = await supabase
    .from('billing_seasons')
    .select('*')
    .eq('id', seasonId)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'season not found')
  return data as BillingSeason
}

async function getStudentsForClass(supabase: Supabase, classId: string): Promise<BillingStudent[]> {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('id, student_id, slot_order, status, student:students(id, chinese_name, english_name, status, school, grade)')
    .eq('class_id', classId)
    .eq('status', 'active')
    .order('slot_order')

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const student = row.student as unknown as {
      chinese_name: string | null
      english_name: string | null
      status: string | null
      school: string | null
      grade: string | null
    } | null

    return {
      enrollment_id: row.id,
      student_id: row.student_id,
      slot_order: row.slot_order,
      chinese_name: student?.chinese_name ?? null,
      english_name: student?.english_name ?? null,
      status: student?.status ?? null,
      school: student?.school ?? null,
      grade: student?.grade ?? null,
    }
  })
}

export async function saveBillingClassConfig(input: {
  id?: string | null
  classCode?: string | null
  className: string
  department?: string | null
  level?: string | null
  classType: 'intensive' | 'double' | 'single' | string
  weekday1?: number | null
  weekday2?: number | null
  systemSessions?: number | null
  status?: string | null
}): Promise<BillingClass> {
  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const className = input.className.trim()
  if (!className) throw new Error('班級名稱不可空白')

  const payload = {
    tenant_id: tenantId,
    class_name: className,
    class_code: input.classCode?.trim() || null,
    department: input.department?.trim() || null,
    level: input.level?.trim() || null,
    class_type: input.classType || 'intensive',
    weekday1: input.weekday1 || null,
    weekday2: input.classType === 'double' ? input.weekday2 || null : null,
    system_sessions: input.systemSessions || 24,
    status: input.status || 'active',
  }

  const query = input.id
    ? supabase.from('classes').update(payload).eq('id', input.id).select()
    : supabase.from('classes').insert(payload).select()
  const { data, error } = await query.single()
  if (error) throw new Error(error.message)
  return data as BillingClass
}

export async function getBillingState(params: {
  classId?: string | null
  seasonId?: string | null
} = {}): Promise<BillingState> {
  const supabase = await createServiceClient()

  const [{ data: classRows, error: classError }, { data: seasonRows, error: seasonError }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, tenant_id, class_name, class_code, department, level, class_type, weekday1, weekday2, system_sessions, status')
      .eq('status', 'active')
      .order('class_name'),
    supabase
      .from('billing_seasons')
      .select('*')
      .order('start_date', { ascending: false }),
  ])

  if (classError) throw new Error(classError.message)
  if (seasonError && seasonError.code !== '42P01') throw new Error(seasonError.message)

  const classes = (classRows ?? []) as BillingClass[]
  const seasons = ((seasonRows ?? []) as BillingSeason[])
  const selectedClass = classes.find((cls) => cls.id === params.classId) ?? classes[0] ?? null
  const selectedSeason = seasons.find((season) => season.id === params.seasonId) ?? seasons[0] ?? null

  if (!selectedClass || !selectedSeason) {
    return {
      classes,
      seasons,
      selectedClass,
      selectedSeason,
      students: [],
      holidays: [],
      actualAttendance: [],
      bags: [],
      activeBag: null,
      generatedAt: new Date().toISOString(),
    }
  }

  const [students, actuals, bags, activeBag] = await Promise.all([
    getStudentsForClass(supabase, selectedClass.id),
    buildAttendanceView(supabase, selectedSeason, selectedClass.id),
    getPaymentBags(supabase, selectedSeason.id, selectedClass.id),
    getActiveBag(supabase, selectedSeason.id, selectedClass.id),
  ])
  const holidays: string[] = selectedSeason.holiday_dates ?? []

  const studentsById = new Map(students.map((student) => [student.student_id, student]))
  if (activeBag) {
    activeBag.lines = activeBag.lines.map((line) => ({
      ...line,
      student: studentsById.get(line.student_id),
    }))
  }

  return {
    classes,
    seasons,
    selectedClass,
    selectedSeason,
    students,
    holidays,
    actualAttendance: actuals,
    bags,
    activeBag,
    generatedAt: new Date().toISOString(),
  }
}


// Synthesize the ActualAttendance view from payment_bag_line_sessions.
async function buildAttendanceView(
  supabase: Supabase,
  season: BillingSeason,
  classId: string,
): Promise<ActualAttendance[]> {
  const { data: bag } = await supabase
    .from('payment_bags')
    .select('id')
    .eq('season_id', season.id)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!bag) return []

  const { data: lines } = await supabase
    .from('payment_bag_lines')
    .select('id')
    .eq('bag_id', bag.id)
  const lineIds = (lines ?? []).map((l: { id: string }) => l.id)
  if (lineIds.length === 0) return []

  const { data: sessions, error } = await supabase
    .from('payment_bag_line_sessions')
    .select('id, student_id, session_date, session_kind, is_billable, attendance_status, absence_resolution')
    .in('line_id', lineIds)
    .not('attendance_status', 'is', null)
  if (error) throw new Error(error.message)

  const view: ActualAttendance[] = []
  for (const s of sessions ?? []) {
    const status = sessionToActualStatus(
      s.attendance_status as string | null,
      s.absence_resolution as string | null,
    )
    if (!status) continue
    const sessionDate = s.session_date as string | null
    view.push({
      id: s.id,
      tenant_id: season.tenant_id,
      season_id: season.id,
      class_id: classId,
      student_id: s.student_id,
      session_date: sessionDate,
      actual_date: sessionDate ?? s.id,
      period_key: null,
      actual_status: status,
      reconciliation_status: statusToReconciliation(status),
      source_task_record_id: null,
      note: null,
    })
  }
  return view
}

function sessionToActualStatus(
  status: string | null,
  resolution: string | null,
): ActualAttendanceStatus | null {
  if (status === 'present' || status === 'late') return 'attended'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'absent') {
    if (resolution === 'makeup_done') return 'makeup'
    if (resolution === 'refund') return 'cancelled'
    return 'absent'
  }
  return null
}

async function getPaymentBags(supabase: Supabase, seasonId: string, classId: string): Promise<PaymentBag[]> {
  const { data, error } = await supabase
    .from('payment_bags')
    .select('*')
    .eq('season_id', seasonId)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PaymentBag[]
}

async function getActiveBag(supabase: Supabase, seasonId: string, classId: string): Promise<PaymentBagWithLines | null> {
  const { data: bag, error } = await supabase
    .from('payment_bags')
    .select('*')
    .eq('season_id', seasonId)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!bag) return null

  const { data: lines, error: linesError } = await supabase
    .from('payment_bag_lines')
    .select('*')
    .eq('bag_id', bag.id)
    .order('student_order')
  if (linesError) throw new Error(linesError.message)

  const bagLines = (lines ?? []) as PaymentBagLine[]
  const lineIds = bagLines.map((line) => line.id)
  if (lineIds.length > 0) {
    const [{ data: sessions, error: sessionsError }, { data: items, error: itemsError }] = await Promise.all([
      supabase
        .from('payment_bag_line_sessions')
        .select('*')
        .in('line_id', lineIds)
        .order('slot_index'),
      supabase
        .from('payment_bag_line_items')
        .select('*')
        .in('line_id', lineIds)
        .order('sort_order'),
    ])

    if (sessionsError && !isMissingTable(sessionsError)) throw new Error(sessionsError.message)
    if (itemsError && !isMissingTable(itemsError)) throw new Error(itemsError.message)

    const sessionsByLine = new Map<string, PaymentBagLineSession[]>()
    for (const row of (sessions ?? []) as PaymentBagLineSession[]) {
      if (!row.line_id) continue
      const list = sessionsByLine.get(row.line_id) ?? []
      list.push(row)
      sessionsByLine.set(row.line_id, list)
    }
    const itemsByLine = new Map<string, PaymentBagLineItem[]>()
    for (const row of (items ?? []) as PaymentBagLineItem[]) {
      if (!row.line_id) continue
      const list = itemsByLine.get(row.line_id) ?? []
      list.push(row)
      itemsByLine.set(row.line_id, list)
    }

    for (const line of bagLines) {
      line.sessions = sessionsByLine.get(line.id) ?? []
      line.items = itemsByLine.get(line.id) ?? []
    }
  }

  return { ...(bag as PaymentBag), lines: bagLines }
}

export async function createBillingSeason(input: {
  year: number
  quarter: BillingQuarter
  startDate?: string | null
  endDate?: string | null
  label?: string | null
}): Promise<BillingSeason> {
  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const dates = quarterDates(input.year, input.quarter)
  const seasonCode = buildSeasonCode(input.year, input.quarter)

  const { data, error } = await supabase
    .from('billing_seasons')
    .upsert({
      tenant_id: tenantId,
      season_code: seasonCode,
      year: input.year,
      quarter: input.quarter,
      start_date: input.startDate || dates.start_date,
      end_date: input.endDate || dates.end_date,
      label: input.label?.trim() || seasonCode,
      status: 'active',
    }, { onConflict: 'tenant_id,season_code' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as BillingSeason
}

export async function replaceSeasonHolidays(input: {
  seasonId: string
  holidayDates: string[]
}): Promise<{ saved: number }> {
  const supabase = await createServiceClient()
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const uniqueDates = Array.from(new Set(input.holidayDates.map(dateOnly))).sort(compareDate)
  const { error } = await supabase
    .from('billing_seasons')
    .update({ holiday_dates: uniqueDates })
    .eq('id', season.id)
  if (error) throw new Error(error.message)
  return { saved: uniqueDates.length }
}

// Carry forward the previous season's refund sessions onto the new bag.
// Reads from payment_bag_line_sessions (absence_resolution='refund').
async function computeCarryovers(
  supabase: Supabase,
  params: { season: BillingSeason; classId: string; studentIds: string[]; rate: number },
): Promise<Map<string, { amount: number; note: string }>> {
  if (params.studentIds.length === 0) return new Map()

  const { data: previousSeasons, error: seasonError } = await supabase
    .from('billing_seasons')
    .select('id, season_code')
    .eq('tenant_id', params.season.tenant_id)
    .lt('start_date', params.season.start_date)
    .order('start_date', { ascending: false })
    .limit(1)
  if (seasonError) throw new Error(seasonError.message)

  const prev = (previousSeasons ?? [])[0] as { id: string; season_code: string } | undefined
  if (!prev) return new Map()

  const { data: prevBag } = await supabase
    .from('payment_bags')
    .select('id')
    .eq('season_id', prev.id)
    .eq('class_id', params.classId)
    .limit(1)
    .maybeSingle()
  if (!prevBag) return new Map()

  const { data: prevLines } = await supabase
    .from('payment_bag_lines')
    .select('id')
    .eq('bag_id', prevBag.id)
    .in('student_id', params.studentIds)
  const prevLineIds = (prevLines ?? []).map((l: { id: string }) => l.id)
  if (prevLineIds.length === 0) return new Map()

  const { data: sessions, error } = await supabase
    .from('payment_bag_line_sessions')
    .select('student_id')
    .in('line_id', prevLineIds)
    .eq('attendance_status', 'absent')
    .eq('absence_resolution', 'refund')
  if (error) throw new Error(error.message)

  const refundCounts = new Map<string, number>()
  for (const s of sessions ?? []) {
    const sid = s.student_id as string
    refundCounts.set(sid, (refundCounts.get(sid) ?? 0) + 1)
  }

  const result = new Map<string, { amount: number; note: string }>()
  for (const [studentId, count] of refundCounts) {
    if (!count) continue
    const amount = Math.round(-count * params.rate)
    result.set(studentId, {
      amount,
      note: `前期 ${prev.season_code} 缺席退費 ${count} 堂`,
    })
  }
  return result
}

function sumOpenBagRows(rows: Array<{ amount?: number | null | undefined }> | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0)
}

function joinOpenBagRows(rows: Array<{ note?: string | null | undefined }> | undefined): string | null {
  const text = (rows ?? [])
    .map((row) => row.note?.trim())
    .filter(Boolean)
    .join(' / ')
  return text || null
}

function normalizeOpenBagDate(value: string | null | undefined, year: number): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return dateOnly(value)
  return mdToDate(year, value)
}

async function writeOpenBagLineDetails(
  supabase: Supabase,
  params: {
    bagId: string
    tenantId: string
    seasonYear: number
    classType: string | null
    lines: PaymentBagLine[]
    drafts: Map<string, OpenBagStudentInput>
  },
): Promise<void> {
  const lineIds = params.lines.map((line) => line.id)
  if (lineIds.length === 0) return

  // Build sessions payload for fn_reopen_bag RPC
  // (preserves attendance data on existing rows; only upserts schedule)
  const sessionRows: Array<Record<string, unknown>> = []
  for (const line of params.lines) {
    const draft = params.drafts.get(line.student_id)
    if (!draft) continue
    const teamDates = draft.teamDates ?? []
    const intensiveDates = draft.intensiveDates ?? []
    teamDates.forEach((rawDate, index) => {
      const sessionDate = normalizeOpenBagDate(rawDate, params.seasonYear)
      const slotIndex = params.classType === 'intensive' ? index * 2 + 1 : index + 1
      if (slotIndex > MAX_BILLING_SESSIONS) return
      sessionRows.push({
        tenant_id: params.tenantId,
        line_id: line.id,
        student_id: line.student_id,
        slot_index: slotIndex,
        session_kind: 'team',
        session_order: index + 1,
        session_date: sessionDate,
        legacy_mmdd: dateToLegacyMd(sessionDate),
        is_unscheduled: false,
        week_key: null,
      })
    })
    if (params.classType === 'intensive') {
      intensiveDates.forEach((rawDate, index) => {
        const sessionDate = normalizeOpenBagDate(rawDate, params.seasonYear)
        const slotIndex = index * 2 + 2
        if (slotIndex > MAX_BILLING_SESSIONS) return
        sessionRows.push({
          tenant_id: params.tenantId,
          line_id: line.id,
          student_id: line.student_id,
          slot_index: slotIndex,
          session_kind: 'intensive',
          session_order: index + 1,
          session_date: sessionDate,
          legacy_mmdd: dateToLegacyMd(sessionDate),
          is_unscheduled: false,
          week_key: null,
        })
      })
      const unscheduled = Math.max(0, toNumber(draft.intensiveUnscheduled))
      for (let index = 0; index < unscheduled; index += 1) {
        const slotIndex = (intensiveDates.length + index) * 2 + 2
        if (slotIndex > MAX_BILLING_SESSIONS) continue
        sessionRows.push({
          tenant_id: params.tenantId,
          line_id: line.id,
          student_id: line.student_id,
          slot_index: slotIndex,
          session_kind: 'intensive',
          session_order: intensiveDates.length + index + 1,
          session_date: null,
          legacy_mmdd: '精修',
          is_unscheduled: true,
          week_key: null,
        })
      }
    }
  }

  // Always call fn_reopen_bag, even when sessionRows is empty.
  // An empty array tells the RPC to delete all unattended rows.
  // Direct DELETE from service code is wrong because it bypasses conflict detection.
  {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_reopen_bag', {
      p_bag_id: params.bagId,
      p_sessions: sessionRows,
    })
    if (rpcError) throw new Error(rpcError.message)
    const result = rpcResult as { ok: boolean; conflicts?: unknown[] } | null
    if (!result?.ok) {
      const conflictCount = result?.conflicts?.length ?? 0
      throw new Error(
        `無法更新課程：${conflictCount} 筆已點名記錄的日期有衝突。請先處理出席記錄再重開袋。`
      )
    }
  }

  const { error: deleteItemError } = await supabase
    .from('payment_bag_line_items')
    .delete()
    .in('line_id', lineIds)
  if (deleteItemError) {
    throw new Error(deleteItemError.message)
  }

  const itemRows: Array<Record<string, unknown>> = []
  for (const line of params.lines) {
    const draft = params.drafts.get(line.student_id)
    if (!draft) continue
    let order = 1
    itemRows.push({
      tenant_id: params.tenantId,
      line_id: line.id,
      item_type: 'tuition',
      label: draft.tuitionLabel?.trim() || '學費',
      amount: line.tuition_amount,
      sort_order: order,
      preset_key: draft.tuitionPresetKey?.trim() || null,
    })
    order += 1
    const pushRows = (
      itemType: 'book' | 'misc' | 'discount',
      rows: Array<{ preset?: string | null; note?: string | null; amount?: number | null }> | undefined,
    ) => {
      for (const row of rows ?? []) {
        const label = row.note?.trim()
        const amount = toNumber(row.amount)
        if (!label && !amount) continue
        itemRows.push({
          tenant_id: params.tenantId,
          line_id: line.id,
          item_type: itemType,
          label: label || null,
          amount,
          sort_order: order,
          preset_key: row.preset?.trim() || null,
        })
        order += 1
      }
    }
    pushRows('book', draft.bookRows)
    pushRows('misc', draft.miscRows)
    pushRows('discount', draft.discountRows)
    if (draft.carryoverAmount || draft.carryoverNote?.trim()) {
      itemRows.push({
        tenant_id: params.tenantId,
        line_id: line.id,
        item_type: 'carryover',
        label: draft.carryoverNote?.trim() || null,
        amount: toNumber(draft.carryoverAmount),
        sort_order: order,
        preset_key: null,
      })
      order += 1
    }
    for (const row of draft.adjustments ?? []) {
      const label = row.name?.trim()
      const amount = toNumber(row.amount)
      if (!label && !amount) continue
      itemRows.push({
        tenant_id: params.tenantId,
        line_id: line.id,
        item_type: 'adjustment',
        label: label || null,
        amount,
        sort_order: order,
        preset_key: null,
      })
      order += 1
    }
  }

  if (itemRows.length > 0) {
    const { error } = await supabase.from('payment_bag_line_items').insert(itemRows)
    if (error) throw new Error(error.message)
  }
}

export async function openPaymentBag(input: OpenBagInput): Promise<PaymentBagWithLines> {
  const supabase = await createServiceClient()
  await assertPaymentBagDetailTables(supabase)
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const cls = await getClassOrThrow(supabase, input.classId)
  const students = await getStudentsForClass(supabase, cls.id)
  const fallbackSessionCount = cls.system_sessions || 0
  const tuitionAmount = toNumber(input.tuitionAmount)
  const hasStudentDrafts = Boolean(input.selectedStudents?.length)
  if (!hasStudentDrafts) {
    throw new Error('Open bag requires at least one selected student with session dates.')
  }
  const studentDrafts = new Map((input.selectedStudents ?? []).map((row) => [row.studentId, row]))
  const targetStudents = hasStudentDrafts
    ? students.filter((student) => studentDrafts.has(student.student_id))
    : students
  const fallbackRate = fallbackSessionCount > 0 ? Math.round(tuitionAmount / fallbackSessionCount) : 0
  const carryovers = hasStudentDrafts
    ? new Map<string, { amount: number; note: string }>()
    : await computeCarryovers(supabase, {
        season,
        classId: cls.id,
        studentIds: targetStudents.map((student) => student.student_id),
        rate: fallbackRate,
      })
  const fallbackTeamDates: string[] = []

  const bagPayload = {
    tenant_id: cls.tenant_id,
    season_id: season.id,
    class_id: cls.id,
    bag_code: bagCode(season.season_code, cls),
    issue_date: input.issueDate,
    due_date: input.dueDate || null,
    status: 'draft',
    tuition_note: `${season.quarter} 季度課程`,
    note: input.note?.trim() || null,
  }

  const { data: bag, error: bagError } = await supabase
    .from('payment_bags')
    .upsert(bagPayload, { onConflict: 'tenant_id,season_id,class_id' })
    .select()
    .single()
  if (bagError) throw new Error(bagError.message)

  const lineRows = targetStudents.map((student, index) => {
    const draft = studentDrafts.get(student.student_id)
    const carryover = carryovers.get(student.student_id)
    const teamDates = draft?.teamDates?.length ? draft.teamDates : fallbackTeamDates
    const intensiveCount = (draft?.intensiveDates?.length ?? 0) + toNumber(draft?.intensiveUnscheduled)
    const sessionCount = teamDates.length + (cls.class_type === 'intensive' ? intensiveCount : 0)
    const lineTuition = draft?.tuitionAmount != null ? toNumber(draft.tuitionAmount) : tuitionAmount
    const bookRows = draft?.bookRows ?? [{ note: input.bookName, amount: input.bookFee }]
    const miscRows = draft?.miscRows ?? [{ note: input.miscLabel, amount: input.miscFee }]
    const discountRows = draft?.discountRows ?? [{ note: input.discountLabel, amount: input.discountAmount }]
    const bookFee = sumOpenBagRows(bookRows)
    const miscFee = sumOpenBagRows(miscRows)
    const discountAmount = sumOpenBagRows(discountRows)
    const manualCarryover = draft?.carryoverAmount != null ? toNumber(draft.carryoverAmount) : carryover?.amount ?? 0
    const adjustments = draft?.adjustments ?? []
    const adjustmentAmount = adjustments.reduce((sum, row) => sum + toNumber(row.amount), 0)
    const total = lineTuition + bookFee + miscFee - discountAmount + manualCarryover + adjustmentAmount
    return {
      tenant_id: cls.tenant_id,
      bag_id: bag.id,
      student_id: student.student_id,
      student_order: student.slot_order ?? index + 1,
      session_count: sessionCount,
      rate_per_session: sessionCount > 0 ? Math.round(lineTuition / sessionCount) : 0,
      tuition_amount: lineTuition,
      book_name: joinOpenBagRows(bookRows),
      book_fee: bookFee,
      misc_label: joinOpenBagRows(miscRows),
      misc_fee: miscFee,
      discount_label: joinOpenBagRows(discountRows),
      discount_amount: discountAmount,
      carryover_amount: manualCarryover,
      carryover_note: draft?.carryoverNote?.trim() || (carryover?.note ?? null),
      adjustment_label: adjustments
        .filter((row) => row.name?.trim() || toNumber(row.amount))
        .map((row) => `${row.name?.trim() || '調整'}:${toNumber(row.amount)}`)
        .join(' / ') || null,
      adjustment_amount: adjustmentAmount,
      total_amount: total,
    }
  })

  if (lineRows.length > 0) {
    const { data: lines, error: lineError } = await supabase
      .from('payment_bag_lines')
      .upsert(lineRows, { onConflict: 'bag_id,student_id' })
      .select()
    if (lineError) throw new Error(lineError.message)
    if (hasStudentDrafts) {
      await writeOpenBagLineDetails(supabase, {
        bagId: bag.id,
        tenantId: cls.tenant_id,
        seasonYear: season.year,
        classType: cls.class_type,
        lines: (lines ?? []) as PaymentBagLine[],
        drafts: studentDrafts,
      })
    }
  }

  const activeBag = await getActiveBag(supabase, season.id, cls.id)
  return requireValue(activeBag, 'payment bag not found after opening')
}

// Print/PDF history is tracked by counters on payment_bags (no events table).
export async function recordPaymentBagPrint(input: { bagId: string; eventType?: 'print' | 'pdf' }): Promise<void> {
  const supabase = await createServiceClient()
  const { data: bag, error } = await supabase.from('payment_bags').select('*').eq('id', input.bagId).single()
  if (error || !bag) throw new Error(error?.message ?? 'payment bag not found')

  const nextCount = Number(bag.print_count ?? 0) + 1
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('payment_bags')
    .update({ print_count: nextCount, last_printed_at: now, status: 'printed' })
    .eq('id', input.bagId)
  if (updateError) throw new Error(updateError.message)
}

export function defaultSeasonDraft(today = new Date()) {
  const month = today.getMonth() + 1
  const quarter: BillingQuarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4'
  const year = today.getFullYear()
  const dates = quarterDates(year, quarter)
  return {
    year,
    quarter,
    seasonCode: buildSeasonCode(year, quarter),
    ...dates,
  }
}

// ---------------------------------------------------------------------------
// Attendance refund calculation
// ---------------------------------------------------------------------------

// Per-student refund from a PREVIOUS season's absent_refund records.
// Used when opening the next season's bag: these amounts go into carryover_amount.
export interface PrevSeasonRefund {
  student_id: string
  prev_season_code: string
  refund_sessions: number
  rate_per_session: number
  refund_amount: number
  carryover_note: string
}

export async function getPreviousSeasonRefunds(input: {
  classId: string
  currentSeasonId: string
}): Promise<PrevSeasonRefund[]> {
  const supabase = await createServiceClient()
  const currentSeason = await getSeasonOrThrow(supabase, input.currentSeasonId)

  const { data: prevSeasons, error: prevSeasonError } = await supabase
    .from('billing_seasons')
    .select('id, season_code, tenant_id')
    .eq('tenant_id', currentSeason.tenant_id)
    .lt('start_date', currentSeason.start_date)
    .order('start_date', { ascending: false })
    .limit(1)
  if (prevSeasonError) throw new Error(prevSeasonError.message)
  const prev = (prevSeasons ?? [])[0] as { id: string; season_code: string; tenant_id: string } | undefined
  if (!prev) return []

  // Get previous season's rate_per_session per student from their payment_bag_lines
  const { data: prevBag } = await supabase
    .from('payment_bags')
    .select('id')
    .eq('season_id', prev.id)
    .eq('class_id', input.classId)
    .limit(1)
    .maybeSingle()

  if (!prevBag) return []

  const { data: prevLinesAll } = await supabase
    .from('payment_bag_lines')
    .select('id, student_id, rate_per_session')
    .eq('bag_id', prevBag.id as string)

  const rateMap = new Map<string, number>()
  for (const line of prevLinesAll ?? []) {
    rateMap.set(line.student_id as string, Number(line.rate_per_session ?? 0))
  }

  const prevLineIds = (prevLinesAll ?? []).map((l: { id: string }) => l.id)
  if (prevLineIds.length === 0) return []

  const { data: sessions, error: sessionsError } = await supabase
    .from('payment_bag_line_sessions')
    .select('student_id')
    .in('line_id', prevLineIds)
    .eq('attendance_status', 'absent')
    .eq('absence_resolution', 'refund')
  if (sessionsError) throw new Error(sessionsError.message)

  const refundCounts = new Map<string, number>()
  for (const s of sessions ?? []) {
    const sid = s.student_id as string
    refundCounts.set(sid, (refundCounts.get(sid) ?? 0) + 1)
  }

  const result: PrevSeasonRefund[] = []
  for (const [studentId, count] of refundCounts) {
    const rate = rateMap.get(studentId) ?? 0
    const refund_amount = count * rate
    if (refund_amount <= 0) continue
    result.push({
      student_id: studentId,
      prev_season_code: prev.season_code,
      refund_sessions: count,
      rate_per_session: rate,
      refund_amount,
      carryover_note: `${prev.season_code} 缺席退費 ${count} 堂`,
    })
  }
  return result
}

export interface AttendanceRefundLine {
  line_id: string
  student_id: string
  student_name: string
  refund_sessions: number
  rate_per_session: number
  refund_amount: number
}

export async function computeAttendanceRefunds(bagId: string): Promise<AttendanceRefundLine[]> {
  const supabase = await createServiceClient()

  const { data: lines, error: linesError } = await supabase
    .from('payment_bag_lines')
    .select('id, student_id, rate_per_session, student:students(chinese_name, english_name)')
    .eq('bag_id', bagId)
    .order('student_order')
  if (linesError) throw new Error(linesError.message)

  const lineIds = (lines ?? []).map((l: { id: string }) => l.id)
  if (lineIds.length === 0) return []

  const { data: sessions, error: sessionsError } = await supabase
    .from('payment_bag_line_sessions')
    .select('student_id')
    .in('line_id', lineIds)
    .eq('attendance_status', 'absent')
    .eq('absence_resolution', 'refund')
  if (sessionsError) throw new Error(sessionsError.message)

  const refundCounts = new Map<string, number>()
  for (const s of sessions ?? []) {
    const sid = s.student_id as string
    refundCounts.set(sid, (refundCounts.get(sid) ?? 0) + 1)
  }

  return (lines ?? [])
    .map(line => {
      const s = line.student as unknown as { chinese_name: string | null; english_name: string | null } | null
      const name = s?.chinese_name ?? s?.english_name ?? '—'
      const refund_sessions = refundCounts.get(line.student_id as string) ?? 0
      const rate = Number(line.rate_per_session ?? 0)
      return {
        line_id: line.id as string,
        student_id: line.student_id as string,
        student_name: name,
        refund_sessions,
        rate_per_session: rate,
        refund_amount: refund_sessions * rate,
      }
    })
    .filter(p => p.refund_sessions > 0)
}


// ─── Fee Presets ────────────────────────────────────────────────────────────

function normalizeFeeCatalogItem(row: Record<string, unknown>): BillingFeeCatalogItem {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    category: String(row.category) as BillingFeeCategory,
    label: String(row.label ?? ''),
    amount: toNumber(row.amount),
    status: String(row.status ?? 'active'),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listBillingFeeCatalog(): Promise<BillingFeeCatalogItem[]> {
  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const { data, error } = await supabase
    .from('invoice_fee_presets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('category')
    .order('label')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => normalizeFeeCatalogItem(row as Record<string, unknown>))
}

export async function saveBillingFeeCatalogItem(input: {
  id?: string | null
  category: BillingFeeCategory
  label: string
  amount: number
}): Promise<BillingFeeCatalogItem> {
  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const label = input.label.trim()
  if (!label) throw new Error('費用名稱不可空白')

  const payload = {
    tenant_id: tenantId,
    category: input.category,
    label,
    amount: toNumber(input.amount),
    status: 'active',
    updated_at: new Date().toISOString(),
  }

  const query = input.id
    ? supabase.from('invoice_fee_presets').update(payload).eq('id', input.id).eq('tenant_id', tenantId)
    : supabase.from('invoice_fee_presets').upsert(payload, { onConflict: 'tenant_id,category,label' })
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)
  return normalizeFeeCatalogItem(data as Record<string, unknown>)
}

export async function deleteBillingFeeCatalogItem(id: string): Promise<void> {
  const supabase = await createServiceClient()
  const tenantId = await getTenantId(supabase)
  const { error } = await supabase
    .from('invoice_fee_presets')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)
}

export function normalizeSeasonDraft(raw: { year?: unknown; quarter?: unknown; startDate?: unknown; endDate?: unknown }) {
  const fallback = defaultSeasonDraft()
  const parsed = parseSeasonCode(`${raw.year ?? fallback.year}-${raw.quarter ?? fallback.quarter}`)
  const year = parsed?.year ?? fallback.year
  const quarter = parsed?.quarter ?? fallback.quarter
  const dates = quarterDates(year, quarter)
  return {
    year,
    quarter,
    startDate: String(raw.startDate ?? dates.start_date).slice(0, 10),
    endDate: String(raw.endDate ?? dates.end_date).slice(0, 10),
  }
}
