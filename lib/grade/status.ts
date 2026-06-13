// Canonical task-record status — the single source of truth for a cell.
//
// The lamp colour + Chinese label shown in a cell are DERIVED from
// (status, task_type); they are never stored. This mirrors the legacy
// EngKanban 狀態機 (51_KanbanToBuffer_EngStatusMachine.js) but drops the
// AppSheet-only pieces: the `writeback_failed` state, the `lamp` column,
// and the `loadedTo` / `writebackStatus` columns.
//
// Why derive instead of store: the same status renders a different lamp
// depending on the task kind — e.g. `correcting` is 🔵驗 for a quiz but
// 🟡訂 for homework, and `completed` is 🟢過 vs 🟢完. Storing the lamp
// separately just lets it drift out of sync with the status.

import type { TaskType, Lamp } from './types'

export type GradeStatus =
  | 'pending'           // 待   — dispatched, not yet started
  | 'redo'              // RE   — failed a quiz, must retake from scratch
  | 'missing'           // 缺   — absent / not handed in
  | 'wont_do'           // 免   — exempted
  | 'retake_ready'      // 補   — corrected, cleared to retake (quiz only)
  | 'retake_correcting' // 訂   — retook below threshold, correcting (quiz only)
  | 'correcting'        // 驗/訂 — quiz: being verified; homework: being corrected
  | 'completed'         // 過/完 — quiz: passed; homework: done

export interface LampDisplay {
  color: Lamp
  label: string // short label shown next to the dot; '' = dot only
}

// 小考 dialect
const QUIZ: Record<GradeStatus, LampDisplay> = {
  pending:           { color: 'red',    label: '' },
  redo:              { color: 'red',    label: 'RE' },
  missing:           { color: 'black',  label: '缺' },
  wont_do:           { color: 'white',  label: '免' },
  retake_ready:      { color: 'yellow', label: '補' },
  retake_correcting: { color: 'red',    label: '訂' },
  correcting:        { color: 'blue',   label: '驗' },
  completed:         { color: 'green',  label: '過' },
}

// 作業 / 練習 dialect
const HOMEWORK: Record<GradeStatus, LampDisplay> = {
  pending:           { color: 'red',    label: '' },
  redo:              { color: 'red',    label: 'RE' },
  missing:           { color: 'black',  label: '缺' },
  wont_do:           { color: 'white',  label: '免' },
  retake_ready:      { color: 'yellow', label: '補' },
  retake_correcting: { color: 'red',    label: '訂' },
  correcting:        { color: 'yellow', label: '訂' },
  completed:         { color: 'green',  label: '完' },
}

// 出席 dialect (completed = 出席)
const ATTENDANCE: Record<GradeStatus, LampDisplay> = {
  ...HOMEWORK,
  completed: { color: 'green', label: '出' },
}

// Older data (and the previous editor) used a different vocabulary than the
// canonical legacy state machine. Fold those aliases onto the canonical set so
// existing rows render correctly while new writes use the canonical terms.
const STATUS_ALIASES: Record<string, GradeStatus> = {
  passed:    'completed',
  complete:  'completed',
  done:      'completed',
  testing:   'correcting', // old name for quiz 驗收中
  exempt:    'wont_do',
  wontdo:    'wont_do',
}

export function normalizeStatus(raw: string | null | undefined): GradeStatus {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/'/g, '')
  if (s in QUIZ) return s as GradeStatus
  if (s in STATUS_ALIASES) return STATUS_ALIASES[s]
  return 'pending'
}

/** Lamp colour + micro-label for a normal (non-comment) cell. */
export function lampFor(status: string | null | undefined, taskType: TaskType): LampDisplay {
  const s = normalizeStatus(status)
  if (taskType === 'quiz') return QUIZ[s]
  if (taskType === 'attendance') return ATTENDANCE[s]
  return HOMEWORK[s] // homework, practice, and fallback
}

/** Comment cells are driven by comment_status, not the workflow status. */
export function commentLamp(commentStatus: string | null | undefined): LampDisplay {
  if (commentStatus === 'published') return { color: 'green', label: '完' }
  if (commentStatus === 'draft') return { color: 'red', label: '待發布' }
  return { color: 'white', label: '' }
}

// ---- Editor support (manual override on the ClassSheet) -------------------

/** Full, human-readable name for a status in the editor, contextual by kind. */
export function statusName(status: GradeStatus, taskType: TaskType): string {
  const quiz = taskType === 'quiz'
  switch (status) {
    case 'pending':           return '待處理'
    case 'redo':              return '需重做'
    case 'missing':           return quiz ? '缺考' : '缺交'
    case 'wont_do':           return '免做'
    case 'retake_ready':      return '可補考'
    case 'retake_correcting': return '補考訂正中'
    case 'correcting':        return quiz ? '驗收中' : '訂正中'
    case 'completed':         return quiz ? '通過' : '完成'
  }
}

const OPTIONS_BY_TYPE: Record<TaskType, GradeStatus[]> = {
  quiz:       ['pending', 'correcting', 'retake_ready', 'retake_correcting', 'completed', 'redo', 'missing', 'wont_do'],
  homework:   ['pending', 'correcting', 'completed', 'redo', 'missing', 'wont_do'],
  practice:   ['pending', 'correcting', 'completed', 'redo', 'missing', 'wont_do'],
  attendance: ['pending', 'completed', 'missing', 'wont_do'],
  comment:    ['pending', 'completed'],
}

export interface StatusOption {
  value: GradeStatus
  name: string
  color: Lamp
  label: string
}

/** The status choices offered when manually editing a cell of this task type. */
export function statusOptionsFor(taskType: TaskType): StatusOption[] {
  return OPTIONS_BY_TYPE[taskType].map(value => {
    const d = lampFor(value, taskType)
    return { value, name: statusName(value, taskType), color: d.color, label: d.label }
  })
}

/** Whether a score input is meaningful for this task type. */
export function takesScore(taskType: TaskType): boolean {
  return taskType === 'quiz'
}
