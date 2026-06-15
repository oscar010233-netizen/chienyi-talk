'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarPlus,
  Check,
  FileDown,
  Loader2,
  ReceiptText,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { buildSeasonCode, defaultSeasonDraft, formatDateMd, formatMoney, quarterDates } from '@/lib/billing/calendar'
import type { BillingQuarter } from '@/lib/billing/calendar'
import type {
  ActualAttendance,
  ActualAttendanceStatus,
  BillingState,
  BillingStudent,
  DefaultAttendance,
  PaymentBagLine,
  PaymentBagWithLines,
} from '@/lib/billing/types'

const buttonBase =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50'
const primaryButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50'
const inputClass =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/25'
const labelClass = 'mb-1 block text-[11px] font-medium text-muted-foreground'

type Message = { tone: 'ok' | 'error' | 'idle'; text: string }

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function studentName(student: BillingStudent | undefined | null) {
  if (!student) return ''
  return [student.chinese_name, student.english_name].filter(Boolean).join(' / ')
}

function byStudentAndDefault(actuals: ActualAttendance[]) {
  const map = new Map<string, ActualAttendance>()
  for (const row of actuals) {
    if (!row.default_attendance_id) continue
    map.set(`${row.student_id}:${row.default_attendance_id}`, row)
  }
  return map
}

function byStudent(students: BillingStudent[]) {
  return new Map(students.map((student) => [student.student_id, student]))
}

function statusLabel(status: string | null | undefined) {
  if (status === 'attended') return '到'
  if (status === 'absent') return '缺'
  if (status === 'cancelled') return '停'
  if (status === 'makeup') return '補'
  if (status === 'extra') return '多'
  return ''
}

function lineStudent(line: PaymentBagLine, students: Map<string, BillingStudent>) {
  return line.student ?? students.get(line.student_id)
}

