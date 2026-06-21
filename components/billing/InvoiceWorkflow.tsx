'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  ReceiptText,
  RefreshCw,
  Save,
  Trash2,
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
import type {
  BillingClass,
  BillingFeeCatalogItem,
  BillingFeeCategory,
  BillingState,
  BillingStudent,
  OpenBagStudentInput,
} from '@/lib/billing/types'

type TabKey = 'holidays' | 'open' | 'fees'
type Message = { tone: 'ok' | 'error' | 'idle'; text: string }
type FeeRowDraft = { preset?: string; note: string; amount: string }
type AdjustmentDraft = { name: string; amount: string }
type StudentDraft = {
  teamDates: string[]
  intensiveDates: string[]
  intensiveUnscheduled: string
  tuitionAmount: string
  tuitionPresetId: string     // '' when manually entered
  tuitionPresetLabel: string  // '' when manually entered
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

const feeCategoryLabels: Record<BillingFeeCategory, string> = {
  tuition: '學費費率',
  book: '教材費',
  misc: '雜費',
  discount: '折扣',
}

const FEE_CATALOG_TABS: BillingFeeCategory[] = ['tuition', 'book', 'discount', 'misc']

function computeTuitionFromPreset(preset: BillingFeeCatalogItem, sessions: number): number {
  if (!preset.base_sessions || preset.base_sessions <= 0) return preset.amount
  const rate = Math.round(preset.amount / preset.base_sessions)
  return Math.round(sessions * rate / 10) * 10
}

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

// Returns every occurrence of weekday1 in the quarter, holidays included.
// Used to pre-populate intensiveWeeks (one 強化 slot per week).
function generateAllIntensiveWeekDates(cls: BillingClass, season: NonNullable<BillingState['selectedSeason']>): string[] {
  if (!cls.weekday1) return []
  const dates: string[] = []
  for (const month of monthsForQuarter(season.quarter)) {
    for (const date of datesInMonth(season.year, month)) {
      if (isoWeekday(date) === cls.weekday1) dates.push(date)
    }
  }
  return dates.sort(compareDate)
}

function emptyFeeRow(): FeeRowDraft {
  return { preset: 'custom', note: '', amount: '0' }
}

function emptyFeeTemplate(): FeeTemplateDraft {
  return {
    tuitionAmount: '0',
    tuitionPresetId: '',
    tuitionPresetLabel: '',
    bookRows: [emptyFeeRow()],
    miscRows: [emptyFeeRow()],
    discountRows: [emptyFeeRow()],
  }
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
    tuitionPresetId: template.tuitionPresetId,
    tuitionPresetLabel: template.tuitionPresetLabel,
    bookRows: cloneRows(template.bookRows),
    miscRows: cloneRows(template.miscRows),
    discountRows: cloneRows(template.discountRows),
    carryoverAmount: '0',
    carryoverNote: '',
    adjustments: [],
  }
}

