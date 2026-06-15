'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CreateClassModal } from './CreateClassModal'

export function CreateClassButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-gold px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98] dark:bg-[#ff4d4f]"
      >
        <Plus size={15} strokeWidth={2.5} />
        新增班級
      </button>
      <CreateClassModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
