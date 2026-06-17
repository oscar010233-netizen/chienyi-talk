'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BufferRow {
  id: string
  source: string | null
  student_id: string | null
  class_task_id: string | null
  task_type: string | null
  class_name: string | null
  eng_name: string | null
  chi_name: string | null
  task_name: string | null
  task_id: string | null
  latest_result: string | null
  status: string | null
  history: string | null
  threshold: string | null
  week: string | null
  teacher_note: string | null
  comment_text: string | null
  comment_status: string | null
  created_at: string | null
  updated_at: string | null
}

const SOURCE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'ENG', label: '英文' },
  { value: 'XIAO', label: '小學堂' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: '全部狀態' },
  { value: 'pending', label: '待處理' },
  { value: 'correcting', label: '批改中' },
  { value: 'retake_ready', label: '可重考' },
  { value: 'retake_correcting', label: '重考批改' },
  { value: 'redo', label: '重做' },
  { value: 'missing', label: '缺交' },
  { value: 'completed', label: '完成' },
  { value: 'wont_do', label: '不用做' },
]

const EDIT_STATUS_OPTIONS = STATUS_OPTIONS.filter(option => option.value !== 'all')

const FIELD_CLASS = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15'
const TEXTAREA_CLASS = 'w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15'
const TABLE_CELL = 'border-b border-border px-3 py-2.5 align-middle whitespace-nowrap'
const MUTED_TABLE_CELL = `${TABLE_CELL} text-muted-foreground`

function display(value: string | number | null | undefined, fallback = '-') {
  if (value == null || value === '') return fallback
  return value
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statusLabel(status: string | null | undefined) {
  return EDIT_STATUS_OPTIONS.find(option => option.value === status)?.label ?? display(status, '未標記')
}

function sourceLabel(source: string | null | undefined) {
  if (source === 'ENG') return '英文'
  if (source === 'XIAO') return '小學堂'
  return display(source, '未分類')
}

function studentName(row: BufferRow) {
  if (row.chi_name && row.eng_name) return `${row.chi_name} / ${row.eng_name}`
  return row.chi_name || row.eng_name || row.student_id || '-'
}

function matchesSearch(row: BufferRow, query: string) {
  if (!query) return true
  const needle = query.toLowerCase()
  return [
    row.student_id,
    row.chi_name,
    row.eng_name,
    row.class_name,
    row.task_name,
    row.task_id,
    row.status,
    row.week,
    row.teacher_note,
    row.comment_text,
    row.comment_status,
  ].some(value => String(value ?? '').toLowerCase().includes(needle))
}

function statusTone(status: string | null | undefined) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25'
    case 'correcting':
    case 'retake_correcting':
      return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/25'
    case 'retake_ready':
      return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25'
    case 'missing':
    case 'redo':
      return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25'
    case 'wont_do':
      return 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/10 dark:text-white/60 dark:ring-white/10'
    default:
      return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25'
  }
}

