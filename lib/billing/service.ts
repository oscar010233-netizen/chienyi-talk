import { createServiceClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/grade/codes'
import {
  MAX_BILLING_SESSIONS,
  type BillingQuarter,
  buildSeasonCode,
  compareDate,
  dateOnly,
  formatDateMd,
  generateClassDates,
  parseSeasonCode,
  periodKey,
  quarterDates,
  shiftHolidayDate,
  toNumber,
} from './calendar'
import type {
  ActualAttendance,
  ActualAttendanceStatus,
  BillingClass,
  BillingSeason,
  BillingState,
  BillingStudent,
  DefaultAttendance,
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
// There is intentionally NO `actual_attendance` table. The class roll-call
// (`class_tasks` with task_type='attendance' + `student_task_records`) is the
// single source of truth for who actually attended. The `ActualAttendance`
// objects below are a *view model* synthesized live from that roll-call:
//   - regular sessions map to default_attendance via lesson_label = S## and
//     week_label = period_key
//   - makeup / extra sessions have no default row; they are stored as ad-hoc
//     attendance tasks with lesson_label `MK<date>` / `EX<date>`
// ---------------------------------------------------------------------------

const EXTRA_PREFIX = 'EX'
const MAKEUP_PREFIX = 'MK'

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

function statusToTask(status: ActualAttendanceStatus): { status: string } {
  if (status === 'attended' || status === 'makeup' || status === 'extra') {
    return { status: 'completed' }
  }
  if (status === 'absent') return { status: 'missing' }
  return { status: 'wont_do' }
}

function taskToActual(status: string | null | undefined): ActualAttendanceStatus | null {
  if (status === 'completed') return 'attended'
  if (status === 'missing') return 'absent'
  if (status === 'wont_do') return 'cancelled'
  return null
}

function sessionLabel(index: number): string {
  return `S${String(index).padStart(2, '0')}`
}

// All attendance tasks of a season share this week_label prefix, e.g. `2026Q1W`.
function seasonWeekPrefix(seasonCode: string): string {
  return `${seasonCode.replace('-', '')}W`
}

function isMissingTable(error: unknown): boolean {
  const maybe = error as { code?: string; message?: string } | null | undefined
  return maybe?.code === 'PGRST205' || /Could not find the table/i.test(maybe?.message ?? '')
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
      defaultAttendance: [],
      actualAttendance: [],
      bags: [],
      activeBag: null,
      generatedAt: new Date().toISOString(),
    }
  }

  const defaults = await getDefaultAttendanceRows(supabase, selectedSeason.id, selectedClass.id)

  const [students, actuals, bags, activeBag] = await Promise.all([
    getStudentsForClass(supabase, selectedClass.id),
    buildAttendanceView(supabase, selectedSeason, selectedClass.id, defaults),
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
    defaultAttendance: defaults,
    actualAttendance: actuals,
    bags,
    activeBag,
    generatedAt: new Date().toISOString(),
  }
}


async function getDefaultAttendanceRows(supabase: Supabase, seasonId: string, classId: string): Promise<DefaultAttendance[]> {
  const { data, error } = await supabase
    .from('default_attendance')
    .select('*')
    .eq('season_id', seasonId)
    .eq('class_id', classId)
    .order('session_index')
  if (error) throw new Error(error.message)
  return (data ?? []) as DefaultAttendance[]
}

type AttendanceTaskRow = {
  id: string
  tenant_id: string
  lesson_label: string | null
  week_label: string | null
}

async function getAttendanceTasks(
  supabase: Supabase,
  classId: string,
  seasonCode: string,
): Promise<AttendanceTaskRow[]> {
  const { data, error } = await supabase
    .from('class_tasks')
    .select('id, tenant_id, lesson_label, week_label')
    .eq('class_id', classId)
    .eq('task_type', 'attendance')
    .like('week_label', `${seasonWeekPrefix(seasonCode)}%`)
  if (error) throw new Error(error.message)
  return (data ?? []) as AttendanceTaskRow[]
}

// Synthesize the ActualAttendance view from the existing roll-call records.
async function buildAttendanceView(
  supabase: Supabase,
  season: BillingSeason,
  classId: string,
  defaults: DefaultAttendance[],
): Promise<ActualAttendance[]> {
  const tasks = await getAttendanceTasks(supabase, classId, season.season_code)
  const taskIds = tasks.map((task) => task.id)
  if (taskIds.length === 0) return []

  const { data: records, error } = await supabase
    .from('student_task_records')
    .select('id, student_id, class_task_id, status')
    .in('class_task_id', taskIds)
  if (error) throw new Error(error.message)

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const defaultByLesson = new Map(defaults.map((row) => [sessionLabel(row.session_index), row]))
  const view: ActualAttendance[] = []

  for (const record of records ?? []) {
    const task = taskById.get(record.class_task_id)
    const lesson = task?.lesson_label
    if (!task || !lesson) continue

    if (lesson.startsWith(EXTRA_PREFIX) || lesson.startsWith(MAKEUP_PREFIX)) {
      if (record.status !== 'completed') continue
      const isExtra = lesson.startsWith(EXTRA_PREFIX)
      const actualDate = lesson.slice(2)
      view.push({
        id: record.id,
        tenant_id: task.tenant_id,
        default_attendance_id: null,
        season_id: season.id,
        class_id: classId,
        student_id: record.student_id,
        default_date: null,
        actual_date: actualDate,
        session_index: null,
        period_key: task.week_label,
        actual_status: isExtra ? 'extra' : 'makeup',
        reconciliation_status: isExtra ? 'extra' : 'makeup',
        source_task_record_id: record.id,
        note: null,
      })
      continue
    }

    const def = defaultByLesson.get(lesson)
    if (!def) continue
    const status = taskToActual(record.status)
    if (!status) continue // pending / unrecorded
    view.push({
      id: record.id,
      tenant_id: def.tenant_id,
      default_attendance_id: def.id,
      season_id: season.id,
      class_id: classId,
      student_id: record.student_id,
      default_date: def.default_date,
      actual_date: def.default_date,
      session_index: def.session_index,
      period_key: def.period_key,
      actual_status: status,
      reconciliation_status: statusToReconciliation(status),
      source_task_record_id: record.id,
      note: null,
    })
  }

  return view
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

export async function generateDefaultAttendance(input: {
  seasonId: string
  classId: string
  limit?: number
}): Promise<{ generated: number; tasks: number; records: number }> {
  const supabase = await createServiceClient()
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const cls = await getClassOrThrow(supabase, input.classId)
  const students = await getStudentsForClass(supabase, cls.id)
  const { data: seasonData } = await supabase.from('billing_seasons').select('holiday_dates').eq('id', season.id).single()
  const holidaySet = new Set<string>((seasonData?.holiday_dates ?? []) as string[])
  const baseDates = generateClassDates({
    startDate: season.start_date,
    endDate: season.end_date,
    weekday1: cls.weekday1,
    weekday2: cls.weekday2,
    classType: cls.class_type,
    limit: input.limit ?? cls.system_sessions ?? MAX_BILLING_SESSIONS,
  })

  const shiftedDates = baseDates.map((originalDate) => {
    const shifted = shiftHolidayDate(originalDate, holidaySet)
    return { originalDate, date: shifted.date, shifted: shifted.shifted }
  })
  // Keep sessions in chronological order even after a holiday pushes one later.
  shiftedDates.sort((a, b) => compareDate(a.date, b.date))

  const rows = shiftedDates.map((entry, index) => ({
    tenant_id: cls.tenant_id,
    season_id: season.id,
    class_id: cls.id,
    session_index: index + 1,
    default_date: entry.date,
    original_date: entry.originalDate,
    period_key: periodKey(season.season_code, season.start_date, entry.date),
    source: 'generated',
    status: entry.shifted ? 'holiday_shifted' : 'scheduled',
    holiday_id: null,
    note: entry.shifted ? `${formatDateMd(entry.originalDate)} 假日順延` : null,
  }))

  const { error } = await supabase
    .from('default_attendance')
    .upsert(rows, { onConflict: 'tenant_id,season_id,class_id,session_index' })
  if (error) throw new Error(error.message)

  const { data: defaults, error: defaultsError } = await supabase
    .from('default_attendance')
    .select('*')
    .eq('season_id', season.id)
    .eq('class_id', cls.id)
    .order('session_index')
  if (defaultsError) throw new Error(defaultsError.message)

  const taskStats = await ensureAttendanceTasks(supabase, cls, season, (defaults ?? []) as DefaultAttendance[], students)
  return { generated: rows.length, ...taskStats }
}

async function ensureAttendanceTasks(
  supabase: Supabase,
  cls: BillingClass,
  season: BillingSeason,
  defaults: DefaultAttendance[],
  students: BillingStudent[],
): Promise<{ tasks: number; records: number }> {
  let tasks = 0
  let records = 0
  const { data: existingTasks, error } = await supabase
    .from('class_tasks')
    .select('id, lesson_label, week_label')
    .eq('class_id', cls.id)
    .eq('task_type', 'attendance')
  if (error) throw new Error(error.message)

  const taskByKey = new Map((existingTasks ?? []).map((task) => [`${task.week_label}:${task.lesson_label}`, task.id as string]))

  for (const row of defaults) {
    const lesson = sessionLabel(row.session_index)
    const key = `${row.period_key}:${lesson}`
    let taskId = taskByKey.get(key)
    const payload = {
      tenant_id: cls.tenant_id,
      class_id: cls.id,
      task_type: 'attendance',
      week_label: row.period_key,
      lesson_label: lesson,
      task_name: `出席 ${row.session_index} ${formatDateMd(row.default_date)}`,
      display_order: row.session_index,
      status: 'active',
    }

    if (taskId) {
      const { error: updateError } = await supabase.from('class_tasks').update(payload).eq('id', taskId)
      if (updateError) throw new Error(updateError.message)
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('class_tasks')
        .insert(payload)
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)
      taskId = inserted.id as string
      taskByKey.set(key, taskId)
      tasks += 1
    }

    if (students.length > 0) {
      const recordRows = students.map((student) => ({
        tenant_id: cls.tenant_id,
        class_task_id: taskId,
        student_id: student.student_id,
        status: 'pending',
      }))
      const { error: recordError } = await supabase
        .from('student_task_records')
        .upsert(recordRows, { onConflict: 'class_task_id,student_id', ignoreDuplicates: true })
      if (recordError) throw new Error(recordError.message)
      records += recordRows.length
    }
  }

  return { tasks, records }
}

// The roll-call IS the source of truth now, so "sync" is just a refresh that
// reports how many regular sessions currently have a recorded result.
export async function syncActualAttendanceFromClassSheet(input: {
  seasonId: string
  classId: string
}): Promise<{ synced: number }> {
  const supabase = await createServiceClient()
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const defaults = await getDefaultAttendanceRows(supabase, season.id, input.classId)
  const view = await buildAttendanceView(supabase, season, input.classId, defaults)
  return { synced: view.filter((row) => row.default_attendance_id).length }
}

export async function recordActualAttendance(input: {
  defaultAttendanceId: string
  studentId: string
  status: ActualAttendanceStatus
  actualDate?: string | null
  note?: string | null
}): Promise<ActualAttendance> {
  const supabase = await createServiceClient()
  const { data: row, error } = await supabase
    .from('default_attendance')
    .select('*')
    .eq('id', input.defaultAttendanceId)
    .single()
  if (error || !row) throw new Error(error?.message ?? 'default attendance not found')

  const def = row as DefaultAttendance
  await mirrorActualToClassTask(supabase, def, input.studentId, input.status)

  return {
    id: `${def.id}:${input.studentId}`,
    tenant_id: def.tenant_id,
    default_attendance_id: def.id,
    season_id: def.season_id,
    class_id: def.class_id,
    student_id: input.studentId,
    default_date: def.default_date,
    actual_date: input.actualDate || def.default_date,
    session_index: def.session_index,
    period_key: def.period_key,
    actual_status: input.status,
    reconciliation_status: statusToReconciliation(input.status),
    source_task_record_id: null,
    note: input.note?.trim() || null,
  }
}

async function mirrorActualToClassTask(
  supabase: Supabase,
  def: DefaultAttendance,
  studentId: string,
  actualStatus: ActualAttendanceStatus,
): Promise<void> {
  const lesson = sessionLabel(def.session_index)
  const { data: task } = await supabase
    .from('class_tasks')
    .select('id, tenant_id')
    .eq('class_id', def.class_id)
    .eq('task_type', 'attendance')
    .eq('lesson_label', lesson)
    .eq('week_label', def.period_key)
    .maybeSingle()

  if (!task) throw new Error('找不到對應的班級點名任務，請先「產生預設出席日」')
  const mapped = statusToTask(actualStatus)
  const { error } = await supabase
    .from('student_task_records')
    .upsert({
      tenant_id: task.tenant_id,
      class_task_id: task.id,
      student_id: studentId,
      status: mapped.status,
    }, { onConflict: 'class_task_id,student_id' })
  if (error) throw new Error(error.message)
}

// Makeup / extra sessions are stored as ad-hoc attendance tasks (lesson_label
// MK<date> / EX<date>) so they live in the same roll-call as everything else.
export async function recordExtraAttendance(input: {
  seasonId: string
  classId: string
  studentId: string
  actualDate: string
  status: 'makeup' | 'extra'
  note?: string | null
}): Promise<ActualAttendance> {
  const supabase = await createServiceClient()
  const cls = await getClassOrThrow(supabase, input.classId)
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const actualDate = dateOnly(input.actualDate)
  const prefix = input.status === 'extra' ? EXTRA_PREFIX : MAKEUP_PREFIX
  const lesson = `${prefix}${actualDate}`
  const weekLabel = periodKey(season.season_code, season.start_date, actualDate)

  const { data: existing } = await supabase
    .from('class_tasks')
    .select('id, tenant_id')
    .eq('class_id', cls.id)
    .eq('task_type', 'attendance')
    .eq('lesson_label', lesson)
    .eq('week_label', weekLabel)
    .maybeSingle()

  let taskId = existing?.id as string | undefined
  if (!taskId) {
    const { data: inserted, error: insertError } = await supabase
      .from('class_tasks')
      .insert({
        tenant_id: cls.tenant_id,
        class_id: cls.id,
        task_type: 'attendance',
        week_label: weekLabel,
        lesson_label: lesson,
        task_name: `${input.status === 'extra' ? '多上' : '補課'} ${formatDateMd(actualDate)}`,
        display_order: 900,
        status: 'active',
      })
      .select('id')
      .single()
    if (insertError) throw new Error(insertError.message)
    taskId = inserted.id as string
  }

  const { error: recordError } = await supabase
    .from('student_task_records')
    .upsert({
      tenant_id: cls.tenant_id,
      class_task_id: taskId,
      student_id: input.studentId,
      status: 'completed',
      teacher_note: input.note?.trim() || null,
    }, { onConflict: 'class_task_id,student_id' })
  if (recordError) throw new Error(recordError.message)

  return {
    id: `${taskId}:${input.studentId}`,
    tenant_id: cls.tenant_id,
    default_attendance_id: null,
    season_id: season.id,
    class_id: cls.id,
    student_id: input.studentId,
    default_date: null,
    actual_date: actualDate,
    session_index: null,
    period_key: weekLabel,
    actual_status: input.status,
    reconciliation_status: input.status,
    source_task_record_id: null,
    note: input.note?.trim() || null,
  }
}

// Carry forward the previous season's missed / extra sessions onto the new bag.
// Source of truth is the previous season's roll-call (class_tasks records).
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

  const tasks = await getAttendanceTasks(supabase, params.classId, prev.season_code)
  const taskIds = tasks.map((task) => task.id)
  if (taskIds.length === 0) return new Map()

  const { data: rows, error } = await supabase
    .from('student_task_records')
    .select('student_id, class_task_id, status')
    .in('class_task_id', taskIds)
    .in('student_id', params.studentIds)
  if (error) throw new Error(error.message)

  const lessonByTask = new Map(tasks.map((task) => [task.id, task.lesson_label ?? '']))
  const counts = new Map<string, { missed: number; makeup: number; extra: number }>()
  for (const row of rows ?? []) {
    const lesson = lessonByTask.get(row.class_task_id) ?? ''
    const item = counts.get(row.student_id) ?? { missed: 0, makeup: 0, extra: 0 }
    if (lesson.startsWith(EXTRA_PREFIX)) {
      if (row.status === 'completed') item.extra += 1
    } else if (lesson.startsWith(MAKEUP_PREFIX)) {
      if (row.status === 'completed') item.makeup += 1
    } else if (row.status === 'missing') {
      item.missed += 1
    }
    counts.set(row.student_id, item)
  }

  // Business rule: 欠課未補 = 補習班退費 → 下期折抵（負數）；多上 = 加收（正數）。
  // 補課抵銷欠課，所以實際折抵的是「欠課 − 補課」。
  const result = new Map<string, { amount: number; note: string }>()
  for (const [studentId, item] of counts) {
    const unpaidMissed = Math.max(0, item.missed - item.makeup)
    if (!unpaidMissed && !item.extra) continue
    const amount = Math.round((item.extra - unpaidMissed) * params.rate)
    const parts: string[] = []
    if (unpaidMissed) parts.push(`欠課 ${unpaidMissed} 堂折抵`)
    if (item.extra) parts.push(`多上 ${item.extra} 堂加收`)
    if (item.makeup) parts.push(`補課 ${item.makeup} 堂`)
    result.set(studentId, { amount, note: `前期 ${parts.join('、')}` })
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
    tenantId: string
    seasonYear: number
    classType: string | null
    lines: PaymentBagLine[]
    drafts: Map<string, OpenBagStudentInput>
  },
): Promise<void> {
  const lineIds = params.lines.map((line) => line.id)
  if (lineIds.length === 0) return

  const { error: deleteSessionError } = await supabase
    .from('payment_bag_line_sessions')
    .delete()
    .in('line_id', lineIds)
  if (deleteSessionError) {
    if (isMissingTable(deleteSessionError)) return
    throw new Error(deleteSessionError.message)
  }

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

  if (sessionRows.length > 0) {
    const { error } = await supabase.from('payment_bag_line_sessions').insert(sessionRows)
    if (error && !isMissingTable(error)) throw new Error(error.message)
  }

  const { error: deleteItemError } = await supabase
    .from('payment_bag_line_items')
    .delete()
    .in('line_id', lineIds)
  if (deleteItemError) {
    if (isMissingTable(deleteItemError)) return
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
      label: '學費',
      amount: line.tuition_amount,
      sort_order: order,
      preset_key: null,
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
    if (error && !isMissingTable(error)) throw new Error(error.message)
  }
}

