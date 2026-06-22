import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const TASK_TYPES = new Set(['homework', 'practice', 'quiz', 'comment', 'progress'])
const SESSION_POSITIONS = new Set(['S1', 'S2'])

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function toSortOrder(value: unknown, fallback: number): number {
  if (value == null) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

async function requireTenantId(requestedTenantId?: string | null) {
  const authClient = await createClient()
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()

  if (userError) throw new Error(userError.message)
  if (!user) {
    if (process.env.NODE_ENV === 'development' && requestedTenantId) {
      return { tenantId: requestedTenantId, supabase: await createServiceClient() }
    }
    const error = new Error('unauthorized')
    ;(error as Error & { status?: number }).status = 401
    throw error
  }

  const supabase = await createServiceClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!profile?.tenant_id) {
    const profileError = new Error('tenant not found')
    ;(profileError as Error & { status?: number }).status = 404
    throw profileError
  }
  if (requestedTenantId && requestedTenantId !== profile.tenant_id) {
    const mismatch = new Error('tenant mismatch')
    ;(mismatch as Error & { status?: number }).status = 403
    throw mismatch
  }

  return { tenantId: profile.tenant_id, supabase }
}

interface TemplateRow {
  id: string
  tenant_id: string
  name: string
  created_at?: string | null
  updated_at?: string | null
}

interface TemplateItemRow {
  id: string
  tenant_id: string
  template_id: string
  task_type: string
  session_position: 'S1' | 'S2'
  sort_order: number | null
  created_at?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const requestedTenantId = request.nextUrl.searchParams.get('tenant_id')
    const { tenantId, supabase } = await requireTenantId(requestedTenantId)

    const { data: templates, error: templateError } = await supabase
      .from('class_task_templates')
      .select('id, tenant_id, name, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at')

    if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 })

    const templateIds = (templates ?? []).map((template: TemplateRow) => template.id)
    const { data: items, error: itemError } = templateIds.length > 0
      ? await supabase
          .from('class_task_template_items')
          .select('id, tenant_id, template_id, task_type, session_position, sort_order, created_at')
          .eq('tenant_id', tenantId)
          .in('template_id', templateIds)
          .order('sort_order')
      : { data: [], error: null }

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    const itemsByTemplate = new Map<string, TemplateItemRow[]>()
    for (const item of (items ?? []) as TemplateItemRow[]) {
      const list = itemsByTemplate.get(item.template_id) ?? []
      list.push(item)
      itemsByTemplate.set(item.template_id, list)
    }

    return NextResponse.json({
      templates: (templates ?? []).map((template: TemplateRow) => ({
        ...template,
        items: itemsByTemplate.get(template.id) ?? [],
      })),
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'failed to load templates' }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      tenant_id?: string | null
      name?: string | null
      items?: Array<{
        task_type?: string
        session_position?: string
        sort_order?: number | null
      }>
    }

    const { tenantId, supabase } = await requireTenantId(trimOrNull(body.tenant_id))
    const name = trimOrNull(body.name)
    const items = Array.isArray(body.items) ? body.items : []

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: 'items required' }, { status: 400 })

    for (const item of items) {
      if (!TASK_TYPES.has(String(item.task_type ?? '').trim())) {
        return NextResponse.json({ error: 'valid task_type required' }, { status: 400 })
      }
      if (!SESSION_POSITIONS.has(String(item.session_position ?? '').trim())) {
        return NextResponse.json({ error: 'valid session_position required' }, { status: 400 })
      }
    }

    const { data: template, error: templateError } = await supabase
      .from('class_task_templates')
      .insert({
        tenant_id: tenantId,
        name,
      })
      .select('id, tenant_id, name, created_at, updated_at')
      .single()

    if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 })

    const itemRows = items.map((item, index) => ({
      tenant_id: tenantId,
      template_id: template.id,
      task_type: String(item.task_type).trim(),
      session_position: String(item.session_position).trim(),
      sort_order: toSortOrder(item.sort_order, index),
    }))

    const { data: createdItems, error: itemError } = await supabase
      .from('class_task_template_items')
      .insert(itemRows)
      .select('id, tenant_id, template_id, task_type, session_position, sort_order, created_at')

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    return NextResponse.json({
      template: {
        ...template,
        items: createdItems ?? [],
      },
    })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'failed to save template' }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = trimOrNull(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const requestedTenantId = request.nextUrl.searchParams.get('tenant_id')
    const { tenantId, supabase } = await requireTenantId(requestedTenantId)

    const { error } = await supabase
      .from('class_task_templates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'failed to delete template' }, { status })
  }
}
