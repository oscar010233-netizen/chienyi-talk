'use client'

import { useState } from 'react'
import { CalendarPlus, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/grade/types'

interface TaskRow {
  id: string
  task_type: TaskType
  task_name: string
  threshold: string
}

interface Props {
  classId: string
  classDepartment?: string | null
  onClose: (refresh?: boolean) => void
}

const TYPE_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200',
  homework: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
  practice: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  quiz: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
  comment: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200',
}

const TYPE_LABEL: Record<TaskType, string> = {
  attendance: '出席',
  homework: '作業',
  practice: '練習',
  quiz: '測驗',
  comment: '評語',
}

const ADD_BUTTONS: { type: TaskType; placeholder: string }[] = [
  { type: 'homework', placeholder: '作業 1' },
  { type: 'quiz',     placeholder: '第一課測驗' },
  { type: 'practice', placeholder: '朗讀練習' },
  { type: 'comment',  placeholder: '評語' },
]

let nextId = 0
function uid() { return String(++nextId) }

function defaultName(type: TaskType, rows: TaskRow[]): string {
  const count = rows.filter(r => r.task_type === type).length + 1
  if (type === 'comment') return '評語'
  if (type === 'practice') return `練習 ${count}`
  if (type === 'quiz') return `測驗 ${count}`
  return `作業 ${count}`
}

export function AddTaskModal({ classId, onClose }: Props) {
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function addRow(type: TaskType) {
    setRows(prev => [...prev, {
      id: uid(),
      task_type: type,
      task_name: defaultName(type, prev),
      threshold: '',
    }])
  }

  function update(id: string, patch: Partial<TaskRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function remove(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function handleSubmit() {
    if (rows.length === 0) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          tasks: rows.map(r => ({
            task_type: r.task_type,
            task_name: r.task_name.trim() || TYPE_LABEL[r.task_type],
            threshold: r.task_type === 'quiz' ? r.threshold : null,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '新增失敗')
      }
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-lg bg-white shadow-xl md:max-w-lg md:rounded-lg dark:bg-[#2c2c2e]">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-gold/10 text-gold dark:bg-[#ff4d4f]/15 dark:text-[#ff8a8a]">
              <CalendarPlus size={18} />
            </span>
            <div>
              <p className="font-semibold text-foreground">新增任務</p>
              <p className="mt-0.5 text-xs text-muted-foreground">點類型按鈕加列，填好後一次新增</p>
            </div>
          </div>
          <button onClick={() => onClose()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Quick-add buttons */}
        <div className="shrink-0 flex gap-2 border-b border-border px-4 py-3">
          {ADD_BUTTONS.map(({ type }) => (
            <button
              key={type}
              type="button"
              onClick={() => addRow(type)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors hover:opacity-80',
                TYPE_CHIP[type],
                'border-transparent',
              )}
            >
              <Plus size={11} strokeWidth={2.5} />
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="grid place-items-center py-14 text-sm text-muted-foreground/60">
              點上方按鈕加入這季要出的任務
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map(row => (
                <div key={row.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold', TYPE_CHIP[row.task_type])}>
                    {TYPE_LABEL[row.task_type]}
                  </span>
                  <input
                    value={row.task_name}
                    onChange={e => update(row.id, { task_name: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15 dark:bg-transparent"
                  />
                  {row.task_type === 'quiz' && (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.threshold}
                      onChange={e => update(row.id, { threshold: e.target.value })}
                      placeholder="門檻"
                      className="h-8 w-16 shrink-0 rounded-md border border-border px-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15 dark:bg-transparent"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {err && <p className="mr-auto text-xs text-red-500">{err}</p>}
          <button
            onClick={() => onClose()}
            className="h-9 rounded-md border border-border px-4 text-xs font-semibold text-foreground/75 hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || rows.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gold px-4 text-xs font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-40 dark:bg-[#ff4d4f]"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {rows.length > 0 ? `新增 ${rows.length} 筆` : '新增任務'}
          </button>
        </div>
      </div>
    </div>
  )
}
