import type { ClassSessionRow, Task } from './types'

export interface SessionSlot {
  sessionKey: string
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
   * 同一個明確課數被兩個以上場次共用時為 true。
   * UI 應顯示衝突提示，不可靜默改為 null。
   */
  lessonConflict: boolean
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
   * 偵測到同日同種 (session_date + session_kind) 下，
   * 同一位學生擁有超過一筆 non-makeup row，代表同日兩堂相同種類的課。
   * 現有 key 策略 (session_date:session_kind) 無法區分它們，場次會被合併。
   * 若需支援，需要 stable per-session identifier 同時涵蓋出席與任務兩側
   * （目前無 migration，本版不宣稱支援）。
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
  // ── Gap detection ────────────────────────────────────────────────────────
  const sameDayKindConflict = detectSameDayKindConflict(sessionRows)

  // ── Build raw attendance slot map ────────────────────────────────────────
  const rowById = new Map<string, ClassSessionRow>()
  for (const row of sessionRows) rowById.set(row.id, row)

  const slotMap = new Map<string, {
    session_date: string
    session_kind: 'team' | 'intensive'
    isBillable: boolean
    attendanceByStudent: Map<string, ClassSessionRow>
    makeupsByStudent: Map<string, ClassSessionRow[]>
  }>()

  for (const row of sessionRows) {
    if (row.session_kind === 'makeup' || !row.session_date) continue
    const key = `${row.session_date}:${row.session_kind}`
    if (!slotMap.has(key)) {
      slotMap.set(key, {
        session_date: row.session_date,
        session_kind: row.session_kind as 'team' | 'intensive',
        isBillable: false,
        attendanceByStudent: new Map(),
        makeupsByStudent: new Map(),
      })
    }
    const slot = slotMap.get(key)!
    slot.attendanceByStudent.set(row.student_id, row)
    if (row.is_billable) slot.isBillable = true
  }

  for (const row of sessionRows) {
    if (row.session_kind !== 'makeup' || !row.makeup_for_session_id) continue
    const parent = rowById.get(row.makeup_for_session_id)
    if (!parent?.session_date) continue
    const key = `${parent.session_date}:${parent.session_kind}`
    const slot = slotMap.get(key)
    if (!slot) continue
    const list = slot.makeupsByStudent.get(row.student_id) ?? []
    list.push(row)
    slot.makeupsByStudent.set(row.student_id, list)
  }

  // ── Group tasks; orphans have no session_date+session_kind ───────────────
  const tasksByKey = new Map<string, Task[]>()
  const orphanTasks: Task[] = []
  for (const task of tasks) {
    if (task.session_date && task.session_kind) {
      const key = `${task.session_date}:${task.session_kind}`
      const arr = tasksByKey.get(key) ?? []
      arr.push(task)
      tasksByKey.set(key, arr)
    } else {
      orphanTasks.push(task)
    }
  }

  // ── Build raw slot list (union of attendance + tasks) ────────────────────
  const allKeys = new Set([...slotMap.keys(), ...tasksByKey.keys()])

  type RawSlot = {
    sessionKey: string
    session_date: string
    session_kind: 'team' | 'intensive'
    isBillable: boolean | null
    attendanceByStudent: Map<string, ClassSessionRow>
    makeupsByStudent: Map<string, ClassSessionRow[]>
    tasks: Task[]
  }

  const raw: RawSlot[] = []
  for (const key of allKeys) {
    const colonIdx = key.indexOf(':')
    const date = key.slice(0, colonIdx)
    const kind = key.slice(colonIdx + 1) as 'team' | 'intensive'
    const attSlot = slotMap.get(key)
    raw.push({
      sessionKey: key,
      session_date: date,
      session_kind: kind,
      // Task-only slots: no attendance data → billing unknown (null, NOT billable)
      isBillable: attSlot ? attSlot.isBillable : null,
      attendanceByStudent: attSlot?.attendanceByStudent ?? new Map(),
      makeupsByStudent: attSlot?.makeupsByStudent ?? new Map(),
      tasks: tasksByKey.get(key) ?? [],
    })
  }