export function BillingWorkspace({ initialState }: { initialState: BillingState }) {
  const router = useRouter()
  const draft = defaultSeasonDraft()
  const [state, setState] = useState(initialState)
  const [classId, setClassId] = useState(initialState.selectedClass?.id ?? '')
  const [seasonId, setSeasonId] = useState(initialState.selectedSeason?.id ?? '')
  const [message, setMessage] = useState<Message>({ tone: 'idle', text: '' })
  const [pending, startTransition] = useTransition()
  const [seasonForm, setSeasonForm] = useState({
    year: initialState.selectedSeason?.year ?? draft.year,
    quarter: (initialState.selectedSeason?.quarter as BillingQuarter | undefined) ?? draft.quarter,
    start_date: initialState.selectedSeason?.start_date ?? draft.start_date,
    end_date: initialState.selectedSeason?.end_date ?? draft.end_date,
  })
  const [holidayForm, setHolidayForm] = useState({
    holiday_date: '',
    label: '',
    scope: 'all' as 'all' | 'class',
  })
  const [extraForm, setExtraForm] = useState({
    student_id: '',
    actual_date: todayDate(),
    status: 'makeup' as 'makeup' | 'extra',
    note: '',
  })
  const [bagForm, setBagForm] = useState({
    issue_date: todayDate(),
    due_date: '',
    tuition_amount: '0',
    book_name: '',
    book_fee: '0',
    misc_label: '',
    misc_fee: '0',
    discount_label: '',
    discount_amount: '0',
    note: '',
  })

  const actualMap = useMemo(() => byStudentAndDefault(state.actualAttendance), [state.actualAttendance])
  const studentsById = useMemo(() => byStudent(state.students), [state.students])
  const selectedClass = state.selectedClass
  const selectedSeason = state.selectedSeason
  const activeBag = state.activeBag

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

  function changeQuarter(quarter: BillingQuarter) {
    const dates = quarterDates(Number(seasonForm.year), quarter)
    setSeasonForm((prev) => ({ ...prev, quarter, ...dates }))
  }

  function createSeason() {
    run(async () => {
      const data = await post({
        action: 'create-season',
        year: seasonForm.year,
        quarter: seasonForm.quarter,
        start_date: seasonForm.start_date,
        end_date: seasonForm.end_date,
        label: buildSeasonCode(seasonForm.year, seasonForm.quarter),
      })
      setSeasonId(data.season.id)
    }, '季度已建立')
  }

  function saveHoliday() {
    if (!seasonId || !holidayForm.holiday_date) return
    run(async () => {
      await post({
        action: 'save-holiday',
        season_id: seasonId,
        class_id: holidayForm.scope === 'class' ? classId : null,
        holiday_date: holidayForm.holiday_date,
        label: holidayForm.label,
      })
      setHolidayForm((prev) => ({ ...prev, holiday_date: '', label: '' }))
    }, '假日已儲存')
  }

  function generateAttendance() {
    if (!seasonId || !classId) return
    run(async () => {
      await post({
        action: 'generate-attendance',
        season_id: seasonId,
        class_id: classId,
        limit: selectedClass?.system_sessions ?? undefined,
      })
    }, '預設出席日已產生，班級點名列已建立')
  }

  function syncActual() {
    if (!seasonId || !classId) return
    run(async () => {
      await post({ action: 'sync-actual', season_id: seasonId, class_id: classId })
    }, '已同步班級點名結果')
  }

  function recordCell(row: DefaultAttendance, studentId: string, status: ActualAttendanceStatus) {
    run(async () => {
      await post({
        action: 'record-actual',
        default_attendance_id: row.id,
        student_id: studentId,
        status,
      })
    }, '實際出席已更新')
  }

  function markSessionAll(row: DefaultAttendance) {
    run(async () => {
      await Promise.all(state.students.map((student) => post({
        action: 'record-actual',
        default_attendance_id: row.id,
        student_id: student.student_id,
        status: 'attended',
      })))
    }, `第 ${row.session_index} 堂已標記全到`)
  }

  function addExtraAttendance() {
    if (!seasonId || !classId || !extraForm.student_id || !extraForm.actual_date) return
    run(async () => {
      await post({
        action: 'extra-attendance',
        season_id: seasonId,
        class_id: classId,
        student_id: extraForm.student_id,
        actual_date: extraForm.actual_date,
        status: extraForm.status,
        note: extraForm.note,
      })
      setExtraForm((prev) => ({ ...prev, note: '' }))
    }, extraForm.status === 'extra' ? '多上紀錄已新增' : '補課紀錄已新增')
  }

  function openBag() {
    if (!seasonId || !classId) return
    run(async () => {
      await post({
        action: 'open-bag',
        season_id: seasonId,
        class_id: classId,
        issue_date: bagForm.issue_date,
        due_date: bagForm.due_date || null,
        tuition_amount: Number(bagForm.tuition_amount) || 0,
        book_name: bagForm.book_name,
        book_fee: Number(bagForm.book_fee) || 0,
        misc_label: bagForm.misc_label,
        misc_fee: Number(bagForm.misc_fee) || 0,
        discount_label: bagForm.discount_label,
        discount_amount: Number(bagForm.discount_amount) || 0,
        note: bagForm.note,
      })
    }, '繳費袋已開立')
  }

  function recordPrint() {
    if (!activeBag) return
    startTransition(async () => {
      try {
        await post({ action: 'record-print', bag_id: activeBag.id, event_type: 'pdf' })
        await load()
        window.print()
      } catch (error) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : '列印失敗' })
      }
    })
  }

  return (
    <div className="flex min-h-full flex-col bg-[#f6f7f9] text-foreground dark:bg-[#18181a]">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .billing-controls, .mac-glass, aside, nav { display: none !important; }
          main { overflow: visible !important; padding: 0 !important; }
          .billing-print-area { padding: 0 !important; overflow: visible !important; }
          .yellow-sheet-scroll { overflow: visible !important; }
          .yellow-sheet { font-size: 8.5px !important; }
          .yellow-sheet th, .yellow-sheet td { padding: 2px 3px !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="billing-controls mac-glass mac-hairline sticky top-0 z-40 border-b px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">開袋系統</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedClass ? `${selectedClass.class_name} · ${selectedSeason?.season_code ?? '尚未選季度'}` : '尚未建立班級'}
            </p>
          </div>

          <select
            value={classId}
            onChange={(event) => {
              const next = event.target.value
              setClassId(next)
              void load(next, seasonId)
            }}
            className={`${inputClass} min-w-44`}
          >
            {state.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>

          <select
            value={seasonId}
            onChange={(event) => {
              const next = event.target.value
              setSeasonId(next)
              void load(classId, next)
            }}
            className={`${inputClass} min-w-36`}
          >
            {state.seasons.length === 0 && <option value="">尚無季度</option>}
            {state.seasons.map((season) => (
              <option key={season.id} value={season.id}>{season.season_code}</option>
            ))}
          </select>

          <button type="button" onClick={() => void load()} disabled={pending} className={buttonBase} title="重新整理">
            <RefreshCw size={14} />
            同步
          </button>
          <button type="button" onClick={recordPrint} disabled={!activeBag || pending} className={primaryButton} title="列印或存成 PDF">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            PDF
          </button>
        </div>
        {message.text && (
          <div className={`mt-2 text-xs ${message.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="billing-controls grid gap-4 border-b border-border bg-background/70 p-4 md:grid-cols-[1.05fr_1fr] md:p-6 xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarPlus size={16} />
            <h2 className="text-sm font-semibold">季度與假日</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={labelClass}>年度</span>
              <input
                type="number"
                value={seasonForm.year}
                onChange={(event) => {
                  const year = Number(event.target.value) || draft.year
                  const dates = quarterDates(year, seasonForm.quarter)
                  setSeasonForm((prev) => ({ ...prev, year, ...dates }))
                }}
                className={`${inputClass} w-full`}
              />
            </label>
            <label>
              <span className={labelClass}>季度</span>
              <select value={seasonForm.quarter} onChange={(event) => changeQuarter(event.target.value as BillingQuarter)} className={`${inputClass} w-full`}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
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
            建立 / 更新季度
          </button>

          <div className="mt-4 border-t border-border pt-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <label>
                <span className={labelClass}>假日</span>
                <input type="date" value={holidayForm.holiday_date} onChange={(event) => setHolidayForm((prev) => ({ ...prev, holiday_date: event.target.value }))} className={`${inputClass} w-full`} />
              </label>
              <label>
                <span className={labelClass}>範圍</span>
                <select value={holidayForm.scope} onChange={(event) => setHolidayForm((prev) => ({ ...prev, scope: event.target.value as 'all' | 'class' }))} className={`${inputClass} w-full`}>
                  <option value="all">全校</option>
                  <option value="class">本班</option>
                </select>
              </label>
              <label className="col-span-2">
                <span className={labelClass}>名稱</span>
                <input value={holidayForm.label} onChange={(event) => setHolidayForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="例：清明連假" className={`${inputClass} w-full`} />
              </label>
            </div>
            <button type="button" onClick={saveHoliday} disabled={!seasonId || !holidayForm.holiday_date || pending} className={`${buttonBase} mt-2 w-full`}>
              <Check size={14} />
              儲存假日
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {state.holidays.map((holiday) => (
                <span key={holiday.id} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {formatDateMd(holiday.holiday_date)}
                  {holiday.class_id ? ' 本班' : ' 全校'}
                  <button
                    type="button"
                    onClick={() => run(async () => { await post({ action: 'remove-holiday', id: holiday.id }) }, '假日已刪除')}
                    className="rounded p-0.5 hover:bg-amber-100"
                    title="刪除假日"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw size={16} />
            <h2 className="text-sm font-semibold">出席對帳</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generateAttendance} disabled={!seasonId || !classId || pending} className={primaryButton}>
              <CalendarPlus size={14} />
              產生預設出席日
            </button>
            <button type="button" onClick={syncActual} disabled={!seasonId || !classId || pending} className={buttonBase}>
              <RefreshCw size={14} />
              同步班級點名
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_1fr] gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label>
              <span className={labelClass}>學生</span>
              <select value={extraForm.student_id} onChange={(event) => setExtraForm((prev) => ({ ...prev, student_id: event.target.value }))} className={`${inputClass} w-full`}>
                <option value="">選擇學生</option>
                {state.students.map((student) => (
                  <option key={student.student_id} value={student.student_id}>{studentName(student)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>日期</span>
              <input type="date" value={extraForm.actual_date} onChange={(event) => setExtraForm((prev) => ({ ...prev, actual_date: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>類型</span>
              <select value={extraForm.status} onChange={(event) => setExtraForm((prev) => ({ ...prev, status: event.target.value as 'makeup' | 'extra' }))} className={`${inputClass} w-full`}>
                <option value="makeup">補課</option>
                <option value="extra">多上</option>
              </select>
            </label>
            <button type="button" onClick={addExtraAttendance} disabled={!extraForm.student_id || pending} className={`${buttonBase} mt-5`}>
              <Check size={14} />
              新增
            </button>
          </div>

          <AttendanceGrid
            students={state.students}
            defaults={state.defaultAttendance}
            actualMap={actualMap}
            onRecord={recordCell}
            onMarkAll={markSessionAll}
          />
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <ReceiptText size={16} />
            <h2 className="text-sm font-semibold">開繳費袋</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={labelClass}>開袋日</span>
              <input type="date" value={bagForm.issue_date} onChange={(event) => setBagForm((prev) => ({ ...prev, issue_date: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>繳費期限</span>
              <input type="date" value={bagForm.due_date} onChange={(event) => setBagForm((prev) => ({ ...prev, due_date: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>學費</span>
              <input type="number" value={bagForm.tuition_amount} onChange={(event) => setBagForm((prev) => ({ ...prev, tuition_amount: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>書費</span>
              <input type="number" value={bagForm.book_fee} onChange={(event) => setBagForm((prev) => ({ ...prev, book_fee: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label className="col-span-2">
              <span className={labelClass}>書籍名稱</span>
              <input value={bagForm.book_name} onChange={(event) => setBagForm((prev) => ({ ...prev, book_name: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>雜費說明</span>
              <input value={bagForm.misc_label} onChange={(event) => setBagForm((prev) => ({ ...prev, misc_label: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>雜費</span>
              <input type="number" value={bagForm.misc_fee} onChange={(event) => setBagForm((prev) => ({ ...prev, misc_fee: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>折扣說明</span>
              <input value={bagForm.discount_label} onChange={(event) => setBagForm((prev) => ({ ...prev, discount_label: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
            <label>
              <span className={labelClass}>折扣金額</span>
              <input type="number" value={bagForm.discount_amount} onChange={(event) => setBagForm((prev) => ({ ...prev, discount_amount: event.target.value }))} className={`${inputClass} w-full`} />
            </label>
          </div>
          <button type="button" onClick={openBag} disabled={!seasonId || !classId || state.defaultAttendance.length === 0 || pending} className={`${primaryButton} mt-3 w-full`}>
            <ReceiptText size={14} />
            開袋 / 重新計算
          </button>

          {activeBag && (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{activeBag.bag_code}</span>
                <span>{activeBag.lines.length} 位學生</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-muted-foreground">
                <span>堂數 {state.defaultAttendance.length}</span>
                <span>列印 {activeBag.print_count}</span>
                <span>{activeBag.last_printed_at ? activeBag.last_printed_at.slice(0, 10) : '未列印'}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="billing-print-area min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {activeBag && selectedClass && selectedSeason ? (
          <YellowSheet
            bag={activeBag}
            selectedClass={selectedClass}
            selectedSeason={selectedSeason}
            students={studentsById}
            defaultAttendance={state.defaultAttendance}
            actualAttendance={state.actualAttendance}
          />
        ) : (
          <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground">
            尚未開袋
          </div>
        )}
      </div>
    </div>
  )
}

function AttendanceGrid({
  students,
  defaults,
  actualMap,
  onRecord,
  onMarkAll,
}: {
  students: BillingStudent[]
  defaults: DefaultAttendance[]
  actualMap: Map<string, ActualAttendance>
  onRecord: (row: DefaultAttendance, studentId: string, status: ActualAttendanceStatus) => void
  onMarkAll: (row: DefaultAttendance) => void
}) {
  if (defaults.length === 0 || students.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        尚無出席資料
      </div>
    )
  }

  return (
    <div className="mt-4 max-h-80 overflow-auto rounded-md border border-border">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-32 border-b border-r border-border bg-background px-2 py-2 text-left">學生</th>
            {defaults.map((row) => (
              <th key={row.id} className="sticky top-0 z-20 min-w-24 border-b border-r border-border bg-background px-2 py-2 text-center">
                <button type="button" onClick={() => onMarkAll(row)} className="mx-auto flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted" title="全班到">
                  <Check size={12} />
                  {row.session_index}
                </button>
                <span className={row.status === 'holiday_shifted' ? 'text-amber-700' : 'text-muted-foreground'}>
                  {formatDateMd(row.default_date)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.student_id}>
              <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-2 font-medium">
                {studentName(student)}
              </td>
              {defaults.map((row) => {
                const actual = actualMap.get(`${student.student_id}:${row.id}`)
                return (
                  <td key={row.id} className="border-b border-r border-border px-1 py-1 text-center">
                    <select
                      value={actual?.actual_status ?? ''}
                      onChange={(event) => {
                        if (event.target.value) onRecord(row, student.student_id, event.target.value as ActualAttendanceStatus)
                      }}
                      className="h-7 w-14 rounded border border-input bg-background px-1 text-xs"
                    >
                      <option value="">-</option>
                      <option value="attended">到</option>
                      <option value="absent">缺</option>
                      <option value="cancelled">停</option>
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YellowSheet({
  bag,
  selectedClass,
  selectedSeason,
  students,
  defaultAttendance,
  actualAttendance,
}: {
  bag: PaymentBagWithLines
  selectedClass: BillingState['selectedClass']
  selectedSeason: BillingState['selectedSeason']
  students: Map<string, BillingStudent>
  defaultAttendance: DefaultAttendance[]
  actualAttendance: ActualAttendance[]
}) {
  const slots = Array.from({ length: 36 }, (_, index) => defaultAttendance[index] ?? null)
  const makeups = defaultAttendance
    .filter((row) => row.original_date !== row.default_date)
    .map((row) => `${formatDateMd(row.original_date)}→${formatDateMd(row.default_date)}`)
  const actualByStudent = useMemo(() => {
    const map = new Map<string, ActualAttendance[]>()
    for (const row of actualAttendance) {
      const list = map.get(row.student_id) ?? []
      list.push(row)
      map.set(row.student_id, list)
    }
    return map
  }, [actualAttendance])

  return (
    <div className="yellow-sheet-scroll overflow-auto rounded-lg border border-[#d6c777] bg-white p-2 shadow-sm">
      <table className="yellow-sheet min-w-[1600px] border-collapse text-[10px] text-black">
        <tbody>
          <tr className="bg-[#fff2cc] font-semibold">
            <Cell>季度：</Cell>
            <Cell>{selectedSeason?.year ?? ''}</Cell>
            <Cell>{selectedSeason?.quarter ?? ''}</Cell>
            <Cell>代號：</Cell>
            <Cell>{selectedClass?.class_code ?? ''}</Cell>
            <Cell>課程：</Cell>
            <Cell span={10}>{selectedClass?.class_name ?? ''}</Cell>
            <Cell>ID</Cell>
            <Cell span={2}>{selectedClass?.class_code ?? selectedClass?.id.slice(0, 8)}</Cell>
            <Cell>系統：</Cell>
            <Cell>{selectedClass?.system_sessions ?? defaultAttendance.length}</Cell>
            <Cell>堂</Cell>
            <Cell>程度：</Cell>
            <Cell span={2}>{selectedClass?.level ?? ''}</Cell>
            <Cell span={10}>{bag.bag_code}</Cell>
          </tr>
          <tr className="bg-[#fff2cc] font-semibold">
            <Cell>編號</Cell>
            <Cell>姓名</Cell>
            <Cell span={14}>上課日期</Cell>
            <Cell>堂數</Cell>
            <Cell>堂價</Cell>
            <Cell>學費說明</Cell>
            <Cell>學費應收</Cell>
            <Cell>書籍名稱</Cell>
            <Cell>書費</Cell>
            <Cell>雜費說明</Cell>
            <Cell>雜費</Cell>
            <Cell>特殊折扣</Cell>
            <Cell>折扣金額</Cell>
            <Cell>上期結轉</Cell>
            <Cell>金額</Cell>
            <Cell>應繳總額</Cell>
            <Cell span={2}>出袋狀態</Cell>
            <Cell>實收金額</Cell>
            <Cell>收介紹卡</Cell>
            <Cell>經手人</Cell>
            <Cell>備註</Cell>
          </tr>
          <SlotHeader start={1} makeups={makeups} />
          <SlotHeader start={13} />
          <SlotHeader start={25} />
          {bag.lines.map((line, index) => (
            <StudentBlock
              key={line.id}
              line={line}
              order={index + 1}
              student={lineStudent(line, students)}
              slots={slots}
              makeups={makeups}
              actuals={actualByStudent.get(line.student_id) ?? []}
              tuitionNote={bag.tuition_note ?? ''}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ children, span = 1, rowSpan = 1, className = '' }: {
  children?: ReactNode
  span?: number
  rowSpan?: number
  className?: string
}) {
  return (
    <td colSpan={span} rowSpan={rowSpan} className={`h-6 border border-[#b7aa60] px-1 text-center align-middle ${className}`}>
      {children}
    </td>
  )
}

function SlotHeader({ start, makeups = [] }: { start: number; makeups?: string[] }) {
  return (
    <tr className="bg-[#efefef] text-[9px]">
      <Cell />
      <Cell />
      {Array.from({ length: 12 }, (_, index) => <Cell key={index}>{start + index}</Cell>)}
      <Cell span={2}>{makeups.slice(0, 2).join(' / ') || (start === 1 ? '順延日期與資訊' : '')}</Cell>
      {Array.from({ length: 19 }, (_, index) => <Cell key={index} />)}
    </tr>
  )
}

function StudentBlock({
  line,
  order,
  student,
  slots,
  makeups,
  actuals,
  tuitionNote,
}: {
  line: PaymentBagLine
  order: number
  student?: BillingStudent
  slots: Array<DefaultAttendance | null>
  makeups: string[]
  actuals: ActualAttendance[]
  tuitionNote: string
}) {
  const first = slots.slice(0, 12)
  const second = slots.slice(12, 24)
  const third = slots.slice(24, 36)
  const attendanceNote = actuals
    .filter((row) => row.actual_status !== 'attended')
    .map((row) => `${formatDateMd(row.actual_date)}${statusLabel(row.actual_status)}`)
    .join(' ')
  const name = studentName(student) || line.student_id.slice(0, 8)
  const paid = line.paid_amount == null ? '' : formatMoney(line.paid_amount)

  return (
    <>
      <tr>
        <Cell rowSpan={6} className="bg-[#fff2cc] font-semibold">{order}</Cell>
        <Cell rowSpan={6} className="min-w-28 bg-[#fff2cc] font-semibold whitespace-pre-line">{name.replace(' / ', '\n')}</Cell>
        {first.map((row, index) => <DateCell key={index} row={row} />)}
        <Cell>{makeups[0] ?? ''}</Cell>
        <Cell>{makeups[1] ?? ''}</Cell>
        <Cell rowSpan={6}>{line.session_count || ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.rate_per_session)}</Cell>
        <Cell rowSpan={6}>{line.session_count ? `第季，實際上課共${line.session_count}堂` : ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.tuition_amount)}</Cell>
        <Cell rowSpan={6}>{line.book_name ?? ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.book_fee)}</Cell>
        <Cell rowSpan={6}>{line.misc_label ?? ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.misc_fee)}</Cell>
        <Cell rowSpan={6}>{line.discount_label ?? ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.discount_amount)}</Cell>
        <Cell rowSpan={6}>{line.carryover_note ?? ''}</Cell>
        <Cell rowSpan={6}>{formatMoney(line.carryover_amount)}</Cell>
        <Cell rowSpan={6} className="font-semibold">{formatMoney(line.total_amount)}</Cell>
        <Cell rowSpan={2} span={2}>{line.issue_status}</Cell>
        <Cell rowSpan={6} className="bg-[#fce5cd]">{paid}</Cell>
        <Cell rowSpan={6}>{line.intro_card_received ? 'Y' : ''}</Cell>
        <Cell rowSpan={6} className="bg-[#fce5cd]">{line.handler ?? ''}</Cell>
        <Cell rowSpan={6}>{[line.note, attendanceNote].filter(Boolean).join(' / ')}</Cell>
      </tr>
      <tr className="bg-[#efefef] text-[9px]">
        {Array.from({ length: 12 }, (_, index) => <Cell key={index}>{index + 1}</Cell>)}
        <Cell />
        <Cell />
      </tr>
      <tr>
        {second.map((row, index) => <DateCell key={index} row={row} />)}
        <Cell>{makeups[2] ?? ''}</Cell>
        <Cell>{makeups[3] ?? ''}</Cell>
        <Cell span={2}>{line.payment_status}</Cell>
      </tr>
      <tr className="bg-[#efefef] text-[9px]">
        {Array.from({ length: 12 }, (_, index) => <Cell key={index}>{index + 13}</Cell>)}
        <Cell />
        <Cell />
        <Cell span={2} />
      </tr>
      <tr>
        {third.map((row, index) => <DateCell key={index} row={row} />)}
        <Cell>{makeups[4] ?? ''}</Cell>
        <Cell>{makeups[5] ?? ''}</Cell>
        <Cell span={2} />
      </tr>
      <tr className="bg-[#efefef] text-[9px]">
        {Array.from({ length: 12 }, (_, index) => <Cell key={index}>{index + 25}</Cell>)}
        <Cell />
        <Cell />
        <Cell span={2} />
      </tr>
    </>
  )
}

function DateCell({ row }: { row: DefaultAttendance | null }) {
  if (!row) return <Cell />
  return (
    <Cell className={row.status === 'holiday_shifted' ? 'bg-[#fce5cd]' : ''}>
      {formatDateMd(row.default_date)}
    </Cell>
  )
}
