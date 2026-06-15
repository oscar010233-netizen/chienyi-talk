'use client'

import { TaskSlot } from '@/components/reinforcement/TaskSlot'

const SLOT_COUNT = 30

export default function ReinforcementPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="mac-glass mac-hairline sticky top-0 z-40 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">強化任務</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            依學生領取任務，送出後會同步更新班級表中的同一筆任務紀錄。
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
          {SLOT_COUNT} 格
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: SLOT_COUNT }, (_, index) => (
            <TaskSlot key={index} index={index + 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
