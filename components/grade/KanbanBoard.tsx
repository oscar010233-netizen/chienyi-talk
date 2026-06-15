'use client'

import { useCallback, useMemo, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Columns3,
  Download,
  Eye,
  EyeOff,
  LayoutList,
  RefreshCw,
  Search,
  Table2,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LampBadge } from './LampBadge'
import { TaskUpdateDrawer } from './TaskUpdateDrawer'
import {
  commentLamp,
  lampFor,
  normalizeStatus,
  statusName,
  type LampDisplay,
} from '@/lib/grade/status'
import type { ClassDetail, ClassEnrollment, Lamp, Task, TaskRecord, TaskType } from '@/lib/grade/types'

type LaneId = 'attention' | 'inProgress' | 'done'
type ViewMode = 'board' | 'matrix'
type FilterLane = 'all' | LaneId
type FilterTaskType = 'all' | TaskType

interface SelectedCell {
  task: Task
  student: { id: string; chinese_name: string; english_name: string }
  record: TaskRecord | null
}

interface WorkItem {
  id: string
  task: Task
  student: ClassEnrollment
  record: TaskRecord | null
  display: LampDisplay
  lane: LaneId
}

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  attendance: '出席',
  homework: '作業',
  practice: '練習',
  quiz: '測驗',
  comment: '評語',
}

const TASK_TYPE_SHORT: Record<TaskType, string> = {
  attendance: '出',
  homework: '作',
  practice: '練',
  quiz: '測',
  comment: '評',
}

const TASK_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200',
  homework: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
  practice: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  quiz: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
  comment: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200',
}

const LAMP_BORDER: Record<Lamp, string> = {
  red: 'border-l-red-400',
  yellow: 'border-l-yellow-400',
  green: 'border-l-emerald-400',
  blue: 'border-l-blue-400',
  black: 'border-l-gray-600',
  white: 'border-l-gray-200 dark:border-l-white/20',
  orange: 'border-l-orange-400',
}

