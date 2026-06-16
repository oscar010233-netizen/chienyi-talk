'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ReceiptText,
  RefreshCw,
  Save,
} from 'lucide-react'
import {
  buildSeasonCode,
  compareDate,
  dateFromDateOnly,
  defaultSeasonDraft,
  formatDateMd,
  formatMoney,
  quarterDates,
} from '@/lib/billing/calendar'
import type { BillingQuarter } from '@/lib/billing/calendar'
import type { BillingClass, BillingState, BillingStudent, OpenBagStudentInput } from '@/lib/billing/types'

type TabKey = 'holidays' | 'open'
type Message = { tone: 'ok' | 'error' | 'idle'; text: string }
type FeeRowDraft = { preset?: string; note: string; amount: string }
type AdjustmentDraft = { name: string; amount: string }
type StudentDraft = {
  teamDates: string[]
  intensiveDates: string[]
  intensiveUnscheduled: string
  tuitionAmount: string
  bookRows: FeeRowDraft[]
  miscRows: FeeRowDraft[]
  discountRows: FeeRowDraft[]
  carryoverAmount: string
  carryoverNote: string
  adjustments: AdjustmentDraft[]
}

const buttonBase =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50'
const primaryButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50'
const inputClass =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/25'
const labelClass = 'mb-1 block text-[11px] font-medium text-muted-foreground'

const quarters: Array<{ value: BillingQuarter; label: string }> = [
  { value: 'Q1', label: 'Q1（1-3月）' },
  { value: 'Q2', label: 'Q2（4-6月）' },
  { value: 'Q3', label: 'Q3（7-9月）' },
  { value: 'Q4', label: 'Q4（10-12月）' },
]

const weekdays = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 7, label: '週日' },
]

const tuitionPresets = [
  { key: 'basic', label: '基礎 24 堂', sessions: 24, price: 10000 },
  { key: 'standard', label: '標準 24 堂', sessions: 24, price: 11000 },
  { key: 'advanced', label: '進階 24 堂', sessions: 24, price: 12000 },
]

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function studentName(student: BillingStudent | undefined | null) {
  if (!student) return ''
  return [student.chinese_name, student.english_name].filter(Boolean).join(' / ') || student.student_id.slice(0, 8)
}

function weekdayLabel(value: number | null | undefined) {
  return weekdays.find((day) => day.value === value)?.label ?? ''
}

function classTypeLabel(value: string | null | undefined) {
  if (value === 'double') return '雙團課'
  if (value === 'intensive') return '團課 + 強化'
  return '單堂'
}

