import type { Lamp, TaskType } from './types'

export type GradeStatus =
  | 'pending'
  | 'redo'
  | 'missing'
  | 'wont_do'
  | 'retake_ready'
  | 'retake_correcting'
  | 'correcting'
  | 'completed'

export type TaskKind = 'attendance' | 'homework' | 'drill' | 'quiz' | 'comment' | 'other'

export interface LampDisplay {
  color: Lamp
  label: string
}

export interface WorkflowContext {
  taskType: TaskType | string | null | undefined
  taskName?: string | null
  currentStatus?: string | null
  thresholdValue?: number | string | null
  maxScore?: number | string | null
  thresholdText?: string | null
  department?: string | null
  source?: string | null
}

export interface WorkflowInput {
  scoreInput?: string | number | null
  statusInput?: string | null
}

export interface WorkflowDecision {
  shouldWriteRecord: boolean
  blocked: boolean
  message: string
  warning: string
  clearScoreInput: boolean
  oldStatus: GradeStatus
  newStatus: GradeStatus
  lamp: LampDisplay
  shouldWriteLatestResult: boolean
  latestResultValue: string
  shouldAppendHistory: boolean
  historyValue: string
}

interface ThresholdInfo {
  ok: boolean
  threshold: number
  maxScore: number
}

type StatusSignal = 'empty' | 'pass' | 'correcting' | 'missing' | 'redo' | 'wont_do' | 'unknown'

const QUIZ_LAMP: Record<GradeStatus, LampDisplay> = {
  pending: { color: 'red', label: '' },
  redo: { color: 'red', label: 'RE' },
  missing: { color: 'black', label: '缺' },
  wont_do: { color: 'white', label: '免' },
  retake_ready: { color: 'yellow', label: '補' },
  retake_correcting: { color: 'red', label: '訂' },
  correcting: { color: 'blue', label: '驗' },
  completed: { color: 'green', label: '過' },
}

const WORK_LAMP: Record<GradeStatus, LampDisplay> = {
  pending: { color: 'red', label: '' },
  redo: { color: 'red', label: 'RE' },
  missing: { color: 'black', label: '缺' },
  wont_do: { color: 'white', label: '免' },
  retake_ready: { color: 'yellow', label: '補' },
  retake_correcting: { color: 'red', label: '訂' },
  correcting: { color: 'yellow', label: '訂' },
  completed: { color: 'green', label: '完' },
}

const ATTENDANCE_LAMP: Record<GradeStatus, LampDisplay> = {
  ...WORK_LAMP,
  completed: { color: 'green', label: '到' },
}

const STATUS_ALIASES: Record<string, GradeStatus> = {
  complete: 'completed',
  done: 'completed',
  passed: 'completed',
  pass: 'completed',
  testing: 'correcting',
  exempt: 'wont_do',
  wontdo: 'wont_do',
}

export function normalizeStatus(raw: string | null | undefined): GradeStatus {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/'/g, '')

  if (value in QUIZ_LAMP) return value as GradeStatus
  if (value in STATUS_ALIASES) return STATUS_ALIASES[value]
  return 'pending'
}

export function inferTaskKind(taskType: TaskType | string | null | undefined, taskName?: string | null): TaskKind {
  if (taskType === 'attendance') return 'attendance'
  if (taskType === 'quiz') return 'quiz'
  if (taskType === 'homework') return 'homework'
  if (taskType === 'practice') return 'drill'
  if (taskType === 'comment') return 'comment'

  const name = String(taskName ?? '').trim()
  if (name.startsWith('考')) return 'quiz'
  if (name.startsWith('交')) return 'homework'
  if (name.startsWith('練')) return 'drill'
  return 'other'
}

export function lampFor(status: string | null | undefined, taskType: TaskType | string | null | undefined): LampDisplay {
  const normalized = normalizeStatus(status)
  const kind = inferTaskKind(taskType)

  if (kind === 'quiz') return QUIZ_LAMP[normalized]
  if (kind === 'attendance') return ATTENDANCE_LAMP[normalized]
  return WORK_LAMP[normalized]
}

export function commentLamp(commentStatus: string | null | undefined): LampDisplay {
  if (commentStatus === 'published') return { color: 'green', label: '已發' }
  if (commentStatus === 'pending_publish') return { color: 'yellow', label: '待發' }
  if (commentStatus === 'draft') return { color: 'red', label: '草稿' }
  if (commentStatus === 'needs_republish') return { color: 'orange', label: '重發' }
  return { color: 'white', label: '' }
}

