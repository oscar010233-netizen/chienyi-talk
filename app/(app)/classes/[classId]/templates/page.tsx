import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, LayoutTemplate } from 'lucide-react'
import { TemplateManager } from '@/components/grade/TemplateManager'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ classId: string }> }

export default async function ClassTemplatePage({ params }: Props) {
  const { classId } = await params
  const id = decodeURIComponent(classId)

  const supabase = await createServiceClient()
  const { data: cls } = await supabase
    .from('classes')
    .select('id, class_name, tenant_id')
    .eq('id', id)
    .single()

  if (!cls) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href={`/classes/${encodeURIComponent(id)}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <LayoutTemplate size={16} className="text-muted-foreground" />
        <span className="font-semibold text-foreground">{cls.class_name} — 任務模板</span>
      </header>

      <div className="flex-1 p-4">
        <TemplateManager tenantId={cls.tenant_id} />
      </div>
    </div>
  )
}
