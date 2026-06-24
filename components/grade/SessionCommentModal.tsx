'use client'

import { useState } from 'react'
import { Check, Loader2, Sparkles, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionDailyComment } from '@/lib/grade/types'

interface Props {
  classId: string
  sessionDate: string
  existingComment: SessionDailyComment | null
  onClose: (refresh?: boolean) => void
}

export function SessionCommentModal({ classId, sessionDate, existingComment, onClose }: Props) {
  const [commentText, setCommentText] = useState(existingComment?.comment_text ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(existingComment?.status ?? 'draft')
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [prePolish, setPrePolish] = useState<string | null>(existingComment?.comment_raw ?? null)
  const [error, setError] = useState('')

  const dateTitle = sessionDate.slice(5).replace('-', '/')

  async function handlePolish() {
    const raw = commentText.trim()
    if (!raw) {
      setError('請先輸入評語內容，再進行潤色')
      return
    }
    setPolishing(true)
    setError('')
    try {
      const res = await fetch('/api/session-comments/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '潤色失敗')
      setPrePolish(commentText)
      setCommentText(data.polished)
    } catch (err) {
      setError(err instanceof Error ? err.message : '潤色失敗')
    } finally {
      setPolishing(false)
    }
  }

  function handleRevert() {
    if (prePolish === null) return
    setCommentText(prePolish)
    setPrePolish(null)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/session-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          session_date: sessionDate,
          comment_text: commentText,
          comment_raw: prePolish,
          status,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '儲存失敗')
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button aria-label="關閉" className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-w-md md:rounded-2xl dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="truncate font-semibold text-foreground">{dateTitle} 班級評語</p>
          <button type="button" onClick={() => onClose()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">評語內容</span>
            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              rows={5}
              placeholder="輸入給家長的評語..."
              className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">狀態</span>
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setStatus('draft')}
                aria-pressed={status === 'draft'}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  status === 'draft'
                    ? 'bg-foreground text-background'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                草稿
              </button>
              <button
                type="button"
                onClick={() => setStatus('published')}
                aria-pressed={status === 'published'}
                className={cn(
                  'border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
                  status === 'published'
                    ? 'bg-foreground text-background'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                發布
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePolish}
              disabled={polishing || saving || !commentText.trim()}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 text-xs font-medium text-foreground transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              {polishing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {polishing ? '潤色中…' : 'Gemini 潤色'}
            </button>
            {prePolish !== null && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={polishing || saving}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Undo2 size={14} />
                還原
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
