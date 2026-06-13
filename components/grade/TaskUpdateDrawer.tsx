'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LampBadge } from './LampBadge'
import type { Task, TaskRecord, Lamp, TaskType } from '@/lib/grade/types'

interface StatusOption {
  value: string
  lamp: Lamp
  label: string
  types: TaskType[]
}

const ALL_STATUS_OPTIONS: StatusOption[] = [
  { value: 'pending',    lamp: 'red',    label: '待處理',   types: ['attendance','homework','practice','quiz','comment'] },
  { value: 'redo',       lamp: 'red',    label: '需重做',   types: ['homework','practice','quiz'] },
  { value: 'correcting', lamp: 'yellow', label: '訂正中',   types: ['homework','practice','quiz'] },
  { value: 'testing',    lamp: 'blue',   label: '驗收中',   types: ['quiz'] },
  { value: 'passed',     lamp: 'green',  label: '通過',     types: ['quiz'] },
  { value: 'completed',  lamp: 'green',  label: '完成',     types: ['attendance','homework','practice','comment'] },
  { value: 'missing',    lamp: 'black',  label: '缺交/缺考', types: ['attendance','homework','practice','quiz'] },
  { value: 'exempt',     lamp: 'white',  label: '免',       types: ['attendance','homework','practice','quiz','comment'] },
]

interface Props {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
  classId: string
  onClose: (refresh?: boolean) => void
}

export function TaskUpdateDrawer({ task, student, record, classId, onClose }: Props) {
  const [status, setStatus] = useState(record?.status ?? 'pending')
  const [score, setScore] = useState('')
  const [note, setNote] = useState(record?.private_note ?? '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const options = ALL_STATUS_OPTIONS.filter(o => o.types.includes(task.task_type))
  const currentLamp = ALL_STATUS_OPTIONS.find(o => o.value === status)?.lamp ?? 'red'

  async function handleSubmit() {
    setLoading(true)
    setErr('')
    try {
      const body: Record<string, unknown> = {
        student_id: student.id,
        task_id: task.id,
        class_id: classId,
        status,
        lamp: currentLamp,
        private_note: note.trim() || null,
      }

      if (score.trim()) {
        const n = parseFloat(score)
        if (!isNaN(n)) {
          body.latest_result = n
          const prev = record?.result_history
            ? record.result_history.split(',')
            : (record?.latest_result != null ? [String(record.latest_result)] : [])
          body.result_history = [...prev, String(n)].join(',')
        }
      }

      if (record?.id) body.id = record.id

      const res = await fetch('/api/task-records', {
        method: record?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('儲存失敗')
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-sm md:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-semibold text-foreground">
              {student.chinese_name}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{student.english_name}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.task_name ?? task.task_code}
              {task.threshold != null && ` · 門檻 ${task.threshold}`}
            </p>
          </div>
          <button onClick={() => onClose()} className="rounded-lg p-1.5 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          {/* Current info */}
          {record && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span>現況：</span>
              <LampBadge lamp={record.lamp} score={record.latest_result} />
              {record.result_history && (
                <span className="ml-auto">歷史：{record.result_history}</span>
              )}
            </div>
          )}

          {/* Status selector */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">更新狀態</p>
            <div className="flex flex-wrap gap-2">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    status === opt.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  <LampBadge lamp={opt.lamp} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Score (quiz only) */}
          {task.task_type === 'quiz' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                新成績{task.threshold != null && `（門檻 ${task.threshold}）`}
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={e => setScore(e.target.value)}
                placeholder="留空表示不更新..."
                className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
              />
            </div>
          )}

          {/* Private note */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">私人備註</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="對老師的備註（家長不可見）..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
            />
          </div>

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}
