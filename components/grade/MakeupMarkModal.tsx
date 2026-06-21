'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassSessionRow } from '@/lib/grade/types'

interface Props {
  makeupRow: ClassSessionRow
  studentName: string
  bagId: string
  onClose: (refresh?: boolean) => void
}

// null = clear mark
type MakeupStatus = 'present' | 'late' | 'absent' | 'cancelled' | null

const OPTIONS: { value: MakeupStatus; label: string; active: string; inactive: string }[] = [
  { value: 'present',   label: '出席', active: 'bg-emerald-500 text-white',           inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'late',      label: '晚到', active: 'bg-amber-400 text-white',             inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'absent',    label: '未到', active: 'bg-red-500 text-white',               inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: 'cancelled', label: '取消', active: 'bg-gray-400 text-white',              inactive: 'border border-border text-muted-foreground hover:bg-muted' },
  { value: null,        label: '清除', active: 'border border-border bg-muted text-muted-foreground', inactive: 'border border-dashed border-border text-muted-foreground/50 hover:bg-muted/50' },
]

export function MakeupMarkModal({ makeupRow, studentName, bagId, onClose }: Props) {
  const currentStatus = makeupRow.attendance_status as MakeupStatus
  // Track "is null selected" separately since useState can't distinguish unset vs null
  const [selected, setSelected] = useState<MakeupStatus | undefined>(
    currentStatus === null ? undefined : currentStatus
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const makeupDate = makeupRow.session_date
    ? makeupRow.session_date.slice(5).replace('-', '/')
    : '待定'

  // selected === undefined means user hasn't picked anything yet
  const hasPick = selected !== undefined

  async function handleSave() {
    if (!hasPick) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/attendance/makeup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          makeup_row_id: makeupRow.id,
          attendance_status: selected,  // may be null
          bag_id: bagId,
        }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onClose()} />

      <div className="relative w-full max-w-sm rounded-lg bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-foreground">補課點名</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {studentName} · 補課日期 {makeupDate}
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

        <div className="flex flex-wrap gap-2 px-4 py-5">
          {OPTIONS.map(opt => {
            const isActive = selected === opt.value && hasPick
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={cn(
                  'h-10 flex-1 min-w-[4rem] rounded-md text-sm font-semibold transition-colors',
                  isActive ? opt.active : opt.inactive,
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

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
              disabled={saving || !hasPick}
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