export async function openPaymentBag(input: OpenBagInput): Promise<PaymentBagWithLines> {
  const supabase = await createServiceClient()
  const season = await getSeasonOrThrow(supabase, input.seasonId)
  const cls = await getClassOrThrow(supabase, input.classId)
  const students = await getStudentsForClass(supabase, cls.id)
  const defaults = await getDefaultAttendanceRows(supabase, season.id, cls.id)
  const fallbackSessionCount = defaults.length || cls.system_sessions || 0
  const tuitionAmount = toNumber(input.tuitionAmount)
  const hasStudentDrafts = Boolean(input.selectedStudents?.length)
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
  const fallbackTeamDates = defaults
    .map((row) => dateToLegacyMd(row.default_date))
    .filter((value): value is string => Boolean(value))

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
      issue_status: '未發',
      payment_status: 'unpaid',
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

export async function updatePaymentBagLine(input: {
  lineId: string
  issueStatus?: string | null
  paymentStatus?: string | null
  paidAmount?: number | null
  handler?: string | null
  introCardReceived?: boolean
  note?: string | null
}): Promise<PaymentBagLine> {
  const supabase = await createServiceClient()
  const patch: Record<string, unknown> = {}
  if (input.issueStatus != null) patch.issue_status = input.issueStatus
  if (input.paymentStatus != null) patch.payment_status = input.paymentStatus
  if (input.paidAmount !== undefined) patch.paid_amount = input.paidAmount
  if (input.handler !== undefined) patch.handler = input.handler?.trim() || null
  if (input.introCardReceived !== undefined) patch.intro_card_received = input.introCardReceived
  if (input.note !== undefined) patch.note = input.note?.trim() || null

  const { data, error } = await supabase
    .from('payment_bag_lines')
    .update(patch)
    .eq('id', input.lineId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as PaymentBagLine
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
