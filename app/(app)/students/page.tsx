import { getAllStudents } from '@/lib/grade/queries'
import { StudentRoster } from '@/components/students/StudentRoster'

export const dynamic = 'force-dynamic'

export default async function StudentsPage() {
  const students = await getAllStudents()
  return (
    <div className="min-h-full bg-[#f2f3f5] pb-20 md:pb-0">
      <StudentRoster students={students} />
    </div>
  )
}
