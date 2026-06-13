import { getAllClasses } from '@/lib/grade/queries'
import { ClassList } from '@/components/grade/ClassList'

export const dynamic = 'force-dynamic'

export default async function ClassesPage() {
  const classes = await getAllClasses()
  return (
    <div className="min-h-full bg-[#f2f3f5] pb-20 md:pb-0">
      <div className="border-b border-border bg-white px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold text-foreground">班級</h1>
        <p className="mt-1 text-sm text-muted-foreground">點選班級查看成績表或 Kanban</p>
      </div>
      <ClassList classes={classes} />
    </div>
  )
}
