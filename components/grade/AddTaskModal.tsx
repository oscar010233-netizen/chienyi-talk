'use client'

import { useMemo, useState } from 'react'
import { CalendarPlus, Layers3, ListPlus, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/grade/types'

type Mode = 'week' | 'single'
type WeeklyTemplateKey = 'eng' | 'xiao'

interface WeeklyTaskRow {
  key: string
  task_type: TaskType
  label: string
  task_name: string
  threshold: string
}

interface Props {
  classId: string
  classDepartment?: string | null
  onClose: (refresh?: boolean) => void
}

const TYPE_LABEL: Record<TaskType, string> = {
  attendance: '出席',
  homework: '作業',
  practice: '練習',
  quiz: '測驗',
  comment: '評語',
}

const TYPE_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200',
  homework: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
  practice: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  quiz: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
  comment: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200',
}

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'homework', label: '作業' },
  { value: 'practice', label: '練習' },
  { value: 'quiz', label: '測驗' },
  { value: 'comment', label: '評語' },
]

const WEEKLY_TEMPLATES: Record<WeeklyTemplateKey, { label: string; description: string; rows: Omit<WeeklyTaskRow, 'key'>[] }> = {
  eng: {
    label: '英文班',
    description: '作業 3、測驗 3、練習 2、評語 1',
    rows: [
      { task_type: 'homework', label: '作業 1', task_name: '作業 1', threshold: '' },
      { task_type: 'homework', label: '作業 2', task_name: '作業 2', threshold: '' },
      { task_type: 'homework', label: '作業 3', task_name: '作業 3', threshold: '' },
      { task_type: 'quiz', label: '測驗 1', task_name: '測驗 1', threshold: '' },
      { task_type: 'quiz', label: '測驗 2', task_name: '測驗 2', threshold: '' },
      { task_type: 'quiz', label: '測驗 3', task_name: '測驗 3', threshold: '' },
      { task_type: 'practice', label: '練習 1', task_name: '練習 1', threshold: '' },
      { task_type: 'practice', label: '練習 2', task_name: '練習 2', threshold: '' },
      { task_type: 'comment', label: '評語', task_name: '評語', threshold: '' },
    ],
  },
  xiao: {
    label: '小學堂',
    description: '作業 5、測驗 3、評語 1',
    rows: [
      { task_type: 'homework', label: '作業 1', task_name: '作業 1', threshold: '' },
      { task_type: 'homework', label: '作業 2', task_name: '作業 2', threshold: '' },
      { task_type: 'homework', label: '作業 3', task_name: '作業 3', threshold: '' },
      { task_type: 'homework', label: '作業 4', task_name: '作業 4', threshold: '' },
      { task_type: 'homework', label: '作業 5', task_name: '作業 5', threshold: '' },
      { task_type: 'quiz', label: '測驗 1', task_name: '測驗 1', threshold: '' },
      { task_type: 'quiz', label: '測驗 2', task_name: '測驗 2', threshold: '' },
      { task_type: 'quiz', label: '測驗 3', task_name: '測驗 3', threshold: '' },
      { task_type: 'comment', label: '評語', task_name: '評語', threshold: '' },
    ],
  },
}

function templateFromDepartment(department?: string | null): WeeklyTemplateKey {
  const value = String(department ?? '').toLowerCase()
  if (value.includes('xiao') || value.includes('小')) return 'xiao'
  return 'eng'
}

function buildWeeklyRows(template: WeeklyTemplateKey): WeeklyTaskRow[] {
  return WEEKLY_TEMPLATES[template].rows.map((row, index) => ({
    ...row,
    key: `${template}-${index}`,
  }))
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    return data.error ?? '新增失敗'
  } catch {
    return '新增失敗'
  }
}

