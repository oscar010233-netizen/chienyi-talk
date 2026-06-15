'use client'

import { useEffect, useState } from 'react'
import { Loader2, X, Search, UserPlus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RosterStudent {
  id: string
  chinese_name: string | null
  english_name: string | null
  school: string | null
  grade: string | null
}

interface Props {
  classId: string
  enrolledIds: string[]
  onClose: (refresh?: boolean) => void
}

export function EnrollStudentModal({ classId, enrolledIds, onClose }: Props) {
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Quick-create
  const [showCreate, setShowCreate] = useState(false)
  const [chi, setChi] = useState('')
  const [eng, setEng] = useState('')
  const [school, setSchool] = useState('')
  const [grade, setGrade] = useState('')
  const [creating, setCreating] = useState(false)

  const enrolled = new Set(enrolledIds)

  useEffect(() => {
    fetch('/api/students')
      .then(r => r.json())
      .then((data: RosterStudent[]) => setRoster(Array.isArray(data) ? data : []))
      .catch(() => setErr('讀取學生名冊失敗'))
      .finally(() => setLoadingList(false))
  }, [])

  const available = roster.filter(s => !enrolled.has(s.id))
  const needle = q.trim().toLowerCase()
  const visible = needle
    ? available.filter(s =>
        [s.chinese_name, s.english_name]
          .some(v => v?.toLowerCase().includes(needle))
      )
    : available

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function enrollIds(ids: string[]) {
    const res = await fetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classId, student_ids: ids }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? '加入失敗')
  }

  async function handleEnrollSelected() {
    if (selected.size === 0) return
    setSaving(true)
    setErr('')
    try {
      await enrollIds([...selected])
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加入失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickCreate() {
    if (!chi.trim() && !eng.trim()) {
      setErr('至少需要中文名或英文名')
      return
    }
    setCreating(true)
    setErr('')
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chinese_name: chi, english_name: eng, school, grade }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '建立失敗')
      const student = await res.json()
      await enrollIds([student.id])
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '建立失敗')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 flex w-full max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-xl md:max-w-md md:rounded-2xl dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold text-foreground">新增學生到班級</p>
          <button onClick={() => onClose()} className="rounded-lg p-1.5 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border px-3">
            <Search size={15} className="text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜尋學生姓名或編號…"
              className="h-9 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {/* Roster list */}
        <div className="min-h-[140px] flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="grid place-items-center py-8 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {available.length === 0 ? '名冊裡的學生都已在此班' : '查無符合的學生'}
            </p>
          ) : (
            visible.map(s => {
              const on = selected.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                    on ? 'bg-gold/10' : 'hover:bg-muted'
                  )}
                >
                  <span className={cn(
                    'grid size-5 shrink-0 place-items-center rounded border',
                    on ? 'border-gold bg-gold text-white' : 'border-border'
                  )}>
                    {on && <Check size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm text-foreground">{s.chinese_name ?? '—'}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.english_name}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {s.school ?? ''}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Quick create */}
        <div className="border-t border-border">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <UserPlus size={15} />
              找不到？快速新增學生
            </button>
          ) : (
            <div className="grid gap-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={chi} onChange={e => setChi(e.target.value)} placeholder="中文名"
                  className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-gold" />
                <input value={eng} onChange={e => setEng(e.target.value)} placeholder="英文名"
                  className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-gold" />
                <input value={school} onChange={e => setSchool(e.target.value)} placeholder="學校"
                  className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-gold" />
                <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="年級"
                  className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-gold" />
              </div>
              <button
                onClick={handleQuickCreate}
                disabled={creating}
                className="flex h-9 items-center justify-center gap-2 rounded-lg border border-foreground text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                建立並加入
              </button>
            </div>
          )}
        </div>

        {err && <p className="px-4 pb-2 text-xs text-red-600">{err}</p>}

        {/* Footer */}
        <div className="border-t border-border p-3">
          <button
            onClick={handleEnrollSelected}
            disabled={saving || selected.size === 0}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            加入所選{selected.size > 0 && ` (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