export function statusName(status: GradeStatus, taskType: TaskType | string | null | undefined): string {
  const kind = inferTaskKind(taskType)
  const quiz = kind === 'quiz'

  switch (status) {
    case 'pending':
      return '待完成'
    case 'redo':
      return '重做'
    case 'missing':
      return '缺交'
    case 'wont_do':
      return '免做'
    case 'retake_ready':
      return '可補考'
    case 'retake_correcting':
      return '補考訂正'
    case 'correcting':
      return quiz ? '待驗收' : '訂正中'
    case 'completed':
      return quiz ? '通過' : '完成'
  }
}

const OPTIONS_BY_TYPE: Record<TaskType, GradeStatus[]> = {
  quiz: ['pending', 'correcting', 'retake_ready', 'retake_correcting', 'completed', 'redo', 'missing', 'wont_do'],
  homework: ['pending', 'correcting', 'completed', 'redo', 'missing', 'wont_do'],
  practice: ['pending', 'correcting', 'completed', 'redo', 'missing', 'wont_do'],
  attendance: ['pending', 'completed', 'missing', 'wont_do'],
  comment: ['pending', 'completed'],
}

export interface StatusOption {
  value: GradeStatus
  name: string
  color: Lamp
  label: string
}

export function statusOptionsFor(taskType: TaskType): StatusOption[] {
  return OPTIONS_BY_TYPE[taskType].map((value) => {
    const display = lampFor(value, taskType)
    return { value, name: statusName(value, taskType), color: display.color, label: display.label }
  })
}

export function takesScore(taskType: TaskType | string | null | undefined): boolean {
  return inferTaskKind(taskType) === 'quiz'
}

