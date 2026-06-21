'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassEnrollment, ClassSessionRow } from '@/lib/grade/types'

interface Props {
  sessionDate: string
  sessionKind: 'team' | 'intensive'
  rows: ClassSessionRow[]               // one row per student for this session
  makeupsByStudent: Map<string, ClassSessionRow[]>  // existing makeup rows keyed by student_id
  bagId: string
  students: ClassEnrollment[]
  onClose: (refresh?: boolean) => void
}

// Combined status values shown in UI.
// pending  = not yet marked (or cleared back to unmarked)
// absent_makeup = absent + makeup_pending
// absent_refund = absent + refund
type UiStatus = 'pending' | 'present' | 'late' | 'absent_makeup' | 'absent_refund' | 'cancelled'

const STATUS_OPTIONS: { value: UiStatus; label: string; active: string; inactive: string }[] = [
  { value: 'present',      label: '出席', active: 'bg-emerald-500 text-white',                    inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'late',         label: '晚到', active: 'bg-amber-400 text-white',                     inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'absent_makeup',label: '缺(補)', active: 'bg-orange-500 text-white',                  inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'absent_refund',label: '缺(退)', active: 'bg-slate-700 text-white dark:bg-slate-500', inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'cancelled',    label: '取消', active: 'bg-gray-400 text-white',                      inactive: 'border border-border text-muted-foreground hover:bg-muted' },
]

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
]

function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

function initials(chi: string, eng: string) {
  if (eng?.trim()) return eng.trim()[0].toUpperCase()
  if (chi?.trim()) return chi.trim().slice(-1)
  return '?'
}

function rowToUiStatus(row: ClassSessionRow | undefined): UiStatus {
  if (!row || !row.attendance_status) return 'pending'
  if (row.attendance_status === 'present') return 'present'
  if (row.attendance_status === 'late') return 'late'
  if (row.attendance_status === 'cancelled') return 'cancelled'
  if (row.attendance_status === 'absent') {
    return row.absence_resolution === 'refund' ? 'absent_refund' : 'absent_makeup'
  }
  return 'pending'
}

function uiStatusToApi(status: UiStatus): { attendance_status: string; absence_resolution: string | null } {
  if (status === 'present')       return { attendance_status: 'present',   absence_resolution: null }
  if (status === 'late')          return { attendance_status: 'late',      absence_resolution: null }
  if (status === 'absent_makeup') return { attendance_status: 'absent',    absence_resolution: 'makeup_pending' }
  if (status === 'absent_refund') return { attendance_status: 'absent',    absence_resolution: 'refund' }
  if (status === 'cancelled')     return { attendance_status: 'cancelled', absence_resolution: null }
  return { attendance_status: 'present', absence_resolution: null }
}