export function BufferBoard() {
  const [rows, setRows] = useState<BufferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<BufferRow | null>(null)

  const loadRows = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      if (source !== 'all') params.set('source', source)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/buffer?${params.toString()}`)
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '讀取 Buffer 失敗')
      setRows(json.rows ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取 Buffer 失敗')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [source, status])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) void loadRows()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [loadRows])

  const visibleRows = useMemo(
    () => rows.filter(row => {
      const sourceMatches = source === 'all' || row.source === source
      const statusMatches = status === 'all' || row.status === status
      return sourceMatches && statusMatches && matchesSearch(row, query.trim())
    }),
    [query, rows, source, status]
  )

  const summary = useMemo(() => {
    const pending = rows.filter(row => !row.status || row.status === 'pending').length
    const done = rows.filter(row => row.status === 'completed').length
    const needsCare = rows.filter(row => ['missing', 'redo', 'retake_ready', 'retake_correcting'].includes(row.status ?? '')).length
    return { pending, done, needsCare }
  }, [rows])

  function handleSaved(row: BufferRow) {
    setRows(current => current.map(item => item.id === row.id ? row : item))
    setEditing(row)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mac-glass mac-hairline sticky top-0 z-40 border-b px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">Buffer 暫存</h1>
            <p className="mt-1 text-sm text-muted-foreground">EngBuffer / XiaoBuffer 核對與修正</p>
          </div>
          <button
            onClick={() => loadRows(true)}
            disabled={loading || refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground/75 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} />
            重新整理
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto_auto]">
          <label className="flex h-10 items-center gap-2 rounded-md bg-black/[0.04] px-3 ring-1 ring-black/[0.06] focus-within:bg-white focus-within:ring-gold/40 dark:bg-white/[0.06] dark:ring-white/10 dark:focus-within:bg-white/10">
            <Search size={15} className="text-muted-foreground" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜尋學生、班級、任務、狀態"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {SOURCE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSource(option.value)}
                className={cn(
                  'h-8 rounded-md px-3 text-xs font-semibold transition-colors',
                  source === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <SummaryBadge icon={Clock3} label="待處理" value={summary.pending} />
          <SummaryBadge icon={AlertCircle} label="需注意" value={summary.needsCare} />
          <SummaryBadge icon={CheckCircle2} label="完成" value={summary.done} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl mac-soft">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-[5.5rem]" />
                <col className="w-[15rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[18rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[6rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[14rem]" />
                <col className="w-[8rem]" />
                <col className="w-[5rem]" />
              </colgroup>
              <thead>
                <tr className="whitespace-nowrap text-xs text-muted-foreground [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b [&>th]:border-border [&>th]:bg-muted [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-semibold">
                  <th>來源</th>
                  <th>學生</th>
                  <th>班級</th>
                  <th>任務</th>
                  <th>狀態</th>
                  <th>最新結果</th>
                  <th>門檻</th>
                  <th>週次</th>
                  <th>留言</th>
                  <th>備註</th>
                  <th>更新</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-16 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 animate-spin" size={20} />
                      讀取中
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-16 text-center text-muted-foreground">
                      沒有符合條件的 Buffer 資料
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'h-[58px] cursor-pointer transition-colors hover:brightness-[0.97] dark:hover:brightness-[1.06]',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted',
                      )}
                      onClick={() => setEditing(row)}
                    >
                      <td className={TABLE_CELL}>
                        <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-xs font-semibold text-foreground/75 dark:bg-white/10">
                          {sourceLabel(row.source)}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="truncate font-medium text-foreground" title={studentName(row)}>{studentName(row)}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.student_id ?? undefined}>{display(row.student_id)}</p>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate" title={row.class_name ?? undefined}>{display(row.class_name)}</span>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="truncate font-medium text-foreground" title={row.task_name ?? undefined}>{display(row.task_name)}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.task_id ?? undefined}>{display(row.task_id)}</p>
                      </td>
                      <td className={TABLE_CELL}>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', statusTone(row.status))}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate" title={row.latest_result ?? undefined}>{display(row.latest_result)}</span>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate" title={row.threshold ?? undefined}>{display(row.threshold)}</span>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate" title={row.week ?? undefined}>{display(row.week)}</span>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate" title={row.comment_status ?? undefined}>{display(row.comment_status)}</span>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="truncate text-muted-foreground" title={row.teacher_note ?? undefined}>{display(row.teacher_note)}</p>
                      </td>
                      <td className={MUTED_TABLE_CELL}>
                        <span className="block truncate">{formatDate(row.updated_at)}</span>
                      </td>
                      <td className={`${TABLE_CELL} text-right`}>
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gold dark:text-[#ff8a8a]">
                          <Pencil size={13} />
                          編輯
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <BufferEditor
          key={editing.id}
          row={editing}
          onSaved={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SummaryBadge({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/70 px-3">
      <Icon size={14} />
      <span>{label}</span>
      <span className="ml-auto font-semibold text-foreground">{value}</span>
    </div>
  )
}

function BufferEditor({ row, onSaved, onClose }: { row: BufferRow; onSaved: (row: BufferRow) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    status: row.status ?? 'pending',
    latest_result: row.latest_result ?? '',
    history: row.history ?? '',
    teacher_note: row.teacher_note ?? '',
    comment_text: row.comment_text ?? '',
    comment_status: row.comment_status ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const statusOptions = form.status && !EDIT_STATUS_OPTIONS.some(option => option.value === form.status)
    ? [{ value: form.status, label: form.status }, ...EDIT_STATUS_OPTIONS]
    : EDIT_STATUS_OPTIONS

  function update(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/buffer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          status: form.status,
          latest_result: form.latest_result,
          history: form.history,
          teacher_note: form.teacher_note,
          comment_text: form.comment_text,
          comment_status: form.comment_status,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '保存失敗')
      onSaved(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="關閉" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">編輯 Buffer</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {studentName(row)} · {row.id.slice(0, 8)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4">
            <section className="grid gap-3">
              <SectionTitle title="核對資料" />
              <div className="grid gap-3 sm:grid-cols-2">
                <ReadOnlyField label="來源" value={sourceLabel(row.source)} />
                <ReadOnlyField label="學生 ID" value={row.student_id} />
                <ReadOnlyField label="班級" value={row.class_name} />
                <ReadOnlyField label="週次" value={row.week} />
                <ReadOnlyField label="任務" value={row.task_name} />
                <ReadOnlyField label="Task ID" value={row.class_task_id ?? row.task_id} />
                <ReadOnlyField label="類型" value={row.task_type} />
                <ReadOnlyField label="門檻" value={row.threshold} />
              </div>
            </section>

            <section className="grid gap-3">
              <SectionTitle title="狀態修正" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="狀態">
                  <select value={form.status} onChange={event => update('status', event.target.value)} className={FIELD_CLASS}>
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="最新結果">
                  <input value={form.latest_result} onChange={event => update('latest_result', event.target.value)} className={FIELD_CLASS} />
                </Field>
              </div>
              <Field label="歷史紀錄">
                <textarea value={form.history} onChange={event => update('history', event.target.value)} rows={4} className={TEXTAREA_CLASS} />
              </Field>
            </section>

            <section className="grid gap-3">
              <SectionTitle title="備註與留言" />
              <Field label="老師備註">
                <textarea value={form.teacher_note} onChange={event => update('teacher_note', event.target.value)} rows={3} className={TEXTAREA_CLASS} />
              </Field>
              <Field label="留言文字">
                <textarea value={form.comment_text} onChange={event => update('comment_text', event.target.value)} rows={3} className={TEXTAREA_CLASS} />
              </Field>
              <Field label="留言狀態">
                <select value={form.comment_status} onChange={event => update('comment_status', event.target.value)} className={FIELD_CLASS}>
                  <option value="">未設定</option>
                  <option value="draft">草稿</option>
                  <option value="pending_publish">待發布</option>
                  <option value="published">已發布</option>
                  <option value="needs_republish">需重發</option>
                </select>
              </Field>
            </section>
          </div>
        </div>

        {error && (
          <div className="border-t border-border bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-9 rounded-md border border-border px-4 text-xs font-semibold text-foreground/75 hover:bg-muted">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gold px-4 text-xs font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-50 dark:bg-[#ff4d4f]"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
        </div>
      </aside>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-h-9 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
        {display(value)}
      </span>
    </div>
  )
}