export function appendHistory(oldHistory: string | null | undefined, nextValue: string | number | null | undefined): string {
  const next = normalizeScoreForHistory(nextValue)
  if (!next) return String(oldHistory ?? '').trim()

  const items = String(oldHistory ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (items[items.length - 1] !== next) items.push(next)
  return items.join(',')
}

export function resolveTaskSubmission(context: WorkflowContext, input: WorkflowInput): WorkflowDecision {
  const kind = inferTaskKind(context.taskType, context.taskName)
  const oldStatus = normalizeStatus(context.currentStatus)
  const scoreRaw = String(input.scoreInput ?? '').trim()
  const statusSignal = parseStatusSignal(input.statusInput)

  if (!scoreRaw && statusSignal === 'empty') {
    return decision(context, oldStatus, {
      shouldWriteRecord: false,
      message: '沒有需要送出的內容',
    })
  }

  if (kind === 'quiz') {
    return resolveQuizSubmission(context, oldStatus, scoreRaw, statusSignal)
  }

  if (kind === 'homework' || kind === 'drill' || kind === 'attendance' || kind === 'other') {
    return resolveWorkSubmission(context, oldStatus, scoreRaw, statusSignal)
  }

  return decision(context, oldStatus, {
    shouldWriteRecord: false,
    message: '評論列不改變任務狀態',
  })
}

function resolveQuizSubmission(
  context: WorkflowContext,
  oldStatus: GradeStatus,
  scoreRaw: string,
  statusSignal: StatusSignal,
): WorkflowDecision {
  const hasScore = isNumeric(scoreRaw)

  if (scoreRaw && !hasScore) {
    if (statusSignal === 'empty') {
      return decision(context, oldStatus, {
        shouldWriteRecord: false,
        message: '文字輸入會作為備註處理，不改變任務狀態',
      })
    }
    return resolveQuizStatusOnly(context, oldStatus, statusSignal)
  }

  if (hasScore && statusSignal === 'empty') {
    const scoreDecision = scoreToQuizStatus(context, oldStatus, Number(scoreRaw), false)
    return scoreDecision
  }

  if (!hasScore && statusSignal !== 'empty') {
    return resolveQuizStatusOnly(context, oldStatus, statusSignal)
  }

  if (hasScore && statusSignal === 'pass') {
    return scoreToQuizStatus(context, oldStatus, Number(scoreRaw), true)
  }

  return blocked(context, oldStatus, '考試分數只能單獨送出，或搭配「完成/通過」')
}

function resolveQuizStatusOnly(context: WorkflowContext, oldStatus: GradeStatus, statusSignal: StatusSignal): WorkflowDecision {
  if (statusSignal === 'pass') {
    if (oldStatus === 'retake_correcting') {
      return statusDecision(context, oldStatus, 'retake_ready', '補考訂正已通過，狀態改為可補考')
    }
    if (oldStatus === 'correcting') {
      return statusDecision(context, oldStatus, 'completed', '驗收通過，狀態改為完成')
    }
    return blocked(context, oldStatus, '目前狀態不能只用完成鍵通過，請輸入分數或先進入訂正流程')
  }

  if (statusSignal === 'missing') {
    if (oldStatus === 'pending') return statusDecision(context, oldStatus, 'missing', '標記缺考/缺交')
    return blocked(context, oldStatus, '只有待完成的考試能直接標記缺交')
  }

  if (statusSignal === 'redo') {
    return statusDecision(context, oldStatus, 'redo', '標記重做')
  }

  if (statusSignal === 'wont_do') {
    return statusDecision(context, oldStatus, 'wont_do', '標記免做')
  }

  if (statusSignal === 'correcting') {
    return blocked(context, oldStatus, '考試的訂正狀態由分數判斷，請輸入分數')
  }

  return blocked(context, oldStatus, '無法辨識狀態輸入')
}

function scoreToQuizStatus(
  context: WorkflowContext,
  oldStatus: GradeStatus,
  score: number,
  passPressed: boolean,
): WorkflowDecision {
  const threshold = parseThreshold(context)
  if (!threshold.ok) return blocked(context, oldStatus, '這個考試任務沒有有效門檻，不能收分數')
  if (score > threshold.maxScore) return blocked(context, oldStatus, `分數不能超過滿分 ${threshold.maxScore}`)
  if (score < 0) return blocked(context, oldStatus, '分數不能小於 0')

  const allowed = ['pending', 'redo', 'missing', 'wont_do', 'retake_ready'] as GradeStatus[]
  if (!allowed.includes(oldStatus)) {
    return blocked(context, oldStatus, '目前狀態不能直接覆寫分數，請先確認任務流程')
  }

  const full = score === threshold.maxScore
  const passed = score >= threshold.threshold
  let nextStatus: GradeStatus

  if (passPressed) {
    nextStatus = passed ? 'completed' : 'retake_ready'
  } else if (full) {
    nextStatus = 'completed'
  } else if (passed) {
    nextStatus = 'correcting'
  } else {
    nextStatus = 'retake_correcting'
  }

  return decision(context, nextStatus, {
    shouldWriteRecord: true,
    shouldWriteLatestResult: true,
    latestResultValue: String(score),
    shouldAppendHistory: true,
    historyValue: String(score),
    message: '已依分數更新狀態',
  })
}

function resolveWorkSubmission(
  context: WorkflowContext,
  oldStatus: GradeStatus,
  scoreRaw: string,
  statusSignal: StatusSignal,
): WorkflowDecision {
  const hasNumericScore = isNumeric(scoreRaw)

  if (hasNumericScore && statusSignal === 'empty') {
    return {
      ...blocked(context, oldStatus, '非考試任務不接受分數輸入，已清空分數'),
      clearScoreInput: true,
    }
  }

  const base = hasNumericScore
    ? { warning: '非考試任務不接受分數輸入，已忽略分數', clearScoreInput: true }
    : {}

  if (statusSignal === 'empty') {
    return decision(context, oldStatus, {
      shouldWriteRecord: false,
      message: scoreRaw ? '文字輸入會作為備註處理，不改變任務狀態' : '沒有需要送出的內容',
      ...base,
    })
  }

  if (statusSignal === 'pass') {
    if (['pending', 'correcting', 'redo'].includes(oldStatus)) {
      return statusDecision(context, oldStatus, 'completed', '標記完成', base)
    }
    return blocked(context, oldStatus, '目前狀態不能直接標記完成')
  }

  if (statusSignal === 'correcting') {
    if (oldStatus === 'pending' || oldStatus === 'redo') {
      return statusDecision(context, oldStatus, 'correcting', '標記訂正中', base)
    }
    return blocked(context, oldStatus, '目前狀態不能改為訂正中')
  }

  if (statusSignal === 'missing') {
    if (!allowsMissing(context)) return blocked(context, oldStatus, '小學堂作業不使用缺交狀態')
    if (oldStatus === 'pending') return statusDecision(context, oldStatus, 'missing', '標記缺交', base)
    return blocked(context, oldStatus, '只有待完成任務能直接標記缺交')
  }

  if (statusSignal === 'redo') {
    return statusDecision(context, oldStatus, 'redo', '標記重做', base)
  }

  if (statusSignal === 'wont_do') {
    return statusDecision(context, oldStatus, 'wont_do', '標記免做', base)
  }

  return blocked(context, oldStatus, '無法辨識狀態輸入')
}

function statusDecision(
  context: WorkflowContext,
  oldStatus: GradeStatus,
  newStatus: GradeStatus,
  message: string,
  extras: Partial<WorkflowDecision> = {},
): WorkflowDecision {
  return decision(context, newStatus, {
    shouldWriteRecord: true,
    message,
    oldStatus,
    ...extras,
  })
}

function blocked(context: WorkflowContext, oldStatus: GradeStatus, message: string): WorkflowDecision {
  return decision(context, oldStatus, {
    shouldWriteRecord: false,
    blocked: true,
    message,
  })
}

function decision(
  context: WorkflowContext,
  status: GradeStatus,
  options: Partial<WorkflowDecision>,
): WorkflowDecision {
  const oldStatus = options.oldStatus ?? normalizeStatus(context.currentStatus)
  const lamp = lampFor(status, context.taskType)

  return {
    shouldWriteRecord: options.shouldWriteRecord ?? false,
    blocked: options.blocked ?? false,
    message: options.message ?? '',
    warning: options.warning ?? '',
    clearScoreInput: options.clearScoreInput ?? false,
    oldStatus,
    newStatus: status,
    lamp,
    shouldWriteLatestResult: options.shouldWriteLatestResult ?? false,
    latestResultValue: options.latestResultValue ?? '',
    shouldAppendHistory: options.shouldAppendHistory ?? false,
    historyValue: options.historyValue ?? '',
  }
}

function parseStatusSignal(raw: string | null | undefined): StatusSignal {
  const value = String(raw ?? '').trim()
  if (!value) return 'empty'

  const compact = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[／/]/g, '')

  if (['✓', '✔', 'v', 'ok', 'pass', 'passed', 'complete', 'completed', 'done', '完', '完成', '過', '通過'].includes(compact)) {
    return 'pass'
  }
  if (['△', '訂', '訂正', 'correcting', 'revise', 'revision'].includes(compact)) {
    return 'correcting'
  }
  if (['缺', '缺交', '缺考', 'missing', 'absent'].includes(compact)) {
    return 'missing'
  }
  if (['re', 'redo', '重做', '重考', '補考'].includes(compact)) {
    return 'redo'
  }
  if (['免', '免做', 'wontdo', 'wont_do', 'exempt'].includes(compact)) {
    return 'wont_do'
  }

  return 'unknown'
}

