export const SCHEDULE_COLOR_PALETTE = [
  '#0A84FF',
  '#5E5CE6',
  '#BF5AF2',
  '#FF375F',
  '#FF453A',
  '#FF9F0A',
  '#FFD60A',
  '#30D158',
  '#32D74B',
  '#40C8E0',
  '#64D2FF',
  '#AC8E68',
] as const

export const DEFAULT_SCHEDULE_COLOR = SCHEDULE_COLOR_PALETTE[0]

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i

export function normalizeScheduleHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null
}