export function AddTaskModal({ classId, classDepartment, onClose }: Props) {
  const defaultTemplate = useMemo(() => templateFromDepartment(classDepartment), [classDepartment])
  const [mode, setMode] = useState<Mode>('week')
  const [template, setTemplate] = useState<WeeklyTemplateKey>(defaultTemplate)
  const [weeklyRows, setWeeklyRows] = useState<WeeklyTaskRow[]>(() => buildWeeklyRows(defaultTemplate))
  const [singleTaskType, setSingleTaskType] = useState<TaskType>('homework')
  const [singleTaskName, setSingleTaskName] = useState('')
  const [singleThreshold, setSingleThreshold] = useState('')
  const [week, setWeek] = useState('W1')
  const [lesson, setLesson] = useState('L1')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function handleTemplateChange(next: WeeklyTemplateKey) {
    setTemplate(next)
    setWeeklyRows(buildWeeklyRows(next))
  }

  function updateWeeklyRow(index: number, patch: Partial<WeeklyTaskRow>) {
    setWeeklyRows(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  async function handleSubmit() {
    setLoading(true)
    setErr('')

    try {
      const body = mode === 'week'
        ? {
            class_id: classId,
            week_label: week,
            lesson_label: lesson,
            tasks: weeklyRows.map(row => ({
              task_type: row.task_type,
              task_name: row.task_name.trim() || row.label,
              threshold: row.task_type === 'quiz' ? row.threshold : null,
            })),
          }
        : {
            class_id: classId,
            task_type: singleTaskType,
            task_name: singleTaskName,
            threshold: singleTaskType === 'quiz' ? singleThreshold : null,
            week_label: week,
            lesson_label: lesson,
          }

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) throw new Error(await readError(response))
      onClose(true)
    } catch (error) {
      setErr(error instanceof Error ? error.message : '新增失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-xl md:max-w-2xl md:rounded-lg dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-gold/10 text-gold dark:bg-[#ff4d4f]/15 dark:text-[#ff8a8a]">
              <CalendarPlus size={18} />
            </span>
            <div>
              <p className="font-semibold text-foreground">新增任務</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mode === 'week' ? `一週任務 - ${weeklyRows.length} 筆` : '單筆任務'}
              </p>
            </div>
          </div>
          <button onClick={() => onClose()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setMode('week')}
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors',
                mode === 'week' ? 'bg-white text-foreground shadow-sm dark:bg-[#3a3a3c]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers3 size={15} />
              一週任務
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors',
                mode === 'single' ? 'bg-white text-foreground shadow-sm dark:bg-[#3a3a3c]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ListPlus size={15} />
              單筆任務
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">週次</span>
              <input
                value={week}
                onChange={event => setWeek(event.target.value)}
                className="h-9 rounded-md border border-border px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">課數</span>
              <input
                value={lesson}
                onChange={event => setLesson(event.target.value)}
                className="h-9 rounded-md border border-border px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
              />
            </label>
          </div>

          {mode === 'week' ? (
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(WEEKLY_TEMPLATES) as WeeklyTemplateKey[]).map(key => {
                  const item = WEEKLY_TEMPLATES[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleTemplateChange(key)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        template === key
                          ? 'border-gold bg-gold/5 text-foreground dark:border-[#ff4d4f] dark:bg-[#ff4d4f]/10'
                          : 'border-border text-muted-foreground hover:bg-muted/70'
                      )}
                    >
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-1 text-xs">{item.description}</p>
                    </button>
                  )
                })}
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>類型</span>
                  <span>任務名稱</span>
                  <span>門檻</span>
                </div>
                <div className="max-h-[22rem] overflow-y-auto">
                  {weeklyRows.map((row, index) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem] gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <span className={cn('inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold', TYPE_CHIP[row.task_type])}>
                        {TYPE_LABEL[row.task_type]}
                      </span>
                      <input
                        value={row.task_name}
                        onChange={event => updateWeeklyRow(index, { task_name: event.target.value })}
                        className="h-8 rounded-md border border-border px-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                      />
                      <input
                        value={row.threshold}
                        onChange={event => updateWeeklyRow(index, { threshold: event.target.value })}
                        disabled={row.task_type !== 'quiz'}
                        className="h-8 rounded-md border border-border px-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15 disabled:bg-muted disabled:text-muted-foreground"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">任務類型</p>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSingleTaskType(option.value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        singleTaskType === option.value
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">任務名稱</span>
                <input
                  value={singleTaskName}
                  onChange={event => setSingleTaskName(event.target.value)}
                  placeholder="例如：單字、講義、課文"
                  className="h-9 rounded-md border border-border px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                />
              </label>

              {singleTaskType === 'quiz' && (
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">門檻</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={singleThreshold}
                    onChange={event => setSingleThreshold(event.target.value)}
                    placeholder="例如：90"
                    className="h-9 rounded-md border border-border px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                  />
                </label>
              )}
            </div>
          )}

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={() => onClose()}
            className="h-9 rounded-md border border-border px-4 text-xs font-semibold text-foreground/75 hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gold px-4 text-xs font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-50 dark:bg-[#ff4d4f]"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === 'week' ? `新增 ${weeklyRows.length} 筆` : '新增任務'}
          </button>
        </div>
      </div>
    </div>
  )
}