function parseThreshold(context: WorkflowContext): ThresholdInfo {
  const directThreshold = Number(context.thresholdValue)
  const directMax = Number(context.maxScore)

  if (Number.isFinite(directThreshold) && directThreshold > 0) {
    const maxScore = Number.isFinite(directMax) && directMax > 0 ? directMax : 100
    return { ok: directThreshold <= maxScore, threshold: directThreshold, maxScore }
  }

  const text = String(context.thresholdText ?? '').trim()
  if (!text) return { ok: false, threshold: 0, maxScore: 0 }

  const [thresholdText, maxText] = text.split('/')
  const threshold = Number(thresholdText?.trim())
  const maxScore = maxText ? Number(maxText.trim()) : 100

  return {
    ok: Number.isFinite(threshold) && Number.isFinite(maxScore) && threshold > 0 && maxScore > 0 && threshold <= maxScore,
    threshold,
    maxScore,
  }
}

function allowsMissing(context: WorkflowContext): boolean {
  const source = String(context.source ?? '').toLowerCase()
  const department = String(context.department ?? '').toLowerCase()
  return !(source.includes('xiao') || department.includes('xiao') || department.includes('小'))
}

function isNumeric(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim())
}

function normalizeScoreForHistory(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim()
  const match = text.match(/\d+(\.\d+)?/)
  return match ? match[0] : ''
}
