import { getAllClasses } from '@/lib/grade/queries'
import { ClassList } from '@/components/grade/ClassList'

export const dynamic = 'force-dynamic'

export default async function ClassesPage() {
  const classes = await getAllClasses()
  return (
    <div className="min-h-full pb-20 md:pb-0">
      <div className="sticky top-0 z-40 border-b border-black/[0.07] bg-white/70 px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">班級</h1>
        <p className="mt-1 text-sm text-muted-foreground">點選班級查看成績表或 Kanban</p>
      </div>
      <ClassList classes={classes} />
    </div>
  )
}
