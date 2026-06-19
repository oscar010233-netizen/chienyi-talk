'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ClassRow, SeasonSession, Task } from '@/lib/grade/types'

const WEEKDAY_ZH = ['', '一', '二', '三', '四', '五', '六', '日']

function fmtDate(dateStr: string) {
  const [, m, d] = dateStr.split('-')
  const day = WEEKDAY_ZH[new Date(dateStr + 'T00:00:00Z').getUTCDay() || 7] ?? ''
  return { md: `${Number(m)}/${Number(d)}`, day }
}

type ColKey = 'progress' | 'homework' | 'quiz' | 'practice' | 'comment'

const COLS: { key: ColKey; label: string; group: boolean; intensive: boolean }[] = [
  { key: 'progress', label: '進度', group: true, intensive: false },
  { key: 'homework', label: '作業', group: false, intensive: true },
  { key: 'quiz', label: '測驗', group: false, intensive: true },
  { key: 'practice', label: '練習', group: false, intensive: true },
  { key: 'comment', label: '評論', group: true, intensive: true },
]

const COL_CHIP: Record<ColKey, string> = {
  progress: 'text-indigo-600 dark:text-indigo-300',
  homework: 'text-violet-600 dark:text-violet-300',
  quiz: 'text-rose-600 dark:text-rose-300',
  practice: 'text-amber-600 dark:text-amber-300',
  comment: 'text-teal-600 dark:text-teal-300',
}

const COL_FILLED: Record<ColKey, string> = {
  progress: 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/20 dark:bg-indigo-500/[0.07]',
  homework: 'border-violet-200 bg-violet-50/60 dark:border-violet-500/20 dark:bg-violet-500/[0.07]',
  quiz: 'border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/[0.07]',
  practice: 'border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.07]',
  comment: 'border-teal-200 bg-teal-50/60 dark:border-teal-500/20 dark:bg-teal-500/[0.07]',
}

function isApplicable(col: ColKey, sessionKind: SeasonSession['session_kind']) {
  const cfg = COLS.find((c) => c.key === col)!
  if (sessionKind === 'team') return cfg.group
  if (sessionKind === 'intensive') return cfg.intensive
  return true
}

interface CellProps {
  bagId: string
  sessionDate: string
  sessionKind: string
  classId: string
  col: ColKey
  task: Task | undefined
  applicable: boolean
  onSaved: (sessionDate: string, sessionKind: string, col: ColKey, task: Task) => void
}

function PlanCell({ bagId, sessionDate, sessionKind, classId, col, task, applicable, onSaved }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.value = task?.task_name ?? ''
      inputRef.current.focus()
    }
  }, [editing, task])

  const save = useCallback(async () => {
    const trimmed = (inputRef.current?.value ?? '').trim()
    if (trimmed === (task?.task_name ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/season-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          bag_id: bagId,
          session_date: sessionDate,
          session_kind: sessionKind,
          task_type: col,
          task_name: trimmed || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        onSaved(sessionDate, sessionKind, col, data.task)
      }
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [task, classId, bagId, sessionDate, sessionKind, col, onSaved])

  if (!applicable) {
    return <td className="border border-border bg-muted/30 p-0" />
  }

  const filled = !!task?.task_name
  const isComment = col === 'comment'

  return (
    <td
      className={cn(
        'border border-border p-0 align-top transition-colors',
        filled ? COL_FILLED[col] : 'hover:bg-muted/40'
      )}
    >
      {editing ? (
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input
            ref={inputRef}
            defaultValue={task?.task_name ?? ''}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') { setEditing(false) }
            }}
            className="h-7 w-full min-w-0 rounded border border-border bg-background px-1.5 text-xs outline-none focus:border-foreground/40"
            placeholder={isComment ? '寫給家長的話…' : '填入內容…'}
          />
          {saving && <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            'block w-full p-2 text-left text-xs leading-snug',
            filled ? 'text-foreground' : 'text-muted-foreground/40',
            isComment && !filled ? 'italic' : ''
          )}
        >
          {filled
            ? task!.task_name
            : isComment
              ? '寫評論…'
              : '點擊填入…'}
        </button>
      )}
    </td>
  )
}

interface Props {
  classId: string
  cls: ClassRow
}

export function SeasonPlanSheet({ classId, cls }: Props) {
  const [sessions, setSessions] = useState<SeasonSession[]>([])
  const [bagId, setBagId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch(`/api/season-plan?class_id=${classId}`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions ?? [])
        setBagId(data.bag_id ?? '')
        setLoading(false)
      })
  }, [classId])

  const handleSaved = useCallback((sessionDate: string, sessionKind: string, col: ColKey, task: Task) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.session_date === sessionDate && s.session_kind === sessionKind
          ? { ...s, tasks: { ...s.tasks, [col]: task } }
          : s
      )
    )
    router.refresh()
  }, [router])

  // displayedSessions: the API now returns correct team/intensive sessions from billing
  const displayedSessions = useMemo(() => sessions, [sessions])

  const classSlug = encodeURIComponent(classId)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href={`/classes/${classSlug}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <CalendarDays size={16} className="text-muted-foreground" />
        <span className="font-semibold text-foreground">{cls.class_name} — 整季計畫</span>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> 載入中…
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            還沒有出席日資料，請先開袋建立出席計畫。
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-border bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground w-28">
                  出席日
                </th>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'border border-border bg-muted/50 px-2 py-2 text-center text-xs font-medium',
                      COL_CHIP[col.key]
                    )}
                  >
                    {col.label}
                    {col.key === 'comment' && (
                      <span className="ml-1 text-[10px] text-muted-foreground/60">✦AI</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedSessions.map((session, idx) => {
                const { md, day } = fmtDate(session.session_date)
                const isTeam = session.session_kind === 'team'
                const isIntensive = session.session_kind === 'intensive'
                return (
                  <tr key={`${session.session_date}-${session.session_kind}`} className={cn(idx % 2 === 1 && 'bg-muted/20')}>
                    <td className="border border-border px-3 py-2 align-middle">
                      <div className="font-medium text-foreground">{md} {day}</div>
                      {isTeam && (
                        <span className="mt-1 inline-flex items-center rounded-sm bg-indigo-100 px-1.5 py-px text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                          團課
                        </span>
                      )}
                      {isIntensive && (
                        <span className="mt-1 inline-flex items-center rounded-sm bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          強化
                        </span>
                      )}
                    </td>
                    {COLS.map((col) => (
                      <PlanCell
                        key={col.key}
                        bagId={bagId}
                        sessionDate={session.session_date}
                        sessionKind={session.session_kind}
                        classId={classId}
                        col={col.key}
                        task={session.tasks[col.key]}
                        applicable={isApplicable(col.key, session.session_kind)}
                        onSaved={handleSaved}
                      />
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
