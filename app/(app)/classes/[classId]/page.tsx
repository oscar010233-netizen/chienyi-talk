import { notFound } from 'next/navigation'
import { getClassDetail } from '@/lib/grade/queries'
import { ClassSheet } from '@/components/grade/ClassSheet'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ classId: string }> }

export default async function ClassSheetPage({ params }: Props) {
  const { classId } = await params
  const detail = await getClassDetail(decodeURIComponent(classId))
  if (!detail) notFound()
  return <ClassSheet detail={detail} />
}
