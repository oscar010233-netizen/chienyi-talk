import { notFound } from 'next/navigation'
import { getClassDetail } from '@/lib/grade/queries'
import { KanbanBoard } from '@/components/grade/KanbanBoard'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ classId: string }> }

export default async function KanbanPage({ params }: Props) {
  const { classId } = await params
  const detail = await getClassDetail(decodeURIComponent(classId))
  if (!detail) notFound()
  return <KanbanBoard detail={detail} />
}
