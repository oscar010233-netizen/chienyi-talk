'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface DinnerOrder {
  id: string
  person: string
  content: string
  notes: string | null
}

export function DinnerPanel({ date }: { date: string }) {
  const [orders, setOrders]   = useState<DinnerOrder[]>([])
  const [name, setName]       = useState('')
  const [meal, setMeal]       = useState('')
  const [loading, setLoading] = useState(false)
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
                className={[
                  'flex items-center gap-2 px-3 py-2 text-xs',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted',
                ].join(' ')}
              >
                <span className="min-w-[40px] font-medium text-foreground">{o.person}</span>
                <span className="flex-1 text-muted-foreground">{o.content}</span>
                <button
                  onClick={() => remove(o.id)}
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
