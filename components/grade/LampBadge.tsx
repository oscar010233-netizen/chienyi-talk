'use client'

import { cn } from '@/lib/utils'
import type { Lamp } from '@/lib/grade/types'

const LAMP: Record<Lamp, { dot: string; bg: string; text: string; label: string }> = {
  red:    { dot: 'bg-red-400',     bg: 'bg-red-50',     text: 'text-red-700',     label: '待' },
  yellow: { dot: 'bg-yellow-400',  bg: 'bg-yellow-50',  text: 'text-yellow-700',  label: '訂' },
  green:  { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', label: '過' },
  blue:   { dot: 'bg-blue-400',    bg: 'bg-blue-50',    text: 'text-blue-700',    label: '驗' },
  black:  { dot: 'bg-gray-600',    bg: 'bg-gray-100',   text: 'text-gray-600',    label: '缺' },
  white:  { dot: 'bg-gray-300',    bg: 'bg-gray-50',    text: 'text-gray-400',    label: '免' },
  orange: { dot: 'bg-orange-400',  bg: 'bg-orange-50',  text: 'text-orange-700',  label: '練' },
}

interface Props {
  lamp: Lamp
  score?: number | null
  className?: string
}

export function LampBadge({ lamp, score, className }: Props) {
  const c = LAMP[lamp]
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
      {c.label}
      {score != null && <span className="opacity-75">{score}</span>}
    </span>
  )
}
