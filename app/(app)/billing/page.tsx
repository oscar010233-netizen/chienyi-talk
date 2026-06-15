import { BillingWorkspace } from '@/components/billing/BillingWorkspace'
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

  return <BillingWorkspace initialState={state} />
}
