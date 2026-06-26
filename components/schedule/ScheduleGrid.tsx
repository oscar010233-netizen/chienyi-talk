'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3 } from 'lucide-react'
import type { Room, ScheduleEvent } from '@/lib/schedule/types'

const SLOT_HEIGHT = 42
const HEADER_HEIGHT = 56
const GRID_START_MIN = 12 * 60
const GRID_END_MIN = 22 * 60
const SLOT_MINUTES = 15
const TOTAL_SLOTS = (GRID_END_MIN - GRID_START_MIN) / SLOT_MINUTES
const TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT
const COL_MIN = 130

function slotToTime(slot: number): string {
  const total = GRID_START_MIN + slot * SLOT_MINUTES
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function minuteToTop(minutes: number): number {
  return ((minutes - GRID_START_MIN) / SLOT_MINUTES) * SLOT_HEIGHT
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentTimeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function eventTitle(event: ScheduleEvent): string {
  return event.title || event.class_info?.class_name || '未命名課程'
}

function eventSubtitle(event: ScheduleEvent): string {
  if (event.class_info?.class_code) return event.class_info.class_code
  if (event.event_type === 'makeup') return '補課'
  if (event.event_type === 'other') return '其他'
  return '團課'
}

function eventFill(color: string | null): string {
  const base = color ?? '#3b82f6'
  return base.startsWith('#') && (base.length === 7 || base.length === 4)
    ? `${base}24`
    : 'rgba(59, 130, 246, 0.14)'
}

function handleInteractiveKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onActivate: () => void
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onActivate()
  }
}

interface DragState {
  roomId: string
  startSlot: number
  endSlot: number
}

export interface NewEventDraft {
  roomId: string
  startTime: string
  endTime: string
}

interface Props {
  date: string
  rooms: Room[]
  events: ScheduleEvent[]
  onCreateEvent: (draft: NewEventDraft) => void
  onClickEvent: (event: ScheduleEvent) => void
}

