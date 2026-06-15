'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { LampBadge } from './LampBadge'
import {
  appendHistory,
  lampFor,
  resolveTaskSubmission,
  statusName,
  takesScore,
  type GradeStatus,
} from '@/lib/grade/status'
import type { Task, TaskRecord } from '@/lib/grade/types'

interface Props {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
  classDepartment: string | null
  onClose: (refresh?: boolean) => void
}

const STATUS_BUTTONS = [
  { label: '完成', value: '✓' },
  { label: '訂正', value: '△' },
  { label: '缺交', value: '缺' },
  { label: '重做', value: 'RE' },
  { label: '免做', value: '免' },
]

function thresholdText(task: Task) {
  if (task.threshold_value != null && task.max_score != null && task.max_score !== 100) {
    return `${task.threshold_value}/${task.max_score}`
  }
  if (task.threshold_value != null) return String(task.threshold_value)
  return task.threshold_text ?? ''
}

export function TaskUpdateDrawer({ task, student, record, classDepartment, onClose }: Props) {
  const [scoreInput, setScoreInput] = useState('')
  const [statusInput, setStatusInput] = useState('')
  const [note, setNote] = useState(record?.teacher_note ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentStatus = (record?.status ?? 'pending') as GradeStatus
  const currentDisplay = lampFor(currentStatus, task.task_type)
  const threshold = thresholdText(task)
  const isScoreTask = takesScore(task.task_type)

  const preview = useMemo(() => {
    if (!scoreInput.trim() && !statusInput.trim()) return null
    return resolveTaskSubmission({
      taskType: task.task_type,
      taskName: task.task_name,
      currentStatus,
      thresholdValue: task.threshold_value,
      maxScore: task.max_score,
      thresholdText: task.threshold_text,
      department: classDepartment,
    }, {
      scoreInput,
      statusInput,
    })
  }, [classDepartment, currentStatus, scoreInput, statusInput, task])

  async function ensureRecordId() {
    if (record?.id) return record.id

    const response = await fetch('/api/task-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: student.id,
        class_task_id: task.id,
        status: 'pending',
      }),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? '建立任務紀錄失敗')
    return String(json.id)
  }

  async function handleSubmit() {
    if (!record && !scoreInput.trim() && !statusInput.trim() && !note.trim()) {
      setError('請先輸入要更新的內容')
      return
    }

    setLoading(true)
    setError('')

    try {
      const id = await ensureRecordId()
      const response = await fetch('/api/reinforcement/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          score_input: scoreInput,
          status_input: statusInput,
          teacher_note: note,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '送出失敗')
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-md md:rounded-2xl dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {student.chinese_name}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{student.english_name}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[task.week_label, task.lesson_label, task.task_name].filter(Boolean).join(' · ') || '未命名任務'}
            </p>
          </div>
          <button type="button" onClick={() => onClose()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span>目前</span>
            <LampBadge
              color={currentDisplay.color}
              label={currentDisplay.label}
              detail={task.task_type === 'quiz' ? (record?.result_history || record?.latest_result) : null}
            />
            <span>{statusName(currentStatus, task.task_type)}</span>
            {threshold && <span className="ml-auto">門檻 {threshold}</span>}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">狀態</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_BUTTONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusInput(option.value)}
                  className={[
                    'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                    statusInput === option.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{isScoreTask ? '分數' : '左欄備註'}</span>
            <input
              type={isScoreTask ? 'number' : 'text'}
              min={0}
              max={task.max_score ?? 100}
              value={scoreInput}
              onChange={(event) => setScoreInput(event.target.value)}
              placeholder={isScoreTask ? '輸入分數' : '輸入文字備註'}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">老師備註</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          {preview && (
            <div className={[
              'rounded-md border px-3 py-2 text-xs',
              preview.blocked
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
            ].join(' ')}
            >
              {preview.blocked ? preview.message : (
                <>
                  {preview.message}
                  {preview.shouldAppendHistory && (
                    <span> · 歷史 {appendHistory(record?.result_history, preview.historyValue)}</span>
                  )}
                  {preview.warning && <span> · {preview.warning}</span>}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            送出
          </button>
        </div>
      </div>
    </div>
  )
}
