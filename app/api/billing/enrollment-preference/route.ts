import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type PatchBody = {
  enrollmentId?: unknown
  intensivePreferredWeekday?: unknown
}

function parseBody(value: PatchBody): { enrollmentId: string; intensivePreferredWeekday: number | null } | null {
  const enrollmentId = typeof value.enrollmentId === 'string' ? value.enrollmentId.trim() : ''
  if (!enrollmentId) return null

  const weekday = value.intensivePreferredWeekday
  if (weekday === null) {
    return { enrollmentId, intensivePreferredWeekday: null }
  }

  if (typeof weekday !== 'number') return null
  if (!Number.isInteger(weekday)) return null
  if (weekday < 1 || weekday > 7) return null

  return { enrollmentId, intensivePreferredWeekday: weekday }
}

export async function PATCH(request: NextRequest) {
  try {
    let rawBody: PatchBody
    try {
      rawBody = (await request.json()) as PatchBody
    } catch {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
    }

    const parsed = parseBody(rawBody)
    if (!parsed) {
      return NextResponse.json({ error: 'invalid enrollmentId or intensivePreferredWeekday' }, { status: 400 })
    }

    const authClient = await createClient()
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser()

    if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
    if (!profile?.tenant_id) return NextResponse.json({ error: 'tenant not found' }, { status: 404 })

    const { data: updated, error: updateError } = await supabase
      .from('class_enrollments')
      .update({ intensive_preferred_weekday: parsed.intensivePreferredWeekday })
      .eq('id', parsed.enrollmentId)
      .eq('tenant_id', profile.tenant_id)
      .select('id, intensive_preferred_weekday')
      .maybeSingle()

    if (updateError) return NextResponse.json({ error: 'failed to update enrollment preference' }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'enrollment not found' }, { status: 404 })

    return NextResponse.json({
      id: updated.id,
      intensive_preferred_weekday: updated.intensive_preferred_weekday,
    })
  } catch {
    return NextResponse.json({ error: 'failed to update enrollment preference' }, { status: 500 })
  }
}
