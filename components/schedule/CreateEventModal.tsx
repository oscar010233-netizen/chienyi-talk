'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Room, ScheduleEvent } from '@/lib/schedule/types'

interface ClassOption {
  id: string
  class_name: string
  class_code: string | null
}

interface ProfileOption {
  id: string
  display_name: string | null
  role: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  rooms: Room[]
  draft?: { roomId: string; startTime: string; endTime: string }
  event?: ScheduleEvent | null
  date: string
  onSaved: () => void
}

interface TeacherSegmentDraft {
  localId: string
  teacherId: string
  startTime: string
  endTime: string
  color: string
}

interface FormState {
  roomId: string
  classId: string
  title: string
  eventType: ScheduleEvent['event_type']
  startTime: string
  endTime: string
  color: string
  note: string
  teacherSegments: TeacherSegmentDraft[]
}

const EVENT_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#f97316',
  '#84cc16',
]

const EVENT_TYPES: { value: ScheduleEvent['event_type']; label: string }[] = [
  { value: 'class', label: '團課' },
  { value: 'makeup', label: '補課' },
  { value: 'other', label: '其他' },
]

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}

function segmentId(index: number): string {
  return `segment-${index}-${Math.random().toString(36).slice(2)}`
}

function initialForm(event: ScheduleEvent | null | undefined, draft: Props['draft']): FormState {
  if (event) {
    const eventColor = event.color ?? EVENT_COLORS[0]
    return {
      roomId: event.room_id,
      classId: event.class_id ?? '',
      title: event.title ?? '',
      eventType: event.event_type,
      startTime: event.start_time.slice(0, 5),
      endTime: event.end_time.slice(0, 5),
      color: eventColor,
      note: event.note ?? '',
      teacherSegments: [...(event.teachers ?? [])]
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((teacher, index) => ({
          localId: teacher.id ?? segmentId(index),
          teacherId: teacher.teacher_id,
          startTime: teacher.start_time.slice(0, 5),
          endTime: teacher.end_time.slice(0, 5),
          color: teacher.color ?? eventColor,
        })),
    }
  }

  return {
    roomId: draft?.roomId ?? '',
    classId: '',
    title: '',
    eventType: 'class',
    startTime: draft?.startTime ?? '12:00',
    endTime: draft?.endTime ?? '13:00',
    color: EVENT_COLORS[0],
    note: '',
    teacherSegments: [],
  }
}

