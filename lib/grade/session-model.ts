import type { ClassSessionRow, Task } from './types'

export interface SessionSlot {
  sessionKey: string
  slot_index: number | null
  session_date: string
  session_kind: 'team' | 'intensive'
  /**
   * 課數（純顯示，不回寫資料庫）。
   * - 有 lesson_label 含數字：以標籤數字為準，永遠保留（調課只改日期不改課數）
   * - isBillable=true 且無明確標籤：自動分配未使用序號（兩階段演算，見 buildSessionSlots）
   * - isBillable=false/null 且無明確標籤：null（顯示「未編課」）
   */
  lessonNumber: number | null
  /** task.lesson_label 原始字串 */
  lesson_label: string | null
  /**
   * true  = 有出席紀錄且至少一位學生 is_billable
   * false = 有出席紀錄但全部不計費（停課等）
   * null  = 無出席紀錄（僅來自 class_tasks），帳務狀態未知
   */
  isBillable: boolean | null
  attendanceByStudent: Map<string, ClassSessionRow>
  makeupsByStudent: Map<string, ClassSessionRow[]>
  tasks: Task[]
}

export interface SessionModelGaps {
  /**
   * 保留舊欄位名稱供相容使用。
   * 目前仍偵測同日同種下的重複 non-makeup row，方便標記歷史排程異常。
   */
  sameDayKindConflict: boolean
}

export interface SessionModelResult {
  slots: SessionSlot[]
  orphanTasks: Task[]
  gaps: SessionModelGaps
}

