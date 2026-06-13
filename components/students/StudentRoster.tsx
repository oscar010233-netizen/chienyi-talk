'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, Search, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RosterStudent } from '@/lib/grade/types'

export function StudentRoster({ students }: { students: RosterStudent[] }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<RosterStudent | null>(null)
  const [adding, setAdding] = useState(false)
  const router = useRouter()

  const needle = q.trim().toLowerCase()
  const visible = needle
    ? students.filter(s =>
        [s.chinese_name, s.english_name, s.legacy_student_id, s.school]
          .some(v => v?.toLowerCase().includes(needle))
      )
    : students

  const handleClose = (refresh?: boolean) => {
    setEditing(null)
    setAdding(false)
    if (refresh) router.refresh()
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-border bg-white px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">學生總覽</h1>
            <p className="mt-1 text-sm text-muted-foreground">全校 {students.length} 位學生</p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            <UserPlus size={15} />
            新增學生
          </button>
        </div>
        <div className="mt-3 flex max-w-sm items-center gap-2 rounded-lg border border-border bg-white px-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜尋姓名、編號、學校…"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto p-3 md:p-6">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-xl bg-white text-sm shadow-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">編號</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">中文名</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">英文名</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">學校</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">年級</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">所屬班級</th>
              <th className="border-b border-border px-3 py-2.5 text-left font-medium">狀態</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  {students.length === 0 ? '尚無學生，點右上角新增' : '查無符合的學生'}
                </td>
              </tr>
            ) : (
              visible.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setEditing(s)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <td className="border-b border-border px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.legacy_student_id}</td>
                  <td className="border-b border-border px-3 py-2.5 text-foreground">{s.chinese_name ?? '—'}</td>
                  <td className="border-b border-border px-3 py-2.5 text-muted-foreground">{s.english_name ?? '—'}</td>
                  <td className="border-b border-border px-3 py-2.5 text-muted-foreground">{s.school ?? '—'}</td>
                  <td className="border-b border-border px-3 py-2.5 text-muted-foreground">{s.grade ?? '—'}</td>
                  <td className="border-b border-border px-3 py-2.5">
                    {s.classes.length === 0
                      ? <span className="text-muted-foreground/50">未分班</span>
                      : <span className="flex flex-wrap gap-1">
                          {s.classes.map((c, i) => (
                            <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{c}</span>
                          ))}
                        </span>}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {s.status === 'active' ? '在學' : '停課'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <StudentFormModal student={editing} onClose={handleClose} />
      )}
    </>
  )
}

function StudentFormModal({ student, onClose }: { student: RosterStudent | null; onClose: (refresh?: boolean) => void }) {
  const isEdit = !!student
  const [chi, setChi] = useState(student?.chinese_name ?? '')
  const [eng, setEng] = useState(student?.english_name ?? '')
  const [school, setSchool] = useState(student?.school ?? '')
  const [grade, setGrade] = useState(student?.grade ?? '')
  const [parentName, setParentName] = useState(student?.parent_name ?? '')
  const [parentPhone, setParentPhone] = useState(student?.parent_phone ?? '')
  const [status, setStatus] = useState(student?.status ?? 'active')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    if (!chi.trim() && !eng.trim()) {
      setErr('至少需要中文名或英文名')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const body: Record<string, unknown> = {
        chinese_name: chi, english_name: eng, school, grade,
        parent_name: parentName, parent_phone: parentPhone,
      }
      if (isEdit) { body.id = student!.id; body.status = status }
      const res = await fetch('/api/students', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '儲存失敗')
      onClose(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setLoading(false)
    }
  }

  const field = 'h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold/30'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-sm md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-semibold text-foreground">{isEdit ? '編輯學生' : '新增學生'}</p>
            {isEdit && <p className="mt-0.5 text-xs text-muted-foreground">{student!.legacy_student_id}</p>}
          </div>
          <button onClick={() => onClose()} className="rounded-lg p-1.5 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">中文名</label>
              <input value={chi} onChange={e => setChi(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">英文名</label>
              <input value={eng} onChange={e => setEng(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">學校</label>
              <input value={school} onChange={e => setSchool(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">年級</label>
              <input value={grade} onChange={e => setGrade(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">家長姓名</label>
              <input value={parentName} onChange={e => setParentName(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">家長電話</label>
              <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} className={field} />
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">狀態</label>
              <div className="flex gap-2">
                {[['active', '在學'], ['inactive', '停課']].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setStatus(v)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      status === v ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  )
}
