import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { PlanSheet, type PlanSessionSlot } from '@/components/grade/PlanSheet'
import type { Task } from '@/lib/grade/types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ classId: string }> }

export default async function SeasonPlanPage({ params }: Props) {
  const { classId } = await params
  const id = decodeURIComponent(classId)

  const supabase = await createServiceClient()
  const { data: cls } = await supabase
    .from('classes')
    .select('id, class_name, class_type, weekday1, weekday2, tenant_id, status, class_code, department, level, system_sessions')
    .eq('id', id)
    .single()

  if (!cls) notFound()

  const { data: bag } = await supabase
    .from('payment_bags')
    .select('id')
    .eq('class_id', id)
    .eq('tenant_id', cls.tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let initialSlots: PlanSessionSlot[] = []

  if (bag?.id) {
    const { data: lineRows } = await supabase
      .from('payment_bag_lines')
      .select('id')
      .eq('bag_id', bag.id)
      .eq('tenant_id', cls.tenant_id)

    const lineIds = (lineRows ?? []).map((row: { id: string }) => row.id)

    if (lineIds.length > 0) {
      const [{ data: sessionRows }, { data: tasks }] = await Promise.all([
        supabase
          .from('payment_bag_line_sessions')
          .select('slot_index, session_date, session_kind')
          .in('line_id', lineIds)
          .eq('tenant_id', cls.tenant_id)
          .neq('session_kind', 'makeup')
          .order('slot_index', { ascending: true, nullsFirst: false }),
        supabase
          .from('class_tasks')
          .select('id, tenant_id, class_id, bag_id, slot_index, lesson_label, task_type, task_name, threshold_value, max_score, threshold_text, display_order')
          .eq('tenant_id', cls.tenant_id)
          .eq('class_id', id)
          .eq('bag_id', bag.id)
          .neq('task_type', 'attendance')
          .order('display_order'),
      ])

      const tasksBySlot = new Map<number, Task[]>()
      for (const task of (tasks ?? []) as Task[]) {
        if (task.slot_index == null) continue
        const list = tasksBySlot.get(task.slot_index) ?? []
        list.push(task)
        tasksBySlot.set(task.slot_index, list)
      }

      const slotMap = new Map<number, PlanSessionSlot>()
      for (const row of (sessionRows ?? []) as Array<{ slot_index: number | null; session_date: string | null; session_kind: 'team' | 'intensive' }>) {
        if (row.slot_index == null || slotMap.has(row.slot_index)) continue
        const slotTasks = tasksBySlot.get(row.slot_index) ?? []
        slotMap.set(row.slot_index, {
          slot_index: row.slot_index,
          session_date: row.session_date,
          session_kind: row.session_kind,
          lesson_label: slotTasks.find((task) => task.lesson_label)?.lesson_label ?? null,
          tasks: slotTasks,
        })
      }

      initialSlots = Array.from(slotMap.values()).sort((a, b) => a.slot_index - b.slot_index)
    }
  }

  return <PlanSheet classId={id} cls={cls} bagId={bag?.id ?? null} initialSlots={initialSlots} />
}
