export const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_BILLING_SESSIONS = 36
export type BillingQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export function dateOnly(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function dateFromDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(value: string, days: number): string {
  return dateOnly(new Date(dateFromDateOnly(value).getTime() + days * DAY_MS))
}

export function compareDate(a: string, b: string): number {
  return dateFromDateOnly(a).getTime() - dateFromDateOnly(b).getTime()
}

export function weekdayOf(date: string): number {
  const day = dateFromDateOnly(date).getUTCDay()
  return day === 0 ? 7 : day
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = []
  for (let cursor = dateOnly(start); compareDate(cursor, end) <= 0; cursor = addDays(cursor, 1)) {
    dates.push(cursor)
  }
  return dates
}

export function datesForWeekday(start: string, end: string, weekday: number | null | undefined): string[] {
  if (!weekday) return []
  return eachDate(start, end).filter((date) => weekdayOf(date) === weekday)
}

export function mergeAndSortDates(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat())).sort(compareDate)
}

export function quarterDates(year: number, quarter: BillingQuarter) {
  const map = {
    Q1: ['01-01', '03-31'],
    Q2: ['04-01', '06-30'],
    Q3: ['07-01', '09-30'],
    Q4: ['10-01', '12-31'],
  } as const
  const [start, end] = map[quarter]
  return {
    start_date: `${year}-${start}`,
    end_date: `${year}-${end}`,
  }
}

export function parseSeasonCode(code: string): { year: number; quarter: BillingQuarter } | null {
  const match = code.trim().match(/^(\d{4})-?(Q[1-4])$/i)
  if (!match) return null
  return { year: Number(match[1]), quarter: match[2].toUpperCase() as BillingQuarter }
}

export function buildSeasonCode(year: number, quarter: string): string {
  return `${year}-${quarter.toUpperCase()}`
}

export function generateClassDates(params: {
  startDate: string
  endDate: string
  weekday1?: number | null
  weekday2?: number | null
  classType?: string | null
  limit?: number
}): string[] {
  const limit = params.limit ?? MAX_BILLING_SESSIONS
  const first = datesForWeekday(params.startDate, params.endDate, params.weekday1)
  const second = params.classType === 'double'
    ? datesForWeekday(params.startDate, params.endDate, params.weekday2)
    : []
  return mergeAndSortDates(first, second).slice(0, limit)
}

export function shiftHolidayDate(date: string, holidays: Set<string>): { date: string; shifted: boolean } {
  if (!holidays.has(date)) return { date, shifted: false }
  let cursor = addDays(date, 7)
  for (let safety = 0; safety < 24 && holidays.has(cursor); safety++) {
    cursor = addDays(cursor, 7)
  }
  return { date: cursor, shifted: true }
}

export function weekNumberFromStart(startDate: string, date: string): number {
  const offset = Math.max(0, dateFromDateOnly(date).getTime() - dateFromDateOnly(startDate).getTime())
  return Math.floor(offset / DAY_MS / 7) + 1
}

export function periodKey(seasonCode: string, startDate: string, date: string): string {
  return `${seasonCode.replace('-', '')}W${weekNumberFromStart(startDate, date)}`
}

export function formatDateMd(date: string | null | undefined): string {
  if (!date) return ''
  const [, month, day] = date.slice(0, 10).split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatMoney(value: number | null | undefined): string {
  const number = Number(value ?? 0)
  return number ? number.toLocaleString('zh-TW') : ''
}

export function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function defaultSeasonDraft(today = new Date()) {
  const month = today.getMonth() + 1
  const quarter: BillingQuarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4'
  const year = today.getFullYear()
  const dates = quarterDates(year, quarter)
  return {
    year,
    quarter,
    seasonCode: buildSeasonCode(year, quarter),
    ...dates,
  }
}
