'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import type { ClassWithCount } from '@/lib/grade/types'

interface Props {
  cls: ClassWithCount | null
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

function toClassTypeValue(v: string): ClassTypeValue {
  return v === 'double' ? 'double' : 'intensive'
}

export function ClassSettingsModal({ cls, onClose }: Props) {
  const router = useRouter()
  const [classType, setClassType] = useState<ClassTypeValue>(toClassTypeValue(cls?.class_type ?? 'intensive'))
  const [classCode, setClassCode] = useState(cls?.class_code ?? '')
  const [className, setClassName] = useState(cls?.class_name ?? '')
  const [weekday1,  setWeekday1]  = useState<number | ''>(cls?.weekday1 ?? '')
  const [weekday2,  setWeekday2]  = useState<number | ''>(cls?.weekday2 ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  if (!cls) return null

  function handleClassTypeChange(value: ClassTypeValue) {
    setClassType(value)
    if (value !== 'double') setWeekday2('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!className.trim()) { setError('請填入班級名稱'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/classes/${cls!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: className.trim(),
          class_code: classCode.trim() || null,
          class_type: classType,
          weekday1:   weekday1 !== '' ? weekday1 : null,
          weekday2:   classType === 'double' && weekday2 !== '' ? weekday2 : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '儲存失敗'); return }
      router.refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/30'
  const labelClass = 'block text-xs text-muted-foreground mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="text-lg font-semibold">班級設定</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Class type */}
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

          {/* Code + Name */}
          <div className="grid grid-cols-[120px_1fr] gap-3">
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
              <label className={labelClass}>班級名稱</label>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="例：B5班"
                className={inputClass}
              />
            </div>
          </div>

          {/* Weekday(s) */}
          {classType === 'double' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>上課日 1</label>
                <select value={weekday1} onChange={(e) => setWeekday1(e.target.value !== '' ? Number(e.target.value) : '')} className={inputClass}>
                  <option value="">請選擇</option>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>上課日 2</label>
                <select value={weekday2} onChange={(e) => setWeekday2(e.target.value !== '' ? Number(e.target.value) : '')} className={inputClass}>
                  <option value="">請選擇</option>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass}>上課日</label>
              <select value={weekday1} onChange={(e) => setWeekday1(e.target.value !== '' ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">請選擇</option>
                {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </form>
      </div>
    </div>
  )
}
