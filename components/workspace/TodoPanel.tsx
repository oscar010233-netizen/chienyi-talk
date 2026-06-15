'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface Todo {
  id: string
  content: string
  done: boolean
}

export function TodoPanel({ date }: { date: string }) {
  const [todos, setTodos]     = useState<Todo[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)

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

  const pending  = todos.filter(t => !t.done)
  const done     = todos.filter(t => t.done)

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
            {[...pending, ...done].map((t, i) => (
              <li
                key={t.id}
                className={[
                  'flex items-center gap-2 px-3 py-2',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted',
                ].join(' ')}
              >
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
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
