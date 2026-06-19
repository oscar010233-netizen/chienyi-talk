'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, ClipboardCheck, Kanban, Plus, ReceiptText, Send, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AddTaskModal } from './AddTaskModal'
import { AttendanceModal } from './AttendanceModal'
import { EnrollStudentModal } from './EnrollStudentModal'
import { LampBadge } from './LampBadge'
import { TaskUpdateDrawer } from './TaskUpdateDrawer'
import { commentLamp, lampFor } from '@/lib/grade/status'
import type { ClassDetail, ClassEnrollment, Task, TaskRecord, TaskType } from '@/lib/grade/types'

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
  for (let index = 0; index < seed.length; index++) {
    value = (value + seed.charCodeAt(index)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[value]
}

function taskMeta(task: Task) {
  return [task.week_label, task.lesson_label].filter(Boolean).join(' ')
}

function thresholdText(task: Task) {
  if (task.threshold_value != null && task.max_score != null && task.max_score !== 100) {
    return `${task.threshold_value}/${task.max_score}`
  }
  if (task.threshold_value != null) return String(task.threshold_value)
  return task.threshold_text ?? ''
}

export function ClassSheet({ detail }: { detail: ClassDetail }) {
  const { class: cls, students, tasks, records } = detail
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [attendanceTask, setAttendanceTask] = useState<Task | null>(null)
  const router = useRouter()

  const classSlug = encodeURIComponent(cls.id)
  const enrolledIds = students.map((student) => student.student_id)

  const recordMap = useMemo(() => {
    const map = new Map<string, TaskRecord>()
    for (const record of records) {
      map.set(`${record.student_id}:${record.class_task_id}`, record)
    }
    return map
  }, [records])

  const sessions = detail.sessions

  // Map attendance class_tasks by session_date:session_kind for lookup (used by modal)
  const attendanceTaskMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) {
      if (t.task_type === 'attendance' && t.session_date && t.session_kind) {
        map.set(`${t.session_date}:${t.session_kind}`, t)
      }
    }
    return map
  }, [tasks])

  const otherTasks = useMemo(() => tasks.filter((t) => t.task_type !== 'attendance'), [tasks])

  const handleModalClose = (refresh?: boolean) => {
    setShowAddTask(false)
    setShowEnroll(false)
    if (refresh) router.refresh()
  }

  async function handleDispatch() {
    setDispatching(true)
    setDispatchMsg('')

    try {
      const response = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: cls.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '派發失敗')

      setDispatchMsg(data.dispatched > 0 ? `已建立 ${data.dispatched} 筆待處理紀錄` : (data.message ?? '沒有需要派發的任務'))
      if (data.dispatched > 0) router.refresh()
    } catch (error) {
      setDispatchMsg(error instanceof Error ? error.message : '派發失敗')
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

  return (
    <div className="flex min-h-full flex-col">
      <div className="mac-glass mac-hairline sticky top-0 z-40 flex items-center gap-2 border-b px-4 py-2.5 md:px-6">
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

        <button type="button" onClick={() => setShowEnroll(true)} className={toolButton}>
          <UserPlus size={14} />
          加學生
        </button>
        <button type="button" onClick={() => setShowAddTask(true)} className={toolButton}>
          <Plus size={14} />
          加任務
        </button>
        <button type="button" onClick={handleDispatch} disabled={dispatching} className={toolButton}>
          <Send size={14} />
          {dispatching ? '派發中' : '派發'}
        </button>
        <Link href={`/billing?classId=${classSlug}`} className={toolButton}>
          <ReceiptText size={14} />
          開袋
        </Link>
        <Link href={`/classes/${classSlug}/plan`} className={toolButton}>
          <CalendarDays size={14} />
          整季計畫
        </Link>
        <Link href={`/classes/${classSlug}/kanban`} className={toolButton}>
          <Kanban size={14} />
          Kanban
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
        <div className="min-h-0 flex-1 overflow-hidden p-4 md:p-6">
          <div className="mac-card h-full overflow-auto rounded-lg">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[17rem] border-b border-border bg-white px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:bg-[#2c2c2e]">
                    任務
                  </th>
                  {students.map((student) => (
                    <th
                      key={student.student_id}
                      className="sticky top-0 z-20 min-w-[7rem] border-b border-border bg-white px-3 py-3 text-center align-bottom font-normal dark:bg-[#2c2c2e]"
                    >
                      <span className={cn('mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full text-xs font-semibold', avatarColor(student.student_id))}>
                        {initials(student.student.chinese_name, student.student.english_name)}
                      </span>
                      <span className="block text-xs font-medium leading-tight text-foreground">{student.student.chinese_name}</span>
                      <span className="block text-[10px] text-muted-foreground">{student.student.english_name}</span>
                    </th>
                  ))}
                  <th aria-hidden className="w-full border-b border-border bg-white dark:bg-[#2c2c2e]" />
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && otherTasks.length === 0 && (
                  <tr>
                    <td colSpan={students.length + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      還沒有課程資料，請先開袋
                    </td>
                  </tr>
                )}

                {/* 出席區 — 從 payment_bag_line_sessions 讀取，每個 session 一列 */}
                {sessions.map((session) => {
                  const sessionKey = `${session.session_date}:${session.session_kind}`
                  const task = attendanceTaskMap.get(sessionKey) ?? null
                  const isIntensive = session.session_kind === 'intensive'
                  const attBg = isIntensive
                    ? 'bg-violet-50/70 dark:bg-violet-500/[0.06] group-hover:bg-violet-100/70 dark:group-hover:bg-violet-500/[0.10]'
                    : 'bg-sky-50/70 dark:bg-sky-500/[0.06] group-hover:bg-sky-100/70 dark:group-hover:bg-sky-500/[0.10]'
                  const borderColor = isIntensive ? 'border-l-violet-400 dark:border-l-violet-500/70' : 'border-l-sky-400 dark:border-l-sky-500/70'
                  const dateLabel = session.session_date.slice(5).replace('-', '/')
                  const kindLabel = isIntensive ? '強' : '團'
                  return (
                    <tr key={sessionKey} className="group">
                      <td className={cn('sticky left-0 z-10 border-b border-border border-l-[3px] px-4 py-3.5 transition-colors', attBg, borderColor)}>
                        <div className="flex min-w-0 items-start gap-2">
                          <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP['attendance'])}>
                            {kindLabel}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{dateLabel}</p>
                          </div>
                          {task && (
                            <button
                              type="button"
                              onClick={() => setAttendanceTask(task)}
                              title="點名"
                              className="mt-0.5 shrink-0 rounded p-1 text-sky-500/70 transition-colors hover:text-sky-600"
                            >
                              <ClipboardCheck size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                      {students.map((student) => {
                        const record = task ? recordMap.get(`${student.student_id}:${task.id}`) : undefined
                        const display = lampFor(record?.status, 'attendance')
                        return (
                          <td key={student.student_id} className={cn('border-b border-border px-2 py-2.5 text-center transition-colors', attBg)}>
                            {task ? (
                              <button
                                type="button"
                                onClick={() => handleCellClick(task, student)}
                                className="inline-flex min-h-8 items-center justify-center rounded-md px-1.5 py-1 transition-colors hover:bg-sky-200/50 dark:hover:bg-sky-500/20"
                              >
                                {record
                                  ? <LampBadge color={display.color} label={display.label} detail={null} />
                                  : <span className="text-gray-300 dark:text-white/20">未派發</span>}
                              </button>
                            ) : (
                              <span className="text-gray-200 dark:text-white/10">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td aria-hidden className={cn('border-b border-border transition-colors', attBg)} />
                    </tr>
                  )
                })}

                {/* 分隔線 */}
                {sessions.length > 0 && (
                  <tr>
                    <td
                      colSpan={students.length + 2}
                      className="border-b border-border bg-muted/50 px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
                    >
                      教師任務
                    </td>
                  </tr>
                )}

                {/* 教師任務區 */}
                {otherTasks.length === 0 && sessions.length > 0 && (
                  <tr>
                    <td colSpan={students.length + 2} className="px-4 py-6 text-center text-sm text-muted-foreground/60">
                      點「加任務」新增這季的考試、作業、練習
                    </td>
                  </tr>
                )}
                {otherTasks.map((task, rowIndex) => {
                  const zebra = cn(
                    rowIndex % 2 === 1 ? 'bg-[#f3f4f6] dark:bg-[#353537]' : 'bg-white dark:bg-[#2c2c2e]',
                    'group-hover:bg-[#e5e7eb] dark:group-hover:bg-[#3a3a3c]',
                  )
                  const meta = taskMeta(task)
                  const threshold = thresholdText(task)
                  return (
                    <tr key={task.id} className="group">
                      <td className={cn('sticky left-0 z-10 border-b border-border px-4 py-3.5 transition-colors', zebra)}>
                        <div className="flex min-w-0 items-start gap-2">
                          <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
                            {TASK_SHORT[task.task_type]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{task.task_name ?? '未命名任務'}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {meta || '未設定週數/課數'}
                              {threshold && <span> · 門檻 {threshold}</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id, task.task_name ?? '未命名任務')}
                            disabled={deletingTaskId === task.id}
                            title="刪除任務"
                            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:text-red-500 disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                      {students.map((student) => {
                        const record = recordMap.get(`${student.student_id}:${task.id}`)
                        const isComment = task.task_type === 'comment'
                        const display = isComment
                          ? commentLamp(record?.comment_status)
                          : lampFor(record?.status, task.task_type)
                        const detailText = task.task_type === 'quiz'
                          ? (record?.result_history || record?.latest_result)
                          : null
                        return (
                          <td key={student.student_id} className={cn('border-b border-border px-2 py-2.5 text-center transition-colors', zebra)}>
                            <button
                              type="button"
                              onClick={() => handleCellClick(task, student)}
                              className="inline-flex min-h-8 items-center justify-center rounded-md px-1.5 py-1 transition-colors hover:bg-gray-300/60 dark:hover:bg-white/10"
                            >
                              {record
                                ? <LampBadge color={display.color} label={display.label} detail={detailText} />
                                : <span className="text-gray-300 dark:text-white/20">未派發</span>}
                            </button>
                          </td>
                        )
                      })}
                      <td aria-hidden className={cn('border-b border-border transition-colors', zebra)} />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {attendanceTask && (
        <AttendanceModal
          task={attendanceTask}
          students={students}
          recordMap={recordMap}
          onClose={(refresh) => { setAttendanceTask(null); if (refresh) router.refresh() }}
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

      {showAddTask && (
        <AddTaskModal
          classId={cls.id}
          classDepartment={cls.department}
          onClose={handleModalClose}
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
