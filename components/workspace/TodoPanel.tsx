'use client'

import { useEffect, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

interface Todo {
  id: string
  content: string
  done: boolean
  sort_order: number | null
}

export function TodoPanel({ date }: { date: string }) {
  const [todos, setTodos]     = useState<Todo[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [dragId, setDragId]   = useState<string | null>(null)
  const [overId, setOverId]   = useState<string | null>(null)

  useEffect(() => {
    if (!date) return
    fetch(`/api/day-entries?date=${date}&type=todo`)
      .then(r => r.json())
      .then(d => setTodos(Array.isArray(d) ? d : []))
      .catch(() => setTodos([]))
  }, [date])

  async function add() {
    if (!input.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/day-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, type: 'todo', content: input.trim() }),
      })
      const row = await res.json()
      setTodos(prev => [...prev, row])
      setInput('')
    } finally {
      setLoading(false)
    }
  }

  async function toggle(id: string, done: boolean) {
    await fetch(`/api/day-entries?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !done }),
    })
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t))
  }

  async function remove(id: string) {
    await fetch(`/api/day-entries?id=${id}`, { method: 'DELETE' })
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function handleDragStart(id: string) {
    setDragId(id)
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id !== overId) setOverId(id)
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ordered = [...pending, ...done]
    const from = ordered.findIndex(t => t.id === dragId)
    const to   = ordered.findIndex(t => t.id === targetId)
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return }
    const next = [...ordered]
    next.splice(from, 1)
    next.splice(to, 0, ordered[from])
    // Merge back non-reordered items (shouldn't exist, but be safe)
    setTodos(next)
    next.forEach((t, i) => {
      void fetch(`/api/day-entries?id=${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      })
    })
    setDragId(null)
    setOverId(null)
  }

  const pending = todos.filter(t => !t.done)
  const done    = todos.filter(t => t.done)

  const renderItem = (t: Todo, i: number) => (
    <li
      key={t.id}
      draggable
      onDragStart={() => handleDragStart(t.id)}
      onDragOver={e => handleDragOver(e, t.id)}
      onDrop={() => handleDrop(t.id)}
      onDragEnd={() => { setDragId(null); setOverId(null) }}
      className={[
        'flex items-center gap-1.5 px-2 py-2',
        i % 2 === 0 ? 'bg-background' : 'bg-muted',
        dragId === t.id ? 'opacity-40' : '',
        overId === t.id && dragId !== t.id ? 'ring-1 ring-inset ring-gold/40' : '',
      ].join(' ')}
    >
      <span className="shrink-0 cursor-grab text-muted-foreground/30 active:cursor-grabbing">
        <GripVertical size={12} />
      </span>
      <input
        type="checkbox"
        checked={t.done}
        onChange={() => toggle(t.id, t.done)}
        className="size-3.5 shrink-0 accent-gold"
      />
      <span className={['flex-1 text-xs', t.done ? 'line-through text-muted-foreground/60' : 'text-foreground'].join(' ')}>
        {t.content}
      </span>
      <button
        onClick={() => remove(t.id)}
        className="shrink-0 text-muted-foreground/50 hover:text-red-500"
      >
        <Trash2 size={11} />
      </button>
    </li>
  )

  return (
    <div className="flex flex-1 flex-col rounded-xl mac-soft overflow-hidden min-h-0">
      <div className="mac-glass mac-hairline border-b px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">☑️ 待辦</p>
      </div>

      {/* Input */}
      <div className="flex gap-1.5 border-b border-border p-2">
        <input
          placeholder="新增待辦…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold"
        />
        <button
          onClick={add}
          disabled={loading || !input.trim()}
          className="grid size-6 shrink-0 place-items-center rounded-md bg-gold/90 text-white hover:bg-gold disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">今天沒有待辦</p>
        ) : (
          <ul>
            {[...pending, ...done].map((t, i) => renderItem(t, i))}
          </ul>
        )}
      </div>
    </div>
  )
}
