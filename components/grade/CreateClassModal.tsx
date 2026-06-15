'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
}

const CLASS_TYPES = [
  { value: 'double',    label: '雙課' },
  { value: 'single',    label: '單課' },
  { value: 'intensive', label: '強化' },
]

const WEEKDAYS = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 7, label: '週日' },
]

export function CreateClassModal({ open, onClose }: Props) {
  const router = useRouter()
  const [className,   setClassName]   = useState('')
  const [classCode,   setClassCode]   = useState('')
  const [classType,   setClassType]   = useState('double')
  const [weekday1,    setWeekday1]    = useState<number | ''>('')
  const [weekday2,    setWeekday2]    = useState<number | ''>('')
  const [level,       setLevel]       = useState('')
  const [sessions,    setSessions]    = useState<number | ''>('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  function resetForm() {
    setClassName(''); setClassCode(''); setClassType('double')
    setWeekday1(''); setWeekday2(''); setLevel(''); setSessions('')
    setError('')
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!className.trim()) { setError('請填入班級名稱'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name:      className.trim(),
          class_code:      classCode.trim() || undefined,
          class_type:      classType,
          weekday1:        weekday1 !== '' ? weekday1 : null,
          weekday2:        weekday2 !== '' ? weekday2 : null,
          level:           level.trim() || undefined,
          system_sessions: sessions !== '' ? sessions : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '建立失敗'); return }
      router.refresh()
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold mb-5">新增班級</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 班級名稱 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">班級名稱 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="例：四年級英文A班"
              autoFocus
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
            />
          </div>

          {/* 班級代號 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">班級代號（可選）</label>
            <input
              type="text"
              value={classCode}
              onChange={e => setClassCode(e.target.value)}
              placeholder="例：G4A"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
            />
          </div>

          {/* 課型 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">課型 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {CLASS_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setClassType(t.value)}
                  className={[
                    'flex-1 py-1.5 text-xs rounded-lg border transition-colors',
                    classType === t.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-input text-muted-foreground hover:border-foreground/40',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 上課日 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">上課日（可選）</label>
            <div className="flex gap-2">
              <select
                value={weekday1}
                onChange={e => setWeekday1(e.target.value !== '' ? Number(e.target.value) : '')}
                className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">不設定</option>
                {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <select
                value={weekday2}
                onChange={e => setWeekday2(e.target.value !== '' ? Number(e.target.value) : '')}
                className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">不設定</option>
                {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          {/* 程度 / 堂數（同一行） */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">程度（可選）</label>
              <input
                type="text"
                value={level}
                onChange={e => setLevel(e.target.value)}
                placeholder="例：初級"
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground mb-1 block">總堂數</label>
              <input
                type="number"
                min={1}
                value={sessions}
                onChange={e => setSessions(e.target.value !== '' ? Number(e.target.value) : '')}
                placeholder="24"
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
            >
              {saving ? '建立中…' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
