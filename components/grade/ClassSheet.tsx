'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CalendarDays, ChevronDown, ChevronUp,
  ClipboardCheck, Kanban, MessageSquare, Pencil, ReceiptText, Send, Trash2, UserPlus,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AttendanceModal } from './AttendanceModal'
import { EnrollStudentModal } from './EnrollStudentModal'
import { LampBadge } from './LampBadge'
import { MakeupMarkModal } from './MakeupMarkModal'
import { TaskUpdateDrawer } from './TaskUpdateDrawer'
import { EditTaskModal } from './EditTaskModal'
import { SessionCommentModal } from './SessionCommentModal'
import { commentLamp, lampFor } from '@/lib/grade/status'
import { buildSessionSlots } from '@/lib/grade/session-model'
import type { SessionSlot } from '@/lib/grade/session-model'
import type {
  ClassDetail, ClassEnrollment, ClassSessionRow,
  Lamp, SessionDailyComment, Task, TaskRecord, TaskType,
} from '@/lib/grade/types'

type ViewMode = 'by-date' | 'by-lesson'

const TASK_SHORT: Record<TaskType, string> = {
  attendance: '出席',
  homework: '作業',
  practice: '練習',
  quiz: '考試',
  comment: '評論',
  progress: '進度',
}

const TASK_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
  homework: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  practice: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  quiz: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  comment: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  progress: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
}

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

interface SelectedCell {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
}

function initials(chinese: string, english: string): string {
  if (english?.trim()) return english.trim()[0].toUpperCase()
  if (chinese?.trim()) return chinese.trim().slice(-1)
  return '?'
}

