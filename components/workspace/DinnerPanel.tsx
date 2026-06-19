'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

interface DinnerOrder {
  id: string
  person: string
  content: string
  notes: string | null
  sort_order: number | null
}

function NoteInput({ id, notes }: { id: string; notes: string | null }) {
  const [val, setVal] = useState(notes ?? '')
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        void fetch(`/api/day-entries?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: val.trim() || null }),
        })
      }}
      placeholder="備注…"
      className="w-full bg-transparent text-[10px] text-muted-foreground/60 outline-none placeholder:text-muted-foreground/25"
    />
  )
}

export function DinnerPanel({ date }: { date: string }) {
  const [orders, setOrders]   = useState<DinnerOrder[]>([])
  const [name, setName]       = useState('')
  const [meal, setMeal]       = useState('')
  const [loading, setLoading] = useState(false)
  const [dragId, setDragId]   = useState<string | null>(null)
  const [overId, setOverId]   = useState<string | null>(null)
  const mealRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!date) return
    fetch(`/api/day-entries?date=${date}&type=dinner`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setOrders([]))
  }, [date])

  async function submit() {
    if (!name.trim() || !meal.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/day-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, type: 'dinner', person: name.trim(), content: meal.trim() }),
      })
      const row = await res.json()
      setOrders(prev => [...prev, row])
      setName('')
      setMeal('')
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/day-entries?id=${id}`, { method: 'DELETE' })
    setOrders(prev => prev.filter(o => o.id !== id))
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
    const from = orders.findIndex(o => o.id === dragId)
    const to   = orders.findIndex(o => o.id === targetId)
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return }
    const next = [...orders]
    next.splice(from, 1)
    next.splice(to, 0, orders[from])
    setOrders(next)
    next.forEach((o, i) => {
      void fetch(`/api/day-entries?id=${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      })
    })
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="flex flex-col rounded-xl mac-soft overflow-hidden">
      <div className="mac-glass mac-hairline border-b px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">🍱 晚餐</p>
      </div>

      {/* Input row */}
      <div className="flex gap-1.5 border-b border-border p-2">
        <input
          placeholder="姓名"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Tab' && (e.preventDefault(), mealRef.current?.focus())}
          className="min-w-0 flex-[2] rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold"
        />
        <input
          ref={mealRef}
          placeholder="餐點"
          value={meal}
          onChange={e => setMeal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="min-w-0 flex-[3] rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold"
        />
        <button
          onClick={submit}
          disabled={loading || !name.trim() || !meal.trim()}
          className="grid size-6 shrink-0 place-items-center rounded-md bg-gold/90 text-white hover:bg-gold disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {orders.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">尚無訂單</p>
        ) : (
          <ul>
            {orders.map((o, i) => (
              <li
                key={o.id}
                draggable
                onDragStart={() => handleDragStart(o.id)}
                onDragOver={e => handleDragOver(e, o.id)}
                onDrop={() => handleDrop(o.id)}
                onDragEnd={() => { setDragId(null); setOverId(null) }}
                className={[
                  'flex items-start gap-1.5 px-2 py-1.5 text-xs transition-opacity',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted',
                  dragId === o.id ? 'opacity-40' : '',
                  overId === o.id && dragId !== o.id ? 'ring-1 ring-inset ring-gold/40' : '',
                ].join(' ')}
              >
                <span className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/30 active:cursor-grabbing">
                  <GripVertical size={12} />
                </span>
                <span className="min-w-[36px] shrink-0 font-medium text-foreground">{o.person}</span>
                <div className="min-w-0 flex-1">
                  <span className="block text-muted-foreground">{o.content}</span>
                  <NoteInput id={o.id} notes={o.notes} />
                </div>
                <button
                  onClick={() => remove(o.id)}
                  className="mt-0.5 shrink-0 text-muted-foreground/50 hover:text-red-500"
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
