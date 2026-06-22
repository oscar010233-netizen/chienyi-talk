'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ClassRow, Task, TaskTemplate, TaskTemplateItem, TaskType } from '@/lib/grade/types'

const WEEKDAY_ZH = ['', '一', '二', '三', '四', '五', '六', '日']

const TASK_TYPE_LABEL: Record<Exclude<TaskType, 'attendance'>, string> = {
  homework: '作業',
  practice: '練習',
  quiz: '測驗',
  comment: '評語',
  progress: '進度',
}

const TASK_TYPE_OPTIONS = Object.entries(TASK_TYPE_LABEL) as Array<[Exclude<TaskType, 'attendance'>, string]>

interface TemplateWithItems extends TaskTemplate {
  items: TaskTemplateItem[]
}

export interface PlanSessionSlot {
  slot_index: number
  session_date: string | null
  session_kind: 'team' | 'intensive'
  lesson_label: string | null
  tasks: Task[]
}

interface Props {
  classId: string
  cls: ClassRow
  bagId: string | null
  initialSlots: PlanSessionSlot[]
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return { md: '待定', day: '' }
  const [, m, d] = dateStr.split('-')
  const day = WEEKDAY_ZH[new Date(`${dateStr}T00:00:00Z`).getUTCDay() || 7] ?? ''
  return { md: `${Number(m)}/${Number(d)}`, day }
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const displayOrderA = a.display_order ?? Number.MAX_SAFE_INTEGER
    const displayOrderB = b.display_order ?? Number.MAX_SAFE_INTEGER
    if (displayOrderA !== displayOrderB) return displayOrderA - displayOrderB
    return a.id.localeCompare(b.id)
  })
}

function deriveSessionPosition(sessionKind: PlanSessionSlot['session_kind']): 'S1' | 'S2' {
  return sessionKind === 'intensive' ? 'S2' : 'S1'
}

function taskTypeName(taskType: Exclude<TaskType, 'attendance'>) {
  return TASK_TYPE_LABEL[taskType] ?? taskType
}