export function ScheduleGrid({ date, rooms, events, onCreateEvent, onClickEvent }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [now, setNow] = useState(() => new Date())
  const mouseDown = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const slots = useMemo(() => Array.from({ length: TOTAL_SLOTS }, (_, index) => index), [])

  const eventsByRoom = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>()
    for (const room of rooms) {
      map.set(room.id, events.filter(event => event.room_id === room.id))
    }
    return map
  }, [events, rooms])

  const isCurrentDay = date === formatDate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTop = minuteToTop(nowMinutes)
  const showNowLine = isCurrentDay && nowMinutes >= GRID_START_MIN && nowMinutes <= GRID_END_MIN

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!showNowLine || !scrollRef.current) return
    scrollRef.current.scrollTop = Math.max(0, HEADER_HEIGHT + nowTop - 220)
  }, [showNowLine, nowTop, date])

  function onSlotDown(roomId: string, slot: number, event: React.MouseEvent) {
    event.preventDefault()
    mouseDown.current = true
    setDrag({ roomId, startSlot: slot, endSlot: slot })
  }

  function onSlotEnter(roomId: string, slot: number) {
    if (mouseDown.current && drag?.roomId === roomId) {
      setDrag(previous => previous ? { ...previous, endSlot: slot } : null)
    }
  }

  const onMouseUp = useCallback(() => {
    if (mouseDown.current && drag) {
      const start = Math.min(drag.startSlot, drag.endSlot)
      const end = Math.max(drag.startSlot, drag.endSlot) + 1
      onCreateEvent({
        roomId: drag.roomId,
        startTime: slotToTime(start),
        endTime: slotToTime(Math.min(end, TOTAL_SLOTS)),
      })
    }

    mouseDown.current = false
    setDrag(null)
  }, [drag, onCreateEvent])

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseUp])

  if (rooms.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <div className="rounded-md border border-dashed border-border bg-white/70 px-6 py-8 text-center dark:bg-white/[0.03]">
          <Clock3 className="mx-auto mb-3 text-muted-foreground" size={28} />
          <p className="text-sm font-semibold text-foreground">尚未建立教室</p>
          <p className="mt-1 text-xs text-muted-foreground">請先建立教室資料。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex flex-1 flex-col">
      <div className="mac-soft min-h-0 flex flex-1 flex-col overflow-clip rounded-xl">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto"
          style={{ userSelect: 'none' }}
        >
          <div className="flex min-w-full flex-col">
            <div className="mac-glass mac-hairline sticky top-0 z-30 flex shrink-0 border-b shadow-[0_2px_10px_-4px_rgba(0,0,0,0.10)]">
              <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-border bg-background/90 backdrop-blur-xl" />
              {rooms.map((room, index) => (
                <div
                  key={room.id}
                  style={{ height: HEADER_HEIGHT, flex: `1 0 ${COL_MIN}px` }}
                  className={[
                    'flex items-center justify-center px-3',
                    index > 0 ? 'border-l border-border' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0 text-center">
                    <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                    {room.room_type && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{room.room_type}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex">
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-border bg-background/95 backdrop-blur-xl">
                <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                  {[...slots, TOTAL_SLOTS].map(slot => {
                    const totalMin = GRID_START_MIN + slot * SLOT_MINUTES
                    const hour = Math.floor(totalMin / 60)
                    const minute = totalMin % 60
                    const isHour = minute === 0
                    return (
                      <div
                        key={slot}
                        className="absolute right-0 left-0 flex items-end justify-end pr-2"
                        style={{ top: Math.max(2, minuteToTop(totalMin) - (isHour ? 9 : 7)) }}
                      >
                        {isHour ? (
                          <span className="text-[11px] font-bold tabular-nums leading-none text-foreground/60">
                            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
                          </span>
                        ) : (
                          <span className="pr-0.5 text-[9px] tabular-nums leading-none text-muted-foreground/75">
                            {String(minute).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {showNowLine && (
                    <div
                      className="absolute right-2 z-20 rounded-sm bg-red-500 px-1 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                      style={{ top: nowTop - 10 }}
                    >
                      {currentTimeLabel(now)}
                    </div>
                  )}
                </div>
              </div>

              {showNowLine && (
                <div
                  className="pointer-events-none absolute right-0 z-20 flex items-center"
                  style={{ top: nowTop, left: 64 }}
                >
                  <span className="-ml-1 size-2 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.16)]" />
                  <span className="h-px flex-1 bg-red-500" />
                </div>
              )}

              {rooms.map((room, roomIndex) => {
                const roomEvents = eventsByRoom.get(room.id) ?? []
                const isDragging = drag?.roomId === room.id
                const dragStart = drag ? Math.min(drag.startSlot, drag.endSlot) : -1
                const dragEnd = drag ? Math.max(drag.startSlot, drag.endSlot) : -1

                return (
                  <div
                    key={room.id}
                    style={{ flex: `1 0 ${COL_MIN}px` }}
                    className={['relative', roomIndex > 0 ? 'border-l border-border' : ''].join(' ')}
                  >
                    <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                      {slots.map(slot => {
                        const isHour = (slot + 1) % 4 === 0
                        const isHalfHour = slot % 2 === 0
                        const inDrag = isDragging && slot >= dragStart && slot <= dragEnd
                        return (
                          <div
                            key={slot}
                            style={{ height: SLOT_HEIGHT }}
                            className={[
                              'relative cursor-crosshair border-b transition-colors',
                              isHour ? 'border-border/70' : 'border-border/20',
                              inDrag ? 'bg-sky-500/15' : isHalfHour ? 'bg-background' : 'bg-muted',
                            ].join(' ')}
                            onMouseDown={event => onSlotDown(room.id, slot, event)}
                            onMouseEnter={() => onSlotEnter(room.id, slot)}
                          />
                        )
                      })}

                      {roomEvents.map(event => {
                        const eventStart = minutesFromTime(event.start_time)
                        const eventEnd = minutesFromTime(event.end_time)
                        const clampedStart = Math.max(eventStart, GRID_START_MIN)
                        const clampedEnd = Math.min(eventEnd, GRID_END_MIN)
                        if (clampedEnd <= GRID_START_MIN || clampedStart >= GRID_END_MIN) return null

                        const top = minuteToTop(clampedStart)
                        const height = Math.max(minuteToTop(clampedEnd) - top - 4, 28)
                        const color = event.color ?? '#3b82f6'
                        const teachers = [...(event.teachers ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time))

                        if (teachers.length > 0) {
                          return (
                            <div
                              key={event.id}
                              role="button"
                              tabIndex={0}
                              style={{
                                position: 'absolute',
                                top: top + 2,
                                left: 6,
                                right: 6,
                                height,
                                borderColor: color,
                                backgroundColor: eventFill(color),
                              }}
                              className="z-10 overflow-hidden rounded-md border border-l-4 shadow-[0_8px_22px_-16px_rgba(0,0,0,0.65)] transition-all hover:-translate-y-0.5 hover:brightness-[1.03] focus:outline-none focus:ring-2 focus:ring-gold/30 active:scale-[0.99]"
                              onClick={() => onClickEvent(event)}
                              onKeyDown={keyEvent => handleInteractiveKeyDown(keyEvent, () => onClickEvent(event))}
                            >
                              {teachers.map((teacher, teacherIndex) => {
                                const teacherStart = minutesFromTime(teacher.start_time)
                                const teacherEnd = minutesFromTime(teacher.end_time)
                                const segmentStart = Math.max(teacherStart, clampedStart)
                                const segmentEnd = Math.min(teacherEnd, clampedEnd)
                                if (segmentEnd <= segmentStart) return null

                                const segmentTop = minuteToTop(segmentStart) - top
                                const segmentHeight = Math.max(
                                  minuteToTop(segmentEnd) - minuteToTop(segmentStart) - (teacherIndex === teachers.length - 1 ? 4 : 0),
                                  20
                                )
                                const segmentColor = teacher.color ?? color

                                return (
                                  <div
                                    key={teacher.id}
                                    style={{
                                      position: 'absolute',
                                      top: segmentTop,
                                      left: 0,
                                      right: 0,
                                      height: segmentHeight,
                                      backgroundColor: eventFill(segmentColor),
                                      borderTop: teacherIndex > 0 ? `1px dashed ${color}` : undefined,
                                    }}
                                    className="overflow-hidden text-left transition-[filter] hover:brightness-[1.02]"
                                  >
                                    <span
                                      className="absolute inset-y-0 left-0 w-1.5"
                                      style={{ backgroundColor: segmentColor }}
                                    />
                                    <div className="flex h-full min-w-0 flex-col justify-center px-2 py-1 pl-4">
                                      {teacherIndex === 0 && (
                                        <p className="truncate text-xs font-semibold leading-tight text-foreground">
                                          {eventTitle(event)}
                                        </p>
                                      )}
                                      {teacherIndex === 0 && segmentHeight >= 44 && (
                                        <p className="truncate text-[10px] text-muted-foreground">
                                          {eventSubtitle(event)}
                                        </p>
                                      )}
                                      <p
                                        className={[
                                          'truncate text-[10px] text-muted-foreground',
                                          teacherIndex === 0 ? 'mt-0.5' : '',
                                        ].join(' ')}
                                      >
                                        {teacher.teacher?.name ?? '未指定老師'} {teacher.start_time.slice(0, 5)} - {teacher.end_time.slice(0, 5)}
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }

                        return (
                          <button
                            key={event.id}
                            type="button"
                            style={{
                              position: 'absolute',
                              top: top + 2,
                              left: 6,
                              right: 6,
                              height,
                              borderColor: color,
                              backgroundColor: eventFill(color),
                            }}
                            className="z-10 overflow-hidden rounded-md border border-l-4 px-2 py-1.5 text-left shadow-[0_8px_22px_-16px_rgba(0,0,0,0.65)] transition-all hover:-translate-y-0.5 hover:brightness-[1.03] focus:outline-none focus:ring-2 focus:ring-gold/30 active:scale-[0.99]"
                            onClick={clickEvent => {
                              clickEvent.stopPropagation()
                              onClickEvent(event)
                            }}
                          >
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold leading-tight text-foreground">
                                  {eventTitle(event)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {eventSubtitle(event)}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-sm bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                                {event.start_time.slice(0, 5)}
                              </span>
                            </div>
                            {height >= 58 && (
                              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                {event.start_time.slice(0, 5)} - {event.end_time.slice(0, 5)}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