async function readJsonArray<T>(response: Response): Promise<T[]> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return []
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export function CreateEventModal({ open, onClose, rooms, draft, event, date, onSaved }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [classRes, profileRes] = await Promise.all([
          fetch('/api/classes'),
          fetch('/api/profiles'),
        ])
        const classData = await readJsonArray<ClassOption>(classRes)
        const profileData = await readJsonArray<ProfileOption>(profileRes)
        if (!cancelled) {
          setClasses(classData)
          setProfiles(profileData)
        }
      } catch {
        if (!cancelled) {
          setClasses([])
          setProfiles([])
        }
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const formKey = useMemo(() => {
    if (event) return `event:${event.id}`
    if (draft) return `draft:${draft.roomId}:${draft.startTime}:${draft.endTime}`
    return 'new'
  }, [draft, event])

  if (!open) return null

  return (
    <EventForm
      key={formKey}
      rooms={rooms}
      classes={classes}
      profiles={profiles}
      draft={draft}
      event={event}
      date={date}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}

function EventForm({
  rooms,
  classes,
  profiles,
  draft,
  event,
  date,
  onClose,
  onSaved,
}: {
  rooms: Room[]
  classes: ClassOption[]
  profiles: ProfileOption[]
  draft: Props['draft']
  event?: ScheduleEvent | null
  date: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(event, draft))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  function updateSegment(index: number, patch: Partial<TeacherSegmentDraft>) {
    setForm(previous => ({
      ...previous,
      teacherSegments: previous.teacherSegments.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, ...patch } : segment
      ),
    }))
  }

  function addSegment() {
    setForm(previous => {
      const last = previous.teacherSegments.at(-1)
      const nextIndex = previous.teacherSegments.length
      return {
        ...previous,
        teacherSegments: [
          ...previous.teacherSegments,
          {
            localId: segmentId(nextIndex),
            teacherId: profiles[0]?.id ?? '',
            startTime: last?.endTime ?? previous.startTime,
            endTime: previous.endTime,
            color: EVENT_COLORS[(nextIndex + 1) % EVENT_COLORS.length],
          },
        ],
      }
    })
  }

  function removeSegment(index: number) {
    setForm(previous => ({
      ...previous,
      teacherSegments: previous.teacherSegments.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function validateTeacherSegments(): string | null {
    const eventStart = minutes(form.startTime)
    const eventEnd = minutes(form.endTime)
    const sortedSegments = [...form.teacherSegments].sort((a, b) => minutes(a.startTime) - minutes(b.startTime))

    for (let index = 0; index < sortedSegments.length; index += 1) {
      const segment = sortedSegments[index]

      if (!segment.teacherId) return `第 ${index + 1} 段尚未選老師`
      if (!segment.startTime || !segment.endTime) return `第 ${index + 1} 段時間不完整`

      const start = minutes(segment.startTime)
      const end = minutes(segment.endTime)

      if (end <= start) return `第 ${index + 1} 段結束時間必須晚於開始時間`
      if (start < eventStart || end > eventEnd) return `第 ${index + 1} 段必須落在整堂課時間內`

      const previous = sortedSegments[index - 1]
      if (previous && start < minutes(previous.endTime)) {
        return `第 ${index} 段與第 ${index + 1} 段時間重疊`
      }
    }

    return null
  }

  async function handleSave() {
    if (!form.roomId) {
      setError('請選擇教室')
      return
    }
    if (!form.startTime || !form.endTime) {
      setError('請填寫開始與結束時間')
      return
    }
    if (minutes(form.endTime) <= minutes(form.startTime)) {
      setError('結束時間必須晚於開始時間')
      return
    }

    const segmentError = validateTeacherSegments()
    if (segmentError) {
      setError(segmentError)
      return
    }

    setSaving(true)
    setError('')

    try {
      const teacherSegments = [...form.teacherSegments]
        .sort((a, b) => minutes(a.startTime) - minutes(b.startTime))
        .map(segment => ({
          teacher_id: segment.teacherId,
          start_time: segment.startTime,
          end_time: segment.endTime,
          color: segment.color,
        }))

      const payload = {
        room_id: form.roomId,
        class_id: form.classId || null,
        title: form.title || null,
        event_type: form.eventType,
        start_time: form.startTime,
        end_time: form.endTime,
        color: form.color,
        note: form.note || null,
        teachers: teacherSegments,
      }

      const response = event
        ? await fetch(`/api/schedule/events/${event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/schedule/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, date }),
          })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? '儲存失敗')
        return
      }

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!window.confirm('確定要刪除這堂課？')) return

    setDeleting(true)
    try {
      await fetch(`/api/schedule/events/${event.id}`, { method: 'DELETE' })
      onSaved()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-lg border border-white/70 bg-white shadow-[0_30px_90px_-45px_rgba(0,0,0,0.75)] md:max-w-2xl md:rounded-lg dark:border-white/10 dark:bg-[#2c2c2e]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-md text-white shadow-sm"
              style={{ backgroundColor: form.color }}
            >
              <CalendarClock size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">
                {event ? '編輯課程' : '新增課程'}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {date} · {form.startTime} - {form.endTime}
              </p>
            </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">教室</span>
              <select
                value={form.roomId}
                onChange={event => update('roomId', event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
              >
                <option value="">選擇教室</option>
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">班級</span>
              <select
                value={form.classId}
                onChange={event => update('classId', event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
              >
                <option value="">不指定班級</option>
                {classes.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.class_code ? `[${item.class_code}] ` : ''}{item.class_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">標題</span>
            <input
              type="text"
              value={form.title}
              onChange={event => update('title', event.target.value)}
              placeholder="例如：國三 A 班"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">類型</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
              {EVENT_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update('eventType', type.value)}
                  className={cn(
                    'h-8 rounded-md text-xs font-semibold transition-colors',
                    form.eventType === type.value
                      ? 'bg-white text-foreground shadow-sm dark:bg-[#3a3a3c]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">開始</span>
              <input
                type="time"
                value={form.startTime}
                onChange={event => update('startTime', event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">結束</span>
              <input
                type="time"
                value={form.endTime}
                onChange={event => update('endTime', event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
              />
            </label>
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">課程顏色</span>
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => update('color', color)}
                  aria-label={`選擇顏色 ${color}`}
                  style={{ backgroundColor: color }}
                  className={cn(
                    'size-7 rounded-full ring-offset-2 ring-offset-white transition-transform dark:ring-offset-[#2c2c2e]',
                    form.color === color ? 'scale-110 ring-2 ring-foreground' : 'hover:scale-105'
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">授課分段</span>
              <button
                type="button"
                onClick={addSegment}
                disabled={profiles.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground/75 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} />
                加入分段
              </button>
            </div>

            {profiles.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                目前沒有可選老師帳號。
              </p>
            )}

            {form.teacherSegments.length > 0 && (
              <div className="grid gap-2">
                {form.teacherSegments.map((segment, index) => (
                  <div
                    key={segment.localId}
                    className="grid gap-2 rounded-md border border-border bg-muted/25 p-2 sm:grid-cols-[1.25fr_0.8fr_0.8fr_auto] sm:items-end"
                  >
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">老師</span>
                      <select
                        value={segment.teacherId}
                        onChange={event => updateSegment(index, { teacherId: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
                      >
                        <option value="">選擇老師</option>
                        {profiles.map(profile => (
                          <option key={profile.id} value={profile.id}>
                            {profile.display_name ?? profile.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">開始</span>
                      <input
                        type="time"
                        value={segment.startTime}
                        onChange={event => updateSegment(index, { startTime: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">結束</span>
                      <input
                        type="time"
                        value={segment.endTime}
                        onChange={event => updateSegment(index, { endTime: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <div className="flex gap-1.5">
                        {EVENT_COLORS.slice(0, 6).map(color => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`選擇分段顏色 ${color}`}
                            onClick={() => updateSegment(index, { color })}
                            style={{ backgroundColor: color }}
                            className={cn(
                              'size-5 rounded-full ring-offset-2 ring-offset-background transition-transform',
                              segment.color === color ? 'scale-110 ring-2 ring-foreground' : 'hover:scale-105'
                            )}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="刪除分段"
                        onClick={() => removeSegment(index)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-400/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">備註</span>
            <textarea
              value={form.note}
              onChange={event => update('note', event.target.value)}
              rows={3}
              className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15"
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-400/10 dark:text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          {event && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-400/25 dark:hover:bg-red-400/10"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              刪除
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-border px-4 text-xs font-semibold text-foreground/75 transition-colors hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gold px-4 text-xs font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-50 dark:bg-[#ff4d4f]"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}
