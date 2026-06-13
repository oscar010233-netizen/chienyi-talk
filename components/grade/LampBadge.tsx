'use client'

import { cn } from '@/lib/utils'
import type { Lamp } from '@/lib/grade/types'

// Pure presentation. The colour + label are derived upstream from
// (status, task_type) via lib/grade/status.ts — this component never
// decides what a status "means".
const LAMP_COLOR: Record<Lamp, { dot: string; bg: string; text: string }> = {
  red:    { dot: 'bg-red-400',     bg: 'bg-red-50',     text: 'text-red-700' },
  yellow: { dot: 'bg-yellow-400',  bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  green:  { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  blue:   { dot: 'bg-blue-400',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  black:  { dot: 'bg-gray-600',    bg: 'bg-gray-100',   text: 'text-gray-600' },
  white:  { dot: 'bg-gray-300',    bg: 'bg-gray-50',    text: 'text-gray-400' },
  orange: { dot: 'bg-orange-400',  bg: 'bg-orange-50',  text: 'text-orange-700' },
}

interface Props {
  color: Lamp
  label?: string
  /** Score or history string, e.g. 100 or "80,90,99,90". */
  detail?: string | number | null
  className?: string
}

export function LampBadge({ color, label, detail, className }: Props) {
  const c = LAMP_COLOR[color]
  const hasDetail = detail != null && detail !== ''
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
        c.bg,
        c.text,
        className
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', c.dot)} />
      {label}
      {hasDetail && <span className="opacity-75">{detail}</span>}
    </span>
  )
}
