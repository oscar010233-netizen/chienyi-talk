'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, GraduationCap, Settings2, Users } from 'lucide-react'
import type { ClassWithCount } from '@/lib/grade/types'
import { ClassSettingsModal } from './ClassSettingsModal'

const WEEKDAY = ['', '一', '二', '三', '四', '五', '六', '日']
const TYPE_LABEL: Record<string, string> = { double: '雙團課', intensive: '團課 + 強化', single: '單堂' }

function weekStr(w1: number | null, w2: number | null): string {
  const parts = [w1, w2].filter((w): w is number => w != null && w > 0)
  return parts.length > 0 ? parts.map(w => `週${WEEKDAY[w]}`).join('、') : '-'
}

export function ClassList({ classes }: { classes: ClassWithCount[] }) {
  const [editingClass, setEditingClass] = useState<ClassWithCount | null>(null)

  if (classes.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center text-muted-foreground">
        <div>
          <GraduationCap className="mx-auto mb-3" size={40} />
          <p className="font-semibold text-foreground">尚無班級</p>
          <p className="mt-1 text-sm">點選右上角「新增班級」開始建立</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
        {classes.map(c => (
          <div key={c.id} className="group relative">
            <Link
              href={`/classes/${encodeURIComponent(c.id)}`}
              className="mac-soft flex items-center gap-4 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-12px_rgba(0,0,0,0.20)] active:scale-[0.99]"
            >
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold dark:bg-[#ff4d4f]/15 dark:text-[#ff7a7a]">
                <GraduationCap size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{c.class_name}</p>
                <p className="text-xs text-muted-foreground">
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

            {/* Settings button */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setEditingClass(c) }}
              className="absolute right-10 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="班級設定"
            >
              <Settings2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <ClassSettingsModal cls={editingClass} onClose={() => setEditingClass(null)} />
    </>
  )
}
