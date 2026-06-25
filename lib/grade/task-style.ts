import type { TaskType } from '@/lib/grade/types'

export const TASK_SHORT: Record<TaskType, string> = {
  attendance: '出席',
  homework: '作業',
  practice: '練習',
  quiz: '考試',
  comment: '評論',
  progress: '進度',
}

export const TASK_CHIP: Record<TaskType, string> = {
  attendance: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
  homework: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  practice: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  quiz: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
  comment: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  progress: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
}

export const SESSION_POSITION_LABEL = {
  S1: '團課',
  S2: '強化',
} as const
