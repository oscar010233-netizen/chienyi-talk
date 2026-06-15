'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, Loader2, Search, Trash2, X } from 'lucide-react'
import { LampBadge } from '@/components/grade/LampBadge'
import {
  appendHistory,
  lampFor,
  resolveTaskSubmission,
  statusName,
  takesScore,
  type GradeStatus,
} from '@/lib/grade/status'
import type { TaskType } from '@/lib/grade/types'

interface TaskRecord {
  id: string
  status: GradeStatus | string
  lamp: string
  latest_result: string | null
  result_history: string | null
  teacher_note: string | null
  comment_text: string | null
  comment_status: string | null
  updated_at: string | null
  class_task: {
    id: string
    task_type: TaskType
    task_name: string | null
    week_label: string | null
    lesson_label: string | null
    threshold_value: number | null
    max_score: number | null
    threshold_text: string | null
    display_order: number | null
    class: {
      id: string
      class_name: string | null
      class_code: string | null
      department: string | null
    } | null
  } | null
}

interface Student {
  id: string
  chinese_name: string | null
  english_name: string | null
  grade: string | null
}

interface SlotData {
  student: Student
  records: TaskRecord[]
}

interface StoredSlot {
  input: string
  data: SlotData | null
  savedAt: number
}

interface Draft {
  scoreInput: string
  statusInput: string
  teacherNote: string
  commentText: string
  saving: boolean
  message: string
  error: string
}

const STORAGE_PREFIX = 'chienyi:reinforcement:slot:v2:'

const STATUS_BUTTONS = [
  { label: '完成', value: '✓' },
  { label: '訂正', value: '△' },
  { label: '缺交', value: '缺' },
  { label: '重做', value: 'RE' },
  { label: '免做', value: '免' },
]

function storageKey(index: number) {
  return `${STORAGE_PREFIX}${index}`
}

function displayName(student: Student) {
  return student.chinese_name || student.english_name || '未命名'
}

function compactClassName(record: TaskRecord) {
  const cls = record.class_task?.class
  return cls?.class_code || cls?.class_name || ''
}

function weekLesson(record: TaskRecord) {
  return [record.class_task?.week_label, record.class_task?.lesson_label].filter(Boolean).join(' ')
}

function thresholdText(record: TaskRecord) {
  const task = record.class_task
  if (!task) return ''
  if (task.threshold_value != null && task.max_score != null && task.max_score !== 100) {
    return `${task.threshold_value}/${task.max_score}`
  }
  if (task.threshold_value != null) return String(task.threshold_value)
  return task.threshold_text ?? ''
}

function taskTitle(record: TaskRecord) {
  const task = record.class_task
  const base = task?.task_name || task?.task_type || '任務'
  const history = record.result_history || record.latest_result
  return task?.task_type === 'quiz' && history ? `${base} ${history}` : base
}

function displayStatus(status: string | null | undefined): GradeStatus {
  const value = String(status ?? '') as GradeStatus
  return value || 'pending'
}

function emptyDraft(record?: TaskRecord): Draft {
  return {
    scoreInput: '',
    statusInput: '',
    teacherNote: record?.teacher_note ?? '',
    commentText: record?.comment_text ?? '',
    saving: false,
    message: '',
    error: '',
  }
}

function isDirty(draft: Draft, record: TaskRecord) {
  return Boolean(
    draft.scoreInput.trim() ||
    draft.statusInput ||
    draft.teacherNote !== (record.teacher_note ?? '') ||
    draft.commentText !== (record.comment_text ?? ''),
  )
}

