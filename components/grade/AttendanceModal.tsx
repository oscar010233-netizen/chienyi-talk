'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassEnrollment, Task, TaskRecord } from '@/lib/grade/types'

interface Props {
  task: Task
  students: ClassEnrollment[]
  recordMap: Map<string, TaskRecord>
  onClose: (refresh?: boolean) => void
}

type AttStatus = 'pending' | 'present' | 'late' | 'absent_makeup' | 'absent_refund'

const STATUS_OPTIONS: { value: AttStatus; label: string; full: string; active: string; inactive: string }[] = [
  {
    value: 'present',
    label: '出席',
    full: '出席',
    active: 'bg-emerald-500 text-white',
    inactive: 'border border-border text-muted-foreground hover:bg-muted',
  },
  {
    value: 'late',
    label: '晚到',
    full: '晚到',
    active: 'bg-amber-400 text-white',
    inactive: 'border border-border text-muted-foreground hover:bg-muted',
  },
  {
    value: 'absent_makeup',
    label: '缺(補)',
    full: '缺席(補)',
    active: 'bg-orange-500 text-white',
    inactive: 'border border-border text-muted-foreground hover:bg-muted',
  },
  {
    value: 'absent_refund',
    label: '缺(退)',
    full: '缺席(退)',
    active: 'bg-slate-700 text-white dark:bg-slate-500',
    inactive: 'border border-border text-muted-foreground hover:bg-muted',
  },
]

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
]

function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

function initials(chi: string, eng: string) {
  if (eng?.trim()) return eng.trim()[0].toUpperCase()
  if (chi?.trim()) return chi.trim().slice(-1)
  return '?'
}

export function AttendanceModal({ task, students, recordMap, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, AttStatus>>(() => {
    const init: Record<string, AttStatus> = {}
    for (const s of students) {
      const rec = recordMap.get(`${s.student_id}:${task.id}`)
      init[s.student_id] = (rec?.status as AttStatus) ?? 'pending'
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const counts = students.reduce(
    (acc, s) => {
      const st = statuses[s.student_id] ?? 'pending'
      acc[st] = (acc[st] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  function setAll(status: AttStatus) {
    const next: Record<string, AttStatus> = {}
    for (const s of students) next[s.student_id] = status
    setStatuses(next)
  }

  function toggle(studentId: string, status: AttStatus) {
    setStatuses(prev => ({
      ...prev,
      [studentId]: prev[studentId] === status ? 'pending' : status,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const updates = students
      .map(s => {
        const rec = recordMap.get(`${s.student_id}:${task.id}`)
        if (!rec) return null
        return { record_id: rec.id, status: statuses[s.student_id] ?? 'pending' }
      })
      .filter(Boolean)

    try {
      const res = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_task_id: task.id, updates }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? '儲存失敗')
      }
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const taskLabel = [task.week_label, task.lesson_label].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onClose()} />

      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-foreground">出席點名</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.task_name ?? '出席'}{taskLabel && ` · ${taskLabel}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setAll('present')}
            className="h-7 rounded-md bg-emerald-500 px-3 text-xs font-medium text-white hover:bg-emerald-600"
          >
            全部到
          </button>
          <button
            type="button"
            onClick={() => setAll('pending')}
            className="h-7 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            清除
          </button>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {(counts['present'] ?? 0) > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">{counts['present']} 出席</span>
            )}
            {(counts['late'] ?? 0) > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{counts['late']} 晚到</span>
            )}
            {(counts['absent_makeup'] ?? 0) > 0 && (
              <span className="text-orange-600 dark:text-orange-400">{counts['absent_makeup']} 缺(補)</span>
            )}
            {(counts['absent_refund'] ?? 0) > 0 && (
              <span className="text-foreground">{counts['absent_refund']} 缺(退)</span>
            )}
            {(counts['pending'] ?? 0) > 0 && (
              <span>{counts['pending']} 未標</span>
            )}
          </div>
        </div>

        {/* Student list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {students.map((s, i) => {
            const current = statuses[s.student_id] ?? 'pending'
            const hasRecord = !!recordMap.get(`${s.student_id}:${task.id}`)
            return (
              <div
                key={s.student_id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5',
                  i % 2 === 1 ? 'bg-muted/40' : '',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', avatarColor(s.student_id))}>
                  {initials(s.student.chinese_name, s.student.english_name)}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
                  {s.student.chinese_name}
                  {s.student.english_name && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{s.student.english_name}</span>
                  )}
                </span>
                {!hasRecord && (
                  <span className="text-xs text-muted-foreground/50">未派發</span>
                )}
                {hasRecord && (
                  <div className="flex shrink-0 gap-1">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggle(s.student_id, opt.value)}
                        className={cn(
                          'h-7 w-9 rounded-md text-xs font-semibold transition-colors',
                          current === opt.value ? opt.active : opt.inactive,
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-[#ff4d4f]"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
