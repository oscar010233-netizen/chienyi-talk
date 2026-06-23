'use client'

import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import type { Task, TaskType } from '@/lib/grade/types'
import { cn } from '@/lib/utils'

interface Props {
  task: Task
  onClose: (refresh?: boolean) => void
}

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

export function EditTaskModal({ task, onClose }: Props) {
  const [taskName, setTaskName] = useState(task.task_name ?? '')
  const [lessonLabel, setLessonLabel] = useState(task.lesson_label ?? '')
  const [thresholdValue, setThresholdValue] = useState(task.threshold_value != null ? String(task.threshold_value) : '')
  const [maxScore, setMaxScore] = useState(task.max_score != null ? String(task.max_score) : '')
  const [thresholdText, setThresholdText] = useState(task.threshold_text ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isQuiz = task.task_type === 'quiz'

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        task_id: task.id,
        task_name: taskName,
        lesson_label: lessonLabel,
      }
      if (isQuiz) {
        payload.threshold_value = thresholdValue
        payload.max_score = maxScore
      } else {
        payload.threshold_text = thresholdText
      }

      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '儲存失敗')
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-md md:rounded-2xl dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">編輯任務</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.lesson_label ?? '未設定課數'}</p>
          </div>
          <button type="button" onClick={() => onClose()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className={cn('inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
              {TASK_SHORT[task.task_type]}
            </span>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">任務名稱</span>
            <input
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">課次標籤</span>
            <input
              value={lessonLabel}
              onChange={(event) => setLessonLabel(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          {isQuiz ? (
            <>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">門檻分數</span>
                <input
                  type="number"
                  value={thresholdValue}
                  onChange={(event) => setThresholdValue(event.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">滿分</span>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(event) => setMaxScore(event.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                />
              </label>
            </>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">門檻說明</span>
              <input
                value={thresholdText}
                onChange={(event) => setThresholdText(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
              />
            </label>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