  // Sort by date asc, then team before intensive
  raw.sort((a, b) => {
    const cmp = a.session_date.localeCompare(b.session_date)
    if (cmp !== 0) return cmp
    return a.session_kind === 'intensive' ? 1 : -1
  })

  // ── Lesson number assignment — three phases ──────────────────────────────
  //
  // Phase 1 — Pre-scan: collect all explicit lesson numbers as reserved set.
  //   Prevents fallback from occupying a number that belongs to an explicit slot
  //   arriving later in date order.
  //
  // Phase 2 — Sequential assignment (date order):
  //   a) Slot with explicit lesson_label digit N:
  //      → Always keep N (調課 only changes the date, not the lesson number).
  //      → Advance nextCounter to max(nextCounter, N + 1).
  //   b) Slot with isBillable === true and no explicit label:
  //      → Find the smallest number ≥ nextCounter not in reservedNumbers
  //        and not already assigned by a prior fallback slot.
  //      → Advance nextCounter past the assigned number.
  //   c) isBillable === false or null without explicit label:
  //      → No lesson number (lessonNumber = null).
  //      → Task-only slots WITH explicit label are handled by case (a).
  //
  // Phase 3 — Conflict detection (post-pass):
  //   If two or more slots share the same explicit lesson number, all of them
  //   get lessonConflict = true. The number is preserved on all; only the UI
  //   adds a warning — nothing is silently discarded.

  // Phase 1
  const reservedNumbers = new Set<number>()
  for (const s of raw) {
    for (const t of s.tasks) {
      if (t.lesson_label) {
        const match = t.lesson_label.match(/\d+/)
        if (match) reservedNumbers.add(parseInt(match[0], 10))
      }
    }
  }

  // Phase 2
  type Intermediate = RawSlot & {
    lessonNumber: number | null
    lesson_label: string | null
    isExplicit: boolean
  }

  let nextCounter = 1
  const fallbackAssigned = new Set<number>()

  const intermediate: Intermediate[] = raw.map((s) => {
    let lessonNumber: number | null = null
    let lesson_label: string | null = null
    let isExplicit = false

    for (const t of s.tasks) {
      if (t.lesson_label) {
        lesson_label = t.lesson_label
        const match = t.lesson_label.match(/\d+/)
        if (match) {
          lessonNumber = parseInt(match[0], 10)
          isExplicit = true
          break
        }
      }
    }

    if (isExplicit && lessonNumber !== null) {
      // Always preserve explicit number; advance counter
      nextCounter = Math.max(nextCounter, lessonNumber + 1)
    } else if (s.isBillable === true) {
      // Fallback: skip reserved (explicit slots) and already-assigned fallbacks
      let n = nextCounter
      while (reservedNumbers.has(n) || fallbackAssigned.has(n)) n++
      lessonNumber = n
      fallbackAssigned.add(n)
      nextCounter = n + 1
    }
    // isBillable === false or null without explicit → lessonNumber stays null

    return { ...s, lessonNumber, lesson_label, isExplicit }
  })

  // Phase 3: mark conflicts on ALL slots sharing the same explicit number
  const explicitCount = new Map<number, number>()
  for (const s of intermediate) {
    if (s.isExplicit && s.lessonNumber !== null) {
      explicitCount.set(s.lessonNumber, (explicitCount.get(s.lessonNumber) ?? 0) + 1)
    }
  }

  const slots: SessionSlot[] = intermediate.map((s) => ({
    sessionKey: s.sessionKey,
    session_date: s.session_date,
    session_kind: s.session_kind,
    lessonNumber: s.lessonNumber,
    lesson_label: s.lesson_label,
    lessonConflict: s.isExplicit && s.lessonNumber !== null
      ? (explicitCount.get(s.lessonNumber) ?? 0) > 1
      : false,
    isBillable: s.isBillable,
    attendanceByStudent: s.attendanceByStudent,
    makeupsByStudent: s.makeupsByStudent,
    tasks: s.tasks,
  }))

  return { slots, orphanTasks, gaps: { sameDayKindConflict } }
}