const LANES: {
  id: LaneId
  label: string
  helper: string
  icon: ComponentType<{ size?: number; className?: string }>
  tone: string
}[] = [
  {
    id: 'attention',
    label: '需要處理',
    helper: '未領取、待補、重做、缺交',
    icon: AlertTriangle,
    tone: 'text-red-600 bg-red-50 dark:bg-red-400/10 dark:text-red-200',
  },
  {
    id: 'inProgress',
    label: '批改中',
    helper: '批改、複查、可補考',
    icon: Clock,
    tone: 'text-amber-700 bg-amber-50 dark:bg-amber-400/10 dark:text-amber-200',
  },
  {
    id: 'done',
    label: '已完成',
    helper: '完成、通過、免做、已發布',
    icon: CheckCircle2,
    tone: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
]

const WEEKDAY = ['', '一', '二', '三', '四', '五', '六', '日']
const CLASS_TYPE_LABEL: Record<string, string> = {
  double: '雙課班',
  intensive: '強化班',
  single: '單課班',
}

function displayFor(task: Task, record?: TaskRecord | null): LampDisplay {
  if (!record) return { color: 'white', label: '未派' }
  return task.task_type === 'comment'
    ? commentLamp(record.comment_status)
    : lampFor(record.status, task.task_type)
}

function laneFor(task: Task, record?: TaskRecord | null): LaneId {
  if (!record) return 'attention'

  if (task.task_type === 'comment') {
    if (record.comment_status === 'published') return 'done'
    if (record.comment_status === 'pending_publish') return 'inProgress'
    return 'attention'
  }

  const status = normalizeStatus(record.status)
  if (status === 'completed' || status === 'wont_do') return 'done'
  if (status === 'correcting' || status === 'retake_ready' || status === 'retake_correcting') {
    return 'inProgress'
  }
  return 'attention'
}

function statusLabel(task: Task, record?: TaskRecord | null): string {
  if (!record) return '尚未領取'
  if (task.task_type === 'comment') {
    if (record.comment_status === 'published') return '已發布'
    if (record.comment_status === 'pending_publish') return '待發布'
    if (record.comment_status === 'needs_republish') return '需重發'
    if (record.comment_status === 'draft') return '草稿'
  }
  return statusName(normalizeStatus(record.status), task.task_type)
}

function scoreDetail(task: Task, record?: TaskRecord | null): string | number | null {
  if (task.task_type !== 'quiz') return null
  return record?.result_history || record?.latest_result || null
}

function weekdayText(w1: number | null, w2: number | null): string {
  const days = [w1, w2].filter((day): day is number => day != null && day > 0)
  return days.length > 0 ? days.map(day => `週${WEEKDAY[day] ?? day}`).join(' / ') : '未排課'
}

function departmentLabel(value: string | null): string {
  if (!value) return '未設定'
  const normalized = value.toLowerCase()
  if (normalized.includes('eng') || value.includes('英文')) return '英文部'
  if (normalized.includes('xiao') || value.includes('小')) return '小學堂'
  return value
}

function formatUpdated(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function itemMatchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true
  const haystack = [
    item.student.student.chinese_name,
    item.student.student.english_name,
    item.task.task_name,
    TASK_TYPE_LABEL[item.task.task_type],
    statusLabel(item.task, item.record),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function initials(chinese: string, english: string): string {
  if (english.trim()) return english.trim()[0].toUpperCase()
  if (chinese.trim()) return chinese.trim().slice(-1)
  return '?'
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  progress,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  detail: string
  tone: string
  progress?: number
}) {
  return (
    <div className="rounded-lg border border-black/[0.07] bg-white/[0.85] p-4 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <span className={cn('grid size-9 place-items-center rounded-lg', tone)}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      {progress != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function KanbanBoard({ detail }: { detail: ClassDetail }) {
  const { class: cls, students, tasks, records } = detail
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [selectedStudentId, setSelectedStudentId] = useState('all')
  const [selectedTaskType, setSelectedTaskType] = useState<FilterTaskType>('all')
  const [selectedLane, setSelectedLane] = useState<FilterLane>('all')
  const [hideDone, setHideDone] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedCell | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const classSlug = encodeURIComponent(cls.id)

  const recordMap = useMemo(() => {
    const map = new Map<string, TaskRecord>()
    for (const record of records) {
      map.set(`${record.student_id}:${record.class_task_id}`, record)
    }
    return map
  }, [records])

  const items = useMemo<WorkItem[]>(() => {
    const next: WorkItem[] = []
    for (const student of students) {
      for (const task of tasks) {
        const record = recordMap.get(`${student.student_id}:${task.id}`) ?? null
        next.push({
          id: `${student.student_id}:${task.id}`,
          task,
          student,
          record,
          display: displayFor(task, record),
          lane: laneFor(task, record),
        })
      }
    }
    return next
  }, [students, tasks, recordMap])

  const queryKey = query.trim().toLowerCase()

  const baseFilteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedStudentId !== 'all' && item.student.student_id !== selectedStudentId) return false
      if (selectedTaskType !== 'all' && item.task.task_type !== selectedTaskType) return false
      if (hideDone && item.lane === 'done') return false
      return itemMatchesQuery(item, queryKey)
    })
  }, [hideDone, items, queryKey, selectedStudentId, selectedTaskType])

  const filteredItems = useMemo(() => {
    return baseFilteredItems.filter(item => selectedLane === 'all' || item.lane === selectedLane)
  }, [baseFilteredItems, selectedLane])

  const itemMap = useMemo(() => {
    const map = new Map<string, WorkItem>()
    for (const item of filteredItems) map.set(item.id, item)
    return map
  }, [filteredItems])

  const taskTypeOptions = useMemo(() => {
    return Array.from(new Set(tasks.map(task => task.task_type)))
  }, [tasks])

  const totalCells = items.length
  const doneCount = items.filter(item => item.lane === 'done').length
  const attentionCount = items.filter(item => item.lane === 'attention').length
  const inProgressCount = items.filter(item => item.lane === 'inProgress').length
  const missingRecordCount = items.filter(item => item.record == null).length
  const completionRate = totalCells > 0 ? Math.round((doneCount / totalCells) * 100) : 0

  const laneCounts = LANES.reduce<Record<LaneId, number>>((acc, lane) => {
    acc[lane.id] = baseFilteredItems.filter(item => item.lane === lane.id).length
    return acc
  }, { attention: 0, inProgress: 0, done: 0 })

  const matrixStudents = students.filter(student =>
    filteredItems.some(item => item.student.student_id === student.student_id)
  )
  const matrixTasks = tasks.filter(task =>
    filteredItems.some(item => item.task.id === task.id)
  )

  const handleCardClick = useCallback((item: WorkItem) => {
    setSelected({
      task: item.task,
      student: {
        id: item.student.student_id,
        chinese_name: item.student.student.chinese_name,
        english_name: item.student.student.english_name,
      },
      record: item.record,
    })
  }, [])

  const handleClose = (refresh?: boolean) => {
    setSelected(null)
    if (refresh) router.refresh()
  }

  async function handleDispatch() {
    setDispatching(true)
    setDispatchMsg('')
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: cls.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '全班領取失敗')
      setDispatchMsg(
        data.dispatched > 0
          ? `已建立 ${data.dispatched} 筆待處理紀錄`
          : (data.message ?? '目前沒有需要新增的紀錄')
      )
      if (data.dispatched > 0) router.refresh()
    } catch (error) {
      setDispatchMsg(error instanceof Error ? error.message : '全班領取失敗')
    } finally {
      setDispatching(false)
    }
  }

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    window.setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <div className="flex min-h-full flex-col bg-[#f6f7f9] dark:bg-[#1c1c1e]">
      <div className="mac-glass mac-hairline sticky top-0 z-40 flex items-center gap-2 border-b px-4 py-2.5 md:px-6">
        <Link
          href={`/classes/${classSlug}`}
          className="rounded-[7px] p-1.5 text-foreground/55 transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
          aria-label="回到班級表格"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold tracking-tight text-foreground">
            {cls.class_name} Kanban Dashboard
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {departmentLabel(cls.department)} · {CLASS_TYPE_LABEL[cls.class_type] ?? cls.class_type} · {weekdayText(cls.weekday1, cls.weekday2)}
          </p>
        </div>
        <div className="hidden items-center gap-1 rounded-lg border border-black/[0.07] bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.04] sm:flex">
          <button
            onClick={() => setViewMode('board')}
            aria-pressed={viewMode === 'board'}
            title="看板"
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/10',
              viewMode === 'board' && 'bg-gold text-white hover:bg-gold hover:text-white dark:bg-[#ff4d4f]'
            )}
          >
            <Columns3 size={16} />
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            aria-pressed={viewMode === 'matrix'}
            title="矩陣"
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/10',
              viewMode === 'matrix' && 'bg-gold text-white hover:bg-gold hover:text-white dark:bg-[#ff4d4f]'
            )}
          >
            <Table2 size={16} />
          </button>
        </div>
        <Link
          href={`/classes/${classSlug}`}
          className="hidden items-center gap-1.5 rounded-[8px] border border-black/[0.08] bg-white/80 px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-white active:scale-[0.97] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:flex"
        >
          <LayoutList size={14} />
          表格
        </Link>
      </div>

      <div className="grid gap-5 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={CheckCircle2}
            label="完成率"
            value={`${completionRate}%`}
            detail={`${doneCount} / ${totalCells || 0} 格已完成`}
            tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
            progress={completionRate}
          />
          <MetricTile
            icon={AlertTriangle}
            label="需要處理"
            value={String(attentionCount)}
            detail={`${missingRecordCount} 格尚未領取`}
            tone="bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-200"
          />
          <MetricTile
            icon={Clock}
            label="批改中"
            value={String(inProgressCount)}
            detail="正在批改、複查或補考"
            tone="bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200"
          />
          <MetricTile
            icon={Users}
            label="班級規模"
            value={`${students.length} 人`}
            detail={`${tasks.length} 個任務 · ${records.length} 筆紀錄`}
            tone="bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border border-black/[0.07] bg-white/[0.85] p-3 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_12rem_11rem]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜尋學生、任務、狀態"
                  className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15 dark:bg-white/[0.03]"
                />
              </label>
              <select
                value={selectedStudentId}
                onChange={event => setSelectedStudentId(event.target.value)}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15 dark:bg-[#2c2c2e]"
              >
                <option value="all">全班學生</option>
                {students.map(student => (
                  <option key={student.student_id} value={student.student_id}>
                    {student.student.chinese_name} {student.student.english_name}
                  </option>
                ))}
              </select>
              <select
                value={selectedTaskType}
                onChange={event => setSelectedTaskType(event.target.value as FilterTaskType)}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/15 dark:bg-[#2c2c2e]"
              >
                <option value="all">全部任務</option>
                {taskTypeOptions.map(type => (
                  <option key={type} value={type}>
                    {TASK_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedLane('all')}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedLane === 'all'
                    ? 'border-gold bg-gold text-white dark:border-[#ff4d4f] dark:bg-[#ff4d4f]'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted dark:bg-white/[0.03]'
                )}
              >
                全部 {baseFilteredItems.length}
              </button>
              {LANES.map(lane => (
                <button
                  key={lane.id}
                  onClick={() => setSelectedLane(lane.id)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    selectedLane === lane.id
                      ? 'border-gold bg-gold text-white dark:border-[#ff4d4f] dark:bg-[#ff4d4f]'
                      : 'border-border bg-white text-muted-foreground hover:bg-muted dark:bg-white/[0.03]'
                  )}
                >
                  {lane.label} {laneCounts[lane.id]}
                </button>
              ))}
              <label className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={hideDone}
                  onChange={event => setHideDone(event.target.checked)}
                  className="size-3.5 accent-[#a40000]"
                />
                {hideDone ? <EyeOff size={13} /> : <Eye size={13} />}
                隱藏已完成
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-black/[0.07] bg-white/[0.85] p-3 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">控制中心</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cls.class_code ?? cls.id.slice(0, 8)}
                </p>
              </div>
              <span className="rounded-md bg-gold/10 px-2 py-1 text-xs font-medium text-gold dark:bg-[#ff4d4f]/15 dark:text-[#ff8a8a]">
                {departmentLabel(cls.department)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={handleDispatch}
                disabled={dispatching}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gold px-3 text-xs font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-55 dark:bg-[#ff4d4f]"
              >
                <Download size={14} />
                {dispatching ? '領取中' : '全班領取'}
              </button>
              <button
                onClick={handleRefresh}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted dark:bg-white/[0.03]"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
                重新整理
              </button>
            </div>
            {dispatchMsg && (
              <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                {dispatchMsg}
              </p>
            )}
          </div>
        </div>

        {students.length === 0 || tasks.length === 0 ? (
          <div className="grid min-h-[24rem] place-items-center rounded-lg border border-dashed border-border bg-white/70 text-center dark:bg-white/[0.03]">
            <div>
              <p className="font-semibold text-foreground">
                {students.length === 0 ? '這個班級還沒有學生' : '這個班級還沒有任務'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {students.length === 0 ? '先加入學生後，Dashboard 才會產生看板格。' : '先新增任務後，就能派發給全班。'}
              </p>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <div className="grid gap-3 xl:grid-cols-3">
            {LANES.map(lane => {
              if (selectedLane !== 'all' && selectedLane !== lane.id) return null
              const laneItems = filteredItems.filter(item => item.lane === lane.id)
              const Icon = lane.icon

              return (
                <section
                  key={lane.id}
                  className="min-h-[24rem] rounded-lg border border-black/[0.07] bg-white/[0.75] p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className={cn('grid size-8 place-items-center rounded-lg', lane.tone)}>
                        <Icon size={16} />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">{lane.label}</h2>
                        <p className="text-xs text-muted-foreground">{lane.helper}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {laneItems.length}
                    </span>
                  </div>

                  <div className="mt-3 grid max-h-[34rem] gap-2 overflow-y-auto pr-1">
                    {laneItems.length === 0 ? (
                      <div className="grid h-32 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                        沒有符合條件的項目
                      </div>
                    ) : (
                      laneItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleCardClick(item)}
                          className={cn(
                            'rounded-lg border border-black/[0.07] border-l-4 bg-white p-3 text-left shadow-[0_6px_18px_-16px_rgba(0,0,0,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.35)] active:scale-[0.99] dark:border-white/10 dark:bg-[#2c2c2e]',
                            LAMP_BORDER[item.display.color]
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {item.student.student.chinese_name}
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  {item.student.student.english_name}
                                </span>
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {item.task.task_name ?? '未命名任務'}
                              </p>
                            </div>
                            <LampBadge
                              color={item.display.color}
                              label={item.display.label}
                              detail={scoreDetail(item.task, item.record)}
                              className="shrink-0"
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[item.task.task_type])}>
                              {TASK_TYPE_LABEL[item.task.task_type]}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {statusLabel(item.task, item.record)}
                              {formatUpdated(item.record?.updated_at) && ` · ${formatUpdated(item.record?.updated_at)}`}
                            </span>
                          </div>
                          {item.record?.teacher_note && (
                            <p className="mt-2 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {item.record.teacher_note}
                            </p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-black/[0.07] bg-white/[0.85] shadow-[0_8px_24px_-18px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="overflow-auto">
              <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 min-w-[14rem] border-b border-r border-border bg-white px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:bg-[#2c2c2e]">
                      任務
                    </th>
                    {matrixStudents.map(student => (
                      <th
                        key={student.student_id}
                        className="sticky top-0 z-20 min-w-[7rem] border-b border-border bg-white px-3 py-3 text-center font-normal dark:bg-[#2c2c2e]"
                      >
                        <span className="mx-auto mb-1 grid size-8 place-items-center rounded-full bg-gold/10 text-xs font-semibold text-gold dark:bg-[#ff4d4f]/15 dark:text-[#ff8a8a]">
                          {initials(student.student.chinese_name, student.student.english_name)}
                        </span>
                        <span className="block truncate text-xs font-semibold text-foreground">{student.student.chinese_name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{student.student.english_name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixTasks.map((task, rowIndex) => {
                    const rowClass = rowIndex % 2 === 0
                      ? 'bg-background'
                      : 'bg-muted'
                    return (
                      <tr key={task.id} className="group">
                        <td className={cn('sticky left-0 z-10 border-b border-r border-border px-4 py-3 transition-colors group-hover:bg-muted', rowClass)}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', TASK_CHIP[task.task_type])}>
                              {TASK_TYPE_SHORT[task.task_type]}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{task.task_name ?? '未命名任務'}</p>
                              {task.threshold_value != null && (
                                <p className="text-[11px] text-muted-foreground">門檻 {task.threshold_value}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        {matrixStudents.map(student => {
                          const item = itemMap.get(`${student.student_id}:${task.id}`)
                          return (
                            <td
                              key={student.student_id}
                              className={cn('border-b border-border px-2 py-2 text-center transition-colors group-hover:bg-muted/70', rowClass)}
                            >
                              {item ? (
                                <button
                                  onClick={() => handleCardClick(item)}
                                  className="inline-flex min-h-8 min-w-16 items-center justify-center rounded-lg px-1.5 py-1 transition-colors hover:bg-gray-200 dark:hover:bg-white/10"
                                  title={statusLabel(item.task, item.record)}
                                >
                                  <LampBadge
                                    color={item.display.color}
                                    label={item.display.label}
                                    detail={scoreDetail(item.task, item.record)}
                                  />
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">-</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <TaskUpdateDrawer
          task={selected.task}
          student={selected.student}
          record={selected.record}
          classDepartment={cls.department}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
