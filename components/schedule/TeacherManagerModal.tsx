'use client'

import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Teacher {
  id: string
  name: string
  status: 'active' | 'archived'
  sort_order: number
}

interface Props {
  open: boolean
  onClose: () => void
}

async function readJsonArray<T>(response: Response): Promise<T[]> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return []
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function fetchTeachers(): Promise<Teacher[]> {
  const response = await fetch('/api/teachers')
  return readJsonArray<Teacher>(response)
}

export function TeacherManagerModal({ open, onClose }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadTeachers() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchTeachers()
      setTeachers(data)
    } catch {
      setTeachers([])
      setError('老師資料讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function syncTeachers() {
      try {
        const data = await fetchTeachers()
        if (!cancelled) {
          setTeachers(data)
          setError('')
        }
      } catch {
        if (!cancelled) {
          setTeachers([])
          setError('老師資料讀取失敗')
        }
      }
    }

    void syncTeachers()

    return () => {
      cancelled = true
    }
  }, [open])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setError('請先輸入老師名稱')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? '新增老師失敗')
        return
      }

      setNewName('')
      await loadTeachers()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(teacher: Teacher) {
    const name = teacher.name.trim()
    if (!name) {
      setError('老師名稱不可空白')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/teachers/${teacher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sort_order: teacher.sort_order }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? '更新老師失敗')
        return
      }

      await loadTeachers()
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(teacher: Teacher) {
    if (!window.confirm(`確定要刪除老師「${teacher.name}」嗎？`)) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/teachers/${teacher.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? '刪除老師失敗')
        return
      }

      await loadTeachers()
    } finally {
      setSaving(false)
    }
  }

  function updateTeacher(index: number, patch: Partial<Teacher>) {
    setTeachers(previous =>
      previous.map((teacher, currentIndex) =>
        currentIndex === index ? { ...teacher, ...patch } : teacher
      )
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl rounded-t-xl border border-white/70 bg-card text-card-foreground shadow-[0_30px_90px_-45px_rgba(0,0,0,0.75)] md:rounded-xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">管理老師</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">只顯示啟用中的老師，刪除會改成封存。</p>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="新增老師名稱"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-50 dark:bg-[#ff4d4f]"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              新增
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="mr-2 animate-spin" />
              載入老師資料中
            </div>
          ) : teachers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              目前沒有啟用中的老師。
            </p>
          ) : (
            <div className="grid gap-2">
              {teachers.map((teacher, index) => (
                <div
                  key={teacher.id}
                  className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_96px_auto_auto] sm:items-center"
                >
                  <input
                    type="text"
                    value={teacher.name}
                    onChange={event => updateTeacher(index, { name: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
                  />
                  <input
                    type="number"
                    value={teacher.sort_order}
                    onChange={event => updateTeacher(index, { sort_order: Number(event.target.value) || 0 })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUpdate(teacher)}
                    disabled={saving}
                    className="h-9 rounded-md border border-border px-3 text-sm font-semibold text-foreground/75 transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleArchive(teacher)}
                    disabled={saving}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-400/25 dark:hover:bg-red-400/10"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