export function AttendanceModal({
  sessionDate, sessionKind, rows, makeupsByStudent, bagId, students, onClose,
}: Props) {
  const rowByStudent = new Map(rows.map(r => [r.student_id, r]))

  // Snapshot DB state at modal open — used to detect rows that need clearing
  const [initialStatuses] = useState<Record<string, UiStatus>>(() => {
    const init: Record<string, UiStatus> = {}
    for (const s of students) init[s.student_id] = rowToUiStatus(rowByStudent.get(s.student_id))
    return init
  })

  const [statuses, setStatuses] = useState<Record<string, UiStatus>>(() => {
    const init: Record<string, UiStatus> = {}
    for (const s of students) init[s.student_id] = rowToUiStatus(rowByStudent.get(s.student_id))
    return init
  })

  // Makeup date inputs: studentId → YYYY-MM-DD (only for absent_makeup students)
  const [makeupSchedules, setMakeupSchedules] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const counts = students.reduce((acc, s) => {
    const st = statuses[s.student_id] ?? 'pending'
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  function setAll(status: UiStatus) {
    const next: Record<string, UiStatus> = {}
    for (const s of students) next[s.student_id] = status
    setStatuses(next)
    if (status !== 'absent_makeup') setMakeupSchedules({})
  }

  function toggle(studentId: string, status: UiStatus) {
    setStatuses(prev => ({
      ...prev,
      [studentId]: prev[studentId] === status ? 'pending' : status,
    }))
    if (status !== 'absent_makeup') {
      setMakeupSchedules(prev => { const next = { ...prev }; delete next[studentId]; return next })
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    // Build update list:
    // - Changed to non-pending → send new status
    // - Changed from non-pending to pending → send null to clear
    // - makeup_done rows are locked (skip)
    const updates: Array<{ session_row_id: string; attendance_status: string | null; absence_resolution: string | null }> = []

    for (const s of students) {
      const row = rowByStudent.get(s.student_id)
      if (!row) continue
      if (row.absence_resolution === 'makeup_done') continue  // locked: completed makeup

      const newStatus = statuses[s.student_id] ?? 'pending'
      const wasMarked = initialStatuses[s.student_id] !== 'pending'

      if (newStatus === 'pending') {
        if (wasMarked) {
          // Explicit clear: send null to wipe attendance
          updates.push({ session_row_id: row.id, attendance_status: null, absence_resolution: null })
        }
        // else: was pending and still pending — nothing to do
      } else {
        const { attendance_status, absence_resolution } = uiStatusToApi(newStatus)
        updates.push({ session_row_id: row.id, attendance_status, absence_resolution })
      }
    }

    try {
      if (updates.length > 0) {
        const res = await fetch('/api/attendance/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bag_id: bagId, updates }),
        })
        if (!res.ok) {
          const data = await res.json() as { error?: string }
          throw new Error(data.error ?? '儲存失敗')
        }
      }

      // Schedule makeup sessions for absent_makeup students that have a date selected
      const makeupEntries = Object.entries(makeupSchedules).filter(([, date]) => !!date)
      for (const [studentId, makeupDate] of makeupEntries) {
        if (statuses[studentId] !== 'absent_makeup') continue
        const row = rowByStudent.get(studentId)
        if (!row) continue

        // Cancel any existing pending (unattended) makeups for this student first.
        // fn_create_makeup_session returns 409 when a pending child exists,
        // so we preemptively cancel before scheduling a new date.
        const pendingMakeups = (makeupsByStudent.get(studentId) ?? []).filter(m => !m.attendance_status)
        for (const pending of pendingMakeups) {
          const cancelRes = await fetch('/api/attendance/makeup', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ makeup_row_id: pending.id, attendance_status: 'cancelled', bag_id: bagId }),
          })
          if (!cancelRes.ok) {
            const data = await cancelRes.json() as { error?: string }
            throw new Error(`取消舊補課失敗（${studentId}）：${data.error ?? ''}`)
          }
        }

        const res = await fetch('/api/attendance/makeup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ original_row_id: row.id, makeup_date: makeupDate, bag_id: bagId }),
        })
        if (!res.ok) {
          const data = await res.json() as { error?: string }
          throw new Error(`出席已儲存，但補課排程失敗：${data.error ?? ''}`)
        }
      }

      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const dateLabel = sessionDate.slice(5).replace('-', '/')
  const kindLabel = sessionKind === 'intensive' ? '強化' : '團課'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onClose()} />

      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-foreground">出席點名</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel} {kindLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setAll('present')}
            className="h-7 rounded-md bg-emerald-500 px-3 text-xs font-medium text-white hover:bg-emerald-600"
          >
            全部到
          </button>
          <button
            type="button"
            onClick={() => setAll('pending')}
            className="h-7 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            清除
          </button>
          <div className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {(counts['present']      ?? 0) > 0 && <span className="text-emerald-600 dark:text-emerald-400">{counts['present']} 出席</span>}
            {(counts['late']         ?? 0) > 0 && <span className="text-amber-600 dark:text-amber-400">{counts['late']} 晚到</span>}
            {(counts['absent_makeup'] ?? 0) > 0 && <span className="text-orange-600 dark:text-orange-400">{counts['absent_makeup']} 缺(補)</span>}
            {(counts['absent_refund'] ?? 0) > 0 && <span className="text-foreground">{counts['absent_refund']} 缺(退)</span>}
            {(counts['cancelled']    ?? 0) > 0 && <span className="text-muted-foreground/60">{counts['cancelled']} 取消</span>}
            {(counts['pending']      ?? 0) > 0 && <span>{counts['pending']} 未標</span>}
          </div>
        </div>

        {/* Student list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {students.map((s, i) => {
            const row = rowByStudent.get(s.student_id)
            const current = statuses[s.student_id] ?? 'pending'
            const isMakeupDone = row?.absence_resolution === 'makeup_done'
            const existingMakeups = makeupsByStudent.get(s.student_id) ?? []

            return (
              <div
                key={s.student_id}
                className={cn('border-b border-border/50 px-4 py-2.5 last:border-0', i % 2 === 1 ? 'bg-muted/40' : '')}
              >
                <div className="flex items-center gap-3">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', avatarColor(s.student_id))}>
                    {initials(s.student.chinese_name, s.student.english_name)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
                    {s.student.chinese_name}
                    {s.student.english_name && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{s.student.english_name}</span>
                    )}
                  </span>

                  {!row && <span className="text-xs text-muted-foreground/50">無記錄</span>}
                  {row && isMakeupDone && (
                    <span className="text-xs text-teal-600 dark:text-teal-400">補課完成</span>
                  )}
                  {row && !isMakeupDone && (
                    <div className="flex shrink-0 gap-1">
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggle(s.student_id, opt.value)}
                          className={cn(
                            'h-7 rounded-md px-2 text-xs font-semibold transition-colors',
                            current === opt.value ? opt.active : opt.inactive,
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Makeup scheduling inline — only for absent_makeup students */}
                {row && !isMakeupDone && current === 'absent_makeup' && (
                  <div className="mt-1.5 flex items-center gap-2 pl-11">
                    {existingMakeups.length > 0 && (
                      <span className="text-xs text-teal-600 dark:text-teal-400">
                        已安排：{existingMakeups.map(m => m.session_date?.slice(5).replace('-', '/') ?? '待定').join(', ')}
                      </span>
                    )}
                    <input
                      type="date"
                      value={makeupSchedules[s.student_id] ?? ''}
                      onChange={e => setMakeupSchedules(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                      className="h-7 rounded border border-orange-200 bg-orange-50 px-2 text-xs text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100"
                      title="安排補課日期"
                    />
                    <span className="text-xs text-orange-600 dark:text-orange-400">安排補課</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-[#ff4d4f]"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
