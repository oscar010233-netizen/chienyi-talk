'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, UtensilsCrossed, CheckSquare } from 'lucide-react'
import { ScheduleGrid, type NewEventDraft } from '@/components/schedule/ScheduleGrid'
import { CreateEventModal } from '@/components/schedule/CreateEventModal'
import { DinnerPanel } from '@/components/workspace/DinnerPanel'
import { TodoPanel } from '@/components/workspace/TodoPanel'
import type { Room, ScheduleEvent } from '@/lib/schedule/types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseLocal(s: string): Date {
  return new Date(`${s}T12:00:00`)
}

function dateLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} 週${WEEKDAYS[d.getDay()]}`
}

interface ViewToggleProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function ViewToggle({ icon, label, active, onClick }: ViewToggleProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-gold/40 bg-gold/10 text-gold dark:border-[#ff4d4f]/40 dark:bg-[#ff4d4f]/10 dark:text-[#ff4d4f]'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
}

export default function WorkspacePage() {
  const [date,        setDate]        = useState(() => formatDate(new Date()))
  const [rooms,       setRooms]       = useState<Room[]>([])
  const [events,      setEvents]      = useState<ScheduleEvent[]>([])
  const [loading,     setLoading]     = useState(false)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [draft,       setDraft]       = useState<NewEventDraft | undefined>()
  const [editEvent,   setEditEvent]   = useState<ScheduleEvent | null>(null)
  const [showGrid,    setShowGrid]    = useState(true)
  const [showDinner,  setShowDinner]  = useState(true)
  const [showTodo,    setShowTodo]    = useState(true)

  useEffect(() => {
    fetch('/api/rooms').then(r => r.json()).then(setRooms).catch(() => {})
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule/events?date=${date}`)
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchEvents()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchEvents])

  function shiftDate(days: number) {
    const d = parseLocal(date)
    d.setDate(d.getDate() + days)
    setDate(formatDate(d))
  }

  function openCreate(d: NewEventDraft) {
    setDraft(d); setEditEvent(null); setModalOpen(true)
  }
  function openEdit(ev: ScheduleEvent) {
    setEditEvent(ev); setDraft(undefined); setModalOpen(true)
  }

  const isToday        = date === formatDate(new Date())
  const showRightPanel = showDinner || showTodo

  return (
    <div className="flex h-full flex-col">

      {/* ── Header ── */}
      <div className="mac-glass mac-hairline sticky top-0 z-40 border-b px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">配課表</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {dateLabel(parseLocal(date))}
              {loading && <span className="ml-2 animate-pulse">載入中…</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggles */}
            <div className="flex items-center gap-1.5">
              <ViewToggle icon={<CalendarDays size={13} />}    label="課表" active={showGrid}   onClick={() => setShowGrid(v => !v)} />
              <ViewToggle icon={<UtensilsCrossed size={13} />} label="晚餐" active={showDinner} onClick={() => setShowDinner(v => !v)} />
              <ViewToggle icon={<CheckSquare size={13} />}     label="待辦" active={showTodo}   onClick={() => setShowTodo(v => !v)} />
            </div>

            <div className="h-5 w-px bg-border" />

            {/* Date nav */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => shiftDate(-1)}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.07]"
              >
                <ChevronLeft size={16} />
              </button>

              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground outline-none transition-colors focus:border-gold dark:focus:border-[#ff4d4f]"
              />

              <button
                onClick={() => shiftDate(1)}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.07]"
              >
                <ChevronRight size={16} />
              </button>

              {!isToday && (
                <button
                  onClick={() => setDate(formatDate(new Date()))}
                  className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  今天
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 md:gap-6 md:p-6">

        {showGrid && (
          <ScheduleGrid
            date={date}
            rooms={rooms}
            events={events}
            onCreateEvent={openCreate}
            onClickEvent={openEdit}
          />
        )}

        {showRightPanel && (
          <div className="flex w-60 shrink-0 flex-col gap-3">
            {showDinner && <DinnerPanel date={date} />}
            {showTodo   && <TodoPanel   date={date} />}
          </div>
        )}
      </div>

      <CreateEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rooms={rooms}
        draft={draft}
        event={editEvent}
        date={date}
        onSaved={fetchEvents}
      />
    </div>
  )
}
