'use client'

import Link from 'next/link'
import { ChevronRight, GraduationCap, Users } from 'lucide-react'
import type { ClassWithCount } from '@/lib/grade/types'

const WEEKDAY = ['', '一', '二', '三', '四', '五', '六', '日']
const SOURCE_LABEL: Record<string, string> = { ENG: '英文', XIAO: '小學堂' }
const TYPE_LABEL: Record<string, string> = { double: '雙課', intensive: '強化', single: '單課' }

function weekStr(w1: number | null, w2: number | null): string {
  const parts = [w1, w2].filter((w): w is number => w != null && w > 0)
  return parts.length > 0 ? parts.map(w => `週${WEEKDAY[w]}`).join('、') : '-'
}

export function ClassList({ classes }: { classes: ClassWithCount[] }) {
  if (classes.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center text-muted-foreground">
        <div>
          <GraduationCap className="mx-auto mb-3" size={40} />
          <p className="font-semibold text-foreground">尚無班級</p>
          <p className="mt-1 text-sm">請先在 Supabase 建立班級資料</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
      {classes.map(c => (
        <Link
          key={c.id}
          href={`/classes/${encodeURIComponent(c.legacy_class_id ?? c.id)}`}
          className="flex items-center gap-4 rounded-2xl bg-white/95 p-4 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.12),0_2px_6px_-4px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-12px_rgba(0,0,0,0.20)] active:scale-[0.99]"
        >
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
            <GraduationCap size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{c.class_name}</p>
            <p className="text-xs text-muted-foreground">
              {SOURCE_LABEL[c.source] ?? c.source}
              {' · '}
              {TYPE_LABEL[c.class_type] ?? c.class_type}
              {' · '}
              {weekStr(c.weekday1, c.weekday2)}
            </p>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={12} />
              <span>{c.student_count} 人</span>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
}
