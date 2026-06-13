'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Kanban, Send, UserPlus, Plus } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LampBadge } from './LampBadge'
import { TaskUpdateDrawer } from './TaskUpdateDrawer'
import { AddTaskModal } from './AddTaskModal'
import { EnrollStudentModal } from './EnrollStudentModal'
import { lampFor, commentLamp } from '@/lib/grade/status'
import type { ClassDetail, Task, TaskRecord, TaskType, ClassStudent } from '@/lib/grade/types'

const TASK_SHORT: Record<TaskType, string> = {
  attendance: '出',
  homework:   '交',
  practice:   '練',
  quiz:       '考',
  comment:    '評',
}

// Type chips — one step darker than the row tint so they stay legible on it.
const TASK_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700',
  homework:   'bg-violet-100 text-violet-700',
  practice:   'bg-amber-100 text-amber-700',
  quiz:       'bg-rose-100 text-rose-700',
  comment:    'bg-teal-100 text-teal-700',
}

// Faint per-type row background (solid so the sticky first column stays opaque),
// with a slightly stronger tint on hover.
const TASK_ROW: Record<TaskType, string> = {
  attendance: 'bg-sky-50 group-hover:bg-sky-100/70',
  homework:   'bg-violet-50 group-hover:bg-violet-100/70',
  practice:   'bg-amber-50 group-hover:bg-amber-100/70',
  quiz:       'bg-rose-50 group-hover:bg-rose-100/70',
  comment:    'bg-teal-50 group-hover:bg-teal-100/70',
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

function initials(chinese: string, english: string): string {
  if (english?.trim()) return english.trim()[0].toUpperCase()
  if (chinese?.trim()) return chinese.trim().slice(-1)
  return '?'
}

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

interface SelectedCell {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
}

export function ClassSheet({ detail }: { detail: ClassDetail }) {
  const { class: cls, students, tasks, records } = detail
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)
  const router = useRouter()

  const enrolledIds = students.map(cs => cs.student_id)

  const handleModalClose = (refresh?: boolean) => {
    setShowAddTask(false)
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
      setDispatchMsg(data.dispatched > 0 ? `已派發 ${data.dispatched} 筆任務` : (data.message ?? '已是最新'))
      if (data.dispatched > 0) router.refresh()
    } catch {
      setDispatchMsg('派發失敗')
    } finally {
      setDispatching(false)
    }
  }

  const recordMap = new Map<string, TaskRecord>()
  for (const r of records) {
    recordMap.set(`${r.student_id}:${r.task_id}`, r)
  }

  const handleCellClick = useCallback(
    (task: Task, cs: ClassStudent) => {
      setSelected({
        task,
        student: {
          id: cs.student_id,
          chinese_name: cs.student.chinese_name,
          english_name: cs.student.english_name,
        },
        record: recordMap.get(`${cs.student_id}:${task.id}`) ?? null,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records]
  )

  const handleClose = (refresh?: boolean) => {
    setSelected(null)
    if (refresh) router.refresh()
  }

  const classSlug = encodeURIComponent(cls.legacy_class_id ?? cls.id)

  // macOS-style bordered toolbar button
  const toolBtn =
    'flex items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-white/80 px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-white active:scale-[0.97] disabled:opacity-50'

  return (
    <div className="flex min-h-full flex-col">
      {/* Toolbar (frosted glass) */}
      <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-black/[0.07] bg-white/70 px-4 py-2.5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 md:px-6">
        <Link href="/classes" className="rounded-[7px] p-1.5 text-foreground/55 transition-colors hover:bg-black/[0.05] hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate font-semibold tracking-tight text-foreground">{cls.class_name}</h1>
          <p className="text-xs text-muted-foreground">
            {cls.legacy_class_id} · {students.length} 人 · {tasks.length} 項任務
          </p>
        </div>
        <button onClick={() => setShowEnroll(true)} className={toolBtn}>
          <UserPlus size={14} />
          新增學生
        </button>
        <button onClick={() => setShowAddTask(true)} className={toolBtn}>
          <Plus size={14} />
          新增任務
        </button>
        <button
          onClick={handleDispatch}
          disabled={dispatching}
          title="為班上所有學生 × 任務補上缺少的任務記錄"
          className={toolBtn}
        >
          <Send size={14} />
          {dispatching ? '派發中…' : '派發任務'}
        </button>
        {dispatchMsg && (
          <span className="text-xs text-muted-foreground">{dispatchMsg}</span>
        )}
        <Link href={`/classes/${classSlug}/kanban`} className={toolBtn}>
          <Kanban size={14} />
          Kanban
        </Link>
      </div>

      {/* Matrix */}
      {tasks.length === 0 || students.length === 0 ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
          <p>{tasks.length === 0 ? '此班尚無任務' : '此班尚無學生'}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="h-full overflow-auto rounded-[18px] bg-white/95 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18),0_4px_12px_-8px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-sm">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[11rem] border-b border-gray-200 bg-white px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    任務
                  </th>
                  {students.map(cs => (
                    <th
                      key={cs.student_id}
                      className="sticky top-0 z-20 min-w-[6.5rem] border-b border-gray-200 bg-white px-3 py-3 text-center align-bottom font-normal"
                    >
                      <span className={cn(
                        'mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full text-xs font-semibold',
                        avatarColor(cs.student_id)
                      )}>
                        {initials(cs.student.chinese_name, cs.student.english_name)}
                      </span>
                      <span className="block text-xs font-medium leading-tight text-foreground">{cs.student.chinese_name}</span>
                      <span className="block text-[10px] text-muted-foreground">{cs.student.english_name}</span>
                    </th>
                  ))}
                  {/* filler keeps the real columns packed to the left */}
                  <th aria-hidden className="w-full border-b border-gray-200 bg-white" />
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const rowBg = TASK_ROW[task.task_type]
                  return (
                  <tr key={task.id} className="group">
                    <td className={cn('sticky left-0 z-10 border-b border-gray-100 px-4 py-3.5 transition-colors', rowBg)}>
                      <span className="flex items-center gap-2">
                        <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
                          {TASK_SHORT[task.task_type]}
                        </span>
                        <span className="font-medium text-foreground">{task.task_name ?? task.task_code}</span>
                      </span>
                      {task.threshold != null && (
                        <span className="mt-0.5 block pl-7 text-[11px] text-muted-foreground">門檻 {task.threshold}</span>
                      )}
                    </td>
                    {students.map(cs => {
                      const record = recordMap.get(`${cs.student_id}:${task.id}`)
                      const isComment = task.task_type === 'comment'
                      const display = isComment
                        ? commentLamp(record?.comment_status)
                        : lampFor(record?.status, task.task_type)
                      // Scores only matter for quizzes; prefer the full history.
                      const detail = task.task_type === 'quiz'
                        ? (record?.result_history || record?.latest_result)
                        : null
                      return (
                        <td
                          key={cs.student_id}
                          className={cn('border-b border-gray-100 px-2 py-2.5 text-center transition-colors', rowBg)}
                        >
                          <button
                            onClick={() => handleCellClick(task, cs)}
                            className="inline-flex items-center justify-center rounded-lg px-1.5 py-1 transition-colors hover:bg-gray-100"
                          >
                            {record
                              ? <LampBadge color={display.color} label={display.label} detail={detail} />
                              : <span className="text-gray-300">–</span>}
                          </button>
                        </td>
                      )
                    })}
                    <td aria-hidden className={cn('border-b border-gray-100 transition-colors', rowBg)} />
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <TaskUpdateDrawer
          task={selected.task}
          student={selected.student}
          record={selected.record}
          classId={cls.id}
          onClose={handleClose}
        />
      )}

      {showAddTask && (
        <AddTaskModal classId={cls.id} onClose={handleModalClose} />
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