function TaskNameInput({
  value,
  onSave,
}: {
  value: string
  onSave: (nextValue: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const nextValue = draft.trim()
    if (nextValue === value) return
    setSaving(true)
    try {
      await onSave(nextValue)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
          if (event.key === 'Escape') {
            setDraft(value)
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
      />
      {saving && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
    </div>
  )
}

export function PlanSheet({ classId, cls, bagId, initialSlots }: Props) {
  const classSlug = encodeURIComponent(classId)
  const [slots, setSlots] = useState<PlanSessionSlot[]>(() => initialSlots.map((slot) => ({ ...slot, tasks: sortTasks(slot.tasks) })))
  const [templates, setTemplates] = useState<TemplateWithItems[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [lessonDrafts, setLessonDrafts] = useState<Record<number, string>>(() => Object.fromEntries(
    initialSlots.map((slot) => [slot.slot_index, slot.lesson_label ?? '']),
  ))
  const [templateSelection, setTemplateSelection] = useState<Record<number, string>>({})
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateItems, setNewTemplateItems] = useState<Array<{ task_type: Exclude<TaskType, 'attendance'>; session_position: 'S1' | 'S2' }>>([
    { task_type: 'homework', session_position: 'S1' },
  ])
  const tenantQuery = `tenant_id=${encodeURIComponent(cls.tenant_id)}`

  const selectedCount = selectedSlots.length

  const loadTemplates = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setTemplatesLoading(true)
      setError('')
    }
    try {
      const response = await fetch(`/api/task-templates?${tenantQuery}`)
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '讀取模板失敗')
      setTemplates(json.templates ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取模板失敗')
    } finally {
      setTemplatesLoading(false)
    }
  }, [tenantQuery])

  useEffect(() => {
    let active = true

    async function hydrateTemplates() {
      try {
        const response = await fetch(`/api/task-templates?${tenantQuery}`)
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? '讀取模板失敗')
        if (!active) return
        setTemplates(json.templates ?? [])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : '讀取模板失敗')
      } finally {
        if (active) setTemplatesLoading(false)
      }
    }

    void hydrateTemplates()
    return () => {
      active = false
    }
  }, [tenantQuery])

  const updateSlot = useCallback((slotIndex: number, updater: (slot: PlanSessionSlot) => PlanSessionSlot) => {
    setSlots((current) => current.map((slot) => slot.slot_index === slotIndex ? updater(slot) : slot))
  }, [])

  const setStatus = useCallback((message: string) => {
    setError('')
    setLoadingMessage(message)
  }, [])

  const clearStatus = useCallback(() => {
    setLoadingMessage('')
  }, [])

  async function applyLessonLabel(slotIndex: number, lessonLabel: string) {
    const nextLessonLabel = lessonLabel.trim()
    setLessonDrafts((current) => ({ ...current, [slotIndex]: nextLessonLabel }))
    updateSlot(slotIndex, (slot) => ({ ...slot, lesson_label: nextLessonLabel || null }))

    const targetSlot = slots.find((slot) => slot.slot_index === slotIndex)
    if (!targetSlot || targetSlot.tasks.length === 0 || !bagId) return true

    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: classId,
        bag_id: bagId,
        slot_index: slotIndex,
        lesson_label: nextLessonLabel || null,
      }),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? '更新課標失敗')

    updateSlot(slotIndex, (slot) => ({
      ...slot,
      lesson_label: nextLessonLabel || null,
      tasks: sortTasks((json.tasks ?? []).map((task: Task) => ({
        ...task,
        lesson_label: nextLessonLabel || null,
      }))),
    }))
    return true
  }

  async function handleLessonBlur(slotIndex: number) {
    setStatus('儲存課標中…')
    try {
      await applyLessonLabel(slotIndex, lessonDrafts[slotIndex] ?? '')
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新課標失敗')
      setLoadingMessage('')
    }
  }

  async function createTasks(slot: PlanSessionSlot, tasksToCreate: Array<{ task_type: Exclude<TaskType, 'attendance'>; task_name: string | null }>) {
    if (!bagId) throw new Error('尚未開袋，無法新增任務')

    const lessonLabel = (lessonDrafts[slot.slot_index] ?? '').trim() || null
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: classId,
        bag_id: bagId,
        slot_index: slot.slot_index,
        lesson_label: lessonLabel,
        tasks: tasksToCreate,
      }),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? '新增任務失敗')

    updateSlot(slot.slot_index, (currentSlot) => ({
      ...currentSlot,
      lesson_label: lessonLabel,
      tasks: sortTasks([...(currentSlot.tasks ?? []), ...((json.tasks ?? []) as Task[])]),
    }))
  }

  async function handleAddSingleTask(slot: PlanSessionSlot, taskType: Exclude<TaskType, 'attendance'>) {
    setStatus(`新增${taskTypeName(taskType)}中…`)
    try {
      await createTasks(slot, [{ task_type: taskType, task_name: taskTypeName(taskType) }])
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增任務失敗')
      setLoadingMessage('')
    }
  }

  async function handleApplyTemplate(slot: PlanSessionSlot) {
    const templateId = templateSelection[slot.slot_index]
    if (!templateId) {
      setError('請先選擇模板')
      return
    }

    const template = templates.find((item) => item.id === templateId)
    if (!template) {
      setError('找不到模板')
      return
    }

    const sessionPosition = deriveSessionPosition(slot.session_kind)
    const templateItems = template.items
      .filter((item) => item.session_position === sessionPosition)
      .sort((a, b) => a.sort_order - b.sort_order)

    if (templateItems.length === 0) {
      setError(`模板「${template.name}」沒有 ${sessionPosition} 項目`)
      return
    }

    setStatus(`套用模板「${template.name}」中…`)
    try {
      await createTasks(slot, templateItems.map((item) => ({
        task_type: item.task_type as Exclude<TaskType, 'attendance'>,
        task_name: taskTypeName(item.task_type as Exclude<TaskType, 'attendance'>),
      })))
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '套用模板失敗')
      setLoadingMessage('')
    }
  }

  async function handleTaskNameSave(slotIndex: number, taskId: string, taskName: string) {
    setError('')
    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        task_name: taskName || null,
      }),
    })
    const json = await response.json()
    if (!response.ok) {
      setError(json.error ?? '更新任務名稱失敗')
      return
    }

    updateSlot(slotIndex, (slot) => ({
      ...slot,
      tasks: sortTasks(slot.tasks.map((task) => task.id === taskId ? json.task as Task : task)),
    }))
  }

  async function handleDeleteTask(slotIndex: number, taskId: string, taskName: string) {
    if (!confirm(`刪除任務「${taskName || '未命名任務'}」？`)) return

    setStatus('刪除任務中…')
    try {
      const response = await fetch(`/api/tasks?task_id=${taskId}`, { method: 'DELETE' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '刪除任務失敗')

      updateSlot(slotIndex, (slot) => ({
        ...slot,
        tasks: slot.tasks.filter((task) => task.id !== taskId),
      }))
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除任務失敗')
      setLoadingMessage('')
    }
  }

  async function handleApplySameLesson() {
    if (selectedSlots.length < 2) {
      setError('請至少勾選兩堂課')
      return
    }

    const initialValue = lessonDrafts[selectedSlots[0]] ?? ''
    const nextLabel = window.prompt('請輸入要套用到這些堂次的課標', initialValue)
    if (nextLabel == null) return

    setStatus('批次更新課標中…')
    try {
      for (const slotIndex of selectedSlots) {
        await applyLessonLabel(slotIndex, nextLabel)
      }
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批次更新課標失敗')
      setLoadingMessage('')
    }
  }

  function toggleSlot(slotIndex: number) {
    setSelectedSlots((current) => current.includes(slotIndex)
      ? current.filter((value) => value !== slotIndex)
      : [...current, slotIndex].sort((a, b) => a - b))
  }

  async function handleCreateTemplate() {
    const name = newTemplateName.trim()
    if (!name) {
      setError('模板名稱必填')
      return
    }

    setStatus('儲存模板中…')
    try {
      const response = await fetch('/api/task-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: cls.tenant_id,
          name,
          items: newTemplateItems.map((item, index) => ({
            task_type: item.task_type,
            session_position: item.session_position,
            sort_order: index,
          })),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '儲存模板失敗')

      setTemplates((current) => [...current, json.template as TemplateWithItems])
      setNewTemplateName('')
      setNewTemplateItems([{ task_type: 'homework', session_position: 'S1' }])
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存模板失敗')
      setLoadingMessage('')
    }
  }

  async function handleDeleteTemplate(templateId: string, templateName: string) {
    if (!confirm(`刪除模板「${templateName}」？`)) return

    setStatus('刪除模板中…')
    try {
      const response = await fetch(`/api/task-templates?id=${templateId}&${tenantQuery}`, { method: 'DELETE' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '刪除模板失敗')

      setTemplates((current) => current.filter((template) => template.id !== templateId))
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除模板失敗')
      setLoadingMessage('')
    }
  }

  const headerMessage = useMemo(() => {
    if (loadingMessage) return loadingMessage
    if (selectedCount > 0) return `已勾選 ${selectedCount} 堂`
    return ''
  }, [loadingMessage, selectedCount])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href={`/classes/${classSlug}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <CalendarDays size={16} className="text-muted-foreground" />
        <span className="font-semibold text-foreground">{cls.class_name} — 整季計畫</span>
      </header>

      {(headerMessage || error) && (
        <div className={cn(
          'border-b px-4 py-2 text-xs',
          error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' : 'border-border bg-muted/40 text-muted-foreground',
        )}>
          {error || headerMessage}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {!bagId ? (
          <div className="rounded-lg border border-border bg-white px-4 py-12 text-center text-sm text-muted-foreground dark:bg-[#2c2c2e]">
            還沒有出席日資料，請先開袋建立整季課表。
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleApplySameLesson()}
                disabled={selectedCount < 2}
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
              >
                設為同一課
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlots([])}
                disabled={selectedCount === 0}
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
              >
                清除勾選
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-white dark:bg-[#2c2c2e]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">同課</th>
                    <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">slot_index</th>
                    <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">出席日</th>
                    <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">課標</th>
                    <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">任務列表</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const date = fmtDate(slot.session_date)
                    const sessionPosition = deriveSessionPosition(slot.session_kind)
                    return (
                      <tr key={slot.slot_index} className="align-top">
                        <td className="border-b border-border px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedSlots.includes(slot.slot_index)}
                            onChange={() => toggleSlot(slot.slot_index)}
                            className="size-4 rounded border-border"
                          />
                        </td>
                        <td className="border-b border-border px-3 py-3 font-medium text-foreground">{slot.slot_index}</td>
                        <td className="border-b border-border px-3 py-3">
                          <div className="font-medium text-foreground">
                            {date.md}
                            {date.day && <span className="ml-1 text-muted-foreground">({date.day})</span>}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {slot.session_kind === 'intensive' ? '強化' : '團課'} · {sessionPosition}
                          </div>
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <input
                            value={lessonDrafts[slot.slot_index] ?? ''}
                            onChange={(event) => setLessonDrafts((current) => ({ ...current, [slot.slot_index]: event.target.value }))}
                            onBlur={() => void handleLessonBlur(slot.slot_index)}
                            placeholder="L1"
                            className="h-9 w-full min-w-[8rem] rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                          />
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <div className="space-y-2">
                            {slot.tasks.length > 0 ? slot.tasks.map((task) => (
                              <div key={task.id} className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2 py-2">
                                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                                  {taskTypeName(task.task_type as Exclude<TaskType, 'attendance'>)}
                                </span>
                                <TaskNameInput
                                  key={`${task.id}:${task.task_name ?? ''}`}
                                  value={task.task_name ?? ''}
                                  onSave={(nextValue) => handleTaskNameSave(slot.slot_index, task.id, nextValue)}
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteTask(slot.slot_index, task.id, task.task_name ?? '')}
                                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )) : (
                              <p className="text-sm text-muted-foreground">（空）</p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <select
                                value={templateSelection[slot.slot_index] ?? ''}
                                onChange={(event) => setTemplateSelection((current) => ({ ...current, [slot.slot_index]: event.target.value }))}
                                className="h-9 min-w-[11rem] rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                              >
                                <option value="">選擇模板</option>
                                {templates.map((template) => (
                                  <option key={template.id} value={template.id}>{template.name}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleApplyTemplate(slot)}
                                disabled={templatesLoading}
                                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
                              >
                                {templatesLoading ? '載入模板中…' : '從模板加入'}
                              </button>
                              <div className="flex flex-wrap gap-1">
                                {TASK_TYPE_OPTIONS.map(([taskType, label]) => (
                                  <button
                                    key={`${slot.slot_index}:${taskType}`}
                                    type="button"
                                    onClick={() => void handleAddSingleTask(slot, taskType)}
                                    className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    + {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-white p-4 dark:bg-[#2c2c2e]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">模板管理</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">建立可重複套用的任務組合。</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadTemplates()}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted"
                >
                  重新整理
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  {templates.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                      目前沒有模板
                    </p>
                  ) : (
                    templates.map((template) => (
                      <div key={template.id} className="rounded-md border border-border px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{template.name}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {template.items.map((item) => (
                                <span key={item.id} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                  {item.session_position} · {taskTypeName(item.task_type as Exclude<TaskType, 'attendance'>)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTemplate(template.id, template.name)}
                            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-md border border-border p-3">
                  <p className="font-medium text-foreground">新增模板</p>
                  <div className="mt-3 grid gap-3">
                    <input
                      value={newTemplateName}
                      onChange={(event) => setNewTemplateName(event.target.value)}
                      placeholder="模板名稱"
                      className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                    />

                    {newTemplateItems.map((item, index) => (
                      <div key={`item-${index}`} className="flex items-center gap-2">
                        <select
                          value={item.task_type}
                          onChange={(event) => setNewTemplateItems((current) => current.map((entry, entryIndex) => (
                            entryIndex === index
                              ? { ...entry, task_type: event.target.value as Exclude<TaskType, 'attendance'> }
                              : entry
                          )))}
                          className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                        >
                          {TASK_TYPE_OPTIONS.map(([taskType, label]) => (
                            <option key={`new-${taskType}`} value={taskType}>{label}</option>
                          ))}
                        </select>
                        <select
                          value={item.session_position}
                          onChange={(event) => setNewTemplateItems((current) => current.map((entry, entryIndex) => (
                            entryIndex === index
                              ? { ...entry, session_position: event.target.value as 'S1' | 'S2' }
                              : entry
                          )))}
                          className="h-9 w-24 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                        >
                          <option value="S1">S1</option>
                          <option value="S2">S2</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setNewTemplateItems((current) => current.length === 1 ? current : current.filter((_, entryIndex) => entryIndex !== index))}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setNewTemplateItems((current) => [...current, { task_type: 'practice', session_position: 'S2' }])}
                        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted"
                      >
                        <Plus size={14} /> 加項目
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCreateTemplate()}
                        className="inline-flex h-9 items-center rounded-md bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90"
                      >
                        儲存模板
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
