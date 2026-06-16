import { InvoiceWorkflow } from '@/components/billing/InvoiceWorkflow'
import { getBillingState } from '@/lib/billing/service'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    classId?: string
    seasonId?: string
  }>
}

export default async function BillingPage({ searchParams }: Props) {
  const params = await searchParams
  const state = await getBillingState({
    classId: params.classId ? decodeURIComponent(params.classId) : null,
    seasonId: params.seasonId ? decodeURIComponent(params.seasonId) : null,
  })

  return <InvoiceWorkflow initialState={state} />
}