function avatarColor(seed: string): string {
  let value = 0
  for (let i = 0; i < seed.length; i++) {
    value = (value + seed.charCodeAt(i)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[value]
}

function taskMeta(task: Task) {
  return [task.lesson_label].filter(Boolean).join(' ')
}

function thresholdText(task: Task) {
  if (task.threshold_value != null && task.max_score != null && task.max_score !== 100) {
    return `${task.threshold_value}/${task.max_score}`
  }
  if (task.threshold_value != null) return String(task.threshold_value)
  return task.threshold_text ?? ''
}

function attDisplay(row: ClassSessionRow | undefined): { label: string; color: Lamp } {
  if (!row || !row.attendance_status) return { label: '—', color: 'white' }
  if (row.attendance_status === 'present') return { label: '出', color: 'green' }
  if (row.attendance_status === 'late') return { label: '遲', color: 'yellow' }
  if (row.attendance_status === 'cancelled') return { label: '取', color: 'white' }
  if (row.attendance_status === 'absent') {
    if (row.absence_resolution === 'makeup_pending') return { label: '缺補', color: 'orange' }
    if (row.absence_resolution === 'makeup_done') return { label: '補✓', color: 'blue' }
    if (row.absence_resolution === 'refund') return { label: '缺退', color: 'black' }
    return { label: '缺', color: 'red' }
  }
  return { label: '—', color: 'white' }
}

// ─── Mobile slot card ────────────────────────────────────────────────────────

interface MobileSlotCardProps {
  slot: SessionSlot
  viewMode: ViewMode
  students: ClassEnrollment[]
  recordMap: Map<string, TaskRecord>
  bagId: string | null
  deletingTaskId: string | null
  onAttendance: () => void
  onMakeup: (row: ClassSessionRow, name: string) => void
  onTaskCell: (task: Task, student: ClassEnrollment) => void
  onDeleteTask: (taskId: string, taskName: string) => void
  onEditTask: (task: Task) => void
  onComment: () => void
  hasComment: boolean
}

function MobileSlotCard({
  slot,
  viewMode,
  students,
  recordMap,
  bagId,
  deletingTaskId,
  onAttendance,
  onMakeup,
  onTaskCell,
  onDeleteTask,
  onEditTask,
  onComment,
  hasComment,
}: MobileSlotCardProps) {
  const [expanded, setExpanded] = useState(true)
  const isIntensive = slot.session_kind === 'intensive'
  const dateLabel = slot.session_date.slice(5).replace('-', '/')
  const kindLabel = isIntensive ? '強化' : '團課'
  const borderColor = isIntensive
    ? 'border-l-rose-500 dark:border-l-rose-500/70'
    : 'border-l-red-400 dark:border-l-red-500/70'

  const lessonPrefix = viewMode === 'by-lesson'
    ? (slot.lesson_label ?? (slot.lessonNumber != null ? `第 ${slot.lessonNumber} 課` : null))
    : null
  const lessonTitle = lessonPrefix ? `${lessonPrefix} · ${dateLabel}` : dateLabel

  const hasAtt = slot.attendanceByStudent.size > 0
  const hasMakeups = slot.makeupsByStudent.size > 0

  const billabilityNote =
    slot.isBillable === null
      ? '尚未開袋 · 帳務狀態未知'
      : slot.isBillable === false
        ? '不計費'
        : null

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border border-l-[3px]', borderColor)}>
      <div className="flex items-center gap-2 bg-muted/40 px-4 py-3">
        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP['attendance'])}>
          {kindLabel}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={`${lessonTitle}，${expanded ? '收合' : '展開'}`}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate font-medium text-foreground">{lessonTitle}</span>
          {billabilityNote && (
            <span className="block text-[10px] text-muted-foreground/60">{billabilityNote}</span>
          )}
        </button>

        {bagId && hasAtt && (
          <button
            type="button"
            onClick={onAttendance}
            aria-label="點名"
            className="shrink-0 rounded p-1 text-sky-500/70 transition-colors hover:text-sky-600"
          >
            <ClipboardCheck size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onComment}
          aria-label="班級評語"
          className={cn(
            'shrink-0 rounded p-1 transition-colors',
            hasComment
              ? 'text-teal-500 hover:text-teal-600'
              : 'text-muted-foreground/30 hover:text-teal-500'
          )}
        >
          <MessageSquare size={14} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? '收合' : '展開'}
          className="shrink-0 rounded p-1 text-muted-foreground/50"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="divide-y divide-border">
          {hasAtt ? (
            students.map((student) => {
              const row = slot.attendanceByStudent.get(student.student_id)
              const display = attDisplay(row)
              return (
                <div key={student.student_id} className="flex items-center gap-3 px-4 py-2">
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', avatarColor(student.student_id))}>
                    {initials(student.student.chinese_name, student.student.english_name)}
                  </span>
                  <span className="flex-1 text-sm text-foreground">{student.student.chinese_name}</span>
                  {row ? (
                    <button type="button" onClick={onAttendance} aria-label={`${student.student.chinese_name} 出席狀態：${display.label}`}>
                      <LampBadge color={display.color} label={display.label} detail={null} />
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </div>
              )
            })
          ) : (
            <p className="px-4 py-2 text-xs text-muted-foreground/60">
              {slot.isBillable === null ? '尚未開袋，無出席紀錄' : '無出席資料'}
            </p>
          )}

          {slot.tasks.length > 0 && (
            <div className="space-y-1.5 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">教學任務</p>
              {slot.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
                    {TASK_SHORT[task.task_type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.task_name ?? '未命名任務'}</span>
                  <div className="flex gap-1">
                    {students.map((student) => {
                      const record = recordMap.get(`${student.student_id}:${task.id}`)
                      const display = task.task_type === 'comment'
                        ? commentLamp(record?.comment_status)
                        : lampFor(record?.status, task.task_type)
                      return (
                        <button
                          key={student.student_id}
                          type="button"
                          onClick={() => onTaskCell(task, student)}
                          aria-label={`${student.student.chinese_name} ${task.task_name ?? '任務'}`}
                          className="rounded p-0.5 hover:bg-muted"
                        >
                          {record
                            ? <LampBadge color={display.color} label={display.label} detail={null} />
                            : <span className="text-[10px] text-gray-300 dark:text-white/20">—</span>}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditTask(task)}
                    aria-label={`編輯 ${task.task_name ?? '任務'}`}
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-foreground"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id, task.task_name ?? '未命名任務')}
                    disabled={deletingTaskId === task.id}
                    aria-label={`刪除 ${task.task_name ?? '任務'}`}
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasMakeups && (
            <div className="divide-y divide-border">
              {Array.from(slot.makeupsByStudent.entries()).flatMap(([studentId, makeupRows]) => {
                const mkStudent = students.find((s) => s.student_id === studentId)
                return makeupRows.map((mkRow) => {
                  const mkDate = mkRow.session_date ? mkRow.session_date.slice(5).replace('-', '/') : '待定'
                  const mkDisplay = attDisplay(mkRow)
                  const mkName = mkStudent
                    ? `${mkStudent.student.chinese_name}${mkStudent.student.english_name ? ` ${mkStudent.student.english_name}` : ''}`
                    : studentId
                  return (
                    <div key={mkRow.id} className="flex items-center gap-3 bg-teal-50/50 px-4 py-2 dark:bg-teal-500/5">
                      <span className="text-xs text-muted-foreground/60">└</span>
                      <span className="shrink-0 rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
                        補 {mkDate}
                      </span>
                      <span className="flex-1 text-sm text-muted-foreground">{mkStudent?.student.chinese_name ?? studentId}</span>
                      <button
                        type="button"
                        onClick={() => onMakeup(mkRow, mkName)}
                        aria-label={`補課點名：${mkStudent?.student.chinese_name ?? studentId}`}
                      >
                        <LampBadge color={mkDisplay.color} label={mkDisplay.label} detail={null} />
                      </button>
                    </div>
                  )
                })
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClassSheet({ detail }: { detail: ClassDetail }) {
  const { class: cls, students, tasks, records } = detail
  const [viewMode, setViewMode] = useState<ViewMode>('by-date')
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [showEnroll, setShowEnroll] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [attendanceSlot, setAttendanceSlot] = useState<SessionSlot | null>(null)
  const [commentSlot, setCommentSlot] = useState<SessionSlot | null>(null)
  const [selectedMakeupRow, setSelectedMakeupRow] = useState<{ row: ClassSessionRow; studentName: string } | null>(null)
  const router = useRouter()

  const classSlug = encodeURIComponent(cls.id)
  const enrolledIds = students.map((s) => s.student_id)

  const recordMap = useMemo(() => {
    const map = new Map<string, TaskRecord>()
    for (const r of records) map.set(`${r.student_id}:${r.class_task_id}`, r)
    return map
  }, [records])

  const commentByDate = useMemo(() => {
    const map = new Map<string, SessionDailyComment>()
    for (const c of detail.sessionComments) map.set(c.session_date, c)
    return map
  }, [detail.sessionComments])

  const teachingTasks = useMemo(
    () => tasks.filter((t) => t.task_type !== 'attendance'),
    [tasks],
  )

  const { slots: sessionSlots, orphanTasks } = useMemo(
    () => buildSessionSlots(detail.sessionRows, teachingTasks),
    [detail.sessionRows, teachingTasks],
  )

  const { lessonGroups, unlessoned } = useMemo(() => {
    const groupMap = new Map<number, { lessonNumber: number; lesson_label: string | null; slots: SessionSlot[] }>()
    for (const slot of sessionSlots) {
      if (slot.lessonNumber !== null) {
        if (!groupMap.has(slot.lessonNumber)) {
          groupMap.set(slot.lessonNumber, { lessonNumber: slot.lessonNumber, lesson_label: slot.lesson_label, slots: [] })
        }
        groupMap.get(slot.lessonNumber)!.slots.push(slot)
      }
    }
    const lessonGroups = Array.from(groupMap.values()).sort((a, b) => a.lessonNumber - b.lessonNumber)
    const unlessoned = sessionSlots.filter((s) => s.lessonNumber === null)
    return { lessonGroups, unlessoned }
  }, [sessionSlots])

  const handleModalClose = (refresh?: boolean) => {
    setShowEnroll(false)
    if (refresh) router.refresh()
  }

  async function handleDispatch() {
    setDispatching(true)
    setDispatchMsg('')
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: cls.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '派發失敗')
      setDispatchMsg(data.dispatched > 0 ? `已建立 ${data.dispatched} 筆待處理紀錄` : (data.message ?? '沒有需要派發的任務'))
      if (data.dispatched > 0) router.refresh()
    } catch (err) {
      setDispatchMsg(err instanceof Error ? err.message : '派發失敗')
    } finally {
      setDispatching(false)
    }
  }

  async function handleDeleteTask(taskId: string, taskName: string) {
    if (!confirm(`刪除任務「${taskName}」？\n同時清除所有學生的相關記錄，無法復原。`)) return
    setDeletingTaskId(taskId)
    try {
      const res = await fetch(`/api/tasks?task_id=${taskId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? '刪除失敗')
      } else {
        router.refresh()
      }
    } finally {
      setDeletingTaskId(null)
    }
  }

  const handleCellClick = useCallback(
    (task: Task, student: ClassEnrollment) => {
      setSelected({
        task,
        student: {
          id: student.student_id,
          chinese_name: student.student.chinese_name,
          english_name: student.student.english_name,
        },
        record: recordMap.get(`${student.student_id}:${task.id}`) ?? null,
      })
    },
    [recordMap],
  )

  const handleClose = (refresh?: boolean) => {
    setSelected(null)
    if (refresh) router.refresh()
  }

  const toolButton =
    'inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-50'

  const gridCols = { gridTemplateColumns: `260px repeat(${students.length}, 96px)` }

  // ── Desktop grid helpers ─────────────────────────────────────────────────

  function renderStudentHeader() {
    return (
      <div style={gridCols} className="sticky top-0 z-30 grid rounded-t-lg border-b mac-hairline bg-white pl-5 dark:bg-[#2c2c2e]">
        <div className="sticky left-5 z-40 rounded-tl-lg bg-white px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:bg-[#2c2c2e]">
          {viewMode === 'by-date' ? '出席日 / 任務' : '課數 / 任務'}
        </div>
        {students.map((student, idx) => (
          <div
            key={student.student_id}
            className={cn(
              'bg-white px-3 py-3 text-center font-normal dark:bg-[#2c2c2e]',
              idx === students.length - 1 && 'rounded-tr-lg',
            )}
          >
            <span className={cn('mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full text-xs font-semibold', avatarColor(student.student_id))}>
              {initials(student.student.chinese_name, student.student.english_name)}
            </span>
            <span className="block text-xs font-medium leading-tight text-foreground">{student.student.chinese_name}</span>
            <span className="block text-[10px] text-muted-foreground">{student.student.english_name}</span>
          </div>
        ))}
      </div>
    )
  }

  function renderTaskRowCard(task: Task) {
    return (
      <div key={task.id} style={gridCols} className="grid items-center border-t border-border/40 transition-colors hover:bg-muted/30">
        <div className="sticky left-5 z-10 bg-white py-3 pl-4 pr-4 dark:bg-[#2c2c2e]">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
              {TASK_SHORT[task.task_type]}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{task.task_name ?? '未命名任務'}</p>
            <button
              type="button"
              onClick={() => setEditingTask(task)}
              aria-label={`編輯 ${task.task_name ?? '任務'}`}
              className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteTask(task.id, task.task_name ?? '未命名任務')}
              disabled={deletingTaskId === task.id}
              aria-label={`刪除 ${task.task_name ?? '任務'}`}
              className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {students.map((student) => {
          const rec = recordMap.get(`${student.student_id}:${task.id}`)
          const display = task.task_type === 'comment'
            ? commentLamp(rec?.comment_status)
            : lampFor(rec?.status, task.task_type)
          const detailText = task.task_type === 'quiz' ? (rec?.result_history || rec?.latest_result) : null
          return (
            <div key={student.student_id} className="px-2 py-2.5 text-center">
              <button
                type="button"
                onClick={() => handleCellClick(task, student)}
                className="inline-flex min-h-7 items-center justify-center rounded-md px-1.5 py-0.5 transition-colors hover:bg-gray-300/60 dark:hover:bg-white/10"
              >
                {rec
                  ? <LampBadge color={display.color} label={display.label} detail={detailText} />
                  : <span className="text-xs text-gray-300 dark:text-white/20">未派發</span>}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  function renderMakeupRowCard(studentId: string, mkRow: ClassSessionRow) {
    const mkDate = mkRow.session_date ? mkRow.session_date.slice(5).replace('-', '/') : '待定'
    const mkDisplay = attDisplay(mkRow)
    const mkStudent = students.find((s) => s.student_id === studentId)
    const mkName = mkStudent
      ? `${mkStudent.student.chinese_name}${mkStudent.student.english_name ? ` ${mkStudent.student.english_name}` : ''}`
      : studentId

    return (
      <div key={mkRow.id} style={gridCols} className="grid items-center border-t border-border/40">
        <div className="sticky left-5 z-10 bg-white px-4 py-3 dark:bg-[#2c2c2e]">
          <div className="flex min-w-0 items-start gap-2 pl-6">
            <span className="mt-0.5 text-xs text-muted-foreground/60">└</span>
            <span className="mt-0.5 shrink-0 rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">補 {mkDate}</span>
          </div>
        </div>
        {students.map((student) => (
          <div key={student.student_id} className="px-2 py-3 text-center">
            {student.student_id === studentId ? (
              <button
                type="button"
                onClick={() => setSelectedMakeupRow({ row: mkRow, studentName: mkName })}
                aria-label={`補課點名：${mkName}`}
                className="inline-flex min-h-8 items-center justify-center rounded-md px-1.5 py-1 transition-colors hover:bg-teal-200/50 dark:hover:bg-teal-500/20"
              >
                <LampBadge color={mkDisplay.color} label={mkDisplay.label} detail={null} />
              </button>
            ) : (
              <span className="text-gray-200 dark:text-white/10">—</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderSessionCard(slot: SessionSlot) {
    const isIntensive = slot.session_kind === 'intensive'
    const accent = isIntensive
      ? 'border-l-rose-500 dark:border-l-rose-500/70'
      : 'border-l-red-400 dark:border-l-red-500/70'
    const dateLabel = slot.session_date.slice(5).replace('-', '/')
    const kindLabel = isIntensive ? '強' : '團'
    const hasAtt = slot.attendanceByStudent.size > 0
    const makeupEntries = Array.from(slot.makeupsByStudent.entries()).flatMap(([studentId, makeupRows]) =>
      makeupRows.map((row) => ({ studentId, row })),
    )

    return (
      <div key={slot.sessionKey} className={cn('mb-4 rounded-lg mac-soft border-l-4 pb-1', accent)}>
        <div style={gridCols} className="grid rounded-t-lg border-b border-red-200/70 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
          <div className="sticky left-5 z-20 rounded-tl-lg bg-red-50 px-4 py-4 dark:bg-red-500/10">
            <div className="flex min-w-0 items-start gap-2">
              <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP.attendance)}>
                {kindLabel}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{dateLabel}</p>
                {slot.isBillable === false && (
                  <p className="text-[10px] text-muted-foreground/60">不計費</p>
                )}
                {slot.isBillable === null && (
                  <p className="text-[10px] text-muted-foreground/60">尚未開袋</p>
                )}
              </div>
              {detail.bag_id && hasAtt && (
                <button
                  type="button"
                  onClick={() => setAttendanceSlot(slot)}
                  aria-label="點名"
                  className="mt-0.5 shrink-0 rounded p-1 text-sky-500/70 transition-colors hover:text-sky-600"
                >
                  <ClipboardCheck size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCommentSlot(slot)}
                aria-label="班級評語"
                className={cn(
                  'mt-0.5 shrink-0 rounded p-1 transition-colors',
                  commentByDate.has(slot.session_date)
                    ? 'text-teal-500 hover:text-teal-600'
                    : 'text-muted-foreground/30 hover:text-teal-500'
                )}
              >
                <MessageSquare size={13} />
              </button>
            </div>
          </div>
          {students.map((student) => {
            const row = slot.attendanceByStudent.get(student.student_id)
            const display = attDisplay(row)
            return (
              <div key={student.student_id} className="px-2 py-3 text-center">
                {row ? (
                  <button
                    type="button"
                    onClick={() => setAttendanceSlot(slot)}
                    aria-label={`${student.student.chinese_name} 出席：${display.label}`}
                    className="inline-flex min-h-8 items-center justify-center rounded-md px-1.5 py-1 transition-colors hover:bg-sky-200/50 dark:hover:bg-sky-500/20"
                  >
                    <LampBadge color={display.color} label={display.label} detail={null} />
                  </button>
                ) : (
                  <span className="text-gray-200 dark:text-white/10">—</span>
                )}
              </div>
            )
          })}
        </div>
        {slot.tasks.map((task) => renderTaskRowCard(task))}
        {makeupEntries.map(({ studentId, row }) => renderMakeupRowCard(studentId, row))}
      </div>
    )
  }

  function renderOrphanTasks() {
    if (orphanTasks.length === 0) return null
    return (
      <div className="mb-3 rounded-lg mac-soft">
        <div className="sticky left-5 border-b border-border bg-muted/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          未對應課次的任務
        </div>
        {orphanTasks.map((task) => renderTaskRowCard(task))}
      </div>
    )
  }

  // ── By-date mode ─────────────────────────────────────────────────────────

  function renderByDate() {
    return (
      <>
        {sessionSlots.map((slot) => renderSessionCard(slot))}
        {renderOrphanTasks()}
        {sessionSlots.length === 0 && orphanTasks.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">還沒有課程資料，請先開袋</p>
        )}
      </>
    )
  }

  // ── By-lesson mode ────────────────────────────────────────────────────────

  function renderByLesson() {
    return (
      <>
        {lessonGroups.map((group) => (
          <div key={group.lessonNumber}>
            <div className="sticky left-5 mb-2 border-b border-border bg-muted/50 px-4 py-1.5 text-xs font-semibold text-foreground">
              {group.lesson_label ?? `第 ${group.lessonNumber} 課`}
            </div>
            {group.slots.map((slot) => renderSessionCard(slot))}
          </div>
        ))}

        {unlessoned.length > 0 && (
          <div>
            <div className="sticky left-5 mb-2 border-b border-border bg-muted/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              未編課（不計費 / 尚未開袋）
            </div>
            {unlessoned.map((slot) => renderSessionCard(slot))}
          </div>
        )}

        {renderOrphanTasks()}

        {sessionSlots.length === 0 && orphanTasks.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">還沒有課程資料，請先開袋</p>
        )}
      </>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-col">
      {/* Toolbar */}
      <div className="mac-glass mac-hairline sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
        <Link
          href="/classes"
          className="rounded-md p-1.5 text-foreground/55 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="回班級列表"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold tracking-tight text-foreground">{cls.class_name}</h1>
          <p className="text-xs text-muted-foreground">
            {cls.class_code ?? cls.id.slice(0, 8)} · {students.length} 位學生 · {tasks.length} 筆任務
          </p>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setViewMode('by-date')}
            aria-pressed={viewMode === 'by-date'}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'by-date'
                ? 'bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            依出席日
          </button>
          <button
            type="button"
            onClick={() => setViewMode('by-lesson')}
            aria-pressed={viewMode === 'by-lesson'}
            className={cn(
              'border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'by-lesson'
                ? 'bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            依課數
          </button>
        </div>

        <button type="button" onClick={() => setShowEnroll(true)} className={toolButton}>
          <UserPlus size={14} />加學生
        </button>
        <button type="button" onClick={handleDispatch} disabled={dispatching} className={toolButton}>
          <Send size={14} />{dispatching ? '派發中' : '派發'}
        </button>
        <Link href={`/billing?classId=${classSlug}`} className={toolButton}>
          <ReceiptText size={14} />開袋
        </Link>
        <Link href={`/classes/${classSlug}/plan`} className={toolButton}>
          <CalendarDays size={14} />整季計畫
        </Link>
        <Link href={`/classes/${classSlug}/kanban`} className={toolButton}>
          <Kanban size={14} />Kanban
        </Link>
      </div>

      {dispatchMsg && (
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:px-6">
          {dispatchMsg}
        </div>
      )}

      {students.length === 0 ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
          <p>還沒有學生</p>
        </div>
      ) : (
        <>
          {/* ── Mobile card layout ── */}
          <div className="space-y-3 p-4 md:hidden">
            {sessionSlots.length === 0 && orphanTasks.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">還沒有課程資料，請先開袋</p>
            ) : (
              <>
                {(viewMode === 'by-date' ? sessionSlots : [...lessonGroups.flatMap((group) => group.slots), ...unlessoned]).map((slot) => (
                  <MobileSlotCard
                    key={slot.sessionKey}
                    slot={slot}
                    viewMode={viewMode}
                    students={students}
                    recordMap={recordMap}
                    bagId={detail.bag_id}
                    deletingTaskId={deletingTaskId}
                    onAttendance={() => setAttendanceSlot(slot)}
                    onMakeup={(row, name) => setSelectedMakeupRow({ row, studentName: name })}
                    onTaskCell={handleCellClick}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={setEditingTask}
                    onComment={() => setCommentSlot(slot)}
                    hasComment={commentByDate.has(slot.session_date)}
                  />
                ))}
                {orphanTasks.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="bg-muted/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                      未對應課次的任務
                    </div>
                    <div className="divide-y divide-border">
                      {orphanTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 px-4 py-3">
                          <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
                            {TASK_SHORT[task.task_type]}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.task_name ?? '未命名任務'}</span>
                          <div className="flex gap-1">
                            {students.map((student) => {
                              const record = recordMap.get(`${student.student_id}:${task.id}`)
                              const display = task.task_type === 'comment'
                                ? commentLamp(record?.comment_status)
                                : lampFor(record?.status, task.task_type)
                              return (
                                <button
                                  key={student.student_id}
                                  type="button"
                                  onClick={() => handleCellClick(task, student)}
                                  aria-label={`${student.student.chinese_name} ${task.task_name ?? '任務'}`}
                                  className="rounded p-0.5 hover:bg-muted"
                                >
                                  {record
                                    ? <LampBadge color={display.color} label={display.label} detail={null} />
                                    : <span className="text-[10px] text-gray-300 dark:text-white/20">—</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Desktop grid ── */}
          <div className="hidden min-h-0 flex-1 overflow-hidden p-4 md:block md:p-6">
            <div className="mac-card h-full overflow-hidden rounded-lg border border-border">
              <div className="h-full overflow-auto bg-muted/30">
                {renderStudentHeader()}
                <div className="px-4 pt-3 pb-4">
                  {viewMode === 'by-date' ? renderByDate() : renderByLesson()}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {attendanceSlot && detail.bag_id && (
        <AttendanceModal
          sessionDate={attendanceSlot.session_date}
          sessionKind={attendanceSlot.session_kind}
          rows={Array.from(attendanceSlot.attendanceByStudent.values())}
          makeupsByStudent={attendanceSlot.makeupsByStudent}
          bagId={detail.bag_id}
          students={students}
          onClose={(refresh) => { setAttendanceSlot(null); if (refresh) router.refresh() }}
        />
      )}

      {selectedMakeupRow && detail.bag_id && (
        <MakeupMarkModal
          makeupRow={selectedMakeupRow.row}
          studentName={selectedMakeupRow.studentName}
          bagId={detail.bag_id}
          onClose={(refresh) => { setSelectedMakeupRow(null); if (refresh) router.refresh() }}
        />
      )}

      {selected && (
        <TaskUpdateDrawer
          task={selected.task}
          student={selected.student}
          record={selected.record}
          classDepartment={cls.department}
          onClose={handleClose}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={(refresh) => { setEditingTask(null); if (refresh) router.refresh() }}
        />
      )}

      {commentSlot && (
        <SessionCommentModal
          classId={cls.id}
          sessionDate={commentSlot.session_date}
          existingComment={commentByDate.get(commentSlot.session_date) ?? null}
          onClose={(refresh) => { setCommentSlot(null); if (refresh) router.refresh() }}
        />
      )}

      {showEnroll && (
        <EnrollStudentModal
          classId={cls.id}
          enrolledIds={enrolledIds}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}