function detectSameDayKindConflict(sessionRows: ClassSessionRow[]): boolean {
  const seen = new Set<string>()
  for (const row of sessionRows) {
    if (row.session_kind === 'makeup' || !row.session_date) continue
    const key = `${row.student_id}:${row.session_date}:${row.session_kind}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

export function buildSessionSlots(
  sessionRows: ClassSessionRow[],
  tasks: Task[],
): SessionModelResult {
  const sameDayKindConflict = detectSameDayKindConflict(sessionRows)

  const rowById = new Map<string, ClassSessionRow>()
  for (const row of sessionRows) rowById.set(row.id, row)

  const slotMap = new Map<number, {
    slot_index: number
    session_date: string
    session_kind: 'team' | 'intensive'
    isBillable: boolean
    attendanceByStudent: Map<string, ClassSessionRow>
    makeupsByStudent: Map<string, ClassSessionRow[]>
  }>()

  for (const row of sessionRows) {
    if (row.session_kind === 'makeup' || row.slot_index === null || !row.session_date) continue
    if (!slotMap.has(row.slot_index)) {
      slotMap.set(row.slot_index, {
        slot_index: row.slot_index,
        session_date: row.session_date,
        session_kind: row.session_kind as 'team' | 'intensive',
        isBillable: false,
        attendanceByStudent: new Map(),
        makeupsByStudent: new Map(),
      })
    }
    const slot = slotMap.get(row.slot_index)!
    slot.attendanceByStudent.set(row.student_id, row)
    if (row.is_billable) slot.isBillable = true
  }

  for (const row of sessionRows) {
    if (row.session_kind !== 'makeup' || !row.makeup_for_session_id) continue
    const parent = rowById.get(row.makeup_for_session_id)
    if (!parent || parent.slot_index === null) continue
    const slot = slotMap.get(parent.slot_index)
    if (!slot) continue
    const list = slot.makeupsByStudent.get(row.student_id) ?? []
    list.push(row)
    slot.makeupsByStudent.set(row.student_id, list)
  }

  const tasksBySlotIndex = new Map<number, Task[]>()
  const orphanTasks: Task[] = []
  for (const task of tasks) {
    if (task.slot_index === null) {
      orphanTasks.push(task)
      continue
    }
    if (!slotMap.has(task.slot_index)) {
      orphanTasks.push(task)
      continue
    }
    const arr = tasksBySlotIndex.get(task.slot_index) ?? []
    arr.push(task)
    tasksBySlotIndex.set(task.slot_index, arr)
  }

  type RawSlot = {
    sessionKey: string
    slot_index: number
    session_date: string
    session_kind: 'team' | 'intensive'
    isBillable: boolean | null
    attendanceByStudent: Map<string, ClassSessionRow>
    makeupsByStudent: Map<string, ClassSessionRow[]>
    tasks: Task[]
  }

  const raw: RawSlot[] = Array.from(slotMap.values()).map((slot) => ({
    sessionKey: String(slot.slot_index),
    slot_index: slot.slot_index,
    session_date: slot.session_date,
    session_kind: slot.session_kind,
    isBillable: slot.isBillable,
    attendanceByStudent: slot.attendanceByStudent,
    makeupsByStudent: slot.makeupsByStudent,
    tasks: tasksBySlotIndex.get(slot.slot_index) ?? [],
  }))

  raw.sort((a, b) => a.slot_index - b.slot_index)

  // ── Lesson number assignment — two phases ────────────────────────────────
  //
  // Phase 1 — Pre-scan: collect all explicit lesson numbers as reserved set.
  //   Prevents fallback from occupying a number that belongs to an explicit slot
  //   arriving later in slot order.
  //
  // Phase 2 — Sequential assignment (slot order):
  //   a) Slot with explicit lesson_label digit N:
  //      → Always keep N (調課 only changes the date, not the lesson number).
  //      → Advance nextCounter to max(nextCounter, N + 1).
  //   b) Slot with isBillable === true and no explicit label:
  //      → Find the smallest number ≥ nextCounter not in reservedNumbers
  //        and not already assigned by a prior fallback slot.
  //      → Advance nextCounter past the assigned number.
  //   c) isBillable === false or null without explicit label:
  //      → No lesson number (lessonNumber = null).
  //      → Task-only slots WITH explicit label are already handled above.

  const reservedNumbers = new Set<number>()
  for (const slot of raw) {
    for (const task of slot.tasks) {
      if (!task.lesson_label) continue
      const match = task.lesson_label.match(/\d+/)
      if (match) reservedNumbers.add(parseInt(match[0], 10))
    }
  }

  type Intermediate = RawSlot & {
    lessonNumber: number | null
    lesson_label: string | null
    isExplicit: boolean
  }

  let nextCounter = 1
  const fallbackAssigned = new Set<number>()

  const intermediate: Intermediate[] = raw.map((slot) => {
    let lessonNumber: number | null = null
    let lesson_label: string | null = null
    let isExplicit = false

    for (const task of slot.tasks) {
      if (!task.lesson_label) continue
      lesson_label = task.lesson_label
      const match = task.lesson_label.match(/\d+/)
      if (match) {
        lessonNumber = parseInt(match[0], 10)
        isExplicit = true
        break
      }
    }

    if (isExplicit && lessonNumber !== null) {
      nextCounter = Math.max(nextCounter, lessonNumber + 1)
    } else if (slot.isBillable === true) {
      let n = nextCounter
      while (reservedNumbers.has(n) || fallbackAssigned.has(n)) n += 1
      lessonNumber = n
      fallbackAssigned.add(n)
      nextCounter = n + 1
    }

    return { ...slot, lessonNumber, lesson_label, isExplicit }
  })

  const slots: SessionSlot[] = intermediate.map((slot) => ({
    sessionKey: slot.sessionKey,
    slot_index: slot.slot_index,
    session_date: slot.session_date,
    session_kind: slot.session_kind,
    lessonNumber: slot.lessonNumber,
    lesson_label: slot.lesson_label,
    isBillable: slot.isBillable,
    attendanceByStudent: slot.attendanceByStudent,
    makeupsByStudent: slot.makeupsByStudent,
    tasks: slot.tasks,
  }))

  return { slots, orphanTasks, gaps: { sameDayKindConflict } }
}
