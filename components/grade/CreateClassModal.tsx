'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

const CLASS_TYPES = [
  { value: 'intensive', label: '團課 + 強化' },
  { value: 'double',    label: '雙團課' },
] as const

const WEEKDAYS = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 7, label: '週日' },
]

type ClassTypeValue = typeof CLASS_TYPES[number]['value']

export function CreateClassModal({ open, onClose }: Props) {
  const router = useRouter()
  const [classType, setClassType] = useState<ClassTypeValue>('intensive')
  const [classCode, setClassCode] = useState('')
  const [className, setClassName] = useState('')
  const [weekday1, setWeekday1] = useState<number | ''>('')
  const [weekday2, setWeekday2] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function resetForm() {
    setClassType('intensive')
    setClassCode(''); setClassName('')
    setWeekday1(''); setWeekday2('')
    setError('')
  }

  function handleClose() { resetForm(); onClose() }

  function handleClassTypeChange(value: ClassTypeValue) {
    setClassType(value)
    if (value !== 'double') setWeekday2('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!className.trim()) { setError('請填入班級名稱'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: className.trim(),
          class_code: classCode.trim() || undefined,
          class_type: classType,
          weekday1:   weekday1 !== '' ? weekday1 : null,
          weekday2:   classType === 'double' && weekday2 !== '' ? weekday2 : null,
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

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/30'
  const labelClass = 'block text-xs text-muted-foreground mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="text-lg font-semibold">班級設定</h2>
          <button type="button" onClick={handleClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Section title */}
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-red-500" />
            <span className="text-sm font-semibold">新增班級</span>
          </div>

          {/* Class type toggle */}
          <div className="grid grid-cols-2 gap-3">
            {CLASS_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleClassTypeChange(t.value)}
                className={`rounded-xl border py-3 text-sm font-medium transition-colors ${
                  classType === t.value
                    ? 'border-red-500 bg-red-500 text-white'
                    : 'border-border bg-background text-foreground hover:border-foreground/30'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Code + Name + Display name */}
          <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
            <div>
              <label className={labelClass}>代號（A-Z）</label>
              <input
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="A"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>課程名稱（上課內容）</label>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="例：英文、數學"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>分頁名（班級名）</label>
              <input
                value={classCode && className ? `${className}${classCode}班` : ''}
                readOnly
                tabIndex={-1}
                placeholder="自動產生"
                className={`${inputClass} bg-muted/40 text-muted-foreground`}
              />
            </div>
          </div>

          {/* Weekday(s) */}
          {classType === 'double' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>上課日 1</label>
                <select
                  value={weekday1}
                  onChange={(e) => setWeekday1(e.target.value !== '' ? Number(e.target.value) : '')}
                  className={inputClass}
                >
                  <option value="">請選擇</option>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>上課日 2</label>
                <select
                  value={weekday2}
                  onChange={(e) => setWeekday2(e.target.value !== '' ? Number(e.target.value) : '')}
                  className={inputClass}
                >
                  <option value="">請選擇</option>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass}>上課日</label>
              <select
                value={weekday1}
                onChange={(e) => setWeekday1(e.target.value !== '' ? Number(e.target.value) : '')}
                className={inputClass}
              >
                <option value="">請選擇</option>
                {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '建立中…' : '新增班級'}
          </button>
        </form>
      </div>
    </div>
  )
}