function numberInput(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function seasonCalendarDays(startDate: string, endDate: string) {
  const s = dateFromDateOnly(startDate)
  const e = dateFromDateOnly(endDate)
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

function dateOnly(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isoWeekday(date: string) {
  const day = dateFromDateOnly(date).getUTCDay()
  return day === 0 ? 7 : day
}

function monthsForQuarter(quarter: BillingQuarter | string) {
  if (quarter === 'Q1') return [1, 2, 3]
  if (quarter === 'Q2') return [4, 5, 6]
  if (quarter === 'Q3') return [7, 8, 9]
  return [10, 11, 12]
}

function datesInMonth(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: last }, (_, index) => dateOnly(year, month, index + 1))
}

function buildMonthWeeks(year: number, month: number) {
  const dates = datesInMonth(year, month)
  const first = dateFromDateOnly(dates[0]).getUTCDay()
  const cells: Array<string | null> = Array(first).fill(null)
  cells.push(...dates)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: Array<Array<string | null>> = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  return weeks
}

function quarterWeekCount(year: number, quarter: BillingQuarter | string) {
  const months = monthsForQuarter(quarter)
  const start = dateFromDateOnly(dateOnly(year, months[0], 1))
  const end = dateFromDateOnly(dateOnly(year, months[2], new Date(Date.UTC(year, months[2], 0)).getUTCDate()))
  return Math.ceil((end.getTime() - start.getTime()) / 86400000 / 7)
}

function generateTeamDates(cls: BillingClass, season: NonNullable<BillingState['selectedSeason']>, holidays: Set<string>) {
  const dates: string[] = []
  for (const month of monthsForQuarter(season.quarter)) {
    for (const date of datesInMonth(season.year, month)) {
      const weekday = isoWeekday(date)
      const isClassDay = weekday === cls.weekday1 || (cls.class_type === 'double' && weekday === cls.weekday2)
      if (isClassDay && !holidays.has(date)) dates.push(date)
    }
  }
  return dates.sort(compareDate)
}

function emptyFeeRow(): FeeRowDraft {
  return { preset: 'custom', note: '', amount: '0' }
}

function cloneRows(rows: FeeRowDraft[]) {
  return rows.map((row) => ({ ...row }))
}

function normalizeRows(rows: FeeRowDraft[]) {
  return rows.map((row) => ({
    preset: row.preset || 'custom',
    note: row.note.trim(),
    amount: numberInput(row.amount),
  }))
}

function rowsTotal(rows: FeeRowDraft[]) {
  return rows.reduce((sum, row) => sum + numberInput(row.amount), 0)
}

function formatDateList(dates: string[]) {
  return dates.map(formatDateMd).join('　')
}

function studentDraftFromTemplate(teamDates: string[], intensiveSessions: number, template: FeeTemplateDraft): StudentDraft {
  return {
    teamDates: [...teamDates],
    intensiveDates: [],
    intensiveUnscheduled: String(intensiveSessions),
    tuitionAmount: template.tuitionAmount,
    bookRows: cloneRows(template.bookRows),
    miscRows: cloneRows(template.miscRows),
    discountRows: cloneRows(template.discountRows),
    carryoverAmount: '0',
    carryoverNote: '',
    adjustments: [],
  }
}

type FeeTemplateDraft = {
  tuitionPreset: string
  tuitionAmount: string
  bookRows: FeeRowDraft[]
  miscRows: FeeRowDraft[]
  discountRows: FeeRowDraft[]
}

interface BagListItem {
  id: string
  class_id: string
  season_id: string
  bag_code: string
  issue_date: string
  due_date: string | null
  status: string
  class_name: string
  class_code: string | null
  season_code: string
  year: number
  quarter: string
  line_count: number
}

export function InvoiceWorkflow({ initialState }: { initialState: BillingState }) {
  const router = useRouter()
  const defaultDraft = defaultSeasonDraft()
  const [state, setState] = useState(initialState)
  const [tab, setTab] = useState<TabKey>('open')
  const [classId, setClassId] = useState(initialState.selectedClass?.id ?? '')
  const [seasonId, setSeasonId] = useState(initialState.selectedSeason?.id ?? '')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<Message>({ tone: 'idle', text: '' })

  const selectedClass = state.selectedClass
  const selectedSeason = state.selectedSeason
  const globalHolidayDates = useMemo(
    () => new Set(state.holidays.filter((holiday) => !holiday.class_id).map((holiday) => holiday.holiday_date)),
    [state.holidays],
  )

  const [seasonForm, setSeasonForm] = useState({
    year: defaultDraft.year,
    quarter: defaultDraft.quarter,
    start_date: defaultDraft.start_date,
    end_date: defaultDraft.end_date,
  })
  const [holidayDraft, setHolidayDraft] = useState<Set<string>>(new Set())
  const [holidaySeasonId, setHolidaySeasonId] = useState(initialState.selectedSeason?.id ?? '')
  const [holidayDraftLoading, setHolidayDraftLoading] = useState(false)
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false)
  const [holidayCountBySeason, setHolidayCountBySeason] = useState<Record<string, number>>({})
  const [openMode, setOpenMode] = useState<'list' | 'workflow'>(
    initialState.selectedClass && initialState.selectedSeason ? 'workflow' : 'list'
  )
  const [bagList, setBagList] = useState<BagListItem[]>([])
  const [bagListLoading, setBagListLoading] = useState(false)
  const [openStep, setOpenStep] = useState(1)
  const [teamDates, setTeamDates] = useState<Set<string>>(new Set())
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set(state.students.map((student) => student.student_id)))
  const [intensiveSessions, setIntensiveSessions] = useState('0')
  const [feeTemplate, setFeeTemplate] = useState<FeeTemplateDraft>({
    tuitionPreset: 'custom',
    tuitionAmount: '0',
    bookRows: [emptyFeeRow()],
    miscRows: [emptyFeeRow()],
    discountRows: [emptyFeeRow()],
  })
  const [studentDrafts, setStudentDrafts] = useState<Record<string, StudentDraft>>({})
  const [currentStudentId, setCurrentStudentId] = useState(state.students[0]?.student_id ?? '')
  const [sessionMode, setSessionMode] = useState<'team' | 'intensive'>('team')
  const [bagForm, setBagForm] = useState({ issue_date: todayDate(), due_date: '', note: '' })

  async function load(nextClassId = classId, nextSeasonId = seasonId) {
    const search = new URLSearchParams()
    if (nextClassId) search.set('classId', nextClassId)
    if (nextSeasonId) search.set('seasonId', nextSeasonId)
    const response = await fetch(`/api/billing?${search.toString()}`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? '讀取失敗')
    setState(data)
    setClassId(data.selectedClass?.id ?? nextClassId)
    setSeasonId(data.selectedSeason?.id ?? nextSeasonId)
    router.replace(`/billing?${search.toString()}`, { scroll: false })
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? '操作失敗')
    return data
  }

  function run(action: () => Promise<void>, okText: string) {
    setMessage({ tone: 'idle', text: '' })
    startTransition(async () => {
      try {
        await action()
        await load()
        setMessage({ tone: 'ok', text: okText })
      } catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '操作失敗' })
      }
    })
  }

  useEffect(() => {
    if (!holidaySeasonId) return
    setHolidayDraftLoading(true)
    fetch(`/api/billing/holidays?seasonId=${holidaySeasonId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setHolidayDraft(new Set(data.dates ?? [])))
      .catch(() => setHolidayDraft(new Set()))
      .finally(() => setHolidayDraftLoading(false))
  }, [holidaySeasonId])

  useEffect(() => {
    if (tab !== 'holidays') return
    fetch('/api/billing/holidays', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setHolidayCountBySeason(data.counts ?? {}))
      .catch(() => {})
  }, [tab])

  useEffect(() => {
    if (!selectedClass || !selectedSeason) return
    const generated = generateTeamDates(selectedClass, selectedSeason, globalHolidayDates)
    setTeamDates(new Set(generated))
    setSelectedStudents(new Set(state.students.map((student) => student.student_id)))
    setCurrentStudentId(state.students[0]?.student_id ?? '')
    setIntensiveSessions(selectedClass.class_type === 'intensive'
      ? String(quarterWeekCount(selectedSeason.year, selectedSeason.quarter))
      : '0')
    setStudentDrafts({})
    setOpenStep(1)
  }, [selectedClass, selectedSeason, globalHolidayDates, state.students])

  function changeClassFilter(nextClassId: string) {
    setClassId(nextClassId)
    if (openMode === 'workflow') setOpenMode('list')
  }

  function changeSeasonFilter(nextSeasonId: string) {
    setSeasonId(nextSeasonId)
    if (openMode === 'workflow') setOpenMode('list')
  }

  function handleEnterWorkflow(cid = classId, sid = seasonId) {
    if (!cid || !sid || pending) return
    setClassId(cid)
    setSeasonId(sid)
    setMessage({ tone: 'idle', text: '' })
    startTransition(async () => {
      try {
        await load(cid, sid)
        setOpenMode('workflow')
      } catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '載入失敗' })
      }
    })
  }

  function handleSelectBag(bag: BagListItem) {
    handleEnterWorkflow(bag.class_id, bag.season_id)
  }

  useEffect(() => {
    if (tab !== 'open' || openMode !== 'list') return
    const params = new URLSearchParams()
    if (classId) params.set('classId', classId)
    if (seasonId) params.set('seasonId', seasonId)
    setBagListLoading(true)
    fetch(`/api/billing/bags?${params.toString()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setBagList(data.bags ?? []))
      .catch(() => setBagList([]))
      .finally(() => setBagListLoading(false))
  }, [tab, openMode, classId, seasonId])

  function changeQuarter(quarter: BillingQuarter) {
    const dates = quarterDates(Number(seasonForm.year), quarter)
    setSeasonForm((prev) => ({ ...prev, quarter, ...dates }))
  }

  function createSeason() {
    setMessage({ tone: 'idle', text: '' })
    startTransition(async () => {
      try {
        const data = await post({
          action: 'create-season',
          year: seasonForm.year,
          quarter: seasonForm.quarter,
          start_date: seasonForm.start_date,
          end_date: seasonForm.end_date,
          label: buildSeasonCode(seasonForm.year, seasonForm.quarter),
        })
        const newId: string = data.season.id
        setSeasonId(newId)
        setHolidaySeasonId(newId)
        setShowNewSeasonForm(false)
        await load()
        setMessage({ tone: 'ok', text: '季度已建立' })
      } catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '操作失敗' })
      }
    })
  }

  function saveHolidays() {
    if (!holidaySeasonId || pending) return
    setMessage({ tone: 'idle', text: '' })
    startTransition(async () => {
      try {
        await post({
          action: 'replace-holidays',
          season_id: holidaySeasonId,
          class_id: null,
          holiday_dates: Array.from(holidayDraft).sort(compareDate),
        })
        if (holidaySeasonId === seasonId) await load()
        setHolidayCountBySeason((prev) => ({ ...prev, [holidaySeasonId]: holidayDraft.size }))
        setMessage({ tone: 'ok', text: `假日已儲存（${holidayDraft.size} 天）` })
      } catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '操作失敗' })
      }
    })
  }

  function toggleHoliday(date: string) {
    setHolidayDraft((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function toggleTeamDate(date: string) {
    setTeamDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function toggleStudent(studentId: string) {
    setSelectedStudents((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function goFees() {
    if (!selectedStudents.size) return
    setOpenStep(2)
  }

  function applyTuitionPreset(key: string) {
    const preset = tuitionPresets.find((item) => item.key === key)
    const totalSessions = teamDates.size + (selectedClass?.class_type === 'intensive' ? numberInput(intensiveSessions) : 0)
    setFeeTemplate((prev) => ({
      ...prev,
      tuitionPreset: key,
      tuitionAmount: preset
        ? String(Math.round((preset.price / preset.sessions) * totalSessions / 10) * 10)
        : prev.tuitionAmount,
    }))
  }

  function goStudentAdjustments() {
    const baseTeamDates = Array.from(teamDates).sort(compareDate)
    const intensiveCount = selectedClass?.class_type === 'intensive' ? numberInput(intensiveSessions) : 0
    setStudentDrafts((prev) => {
      const next = { ...prev }
      for (const studentId of selectedStudents) {
        if (!next[studentId]) next[studentId] = studentDraftFromTemplate(baseTeamDates, intensiveCount, feeTemplate)
      }
      return next
    })
    const first = Array.from(selectedStudents)[0] ?? ''
    if (first) setCurrentStudentId(first)
    setOpenStep(3)
  }

  function updateCurrentDraft(mutator: (draft: StudentDraft) => StudentDraft) {
    if (!currentStudentId) return
    setStudentDrafts((prev) => {
      const fallback = studentDraftFromTemplate(
        Array.from(teamDates).sort(compareDate),
        selectedClass?.class_type === 'intensive' ? numberInput(intensiveSessions) : 0,
        feeTemplate,
      )
      return { ...prev, [currentStudentId]: mutator(prev[currentStudentId] ?? fallback) }
    })
  }

  function toggleStudentSession(date: string) {
    updateCurrentDraft((draft) => {
      if (sessionMode === 'team') {
        const team = new Set(draft.teamDates)
        if (team.has(date)) team.delete(date)
        else team.add(date)
        return { ...draft, teamDates: Array.from(team).sort(compareDate), intensiveDates: draft.intensiveDates.filter((item) => item !== date) }
      }
      const intensive = new Set(draft.intensiveDates)
      if (intensive.has(date)) intensive.delete(date)
      else intensive.add(date)
      return { ...draft, intensiveDates: Array.from(intensive).sort(compareDate), teamDates: draft.teamDates.filter((item) => item !== date) }
    })
  }

  function openBag() {
    const selected = Array.from(selectedStudents)
      .map((studentId): OpenBagStudentInput | null => {
        const draft = studentDrafts[studentId]
        if (!draft) return null
        return {
          studentId,
          teamDates: draft.teamDates,
          intensiveDates: draft.intensiveDates,
          intensiveUnscheduled: numberInput(draft.intensiveUnscheduled),
          tuitionAmount: numberInput(draft.tuitionAmount),
          bookRows: normalizeRows(draft.bookRows),
          miscRows: normalizeRows(draft.miscRows),
          discountRows: normalizeRows(draft.discountRows),
          carryoverAmount: numberInput(draft.carryoverAmount),
          carryoverNote: draft.carryoverNote,
          adjustments: draft.adjustments.map((row) => ({ name: row.name, amount: numberInput(row.amount) })),
        }
      })
      .filter((value): value is OpenBagStudentInput => Boolean(value))

    run(async () => {
      await post({
        action: 'open-bag',
        season_id: seasonId,
        class_id: classId,
        issue_date: bagForm.issue_date,
        due_date: bagForm.due_date || null,
        tuition_amount: numberInput(feeTemplate.tuitionAmount),
        note: bagForm.note,
        selected_students: selected,
      })
    }, '開袋完成')
  }

  const selectedStudentList = state.students.filter((student) => selectedStudents.has(student.student_id))
  const currentStudent = selectedStudentList.find((student) => student.student_id === currentStudentId)
  const currentDraft = currentStudentId ? studentDrafts[currentStudentId] : undefined
  const currentSubtotal = currentDraft
    ? numberInput(currentDraft.tuitionAmount) + rowsTotal(currentDraft.bookRows) + rowsTotal(currentDraft.miscRows) - rowsTotal(currentDraft.discountRows)
    : 0
  const currentTotal = currentDraft
    ? currentSubtotal + numberInput(currentDraft.carryoverAmount) + currentDraft.adjustments.reduce((sum, row) => sum + numberInput(row.amount), 0)
    : 0

  return (
    <div className="flex min-h-full flex-col bg-[#f6f7f9] text-foreground dark:bg-[#18181a]">
      <div className="mac-hairline sticky top-0 z-40 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Invoice</h1>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TabButton active={tab === 'holidays'} onClick={() => setTab('holidays')} icon={<CalendarDays size={14} />}>季度放假</TabButton>
          <TabButton active={tab === 'open'} onClick={() => setTab('open')} icon={<ReceiptText size={14} />}>開袋</TabButton>
        </div>
        {message.text && (
          <div className={`mt-2 text-xs ${message.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message.text}
          </div>
        )}
      </div>

      {tab === 'holidays' && (
        <main className="grid gap-4 p-4 md:grid-cols-[260px_1fr] md:p-6">
          {/* Left: season list + new season form */}
          <section className="rounded-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">季度列表</h2>
              <button
                type="button"
                onClick={() => setShowNewSeasonForm((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showNewSeasonForm ? '取消' : '＋ 新增'}
              </button>
            </div>
            <div className="max-h-[calc(100vh-240px)] overflow-auto">
              {state.seasons.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">尚無季度，請新增</div>
              )}
              {state.seasons.map((season) => {
                const active = season.id === holidaySeasonId
                const totalDays = seasonCalendarDays(season.start_date, season.end_date)
                const holidayCount = holidayCountBySeason[season.id] ?? 0
                return (
                  <button
                    key={season.id}
                    type="button"
                    onClick={() => setHolidaySeasonId(season.id)}
                    className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left text-sm transition-colors ${active ? 'bg-foreground text-background' : 'hover:bg-muted/60'}`}
                  >
                    <span className="font-medium">{season.year} {season.quarter}</span>
                    <span className={`text-right text-xs leading-snug ${active ? 'text-background/70' : 'text-muted-foreground'}`}>
                      <span className="block">共 {totalDays} 天</span>
                      <span className="block">放假 {holidayCount} 天</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {showNewSeasonForm && (
              <div className="border-t border-border p-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">新增季度</p>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className={labelClass}>年份</span>
                    <input
                      type="number"
                      value={seasonForm.year}
                      onChange={(event) => {
                        const year = Number(event.target.value) || defaultDraft.year
                        const dates = quarterDates(year, seasonForm.quarter)
                        setSeasonForm((prev) => ({ ...prev, year, ...dates }))
                      }}
                      className={`${inputClass} w-full`}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>季度</span>
                    <select value={seasonForm.quarter} onChange={(event) => changeQuarter(event.target.value as BillingQuarter)} className={`${inputClass} w-full`}>
                      {quarters.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>開始</span>
                    <input type="date" value={seasonForm.start_date} onChange={(event) => setSeasonForm((prev) => ({ ...prev, start_date: event.target.value }))} className={`${inputClass} w-full`} />
                  </label>
                  <label>
                    <span className={labelClass}>結束</span>
                    <input type="date" value={seasonForm.end_date} onChange={(event) => setSeasonForm((prev) => ({ ...prev, end_date: event.target.value }))} className={`${inputClass} w-full`} />
                  </label>
                </div>
                <button type="button" onClick={createSeason} disabled={pending} className={`${primaryButton} mt-3 w-full`}>
                  <Save size={14} />
                  建立季度
                </button>
              </div>
            )}
          </section>

          {/* Right: calendar for selected season */}
          {(() => {
            const editSeason = state.seasons.find((s) => s.id === holidaySeasonId)
            if (!editSeason) {
              return (
                <section className="grid min-h-48 place-items-center rounded-md border border-dashed border-border bg-background text-sm text-muted-foreground">
                  請從左側選擇季度
                </section>
              )
            }
            return (
              <section className="rounded-md border border-border bg-background p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{editSeason.year} 年 {editSeason.quarter} 假日</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{editSeason.start_date} ～ {editSeason.end_date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">已選 {holidayDraft.size} 天</span>
                    <button
                      type="button"
                      onClick={saveHolidays}
                      disabled={pending || holidayDraftLoading}
                      className={primaryButton}
                    >
                      {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      儲存假日
                    </button>
                  </div>
                </div>
                {holidayDraftLoading ? (
                  <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : (
                  <>
                    <QuarterCalendar
                      year={editSeason.year}
                      quarter={editSeason.quarter}
                      selected={holidayDraft}
                      holidays={holidayDraft}
                      onToggle={toggleHoliday}
                      mode="holiday"
                    />
                    {holidayDraft.size > 0 && (
                      <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
                        {formatDateList(Array.from(holidayDraft).sort(compareDate))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )
          })()}
        </main>
      )}

      {tab === 'open' && (
        <main className="grid gap-4 p-4 md:p-6">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={classId}
              onChange={(event) => changeClassFilter(event.target.value)}
              className={`${inputClass} min-w-44`}
            >
              <option value="">全部班級</option>
              {state.classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.class_name}</option>)}
            </select>
            <select
              value={seasonId}
              onChange={(event) => changeSeasonFilter(event.target.value)}
              className={`${inputClass} min-w-36`}
            >
              <option value="">全部季度</option>
              {state.seasons.map((season) => <option key={season.id} value={season.id}>{season.season_code}</option>)}
            </select>
            {openMode === 'workflow' && (
              <>
                <button type="button" onClick={() => setOpenMode('list')} className={buttonBase}>
                  <ChevronLeft size={14} />
                  返回列表
                </button>
                <button type="button" onClick={() => void load()} disabled={pending} className={buttonBase}>
                  <RefreshCw size={14} />
                  重新整理
                </button>
              </>
            )}
          </div>

          {/* List mode */}
          {openMode === 'list' && (
            <section className="rounded-md border border-border bg-background">
              {bagListLoading ? (
                <div className="grid min-h-48 place-items-center">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : bagList.length === 0 ? (
                <div className="grid min-h-48 place-items-center gap-3 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {classId && seasonId ? '這個班這個季度尚未開袋' : '尚無繳費袋'}
                    </p>
                    {classId && seasonId && (
                      <button
                        type="button"
                        onClick={() => handleEnterWorkflow()}
                        disabled={pending}
                        className={`${primaryButton} mt-3`}
                      >
                        {pending ? <Loader2 size={14} className="animate-spin" /> : <ReceiptText size={14} />}
                        開袋
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      {!classId && <th className="border-b border-border px-4 py-2.5 text-left font-medium">班級</th>}
                      {!seasonId && <th className="border-b border-border px-4 py-2.5 text-left font-medium">季度</th>}
                      <th className="border-b border-border px-4 py-2.5 text-left font-medium">袋號</th>
                      <th className="border-b border-border px-4 py-2.5 text-left font-medium">開袋日</th>
                      <th className="border-b border-border px-4 py-2.5 text-right font-medium">人數</th>
                      <th className="border-b border-border px-4 py-2.5 text-left font-medium">狀態</th>
                      <th className="border-b border-border" />
                    </tr>
                  </thead>
                  <tbody>
                    {bagList.map((bag) => (
                      <tr
                        key={bag.id}
                        onClick={() => handleSelectBag(bag)}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        {!classId && <td className="border-b border-border px-4 py-2.5 font-medium">{bag.class_name}</td>}
                        {!seasonId && <td className="border-b border-border px-4 py-2.5 text-muted-foreground">{bag.season_code}</td>}
                        <td className="border-b border-border px-4 py-2.5 font-mono text-xs">{bag.bag_code}</td>
                        <td className="border-b border-border px-4 py-2.5 text-muted-foreground">{bag.issue_date}</td>
                        <td className="border-b border-border px-4 py-2.5 text-right text-muted-foreground">{bag.line_count} 人</td>
                        <td className="border-b border-border px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${bag.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {bag.status === 'draft' ? '草稿' : bag.status}
                          </span>
                        </td>
                        <td className="border-b border-border px-4 py-2.5 text-right">
                          <span className="text-xs text-muted-foreground hover:text-foreground">查看 →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Workflow mode */}
          {openMode === 'workflow' && selectedClass && selectedSeason && (
          <>
          <section className="rounded-md border border-border bg-background p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <StepPill active={openStep === 1} done={openStep > 1}>1 日期 & 學生</StepPill>
              <StepPill active={openStep === 2} done={openStep > 2}>2 費用</StepPill>
              <StepPill active={openStep === 3}>3 個別調整</StepPill>
              <div className="ml-auto text-xs text-muted-foreground">
                {selectedClass.class_name} · {selectedSeason.season_code}
              </div>
            </div>

            {openStep === 1 && (
              <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{classTypeLabel(selectedClass.class_type)}</span>
                    <span>{[weekdayLabel(selectedClass.weekday1), selectedClass.class_type === 'double' ? weekdayLabel(selectedClass.weekday2) : ''].filter(Boolean).join(' + ')}</span>
                    <span>{teamDates.size} 堂團課</span>
                    {selectedClass.class_type === 'intensive' && (
                      <label className="ml-auto inline-flex items-center gap-2">
                        <span>精修</span>
                        <input
                          type="number"
                          min="0"
                          value={intensiveSessions}
                          onChange={(event) => setIntensiveSessions(event.target.value)}
                          className={`${inputClass} w-20`}
                        />
                      </label>
                    )}
                  </div>
                  <QuarterCalendar
                    year={selectedSeason.year}
                    quarter={selectedSeason.quarter}
                    selected={teamDates}
                    holidays={globalHolidayDates}
                    onToggle={toggleTeamDate}
                    mode="team"
                  />
                </div>
                <aside className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-medium">
                    <span>學生</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStudents(new Set(state.students.map((student) => student.student_id)))}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      全選
                    </button>
                  </div>
                  <div className="max-h-[520px] overflow-auto">
                    {state.students.map((student) => (
                      <label key={student.student_id} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.student_id)}
                          onChange={() => toggleStudent(student.student_id)}
                          className="accent-foreground"
                        />
                        <span>{studentName(student)}</span>
                      </label>
                    ))}
                    {state.students.length === 0 && <div className="p-4 text-sm text-muted-foreground">沒有學生</div>}
                  </div>
                </aside>
                <div className="xl:col-span-2 flex justify-end">
                  <button type="button" onClick={goFees} disabled={!selectedStudents.size} className={primaryButton}>
                    下一步
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {openStep === 2 && (
              <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                <section className="rounded-md border border-border bg-muted/20 p-4">
                  <div className="grid gap-2 text-sm">
                    <SummaryLine label="團課" value={`${teamDates.size} 堂`} />
                    {selectedClass.class_type === 'intensive' && <SummaryLine label="精修" value={`${numberInput(intensiveSessions)} 堂`} />}
                    <SummaryLine label="學生" value={`${selectedStudents.size} 人`} />
                    <SummaryLine label="小計" value={formatMoney(numberInput(feeTemplate.tuitionAmount) + rowsTotal(feeTemplate.bookRows) + rowsTotal(feeTemplate.miscRows) - rowsTotal(feeTemplate.discountRows))} />
                  </div>
                </section>
                <section className="grid gap-4">
                  <div className="grid gap-2 md:grid-cols-[1fr_160px]">
                    <label>
                      <span className={labelClass}>學費方案</span>
                      <select value={feeTemplate.tuitionPreset} onChange={(event) => applyTuitionPreset(event.target.value)} className={`${inputClass} w-full`}>
                        <option value="custom">自訂</option>
                        {tuitionPresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>學費</span>
                      <input value={feeTemplate.tuitionAmount} onChange={(event) => setFeeTemplate((prev) => ({ ...prev, tuitionAmount: event.target.value, tuitionPreset: 'custom' }))} className={`${inputClass} w-full`} />
                    </label>
                  </div>
                  <FeeRowsEditor title="教材費" rows={feeTemplate.bookRows} onChange={(bookRows) => setFeeTemplate((prev) => ({ ...prev, bookRows }))} />
                  <FeeRowsEditor title="雜費" rows={feeTemplate.miscRows} onChange={(miscRows) => setFeeTemplate((prev) => ({ ...prev, miscRows }))} />
                  <FeeRowsEditor title="折扣" rows={feeTemplate.discountRows} onChange={(discountRows) => setFeeTemplate((prev) => ({ ...prev, discountRows }))} />
                </section>
                <div className="lg:col-span-2 flex justify-between">
                  <button type="button" onClick={() => setOpenStep(1)} className={buttonBase}>
                    <ChevronLeft size={14} />
                    上一步
                  </button>
                  <button type="button" onClick={goStudentAdjustments} className={primaryButton}>
                    個別調整
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {openStep === 3 && currentDraft && (
              <div className="grid gap-4 xl:grid-cols-[220px_1fr_340px]">
                <aside className="rounded-md border border-border">
                  <div className="border-b border-border px-3 py-2 text-sm font-medium">學生</div>
                  <div className="max-h-[560px] overflow-auto">
                    {selectedStudentList.map((student, index) => (
                      <button
                        key={student.student_id}
                        type="button"
                        onClick={() => setCurrentStudentId(student.student_id)}
                        className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm ${currentStudentId === student.student_id ? 'bg-muted' : 'hover:bg-muted/60'}`}
                      >
                        <span className="w-6 text-xs text-muted-foreground">#{index + 1}</span>
                        <span>{studentName(student)}</span>
                      </button>
                    ))}
                  </div>
                </aside>
                <section>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{studentName(currentStudent)}</div>
                    {selectedClass.class_type === 'intensive' && (
                      <div className="ml-auto inline-flex rounded-md border border-border p-0.5">
                        <button type="button" onClick={() => setSessionMode('team')} className={`h-8 rounded px-3 text-xs ${sessionMode === 'team' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>團課</button>
                        <button type="button" onClick={() => setSessionMode('intensive')} className={`h-8 rounded px-3 text-xs ${sessionMode === 'intensive' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>精修</button>
                      </div>
                    )}
                    {selectedClass.class_type === 'intensive' && (
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <span>未排精修</span>
                        <input
                          value={currentDraft.intensiveUnscheduled}
                          onChange={(event) => updateCurrentDraft((draft) => ({ ...draft, intensiveUnscheduled: event.target.value }))}
                          className={`${inputClass} w-16`}
                        />
                      </label>
                    )}
                  </div>
                  <QuarterCalendar
                    year={selectedSeason.year}
                    quarter={selectedSeason.quarter}
                    selected={new Set(currentDraft.teamDates)}
                    secondary={new Set(currentDraft.intensiveDates)}
                    holidays={globalHolidayDates}
                    onToggle={toggleStudentSession}
                    mode={sessionMode}
                  />
                  <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-xs leading-6">
                    <div>團課 {currentDraft.teamDates.length} 堂：{formatDateList(currentDraft.teamDates)}</div>
                    {selectedClass.class_type === 'intensive' && <div>精修 {currentDraft.intensiveDates.length + numberInput(currentDraft.intensiveUnscheduled)} 堂：{formatDateList(currentDraft.intensiveDates)}</div>}
                  </div>
                </section>
                <aside className="grid gap-4">
                  <label>
                    <span className={labelClass}>學費</span>
                    <input value={currentDraft.tuitionAmount} onChange={(event) => updateCurrentDraft((draft) => ({ ...draft, tuitionAmount: event.target.value }))} className={`${inputClass} w-full`} />
                  </label>
                  <FeeRowsEditor title="教材費" rows={currentDraft.bookRows} onChange={(bookRows) => updateCurrentDraft((draft) => ({ ...draft, bookRows }))} compact />
                  <FeeRowsEditor title="雜費" rows={currentDraft.miscRows} onChange={(miscRows) => updateCurrentDraft((draft) => ({ ...draft, miscRows }))} compact />
                  <FeeRowsEditor title="折扣" rows={currentDraft.discountRows} onChange={(discountRows) => updateCurrentDraft((draft) => ({ ...draft, discountRows }))} compact />
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <label>
                      <span className={labelClass}>結轉</span>
                      <input value={currentDraft.carryoverAmount} onChange={(event) => updateCurrentDraft((draft) => ({ ...draft, carryoverAmount: event.target.value }))} className={`${inputClass} w-full`} />
                    </label>
                    <label>
                      <span className={labelClass}>結轉備註</span>
                      <input value={currentDraft.carryoverNote} onChange={(event) => updateCurrentDraft((draft) => ({ ...draft, carryoverNote: event.target.value }))} className={`${inputClass} w-full`} />
                    </label>
                  </div>
                  <AdjustmentEditor rows={currentDraft.adjustments} onChange={(adjustments) => updateCurrentDraft((draft) => ({ ...draft, adjustments }))} />
                  <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <SummaryLine label="費用小計" value={formatMoney(currentSubtotal)} />
                    <SummaryLine label="個別總額" value={formatMoney(currentTotal)} />
                  </div>
                </aside>
                <div className="xl:col-span-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpenStep(2)} className={buttonBase}>
                    <ChevronLeft size={14} />
                    上一步
                  </button>
                  <label className="ml-auto">
                    <span className={labelClass}>開袋日</span>
                    <input type="date" value={bagForm.issue_date} onChange={(event) => setBagForm((prev) => ({ ...prev, issue_date: event.target.value }))} className={inputClass} />
                  </label>
                  <label>
                    <span className={labelClass}>繳費期限</span>
                    <input type="date" value={bagForm.due_date} onChange={(event) => setBagForm((prev) => ({ ...prev, due_date: event.target.value }))} className={inputClass} />
                  </label>
                  <button type="button" onClick={openBag} disabled={pending} className={primaryButton}>
                    {pending ? <Loader2 size={14} className="animate-spin" /> : <ReceiptText size={14} />}
                    送出開袋
                  </button>
                </div>
              </div>
            )}
          </section>

          <BagPreview state={state} />
          </>
          )}
        </main>
      )}
    </div>
  )
}

function TabButton({ active, children, icon, onClick }: { active: boolean; children: ReactNode; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${active ? 'bg-foreground text-background' : 'border border-border bg-background text-foreground/75 hover:bg-muted'}`}
    >
      {icon}
      {children}
    </button>
  )
}

function StepPill({ active, done, children }: { active?: boolean; done?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium ${active ? 'border-foreground bg-foreground text-background' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-border text-muted-foreground'}`}>
      {done ? <Check size={13} /> : null}
      {children}
    </span>
  )
}

function QuarterCalendar({
  year,
  quarter,
  selected,
  secondary,
  holidays,
  onToggle,
  mode,
}: {
  year: number
  quarter: string
  selected: Set<string>
  secondary?: Set<string>
  holidays: Set<string>
  onToggle: (date: string) => void
  mode: 'holiday' | 'team' | 'intensive'
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {monthsForQuarter(quarter).map((month) => (
        <div key={month} className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 text-center text-sm font-medium">{year} 年 {month} 月</div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          {buildMonthWeeks(year, month).map((week, index) => (
            <div key={index} className="grid grid-cols-7 gap-1">
              {week.map((date, cellIndex) => {
                if (!date) return <span key={cellIndex} className="aspect-square" />
                const isSelected = selected.has(date)
                const isSecondary = secondary?.has(date) ?? false
                const isHoliday = holidays.has(date)
                const tone = mode === 'holiday'
                  ? isSelected ? 'bg-red-500 text-white' : 'hover:bg-red-50'
                  : isSelected ? 'bg-blue-600 text-white'
                    : isSecondary ? 'bg-emerald-600 text-white'
                      : isHoliday ? 'text-muted-foreground'
                        : 'hover:bg-muted'
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onToggle(date)}
                    className={`relative aspect-square rounded-full text-xs font-medium transition-colors ${tone}`}
                    title={formatDateMd(date)}
                  >
                    {Number(date.slice(8, 10))}
                    {isHoliday && mode !== 'holiday' && <span className="absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-red-500" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FeeRowsEditor({ title, rows, onChange, compact }: {
  title: string
  rows: FeeRowDraft[]
  onChange: (rows: FeeRowDraft[]) => void
  compact?: boolean
}) {
  function update(index: number, patch: Partial<FeeRowDraft>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  }
  return (
    <section className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        <button type="button" onClick={() => onChange([...rows, emptyFeeRow()])} className="text-xs text-muted-foreground hover:text-foreground">新增</button>
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={index} className={`grid gap-2 ${compact ? 'grid-cols-[1fr_82px_28px]' : 'grid-cols-[1fr_120px_32px]'}`}>
            <input value={row.note} onChange={(event) => update(index, { note: event.target.value })} className={inputClass} />
            <input value={row.amount} onChange={(event) => update(index, { amount: event.target.value })} className={inputClass} />
            <button type="button" onClick={() => onChange(rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyFeeRow()])} className="h-9 rounded-md border border-border text-muted-foreground hover:bg-muted">×</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function AdjustmentEditor({ rows, onChange }: { rows: AdjustmentDraft[]; onChange: (rows: AdjustmentDraft[]) => void }) {
  return (
    <section className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">個別調整</h3>
        <button type="button" onClick={() => onChange([...rows, { name: '', amount: '0' }])} className="text-xs text-muted-foreground hover:text-foreground">新增</button>
      </div>
      <div className="grid gap-2">
        {rows.length === 0 && <div className="text-xs text-muted-foreground">無</div>}
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_82px_28px] gap-2">
            <input value={row.name} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className={inputClass} />
            <input value={row.amount} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} className={inputClass} />
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} className="h-9 rounded-md border border-border text-muted-foreground hover:bg-muted">×</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function SummaryLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function BagPreview({ state }: { state: BillingState }) {
  const bag = state.activeBag
  if (!bag) {
    return (
      <section className="grid min-h-48 place-items-center rounded-md border border-dashed border-border bg-background text-sm text-muted-foreground">
        尚未開袋
      </section>
    )
  }
  const total = bag.lines.reduce((sum, line) => sum + Number(line.total_amount ?? 0), 0)
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <ReceiptText size={16} />
        <h2 className="text-sm font-semibold">{bag.bag_code}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{bag.lines.length} 人 · {formatMoney(total)}</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left">學生</th>
              <th className="border-b border-border px-3 py-2 text-right">堂數</th>
              <th className="border-b border-border px-3 py-2 text-right">學費</th>
              <th className="border-b border-border px-3 py-2 text-right">教材</th>
              <th className="border-b border-border px-3 py-2 text-right">雜費</th>
              <th className="border-b border-border px-3 py-2 text-right">折扣</th>
              <th className="border-b border-border px-3 py-2 text-right">結轉/調整</th>
              <th className="border-b border-border px-3 py-2 text-right">總額</th>
            </tr>
          </thead>
          <tbody>
            {bag.lines.map((line) => (
              <tr key={line.id}>
                <td className="border-b border-border px-3 py-2">{studentName(line.student)}</td>
                <td className="border-b border-border px-3 py-2 text-right">{line.session_count}</td>
                <td className="border-b border-border px-3 py-2 text-right">{formatMoney(line.tuition_amount)}</td>
                <td className="border-b border-border px-3 py-2 text-right">{formatMoney(line.book_fee)}</td>
                <td className="border-b border-border px-3 py-2 text-right">{formatMoney(line.misc_fee)}</td>
                <td className="border-b border-border px-3 py-2 text-right">{formatMoney(line.discount_amount)}</td>
                <td className="border-b border-border px-3 py-2 text-right">{formatMoney(Number(line.carryover_amount) + Number(line.adjustment_amount))}</td>
                <td className="border-b border-border px-3 py-2 text-right font-medium">{formatMoney(line.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
