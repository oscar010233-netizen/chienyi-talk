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

  return (
    <div className="flex min-h-full flex-col bg-[#f2f3f5]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 md:px-6">
        <Link href="/classes" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate font-semibold text-foreground">{cls.class_name}</h1>
          <p className="text-xs text-muted-foreground">
            {cls.legacy_class_id} · {students.length} 人 · {tasks.length} 項任務
          </p>
        </div>
        <button
          onClick={() => setShowEnroll(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <UserPlus size={14} />
          新增學生
        </button>
        <button
          onClick={() => setShowAddTask(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <Plus size={14} />
          新增任務
        </button>
        <button
          onClick={handleDispatch}
          disabled={dispatching}
          title="為班上所有學生 × 任務補上缺少的任務記錄"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <Send size={14} />
          {dispatching ? '派發中…' : '派發任務'}
        </button>
        {dispatchMsg && (
          <span className="text-xs text-muted-foreground">{dispatchMsg}</span>
        )}
        <Link
          href={`/classes/${classSlug}/kanban`}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
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
        <div className="flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 bg-white text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[7rem] border-b border-r border-border bg-white px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  任務
                </th>
                {students.map(cs => (
                  <th
                    key={cs.student_id}
                    className="sticky top-0 z-20 min-w-[5.5rem] border-b border-r border-border bg-white px-2 py-2 text-center text-xs font-medium"
                  >
                    <span className="block leading-tight text-foreground">{cs.student.chinese_name}</span>
                    <span className="block text-muted-foreground opacity-60">{cs.student.english_name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, rowIdx) => (
                <tr key={task.id} className={rowIdx % 2 === 1 ? 'bg-muted/30' : ''}>
                  <td className={cn(
                    'sticky left-0 z-10 border-b border-r border-border px-3 py-2 text-xs',
                    rowIdx % 2 === 1 ? 'bg-muted/30' : 'bg-white'
                  )}>
                    <span className="flex items-center gap-1">
                      <span className="rounded bg-muted px-1 font-mono font-semibold text-muted-foreground text-[10px]">
                        {TASK_SHORT[task.task_type]}
                      </span>
                      <span className="text-foreground">{task.task_name ?? task.task_code}</span>
                    </span>
                    {task.threshold != null && (
                      <span className="text-[10px] text-muted-foreground">門檻 {task.threshold}</span>
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
                        className="border-b border-r border-border px-1.5 py-1.5 text-center"
                      >
                        <button
                          onClick={() => handleCellClick(task, cs)}
                          className="rounded-md px-1 py-0.5 transition-colors hover:bg-muted"
                        >
                          {record
                            ? <LampBadge color={display.color} label={display.label} detail={detail} />
                            : <span className="text-muted-foreground/40">–</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
