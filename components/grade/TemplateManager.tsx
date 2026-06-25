'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SESSION_POSITION_LABEL, TASK_CHIP, TASK_SHORT } from '@/lib/grade/task-style'
import { cn } from '@/lib/utils'
import type { TaskTemplate, TaskTemplateItem, TaskType } from '@/lib/grade/types'

type TemplateTaskType = 'homework' | 'practice' | 'quiz' | 'progress'

const TEMPLATE_TASK_TYPES: TemplateTaskType[] = ['homework', 'practice', 'quiz', 'progress']
const TASK_TYPE_OPTIONS = TEMPLATE_TASK_TYPES.map((taskType) => [taskType, TASK_SHORT[taskType]] as const)

interface TemplateWithItems extends TaskTemplate {
  items: TaskTemplateItem[]
}

interface Props {
  tenantId: string
}

function taskTypeName(taskType: Exclude<TaskType, 'attendance'>) {
  return TASK_SHORT[taskType] ?? taskType
}

export function TemplateManager({ tenantId }: Props) {
  const [templates, setTemplates] = useState<TemplateWithItems[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateItems, setNewTemplateItems] = useState<Array<{ task_type: TemplateTaskType; session_position: 'S1' | 'S2' }>>([
    { task_type: 'homework', session_position: 'S1' },
  ])
  const [error, setError] = useState('')
  const tenantQuery = `tenant_id=${encodeURIComponent(tenantId)}`

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

  async function handleCreateTemplate() {
    const name = newTemplateName.trim()
    if (!name) {
      setError('模板名稱必填')
      return
    }

    setError('')
    try {
      const response = await fetch('/api/task-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存模板失敗')
    }
  }

  async function handleDeleteTemplate(templateId: string, templateName: string) {
    if (!confirm(`刪除模板「${templateName}」？`)) return

    setError('')
    try {
      const response = await fetch(`/api/task-templates?id=${templateId}&${tenantQuery}`, { method: 'DELETE' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? '刪除模板失敗')

      setTemplates((current) => current.filter((template) => template.id !== templateId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除模板失敗')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 dark:bg-[#2c2c2e]">
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

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          {templatesLoading ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              載入模板中…
            </p>
          ) : templates.length === 0 ? (
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
                        <span
                          key={item.id}
                          className={cn('rounded-full px-2 py-1 text-xs font-medium', TASK_CHIP[item.task_type])}
                        >
                          {SESSION_POSITION_LABEL[item.session_position]} · {taskTypeName(item.task_type as Exclude<TaskType, 'attendance'>)}
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
                      ? { ...entry, task_type: event.target.value as TemplateTaskType }
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
                  <option value="S1">{SESSION_POSITION_LABEL.S1}</option>
                  <option value="S2">{SESSION_POSITION_LABEL.S2}</option>
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
  )
}