export function TaskSlot({ index }: { index: number }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SlotData | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [editing, setEditing] = useState<{ id: string; rect: DOMRect } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    window.setTimeout(() => {
      if (cancelled) return
      try {
        const raw = window.localStorage.getItem(storageKey(index))
        if (raw) {
          const saved = JSON.parse(raw) as Partial<StoredSlot>
          setInput(typeof saved.input === 'string' ? saved.input : '')
          setData(saved.data && typeof saved.data === 'object' ? saved.data as SlotData : null)
        }
        setError('')
      } catch {
        window.localStorage.removeItem(storageKey(index))
      } finally {
        setHydrated(true)
      }
    }, 0)
    return () => { cancelled = true }
  }, [index])

  useEffect(() => {
    if (!hydrated) return
    try {
      if (!input.trim() && !data) {
        window.localStorage.removeItem(storageKey(index))
        return
      }
      window.localStorage.setItem(storageKey(index), JSON.stringify({ input, data, savedAt: Date.now() }))
    } catch {
      // board still works without storage
    }
  }, [data, hydrated, index, input])

  // Show every task — the card has a fixed height and the list scrolls inside,
  // so content never makes the card grow (mirrors the kanban lane pattern).
  const records = useMemo(() => data?.records ?? [], [data])
  const pendingCount = records.length

  async function fetchTasks() {
    if (!input.trim()) return
    setLoading(true)
    setError('')
    setData(null)
    setDrafts({})
    try {
      const response = await fetch(`/api/reinforcement/tasks?name=${encodeURIComponent(input.trim())}`)
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '讀取失敗')
      setData(json)
      const nextDrafts: Record<string, Draft> = {}
      for (const record of json.records ?? []) nextDrafts[record.id] = emptyDraft(record)
      setDrafts(nextDrafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setData(null)
    setDrafts({})
    setError('')
    setInput('')
    setEditing(null)
    window.localStorage.removeItem(storageKey(index))
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  function updateDraft(id: string, record: TaskRecord, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyDraft(record)),
        ...patch,
      },
    }))
  }

  async function submitRecord(record: TaskRecord): Promise<boolean> {
    const draft = drafts[record.id] ?? emptyDraft(record)
    updateDraft(record.id, record, { saving: true, error: '', message: '' })
    try {
      const response = await fetch('/api/reinforcement/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          score_input: draft.scoreInput,
          status_input: draft.statusInput,
          teacher_note: draft.teacherNote,
          comment_text: draft.commentText,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        const clearScore = json.decision?.clearScoreInput
        updateDraft(record.id, record, {
          saving: false,
          scoreInput: clearScore ? '' : draft.scoreInput,
          error: json.error ?? '送出失敗',
        })
        return false
      }
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          records: current.records.map((item) => item.id === record.id ? json.record : item),
        }
      })
      // The state machine only "writes a record" when status/score changes; a
      // note/comment-only edit still saves, so don't surface "沒有需要送出的內容".
      const noteOrComment =
        draft.teacherNote !== (record.teacher_note ?? '') ||
        draft.commentText !== (record.comment_text ?? '')
      const message = json.decision?.warning
        || (json.decision?.shouldWriteRecord ? (json.decision?.message || '已同步')
          : (noteOrComment ? '已儲存' : (json.decision?.message || '已同步')))
      updateDraft(record.id, json.record, {
        scoreInput: '',
        statusInput: '',
        teacherNote: json.record.teacher_note ?? '',
        commentText: json.record.comment_text ?? '',
        saving: false,
        message,
        error: '',
      })
      return true
    } catch (err) {
      updateDraft(record.id, record, {
        saving: false,
        error: err instanceof Error ? err.message : '送出失敗',
      })
      return false
    }
  }

  function openEditor(record: TaskRecord, element: HTMLElement) {
    setEditing((current) =>
      current?.id === record.id ? null : { id: record.id, rect: element.getBoundingClientRect() },
    )
  }

  const hasRecords = pendingCount > 0
  const isAllDone = data && pendingCount === 0
  const editingRecord = editing ? data?.records.find((r) => r.id === editing.id) ?? null : null

  return (
    <div className={[
      'flex h-[180px] flex-col overflow-hidden rounded-xl mac-soft transition-all duration-200',
      hasRecords ? 'ring-1 ring-red-200 dark:ring-red-900/50' : '',
      isAllDone ? 'ring-1 ring-emerald-200 dark:ring-emerald-900/50' : '',
    ].join(' ')}
    >
      {/* Slot header */}
      <div className="flex min-h-8 shrink-0 items-center gap-1.5 border-b mac-hairline px-2.5">
        <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground/40 select-none">
          {index}
        </span>

        {data ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold tracking-tight text-foreground">
                {displayName(data.student)}
                <span className="ml-1 font-normal text-muted-foreground">
                  {[data.student.english_name, data.student.grade].filter(Boolean).join(' · ')}
                </span>
              </p>
            </div>
            {hasRecords && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[9px] font-semibold tabular-nums text-red-600 dark:bg-red-500/15 dark:text-red-400">
                {pendingCount}
              </span>
            )}
            <button
              type="button"
              onClick={clear}
              title="清空此格"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void fetchTasks() }}
              placeholder="學生姓名"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-muted-foreground/30"
            />
            <button
              type="button"
              onClick={fetchTasks}
              disabled={!input.trim() || loading}
              title="領取任務"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground disabled:opacity-25 transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            </button>
          </>
        )}
      </div>

      {/* Slot body — fixed height, scrolls internally so the card never grows */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error && (
          <p className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
        {loading && (
          <p className="py-2 text-center animate-pulse text-[10px] text-muted-foreground">讀取中…</p>
        )}
        {isAllDone && (
          <p className="flex items-center justify-center gap-1 py-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
            <Check size={11} /> 全部完成
          </p>
        )}

        {records.map((record) => {
            const task = record.class_task
            const currentStatus = displayStatus(record.status)
            const display = lampFor(currentStatus, task?.task_type)
            const draft = drafts[record.id] ?? emptyDraft(record)
            const isQuiz = takesScore(task?.task_type)
            const meta = [compactClassName(record), weekLesson(record), statusName(currentStatus, task?.task_type ?? 'homework')]
              .filter(Boolean).join(' · ')
            const dirty = isDirty(draft, record)
            const active = editing?.id === record.id

            return (
              <button
                key={record.id}
                type="button"
                onClick={(event) => openEditor(record, event.currentTarget)}
                title={`${taskTitle(record)} — ${meta}`}
                className={[
                  'group flex w-full items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left transition-colors',
                  active ? 'bg-muted' : 'hover:bg-muted/60',
                ].join(' ')}
              >
                <LampBadge
                  color={display.color}
                  label={display.label}
                  detail={isQuiz ? (record.result_history || record.latest_result) : null}
                  className="!px-1 !py-0 !text-[10px]"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-foreground">
                  {task?.task_name || task?.task_type || '任務'}
                </span>
                {dirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="尚未送出" />
                )}
              </button>
            )
          })}
      </div>

      {/* Floating editor anchored to the clicked task row */}
      {editing && editingRecord && data && (
        <TaskEditor
          anchor={editing.rect}
          record={editingRecord}
          student={data.student}
          draft={drafts[editingRecord.id] ?? emptyDraft(editingRecord)}
          onChange={(patch) => updateDraft(editingRecord.id, editingRecord, patch)}
          onSubmit={async () => {
            const ok = await submitRecord(editingRecord)
            if (ok) setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

interface EditorProps {
  anchor: DOMRect
  record: TaskRecord
  student: Student
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onSubmit: () => void | Promise<void>
  onClose: () => void
}

function TaskEditor({ anchor, record, student, draft, onChange, onSubmit, onClose }: EditorProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const task = record.class_task
  const currentStatus = displayStatus(record.status)
  const currentDisplay = lampFor(currentStatus, task?.task_type)
  const isQuiz = takesScore(task?.task_type)
  const threshold = thresholdText(record)

  const preview = useMemo(() => {
    if (!draft.scoreInput.trim() && !draft.statusInput) return null
    return resolveTaskSubmission({
      taskType: task?.task_type,
      taskName: task?.task_name,
      currentStatus,
      thresholdValue: task?.threshold_value,
      maxScore: task?.max_score,
      thresholdText: task?.threshold_text,
      department: task?.class?.department,
      source: task?.class?.department,
    }, {
      scoreInput: draft.scoreInput,
      statusInput: draft.statusInput,
    })
  }, [currentStatus, draft.scoreInput, draft.statusInput, task])

  // Position the popover next to the anchor, flipping above when short on space.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const margin = 8
    const width = Math.min(296, window.innerWidth - margin * 2)
    const ph = panel.offsetHeight
    const left = Math.min(Math.max(anchor.left, margin), window.innerWidth - width - margin)
    let top = anchor.bottom + 6
    if (top + ph > window.innerHeight - margin) {
      const above = anchor.top - ph - 6
      top = above > margin ? above : Math.max(margin, window.innerHeight - ph - margin)
    }
    setPos({ top, left, width })
  }, [anchor])

  // Close on Escape or when the board scrolls (anchor would go stale).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: -9999, width: 296 }}
        className="fixed z-50 space-y-2 rounded-xl mac-card p-2.5"
      >
        {/* Header */}
        <div className="flex items-start gap-2">
          <LampBadge
            color={currentDisplay.color}
            label={currentDisplay.label}
            detail={isQuiz ? (record.result_history || record.latest_result) : null}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {taskTitle(record)}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {displayName(student)}
              {` · ${[compactClassName(record), weekLesson(record)].filter(Boolean).join(' ')}`}
              {threshold && ` · 門檻 ${threshold}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Status chips */}
        <div className="grid grid-cols-5 gap-1">
          {STATUS_BUTTONS.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => onChange({
                statusInput: draft.statusInput === btn.value ? '' : btn.value,
                error: '',
                message: '',
              })}
              className={[
                'h-7 rounded-md border text-[11px] font-medium transition-colors',
                draft.statusInput === btn.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              ].join(' ')}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Score — quiz only */}
        {isQuiz && (
          <input
            type="number"
            value={draft.scoreInput}
            onChange={(event) => onChange({ scoreInput: event.target.value, error: '', message: '' })}
            onKeyDown={(event) => { if (event.key === 'Enter') void onSubmit() }}
            placeholder={threshold ? `分數（門檻 ${threshold}）` : '分數'}
            autoFocus
            className="h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/25 [appearance:textfield]"
          />
        )}

        {/* Teacher note */}
        <input
          value={draft.teacherNote}
          onChange={(event) => onChange({ teacherNote: event.target.value, message: '' })}
          onKeyDown={(event) => { if (event.key === 'Enter') void onSubmit() }}
          placeholder="老師備註"
          className="h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-[13px] outline-none focus:border-gold focus:ring-1 focus:ring-gold/25"
        />

        {/* Comment / 評論 */}
        <input
          value={draft.commentText}
          onChange={(event) => onChange({ commentText: event.target.value, message: '' })}
          onKeyDown={(event) => { if (event.key === 'Enter') void onSubmit() }}
          placeholder="評論"
          className="h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-[13px] outline-none focus:border-gold focus:ring-1 focus:ring-gold/25"
        />

        {/* Live preview */}
        {preview && (
          <p className={[
            'rounded-md px-2 py-1 text-[11px] leading-snug',
            preview.blocked
              ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
          ].join(' ')}>
            {preview.blocked
              ? preview.message
              : (
                <>
                  → {preview.message}
                  {preview.shouldAppendHistory && (
                    <> · 歷史 {appendHistory(record.result_history, preview.historyValue)}</>
                  )}
                  {preview.warning && <> · {preview.warning}</>}
                </>
              )
            }
          </p>
        )}

        {(draft.error || draft.message) && (
          <p className={[
            'text-[11px]',
            draft.error ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
          ].join(' ')}>
            {draft.error || draft.message}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            title="拍照 / 附件（開發中）"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Camera size={14} />
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={draft.saving}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            {draft.saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            送出
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