type FeeTemplateDraft = {
  tuitionAmount: string
  tuitionPresetId: string     // catalog item id; '' if manually entered or not yet selected
  tuitionPresetLabel: string  // catalog label when preset selected; '' if manual
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
    () => new Set(state.holidays),
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
  const [intensiveWeeks, setIntensiveWeeks] = useState<Set<string>>(new Set())
  const [feeTemplate, setFeeTemplate] = useState<FeeTemplateDraft>(emptyFeeTemplate)
  const [feeCatalog, setFeeCatalog] = useState<BillingFeeCatalogItem[]>([])
  const [feeCatalogBusy, setFeeCatalogBusy] = useState(false)
  const [feeCatalogTab, setFeeCatalogTab] = useState<BillingFeeCategory>('tuition')
  const [editingFeeItemId, setEditingFeeItemId] = useState('')
  const [feeItemLabel, setFeeItemLabel] = useState('')
  const [feeItemAmount, setFeeItemAmount] = useState('0')
  const [feeItemBaseSessions, setFeeItemBaseSessions] = useState('24')
  const [studentDrafts, setStudentDrafts] = useState<Record<string, StudentDraft>>({})
  const [currentStudentId, setCurrentStudentId] = useState(state.students[0]?.student_id ?? '')
  const [sessionMode, setSessionMode] = useState<'team' | 'intensive'>('team')
  const [bagForm, setBagForm] = useState({ issue_date: todayDate(), due_date: '', note: '' })
  const [prevRefundMap, setPrevRefundMap] = useState<Map<string, { sessions: number; rate: number; amount: number; note: string }>>(new Map())
  const [prevRefundLoading, setPrevRefundLoading] = useState(false)
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
    setIntensiveWeeks(
      selectedClass.class_type === 'intensive'
        ? new Set(generateAllIntensiveWeekDates(selectedClass, selectedSeason))
        : new Set()
    )
    setStudentDrafts({})
    setOpenStep(1)
  }, [selectedClass, selectedSeason, globalHolidayDates, state.students])

  useEffect(() => {
    let cancelled = false
    setFeeCatalogBusy(true)
    fetch('/api/billing/fee-items', { cache: 'no-store' })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error ?? '讀取費用資料庫失敗')
        if (cancelled) return
        setFeeCatalog((data.items ?? []) as BillingFeeCatalogItem[])
      })
      .catch((error) => {
        if (!cancelled) setMessage({ tone: 'error', text: error instanceof Error ? error.message : '讀取費用資料庫失敗' })
      })
      .finally(() => {
        if (!cancelled) setFeeCatalogBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const actualSessionCount = teamDates.size + (selectedClass?.class_type === 'intensive' ? intensiveWeeks.size : 0)

  // Reactive tuition recalculation — single source: actualSessionCount (defined in render body).
  // Deps include all variables that compose actualSessionCount; closure captures the latest value.
  // Only fires when a valid rate preset is active; manual edits clear tuitionPresetId.
  useEffect(() => {
    if (!feeTemplate.tuitionPresetId) return
    const preset = feeCatalog.find((item) => item.id === feeTemplate.tuitionPresetId)
    if (!preset?.base_sessions) return
    setFeeTemplate((prev) => ({
      ...prev,
      tuitionAmount: String(computeTuitionFromPreset(preset, actualSessionCount)),
    }))
  }, [actualSessionCount, teamDates, intensiveWeeks, selectedClass?.class_type, feeTemplate.tuitionPresetId, feeCatalog])

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

  async function refreshFeeCatalog() {
    const response = await fetch('/api/billing/fee-items', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? '讀取費用資料庫失敗')
    setFeeCatalog((data.items ?? []) as BillingFeeCatalogItem[])
  }

  function beginNewFeeItem() {
    setEditingFeeItemId('')
    setFeeItemLabel('')
    setFeeItemAmount('0')
    setFeeItemBaseSessions('24')
  }

  async function saveFeeItem() {
    if (!feeItemLabel.trim()) {
      setMessage({ tone: 'error', text: '請輸入費用名稱' })
      return
    }
    if (feeCatalogTab === 'tuition') {
      const sessions = numberInput(feeItemBaseSessions)
      if (!Number.isInteger(sessions) || sessions <= 0) {
        setMessage({ tone: 'error', text: '基準堂數必須為正整數（23.5、0、負數均不接受）' })
        return
      }
      if (numberInput(feeItemAmount) <= 0) {
        setMessage({ tone: 'error', text: '基準費用必須大於 0' })
        return
      }
    }
    setFeeCatalogBusy(true)
    setMessage({ tone: 'idle', text: '' })
    try {
      const baseSessions = feeCatalogTab === 'tuition' ? (numberInput(feeItemBaseSessions) || null) : null
      const response = await fetch('/api/billing/fee-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFeeItemId || null,
          category: feeCatalogTab,
          label: feeItemLabel.trim(),
          amount: numberInput(feeItemAmount),
          base_sessions: baseSessions,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '儲存費用項目失敗')
      await refreshFeeCatalog()
      beginNewFeeItem()
      setMessage({ tone: 'ok', text: editingFeeItemId ? '費用項目已更新' : '費用項目已加入資料庫' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '儲存費用項目失敗' })
    } finally {
      setFeeCatalogBusy(false)
    }
  }

  function editFeeItem(item: BillingFeeCatalogItem) {
    setEditingFeeItemId(item.id)
    setFeeItemLabel(item.label)
    setFeeItemAmount(String(item.amount))
    // null → empty string; do NOT guess 24 for legacy items
    setFeeItemBaseSessions(item.base_sessions != null ? String(item.base_sessions) : '')
  }

  async function deleteFeeItem(item: BillingFeeCatalogItem) {
    if (!window.confirm(`確定從費用資料庫刪除「${item.label}」？`)) return
    setFeeCatalogBusy(true)
    setMessage({ tone: 'idle', text: '' })
    try {
      const response = await fetch(`/api/billing/fee-items?id=${item.id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '刪除費用項目失敗')
      if (editingFeeItemId === item.id) beginNewFeeItem()
      await refreshFeeCatalog()
      setMessage({ tone: 'ok', text: '費用項目已刪除' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '刪除費用項目失敗' })
    } finally {
      setFeeCatalogBusy(false)
    }
  }

  function goFees() {
    if (!selectedStudents.size || !selectedClass || !selectedSeason) return
    setOpenStep(2)

    setPrevRefundLoading(true)
    fetch(`/api/billing/attendance-refund?class_id=${selectedClass.id}&season_id=${selectedSeason.id}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { refunds?: Array<{ student_id: string; refund_sessions: number; rate_per_session: number; refund_amount: number; carryover_note: string }> }) => {
        const map = new Map<string, { sessions: number; rate: number; amount: number; note: string }>()
        for (const r of data.refunds ?? []) {
          map.set(r.student_id, { sessions: r.refund_sessions, rate: r.rate_per_session, amount: r.refund_amount, note: r.carryover_note })
        }
        setPrevRefundMap(map)
      })
      .catch(() => setPrevRefundMap(new Map()))
      .finally(() => setPrevRefundLoading(false))
  }

  function goStudentAdjustments() {
    const baseTeamDates = Array.from(teamDates).sort(compareDate)
    const intensiveCount = selectedClass?.class_type === 'intensive' ? intensiveWeeks.size : 0
    setStudentDrafts((prev) => {
      const next = { ...prev }
      for (const studentId of selectedStudents) {
        if (!next[studentId]) {
          const draft = studentDraftFromTemplate(baseTeamDates, intensiveCount, feeTemplate)
          const refund = prevRefundMap.get(studentId)
          if (refund) {
            draft.carryoverAmount = String(-refund.amount)
            draft.carryoverNote = refund.note
          }
          next[studentId] = draft
        }
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
        selectedClass?.class_type === 'intensive' ? intensiveWeeks.size : 0,
        feeTemplate,
      )
      return { ...prev, [currentStudentId]: mutator(prev[currentStudentId] ?? fallback) }
    })
  }

  function toggleIntensiveWeek(date: string) {
    setIntensiveWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
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
          tuitionPresetKey: draft.tuitionPresetId || null,
          tuitionLabel: draft.tuitionPresetLabel || null,
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
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mac-glass mac-hairline sticky top-0 z-40 border-b px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">帳務</h1>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <TabButton active={tab === 'holidays'} onClick={() => setTab('holidays')} icon={<CalendarDays size={14} />}>季度放假</TabButton>
            <TabButton active={tab === 'open'} onClick={() => setTab('open')} icon={<ReceiptText size={14} />}>開袋</TabButton>
            <TabButton active={tab === 'fees'} onClick={() => setTab('fees')} icon={<Database size={14} />}>費用項目庫</TabButton>
          </div>
        </div>
        {message.text && (
          <p className={`mt-1.5 text-xs ${message.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message.text}
          </p>
        )}
      </div>

      {tab === 'holidays' && (
        <main className="grid gap-4 p-4 md:grid-cols-[260px_1fr] md:p-6">
          {/* Left: season list + new season form */}
          <section className="overflow-hidden rounded-lg border border-border bg-background">
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
                <section className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground">
                  請從左側選擇季度
                </section>
              )
            }
            return (
              <section className="rounded-lg border border-border bg-background p-4">
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


      {tab === 'fees' && (
        <main className="grid gap-4 p-4 md:p-6">
          <section className="overflow-hidden rounded-lg border border-border bg-background">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">費用項目庫</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">集中管理開袋時可重複選用的費用項目。</p>
              </div>
              {feeCatalogBusy && <Loader2 size={15} className="animate-spin text-muted-foreground" />}
            </div>

            {/* Sub-tabs */}
            <div className="flex overflow-x-auto border-b border-border">
              {FEE_CATALOG_TABS.map((cat) => {
                const count = feeCatalog.filter((item) => item.category === cat).length
                const isActive = feeCatalogTab === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { setFeeCatalogTab(cat); beginNewFeeItem() }}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {feeCategoryLabels[cat]}
                    {count > 0 && (
                      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
                        isActive ? 'bg-foreground/10 text-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Add / Edit form */}
            <div className="border-b border-border bg-muted/20 p-4">
              {feeCatalogTab === 'tuition' ? (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(140px,1fr)_96px_130px_80px]">
                    <div className="col-span-2 md:col-span-1">
                      <span className={labelClass}>級別名稱</span>
                      <input
                        value={feeItemLabel}
                        onChange={(event) => setFeeItemLabel(event.target.value)}
                        placeholder="例：初級、中級A"
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>基準堂數</span>
                      <input
                        value={feeItemBaseSessions}
                        onChange={(event) => setFeeItemBaseSessions(event.target.value)}
                        inputMode="numeric"
                        placeholder={editingFeeItemId && feeItemBaseSessions === '' ? '請輸入真實基準堂數' : '例：24'}
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>基準費用</span>
                      <input
                        value={feeItemAmount}
                        onChange={(event) => setFeeItemAmount(event.target.value)}
                        inputMode="numeric"
                        placeholder="10000"
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>單堂費</span>
                      <div className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                        {numberInput(feeItemBaseSessions) > 0
                          ? `${formatMoney(Math.round(numberInput(feeItemAmount) / numberInput(feeItemBaseSessions)))} 元`
                          : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {editingFeeItemId && (
                      <button type="button" onClick={beginNewFeeItem} className={buttonBase} disabled={feeCatalogBusy}>取消</button>
                    )}
                    <button type="button" onClick={saveFeeItem} className={primaryButton} disabled={feeCatalogBusy || !feeItemLabel.trim()}>
                      <Save size={13} />
                      {editingFeeItemId ? '更新費率' : '新增費率'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_140px_auto]">
                  <input
                    value={feeItemLabel}
                    onChange={(event) => setFeeItemLabel(event.target.value)}
                    placeholder={`${feeCategoryLabels[feeCatalogTab]}名稱`}
                    className={inputClass}
                  />
                  <input
                    value={feeItemAmount}
                    onChange={(event) => setFeeItemAmount(event.target.value)}
                    inputMode="numeric"
                    placeholder="金額"
                    className={inputClass}
                  />
                  <div className="flex items-center gap-1.5">
                    {editingFeeItemId && (
                      <button type="button" onClick={beginNewFeeItem} className={buttonBase} disabled={feeCatalogBusy}>取消</button>
                    )}
                    <button type="button" onClick={saveFeeItem} className={primaryButton} disabled={feeCatalogBusy || !feeItemLabel.trim()}>
                      <Save size={13} />
                      {editingFeeItemId ? '更新' : '新增項目'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Legacy tuition warning banner */}
            {feeCatalogTab === 'tuition' && (() => {
              const legacy = feeCatalog.filter((item) => item.category === 'tuition' && !item.base_sessions)
              if (legacy.length === 0) return null
              return (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-700">
                    以下 {legacy.length} 筆學費資料尚未設定基準堂數，無法在開袋時套用費率計算，請編輯補設定：
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-amber-600">
                    {legacy.map((item) => <li key={item.id}>{item.label}（{formatMoney(item.amount)} 元）</li>)}
                  </ul>
                </div>
              )
            })()}

            {/* Item list */}
            {(() => {
              const items = feeCatalog.filter((item) => item.category === feeCatalogTab)
              if (items.length === 0 && !feeCatalogBusy) {
                return (
                  <div className="grid min-h-48 place-items-center px-4 py-8 text-center">
                    <div>
                      <Database size={22} className="mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">目前沒有{feeCategoryLabels[feeCatalogTab]}項目</p>
                      <p className="mt-1 text-xs text-muted-foreground">使用上方表單建立第一筆。</p>
                    </div>
                  </div>
                )
              }
              return (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          {feeCatalogTab === 'tuition' ? (
                            <>
                              <th className="border-b border-border px-4 py-2.5 text-left font-medium">級別名稱</th>
                              <th className="border-b border-border px-4 py-2.5 text-right font-medium">基準堂數</th>
                              <th className="border-b border-border px-4 py-2.5 text-right font-medium">基準費用</th>
                              <th className="border-b border-border px-4 py-2.5 text-right font-medium">單堂費</th>
                            </>
                          ) : (
                            <>
                              <th className="border-b border-border px-4 py-2.5 text-left font-medium">名稱</th>
                              <th className="border-b border-border px-4 py-2.5 text-right font-medium">金額</th>
                            </>
                          )}
                          <th className="border-b border-border px-4 py-2.5 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="transition-colors hover:bg-muted/30">
                            {feeCatalogTab === 'tuition' ? (
                              <>
                                <td className="border-b border-border px-4 py-3">
                                  <span className="font-medium">{item.label}</span>
                                  {!item.base_sessions && (
                                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">尚未設定基準堂數</span>
                                  )}
                                </td>
                                <td className="border-b border-border px-4 py-3 text-right tabular-nums">{item.base_sessions ?? <span className="text-amber-500">—</span>}</td>
                                <td className="border-b border-border px-4 py-3 text-right tabular-nums">{formatMoney(item.amount)}</td>
                                <td className="border-b border-border px-4 py-3 text-right tabular-nums text-muted-foreground">
                                  {item.base_sessions ? formatMoney(Math.round(item.amount / item.base_sessions)) : <span className="text-amber-500">—</span>}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="border-b border-border px-4 py-3 font-medium">{item.label}</td>
                                <td className="border-b border-border px-4 py-3 text-right tabular-nums">{formatMoney(item.amount)}</td>
                              </>
                            )}
                            <td className="border-b border-border px-4 py-3">
                              <div className="flex justify-end gap-1.5">
                                <button type="button" onClick={() => editFeeItem(item)} className={buttonBase} disabled={feeCatalogBusy}>編輯</button>
                                <button
                                  type="button"
                                  onClick={() => deleteFeeItem(item)}
                                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
                                  disabled={feeCatalogBusy}
                                >
                                  <Trash2 size={12} />
                                  刪除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="divide-y divide-border md:hidden">
                    {items.map((item) => (
                      <div key={item.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-medium">{item.label}</p>
                              {feeCatalogTab === 'tuition' && !item.base_sessions && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">尚未設定基準堂數</span>
                              )}
                            </div>
                            {feeCatalogTab === 'tuition' ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.base_sessions
                                  ? `${item.base_sessions}堂 / 基準 ${formatMoney(item.amount)} 元 → ${formatMoney(Math.round(item.amount / item.base_sessions))} 元/堂`
                                  : `基準費用 ${formatMoney(item.amount)} 元（需補設定堂數）`}
                              </p>
                            ) : (
                              <p className="mt-0.5 tabular-nums text-xs text-muted-foreground">{formatMoney(item.amount)}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button type="button" onClick={() => editFeeItem(item)} className={buttonBase} disabled={feeCatalogBusy}>編輯</button>
                            <button
                              type="button"
                              onClick={() => deleteFeeItem(item)}
                              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
                              disabled={feeCatalogBusy}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </section>
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
            <section className="overflow-hidden rounded-lg border border-border bg-background">
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
          <section className="rounded-lg border border-border bg-background p-4">
            <div className="mb-6">
              <WizardSteps
                current={openStep}
                steps={['日期 & 學生', '費用', '個別調整']}
              />
              <div className="mt-2 text-right text-xs text-muted-foreground">
                {selectedClass.class_name} · {selectedSeason.season_code}
              </div>
            </div>

            {openStep === 1 && (
              <div className="grid gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{classTypeLabel(selectedClass.class_type)}</span>
                    <span>{[weekdayLabel(selectedClass.weekday1), selectedClass.class_type === 'double' ? weekdayLabel(selectedClass.weekday2) : ''].filter(Boolean).join(' + ')}</span>
                    <span>{teamDates.size} 堂團課</span>
                    <span className="flex-1" />
                    {selectedClass.class_type === 'intensive' && (
                      <span>強化課 {intensiveWeeks.size} 堂</span>
                    )}
                  </div>
                  <QuarterCalendar
                    year={selectedSeason.year}
                    quarter={selectedSeason.quarter}
                    selected={teamDates}
                    holidays={globalHolidayDates}
                    onToggle={toggleTeamDate}
                    mode="team"
                    intensiveWeeks={selectedClass.class_type === 'intensive' ? intensiveWeeks : undefined}
                    teamWeekday={selectedClass.class_type === 'intensive' ? (selectedClass.weekday1 ?? undefined) : undefined}
                    onToggleIntensiveWeek={selectedClass.class_type === 'intensive' ? toggleIntensiveWeek : undefined}
                  />
                </div>
                <aside className="overflow-hidden rounded-lg border border-border">
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
                <div className="md:col-span-2 flex justify-end">
                  <button type="button" onClick={goFees} disabled={!selectedStudents.size} className={primaryButton}>
                    下一步
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {openStep === 2 && (
              <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                <section className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid gap-2 text-sm">
                    <SummaryLine label="團課" value={`${teamDates.size} 堂`} />
                    {selectedClass.class_type === 'intensive' && <SummaryLine label="強化課" value={`${intensiveWeeks.size} 堂`} />}
                    <SummaryLine label="學生" value={`${selectedStudents.size} 人`} />
                    <SummaryLine label="小計" value={formatMoney(numberInput(feeTemplate.tuitionAmount) + rowsTotal(feeTemplate.bookRows) + rowsTotal(feeTemplate.miscRows) - rowsTotal(feeTemplate.discountRows))} />
                  </div>
                  {prevRefundLoading && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 size={11} className="animate-spin" />
                      讀取前季退費…
                    </p>
                  )}
                  {!prevRefundLoading && prevRefundMap.size > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">前季退費（將自動帶入結轉）</p>
                      {Array.from(prevRefundMap.entries()).map(([sid, r]) => {
                        const student = state.students.find((s) => s.student_id === sid)
                        const name = student ? studentName(student) : sid.slice(0, 8)
                        return (
                          <div key={sid} className="flex justify-between text-xs text-muted-foreground">
                            <span>{name}</span>
                            <span className="text-red-600">−{formatMoney(r.amount)} ({r.sessions} 堂)</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
                <section className="grid gap-4">
                  <label>
                    <span className={labelClass}>學費費率</span>
                    <div className="grid grid-cols-[1fr_130px] gap-2">
                      <select
                        value={feeTemplate.tuitionPresetId}
                        onChange={(event) => {
                          const item = feeCatalog.find((entry) => entry.id === event.target.value)
                          if (item) {
                            // Amount will be computed by the reactive useEffect above
                            setFeeTemplate((prev) => ({ ...prev, tuitionPresetId: item.id, tuitionPresetLabel: item.label }))
                          } else {
                            setFeeTemplate((prev) => ({ ...prev, tuitionPresetId: '', tuitionPresetLabel: '' }))
                          }
                        }}
                        className={inputClass}
                      >
                        <option value="">從費用資料庫選擇…</option>
                        {feeCatalog.filter((item) => item.category === 'tuition' && item.base_sessions && item.base_sessions > 0).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.base_sessions}堂/{formatMoney(item.amount)}元
                          </option>
                        ))}
                      </select>
                      <input
                        value={feeTemplate.tuitionAmount}
                        onChange={(event) => setFeeTemplate((prev) => ({ ...prev, tuitionPresetId: '', tuitionPresetLabel: '', tuitionAmount: event.target.value }))}
                        inputMode="numeric"
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    {(() => {
                      const preset = feeCatalog.find((i) => i.id === feeTemplate.tuitionPresetId)
                      if (!preset?.base_sessions) return null
                      const rate = Math.round(preset.amount / preset.base_sessions)
                      const raw = actualSessionCount * rate
                      return (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {preset.label}：{preset.base_sessions}堂/{formatMoney(preset.amount)}元
                          {' → '}單堂費 {formatMoney(rate)}元 × {actualSessionCount}堂 = {formatMoney(raw)}
                          {' → '}四捨五入至十位：{formatMoney(Math.round(raw / 10) * 10)}
                        </p>
                      )
                    })()}
                    {feeCatalog.some((i) => i.category === 'tuition' && !i.base_sessions) && (
                      <p className="mt-1 text-xs text-amber-600">
                        有舊學費項目尚未設定基準堂數，請至「費用項目庫 → 學費費率」補設定後才可使用。
                      </p>
                    )}
                  </label>
                  <FeeRowsEditor title="教材費" category="book" catalog={feeCatalog} rows={feeTemplate.bookRows} onChange={(bookRows) => setFeeTemplate((prev) => ({ ...prev, bookRows }))} />
                  <FeeRowsEditor title="雜費" category="misc" catalog={feeCatalog} rows={feeTemplate.miscRows} onChange={(miscRows) => setFeeTemplate((prev) => ({ ...prev, miscRows }))} />
                  <FeeRowsEditor title="折扣" category="discount" catalog={feeCatalog} rows={feeTemplate.discountRows} onChange={(discountRows) => setFeeTemplate((prev) => ({ ...prev, discountRows }))} />
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
                <aside className="overflow-hidden rounded-lg border border-border">
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
                  <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-6">
                    <div>團課 {currentDraft.teamDates.length} 堂：{formatDateList(currentDraft.teamDates)}</div>
                    {selectedClass.class_type === 'intensive' && <div>精修 {currentDraft.intensiveDates.length + numberInput(currentDraft.intensiveUnscheduled)} 堂：{formatDateList(currentDraft.intensiveDates)}</div>}
                  </div>
                </section>
                <aside className="grid gap-4">
                  <label>
                    <span className={labelClass}>學費費率</span>
                    <input
                      value={currentDraft.tuitionAmount}
                      onChange={(event) => updateCurrentDraft((draft) => ({ ...draft, tuitionAmount: event.target.value, tuitionPresetId: '', tuitionPresetLabel: '' }))}
                      className={`${inputClass} w-full`}
                    />
                  </label>
                  <FeeRowsEditor title="教材費" category="book" catalog={feeCatalog} rows={currentDraft.bookRows} onChange={(bookRows) => updateCurrentDraft((draft) => ({ ...draft, bookRows }))} compact />
                  <FeeRowsEditor title="雜費" category="misc" catalog={feeCatalog} rows={currentDraft.miscRows} onChange={(miscRows) => updateCurrentDraft((draft) => ({ ...draft, miscRows }))} compact />
                  <FeeRowsEditor title="折扣" category="discount" catalog={feeCatalog} rows={currentDraft.discountRows} onChange={(discountRows) => updateCurrentDraft((draft) => ({ ...draft, discountRows }))} compact />
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
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
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

          <BagPreview state={state} onRefresh={load} />
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
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
        active
          ? 'border-gold/40 bg-gold/10 text-gold dark:border-[#ff4d4f]/40 dark:bg-[#ff4d4f]/10 dark:text-[#ff4d4f]'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function WizardSteps({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-start">
      {steps.map((label, index) => {
        const stepNum = index + 1
        const isDone = current > stepNum
        const isActive = current === stepNum
        return (
          <div key={stepNum} className="flex flex-1 items-start">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                isActive ? 'bg-foreground text-background'
                : isDone ? 'bg-emerald-100 text-emerald-700'
                : 'border-2 border-border text-muted-foreground'
              }`}>
                {isDone ? <Check size={14} /> : stepNum}
              </div>
              <span className={`mt-1.5 text-center text-xs leading-tight ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mt-4 h-px flex-1 ${isDone ? 'bg-emerald-300' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Position within quarter: 0=first month, 1=second, 2=third
const QM = [
  { label: 'bg-rose-50 text-rose-600',    cell: 'bg-rose-50/70' },
  { label: 'bg-sky-50 text-sky-600',      cell: 'bg-sky-50/70' },
  { label: 'bg-emerald-50 text-emerald-700', cell: 'bg-emerald-50/70' },
] as const

function buildQuarterWeeksGrouped(year: number, quarter: string) {
  const months = monthsForQuarter(quarter)
  const lastDay = new Date(Date.UTC(year, months[2], 0)).getUTCDate()
  const quarterEnd = dateOnly(year, months[2], lastDay)

  return months.map((month, idx) => {
    const allDays = datesInMonth(year, month)
    const firstDow = dateFromDateOnly(allDays[0]).getUTCDay() // 0=Sun
    const sundays = allDays.filter(d => dateFromDateOnly(d).getUTCDay() === 0)
    const weeks: Array<Array<{ date: string; month: number } | null>> = []

    // Partial first week — only for the first month of the quarter
    if (idx === 0 && firstDow !== 0) {
      const partial: Array<{ date: string; month: number } | null> = Array(firstDow).fill(null)
      for (const d of allDays.slice(0, 7 - firstDow)) partial.push({ date: d, month })
      weeks.push(partial)
    }

    // Full weeks whose Sunday falls in this month
    for (const sunday of sundays) {
      const t0 = dateFromDateOnly(sunday).getTime()
      const week: Array<{ date: string; month: number } | null> = []
      for (let d = 0; d < 7; d++) {
        const dt = new Date(t0 + d * 86400000)
        const ds = dateOnly(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
        week.push(ds <= quarterEnd ? { date: ds, month: dt.getUTCMonth() + 1 } : null)
      }
      weeks.push(week)
    }

    return { month, monthIdx: idx, weeks }
  })
}

function QuarterCalendar({
  year,
  quarter,
  selected,
  secondary,
  holidays,
  onToggle,
  mode,
  intensiveWeeks,
  teamWeekday,
  onToggleIntensiveWeek,
}: {
  year: number
  quarter: string
  selected: Set<string>
  secondary?: Set<string>
  holidays: Set<string>
  onToggle: (date: string) => void
  mode: 'holiday' | 'team' | 'intensive'
  intensiveWeeks?: Set<string>
  teamWeekday?: number
  onToggleIntensiveWeek?: (date: string) => void
}) {
  const qMonths = monthsForQuarter(quarter)
  const groups = buildQuarterWeeksGrouped(year, quarter)
  const showIntensiveCol = !!intensiveWeeks && teamWeekday != null
  // ISO weekday → Sun-indexed array position (0=Sun…6=Sat)
  const teamDayIdx = teamWeekday == null ? -1 : teamWeekday === 7 ? 0 : teamWeekday

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="w-9 border-b border-r border-border" />
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <th key={d} className="border-b border-border py-2 text-center text-xs font-normal text-muted-foreground">{d}</th>
            ))}
            {showIntensiveCol && (
              <th className="border-b border-l border-border py-2 text-center text-xs font-normal text-emerald-600">強</th>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ month, monthIdx, weeks }) =>
            weeks.map((week, weekIdx) => {
              const isMonthBoundary = weekIdx === 0 && monthIdx > 0
              // Date key for this week's intensive slot (same weekday as team day)
              const intensiveCell = teamDayIdx >= 0 ? week[teamDayIdx] : null
              const intensiveDate = intensiveCell?.date ?? null
              const intensiveOn = intensiveDate != null && (intensiveWeeks?.has(intensiveDate) ?? false)
              return (
                <tr key={`${month}-${weekIdx}`}>
                  {weekIdx === 0 && (
                    <td
                      rowSpan={weeks.length}
                      className={`w-9 border-r border-border text-center text-[11px] font-semibold align-middle ${isMonthBoundary ? 'border-t border-border' : ''} ${QM[monthIdx].label}`}
                    >
                      {month}
                    </td>
                  )}
                  {week.map((cell, cellIdx) => {
                    if (!cell) {
                      return <td key={cellIdx} className={`p-0.5 ${isMonthBoundary ? 'border-t border-border' : ''}`} />
                    }
                    const isOverflow = cell.month !== month
                    const pos = qMonths.indexOf(cell.month)
                    const cellBg = pos >= 0 ? QM[pos].cell : ''
                    const isSelected = selected.has(cell.date)
                    const isSecondary = secondary?.has(cell.date) ?? false
                    const isHoliday = holidays.has(cell.date)
                    const btnTone = mode === 'holiday'
                      ? isSelected ? 'bg-red-500 text-white' : 'hover:bg-red-50'
                      : isSelected ? 'bg-blue-600 text-white'
                        : isSecondary ? 'bg-emerald-600 text-white'
                          : isHoliday ? 'text-muted-foreground/40'
                            : 'hover:bg-black/5'
                    return (
                      <td key={cell.date} className={`p-0.5 ${cellBg} ${isMonthBoundary ? 'border-t border-border' : ''}`}>
                        <button
                          type="button"
                          onClick={() => onToggle(cell.date)}
                          className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${btnTone}`}
                          title={formatDateMd(cell.date)}
                        >
                          {Number(cell.date.slice(8, 10))}
                          {isHoliday && mode !== 'holiday' && (
                            <span className="absolute right-0.5 top-0.5 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-red-500" />
                          )}
                        </button>
                      </td>
                    )
                  })}
                  {showIntensiveCol && (
                    <td className={`border-l border-border p-0.5 ${isMonthBoundary ? 'border-t border-border' : ''}`}>
                      {intensiveDate && onToggleIntensiveWeek ? (
                        <button
                          type="button"
                          onClick={() => onToggleIntensiveWeek(intensiveDate)}
                          title={`強化 ${formatDateMd(intensiveDate)}`}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${intensiveOn ? 'bg-emerald-500 text-white' : 'border border-emerald-300 text-emerald-500 hover:bg-emerald-50'}`}
                        >強</button>
                      ) : (
                        <div className="h-8" />
                      )}
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function FeeRowsEditor({ title, category, catalog, rows, onChange, compact }: {
  title: string
  category: BillingFeeCategory
  catalog: BillingFeeCatalogItem[]
  rows: FeeRowDraft[]
  onChange: (rows: FeeRowDraft[]) => void
  compact?: boolean
}) {
  const choices = catalog.filter((item) => item.category === category)
  function update(index: number, patch: Partial<FeeRowDraft>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  }
  return (
    <section className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        <button type="button" onClick={() => onChange([...rows, emptyFeeRow()])} className="text-xs text-muted-foreground hover:text-foreground">新增</button>
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={index} className={`grid gap-2 ${compact ? 'grid-cols-[1fr_82px_28px]' : 'grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_120px_32px]'}`}>
            <select
              value={choices.some((item) => item.id === row.preset) ? row.preset : ''}
              onChange={(event) => {
                const item = choices.find((entry) => entry.id === event.target.value)
                update(index, item
                  ? { preset: item.id, note: item.label, amount: String(item.amount) }
                  : { preset: 'custom' })
              }}
              className={`${inputClass} ${compact ? 'col-span-3' : ''}`}
            >
              <option value="">從費用資料庫選擇…</option>
              {choices.map((item) => <option key={item.id} value={item.id}>{item.label} · {formatMoney(item.amount)}</option>)}
            </select>
            <input value={row.note} onChange={(event) => update(index, { preset: 'custom', note: event.target.value })} placeholder="名稱" className={inputClass} />
            <input value={row.amount} onChange={(event) => update(index, { preset: 'custom', amount: event.target.value })} inputMode="numeric" placeholder="金額" className={inputClass} />
            <button type="button" onClick={() => onChange(rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyFeeRow()])} className="h-9 rounded-md border border-border text-muted-foreground hover:bg-muted">×</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function AdjustmentEditor({ rows, onChange }: { rows: AdjustmentDraft[]; onChange: (rows: AdjustmentDraft[]) => void }) {
  return (
    <section className="rounded-lg border border-border p-3">
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

interface RefundLine {
  line_id: string
  student_name: string
  refund_sessions: number
  rate_per_session: number
  refund_amount: number
}

function BagPreview({ state, onRefresh }: { state: BillingState; onRefresh?: () => Promise<void> }) {
  const [refundPreview, setRefundPreview] = useState<RefundLine[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [refundError, setRefundError] = useState('')

  const bag = state.activeBag
  if (!bag) {
    return (
      <section className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground">
        尚未開袋
      </section>
    )
  }

  async function openRefundDialog() {
    setComputing(true)
    setRefundError('')
    try {
      const res = await fetch(`/api/billing/attendance-refund?bag_id=${bag!.id}`)
      const data = await res.json() as { preview?: RefundLine[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '計算失敗')
      setRefundPreview(data.preview ?? [])
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : '計算失敗')
    } finally {
      setComputing(false)
    }
  }

  const total = bag.lines.reduce((sum, line) => sum + Number(line.total_amount ?? 0), 0)
  const refundTotal = refundPreview?.reduce((s, r) => s + r.refund_amount, 0) ?? 0

  return (
    <>
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <ReceiptText size={16} />
        <h2 className="text-sm font-semibold">{bag.bag_code}</h2>
        <span className="text-xs text-muted-foreground">{bag.lines.length} 人 · {formatMoney(total)}</span>
        <button
          type="button"
          onClick={openRefundDialog}
          disabled={computing}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {computing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          下季退費預覽
        </button>
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

    {refundPreview !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRefundPreview(null)} />
        <div className="relative flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">下季退費預覽</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">本期「缺席(退)」紀錄，將在下一季開袋時自動帶入結轉折抵</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {refundPreview.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">本期無「缺席(退)」紀錄</p>
            ) : (
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-4 py-2 text-left">學生</th>
                    <th className="border-b border-border px-4 py-2 text-right">退堂</th>
                    <th className="border-b border-border px-4 py-2 text-right">單價</th>
                    <th className="border-b border-border px-4 py-2 text-right">退費</th>
                  </tr>
                </thead>
                <tbody>
                  {refundPreview.map((r, i) => (
                    <tr key={r.line_id} className={i % 2 === 1 ? 'bg-muted/40' : ''}>
                      <td className="border-b border-border px-4 py-2">{r.student_name}</td>
                      <td className="border-b border-border px-4 py-2 text-right">{r.refund_sessions}</td>
                      <td className="border-b border-border px-4 py-2 text-right">{formatMoney(r.rate_per_session)}</td>
                      <td className="border-b border-border px-4 py-2 text-right text-orange-600 dark:text-orange-400">−{formatMoney(r.refund_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-xs text-muted-foreground">合計退費</td>
                    <td className="px-4 py-2 text-right font-semibold text-orange-600 dark:text-orange-400">−{formatMoney(refundTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {refundError && <p className="border-t border-border px-4 py-2 text-xs text-red-500">{refundError}</p>}
          <div className="flex justify-end border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setRefundPreview(null)}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
