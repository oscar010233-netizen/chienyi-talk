'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/grade/types'

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'attendance', label: '出席' },
  { value: 'homework',   label: '作業' },
  { value: 'practice',   label: '練習' },
  { value: 'quiz',       label: '考試' },
  { value: 'comment',    label: '評語' },
]

export function AddTaskModal({ classId, onClose }: { classId: string; onClose: (refresh?: boolean) => void }) {
  const [taskType, setTaskType] = useState<TaskType>('homework')
  const [taskName, setTaskName] = useState('')
  const [threshold, setThreshold] = useState('')
  const [week, setWeek] = useState('W1')
  const [lesson, setLesson] = useState('L1')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          task_type: taskType,
          task_name: taskName,
          threshold: taskType === 'quiz' ? threshold : null,
          week,
          lesson_number: lesson,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '新增失敗')
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-sm md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold text-foreground">新增任務</p>
          <button onClick={() => onClose()} className="rounded-lg p-1.5 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          {/* Task type */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">任務類型</p>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTaskType(opt.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    taskType === opt.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">任務名稱</label>
            <input
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="例如：單字、聽力、課文…"
              className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
            />
          </div>

          {/* Threshold (quiz only) */}
          {taskType === 'quiz' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">門檻分數</label>
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                placeholder="例如：90"
                className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
              />
            </div>
          )}

          {/* Week + lesson */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">週次</label>
              <input
                value={week}
                onChange={e => setWeek(e.target.value)}
                className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">課數</label>
              <input
                value={lesson}
                onChange={e => setLesson(e.target.value)}
                className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
              />
            </div>
          </div>

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            新增任務
          </button>
        </div>
      </div>
    </div>
  )
}
