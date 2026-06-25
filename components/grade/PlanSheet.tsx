'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { SESSION_POSITION_LABEL, TASK_CHIP, TASK_SHORT } from '@/lib/grade/task-style'
import { cn } from '@/lib/utils'
import type { ClassRow, Task, TaskTemplate, TaskTemplateItem, TaskType } from '@/lib/grade/types'

const WEEKDAY_ZH = ['', '一', '二', '三', '四', '五', '六', '日']

type ManualPlanTaskType = 'homework' | 'practice' | 'quiz' | 'progress'
type TemplateApplyScope = 'season' | 'team' | 'intensive'
type ConflictMode = 'overwrite' | 'skip'

const PLAN_TASK_TYPES: ManualPlanTaskType[] = ['homework', 'practice', 'quiz', 'progress']

const TASK_TYPE_OPTIONS = PLAN_TASK_TYPES.map((taskType) => [taskType, TASK_SHORT[taskType]] as const)

interface TemplateWithItems extends TaskTemplate {
  items: TaskTemplateItem[]
}

interface TemplateApplyConflictState {
  templateId: string
  scope: TemplateApplyScope
  targetSlots: PlanSessionSlot[]
  conflictSlots: PlanSessionSlot[]
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

function reorderTasks(tasks: Task[], orderedTaskIds: string[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const orderPool = tasks
    .map((task) => task.display_order)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)
  const fallbackStart = orderPool.length > 0 ? orderPool[0] : 1

  return orderedTaskIds
    .map((taskId, index) => ({
      ...byId.get(taskId)!,
      display_order: orderPool[index] ?? (fallbackStart + index),
    }))
}

function deriveSessionPosition(sessionKind: PlanSessionSlot['session_kind']): 'S1' | 'S2' {
  return sessionKind === 'intensive' ? 'S2' : 'S1'
}

function taskTypeName(taskType: Exclude<TaskType, 'attendance'>) {
  return TASK_SHORT[taskType] ?? taskType
}

function scopeLabel(scope: TemplateApplyScope) {
  if (scope === 'season') return '整季'
  if (scope === 'team') return '全團課'
  return '全強化'
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
  const [bulkTemplateId, setBulkTemplateId] = useState('')
  const [templateConflict, setTemplateConflict] = useState<TemplateApplyConflictState | null>(null)
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

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  function templateItemsForSlot(template: TemplateWithItems, slot: PlanSessionSlot) {
    const sessionPosition = deriveSessionPosition(slot.session_kind)
    return template.items
      .filter((item) => item.session_position === sessionPosition && item.task_type !== 'comment')
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  function targetSlotsForScope(scope: TemplateApplyScope, template: TemplateWithItems) {
    return slots.filter((slot) => {
      if (scope === 'team' && slot.session_kind !== 'team') return false
      if (scope === 'intensive' && slot.session_kind !== 'intensive') return false
      return templateItemsForSlot(template, slot).length > 0
    })
  }

  function buildLessonLabelMap(targetSlots: PlanSessionSlot[]) {
    return Object.fromEntries(
      targetSlots.map((slot) => [String(slot.slot_index), (lessonDrafts[slot.slot_index] ?? '').trim() || null]),
    )
  }

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

  async function handleAddSingleTask(slot: PlanSessionSlot, taskType: ManualPlanTaskType) {
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
    const templateItems = templateItemsForSlot(template, slot)

    if (templateItems.length === 0) {
      setError(`模板「${template.name}」沒有 ${SESSION_POSITION_LABEL[sessionPosition]} 項目`)
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

  async function applyTemplateToScope(templateId: string, scope: TemplateApplyScope, conflictMode: ConflictMode) {
    if (!bagId) {
      setError('尚未開袋，無法套用模板')
      return
    }

    const template = templateById.get(templateId)
    if (!template) {
      setError('找不到模板')
      return
    }

    const targetSlots = targetSlotsForScope(scope, template)
    if (targetSlots.length === 0) {
      setError(`模板「${template.name}」沒有可套用的${scopeLabel(scope)}堂次`)
      return
    }

    setStatus(`套用模板「${template.name}」到${scopeLabel(scope)}中…`)
    try {
      const response = await fetch('/api/tasks/apply-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          bag_id: bagId,
          template_id: templateId,
          scope,
          conflict_mode: conflictMode,
          lesson_labels: buildLessonLabelMap(targetSlots),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '整季套用模板失敗')

      for (const updatedSlot of (json.slots ?? []) as Array<{ slot_index: number; tasks: Task[] }>) {
        updateSlot(updatedSlot.slot_index, (slot) => ({
          ...slot,
          lesson_label: updatedSlot.tasks.find((task) => task.lesson_label)?.lesson_label ?? slot.lesson_label,
          tasks: sortTasks(updatedSlot.tasks),
        }))
      }
      clearStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '整季套用模板失敗')
      setLoadingMessage('')
    }
  }

  function handleScopeTemplateApply(scope: TemplateApplyScope) {
    if (!bulkTemplateId) {
      setError('請先選擇模板')
      return
    }

    const template = templateById.get(bulkTemplateId)
    if (!template) {
      setError('找不到模板')
      return
    }

    const targetSlots = targetSlotsForScope(scope, template)
    if (targetSlots.length === 0) {
      setError(`模板「${template.name}」沒有可套用的${scopeLabel(scope)}堂次`)
      return
    }

    const conflictSlots = targetSlots.filter((slot) => slot.tasks.length > 0)
    if (conflictSlots.length === 0) {
      void applyTemplateToScope(bulkTemplateId, scope, 'skip')
      return
    }

    setTemplateConflict({
      templateId: bulkTemplateId,
      scope,
      targetSlots,
      conflictSlots,
    })
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

  async function handleMoveTask(slotIndex: number, taskId: string, direction: 'up' | 'down') {
    const targetSlot = slots.find((slot) => slot.slot_index === slotIndex)
    if (!targetSlot || !bagId) return

    const currentIndex = targetSlot.tasks.findIndex((task) => task.id === taskId)
    if (currentIndex === -1) return

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= targetSlot.tasks.length) return

    const orderedTaskIds = targetSlot.tasks.map((task) => task.id)
    ;[orderedTaskIds[currentIndex], orderedTaskIds[nextIndex]] = [orderedTaskIds[nextIndex], orderedTaskIds[currentIndex]]

    const previousTasks = targetSlot.tasks
    updateSlot(slotIndex, (slot) => ({
      ...slot,
      tasks: reorderTasks(slot.tasks, orderedTaskIds),
    }))

    setError('')
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          class_id: classId,
          bag_id: bagId,
          slot_index: slotIndex,
          ordered_task_ids: orderedTaskIds,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '任務排序失敗')

      updateSlot(slotIndex, (slot) => ({
        ...slot,
        tasks: sortTasks((json.tasks ?? []) as Task[]),
      }))
    } catch (err) {
      updateSlot(slotIndex, (slot) => ({
        ...slot,
        tasks: previousTasks,
      }))
      setError(err instanceof Error ? err.message : '任務排序失敗')
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
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  value={bulkTemplateId}
                  onChange={(event) => setBulkTemplateId(event.target.value)}
                  onFocus={() => void loadTemplates(false)}
                  className="h-9 min-w-[12rem] rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                >
                  <option value="">選擇模板</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleScopeTemplateApply('season')}
                  disabled={templatesLoading || !bulkTemplateId}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
                >
                  套用整季
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeTemplateApply('team')}
                  disabled={templatesLoading || !bulkTemplateId}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
                >
                  套用全團課
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeTemplateApply('intensive')}
                  disabled={templatesLoading || !bulkTemplateId}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-40"
                >
                  套用全強化
                </button>
              </div>
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
                            {SESSION_POSITION_LABEL[sessionPosition]}
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
                            {slot.tasks.length > 0 ? slot.tasks.map((task, taskIndex) => (
                              <div key={task.id} className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2 py-2">
                                <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium', TASK_CHIP[task.task_type])}>
                                  {taskTypeName(task.task_type as Exclude<TaskType, 'attendance'>)}
                                </span>
                                <TaskNameInput
                                  key={`${task.id}:${task.task_name ?? ''}`}
                                  value={task.task_name ?? ''}
                                  onSave={(nextValue) => handleTaskNameSave(slot.slot_index, task.id, nextValue)}
                                />
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleMoveTask(slot.slot_index, task.id, 'up')}
                                    disabled={taskIndex === 0}
                                    className="grid size-8 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleMoveTask(slot.slot_index, task.id, 'down')}
                                    disabled={taskIndex === slot.tasks.length - 1}
                                    className="grid size-8 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                </div>
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
                                onFocus={() => void loadTemplates(false)}
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

            {templateConflict && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
                <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl dark:bg-[#2c2c2e]">
                  <h2 className="text-base font-semibold text-foreground">套用模板前確認</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {`這次會套用到 ${scopeLabel(templateConflict.scope)} ${templateConflict.targetSlots.length} 堂，其中 ${templateConflict.conflictSlots.length} 堂已有既有任務。`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-red-600 dark:text-red-300">
                    覆蓋會刪除這些堂次現有任務與學生記錄，comment/attendance 不會變動。
                  </p>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateConflict(null)}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-foreground/80 transition-colors hover:bg-muted"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentConflict = templateConflict
                        setTemplateConflict(null)
                        void applyTemplateToScope(currentConflict.templateId, currentConflict.scope, 'skip')
                      }}
                      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-foreground/80 transition-colors hover:bg-muted"
                    >
                      跳過既有任務
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentConflict = templateConflict
                        setTemplateConflict(null)
                        void applyTemplateToScope(currentConflict.templateId, currentConflict.scope, 'overwrite')
                      }}
                      className="inline-flex h-9 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-500"
                    >
                      覆蓋並套用
                    </button>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  )
}
