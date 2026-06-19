import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { SeasonPlanSheet } from '@/components/grade/SeasonPlanSheet'

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

  return <SeasonPlanSheet classId={id} cls={cls} />
}
