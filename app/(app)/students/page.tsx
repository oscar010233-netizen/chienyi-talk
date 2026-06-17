import { getAllStudents } from '@/lib/grade/queries'
import { StudentRoster } from '@/components/students/StudentRoster'

export const dynamic = 'force-dynamic'

export default async function StudentsPage() {
  const students = await getAllStudents()
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StudentRoster students={students} />
    </div>
  )
}
