'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, LayoutList } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LampBadge } from './LampBadge'
import { TaskUpdateDrawer } from './TaskUpdateDrawer'
import { lampFor, commentLamp, type LampDisplay } from '@/lib/grade/status'
import type { ClassDetail, Task, TaskRecord, TaskType, ClassStudent, Lamp } from '@/lib/grade/types'

// Lamp colour + label are derived from (status, task_type); an
// un-dispatched cell (no record) is treated as a neutral white.
function displayFor(task: Task, record?: TaskRecord): LampDisplay {
  if (!record) return { color: 'white', label: '' }
  return task.task_type === 'comment'
    ? commentLamp(record.comment_status)
    : lampFor(record.status, task.task_type)
}

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  attendance: '出席',
  homework:   '作業',
  practice:   '練習',
  quiz:       '考試',
  comment:    '評語',
}

const LAMP_BORDER: Record<Lamp, string> = {
  red:    'border-l-red-400',
  yellow: 'border-l-yellow-400',
  green:  'border-l-emerald-400',
  blue:   'border-l-blue-400',
  black:  'border-l-gray-500',
  white:  'border-l-gray-200',
  orange: 'border-l-orange-400',
}

const DONE_LAMPS: Lamp[] = ['green', 'white']

interface SelectedCell {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
}

export function KanbanBoard({ detail }: { detail: ClassDetail }) {
  const { class: cls, students, tasks, records } = detail
  const [activeStudentIdx, setActiveStudentIdx] = useState(0)
  const [hideDone, setHideDone] = useState(false)
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const router = useRouter()

  const recordMap = new Map<string, TaskRecord>()
  for (const r of records) {
    recordMap.set(`${r.student_id}:${r.task_id}`, r)
  }

  const handleCardClick = useCallback(
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

  const activeStudent = students[activeStudentIdx]
  const classSlug = encodeURIComponent(cls.legacy_class_id ?? cls.id)

  const visibleTasks = hideDone
    ? tasks.filter(t => {
        const r = activeStudent ? recordMap.get(`${activeStudent.student_id}:${t.id}`) : undefined
        return !DONE_LAMPS.includes(displayFor(t, r).color)
      })
    : tasks

  return (
    <div className="flex min-h-full flex-col bg-[#f2f3f5]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 md:px-6">
        <Link href={`/classes/${classSlug}`} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate font-semibold text-foreground">{cls.class_name} · Kanban</h1>
          <p className="text-xs text-muted-foreground">{students.length} 人 · {tasks.length} 項任務</p>
        </div>
        <Link
          href={`/classes/${classSlug}`}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <LayoutList size={14} />
          表格
        </Link>
      </div>

      {/* Student tabs */}
      <div className="overflow-x-auto border-b border-border bg-white">
        <div className="flex min-w-max px-2">
          {students.map((cs, idx) => {
            const unfinished = tasks.filter(t => {
              const r = recordMap.get(`${cs.student_id}:${t.id}`)
              return !DONE_LAMPS.includes(displayFor(t, r).color)
            }).length
            return (
              <button
                key={cs.student_id}
                onClick={() => setActiveStudentIdx(idx)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors',
                  idx === activeStudentIdx
                    ? 'border-b-2 border-gold text-gold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{cs.student.chinese_name}</span>
                <span className="text-[10px] opacity-60">{cs.student.english_name}</span>
                {unfinished > 0 && (
                  <span className="absolute right-1 top-1.5 grid size-4 place-items-center rounded-full bg-red-400 text-[9px] font-bold text-white">
                    {unfinished}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-end px-4 py-2">
        <button
          onClick={() => setHideDone(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {hideDone ? <Eye size={13} /> : <EyeOff size={13} />}
          {hideDone ? '顯示全部' : '隱藏已完成'}
        </button>
      </div>

      {/* Cards */}
      {!activeStudent ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">無學生資料</div>
      ) : visibleTasks.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">全部完成！</p>
            <p className="mt-1 text-sm">所有任務都已通過或免</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTasks.map(task => {
            const record = recordMap.get(`${activeStudent.student_id}:${task.id}`)
            const display = displayFor(task, record)
            const lamp = display.color
            const detail = task.task_type === 'quiz'
              ? (record?.result_history || record?.latest_result)
              : null
            return (
              <button
                key={task.id}
                onClick={() => handleCardClick(task, activeStudent)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-xl border border-border bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md',
                  'border-l-4',
                  LAMP_BORDER[lamp]
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.task_name ?? task.task_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TASK_TYPE_LABEL[task.task_type]}
                      {task.threshold != null && ` · 門檻 ${task.threshold}`}
                    </p>
                  </div>
                  <LampBadge color={display.color} label={display.label} detail={detail} />
                </div>
                {record?.result_history && (
                  <p className="text-[10px] text-muted-foreground">歷史：{record.result_history}</p>
                )}
                {record?.private_note && (
                  <p className="truncate text-[10px] text-muted-foreground">備註：{record.private_note}</p>
                )}
              </button>
            )
          })}
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
    </div>
  )
}
