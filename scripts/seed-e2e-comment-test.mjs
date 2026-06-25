import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env.local')

const TENANT_ID = '5b2f677e-8488-4f65-89fc-ebed4a5f8924'
const CLASS_NAME = '[E2E] 評語測試班'
const CLASS_CODE = 'E2E-COMMENT-TEST'
const STUDENT_NAMES = [1, 2, 3, 4, 5].map((index) => `[E2E] 測試生${index}`)
const SEASON_CODE = '2099-Q4'
const SEASON_LABEL = '[E2E] 評語測試季'
const SEASON_YEAR = 2099
const SEASON_QUARTER = 'Q4'
const SEASON_START = '2099-10-01'
const SEASON_END = '2099-12-31'
const ISSUE_DATE = '2099-10-01'
const DUE_DATE = '2099-10-07'
const TEAM_DATES = ['2099-10-05', '2099-10-12', '2099-10-19']
const INTENSIVE_DATES = ['2099-10-08', '2099-10-15', '2099-10-22']

function readEnv(file) {
  const env = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return env
}

function resolveProjectModule(basePath) {
  for (const candidate of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return basePath
}

function registerProjectHooks(root) {
  const nextHeadersStub = `data:text/javascript,export async function cookies(){throw new Error(${JSON.stringify('next/headers cookies() is unavailable in seed script')})}`

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'next/headers') {
        return { url: nextHeadersStub, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        const filePath = resolveProjectModule(path.join(root, specifier.slice(2)))
        return { url: pathToFileURL(filePath).href, shortCircuit: true }
      }
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file://')) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL))
        const filePath = resolveProjectModule(path.resolve(parentDir, specifier))
        if (fs.existsSync(filePath)) {
          return { url: pathToFileURL(filePath).href, shortCircuit: true }
        }
      }
      return nextResolve(specifier, context)
    },
  })
}

function serviceSupabase(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function confirmTenant(supabase) {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', TENANT_ID)
    .maybeSingle()

  if (tenantError) throw new Error(tenantError.message)
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_ID}`)

  const { data: existingClass, error: classError } = await supabase
    .from('classes')
    .select('id, class_name')
    .eq('tenant_id', TENANT_ID)
    .limit(1)
    .maybeSingle()

  if (classError) throw new Error(classError.message)
  if (!existingClass) {
    throw new Error(`Tenant ${TENANT_ID} has no existing classes; please confirm the target tenant first.`)
  }

  return tenant
}

async function ensureStudents(supabase) {
  const { data: existingRows, error: existingError } = await supabase
    .from('students')
    .select('id, chinese_name, status')
    .eq('tenant_id', TENANT_ID)
    .in('chinese_name', STUDENT_NAMES)

  if (existingError) throw new Error(existingError.message)

  const byName = new Map((existingRows ?? []).map((row) => [row.chinese_name, row]))
  const missingNames = STUDENT_NAMES.filter((name) => !byName.has(name))

  if (missingNames.length > 0) {
    const rows = missingNames.map((name, index) => ({
      tenant_id: TENANT_ID,
      chinese_name: name,
      english_name: `E2E${index + 1}`,
      status: 'active',
      school: null,
      grade: null,
      note: 'seed-e2e-comment-test',
      parent_name: null,
      parent_phone: null,
    }))
    const { error } = await supabase.from('students').insert(rows)
    if (error) throw new Error(error.message)
  }

  for (const row of existingRows ?? []) {
    if (row.status === 'active') continue
    const { error } = await supabase
      .from('students')
      .update({ status: 'active' })
      .eq('id', row.id)
      .eq('tenant_id', TENANT_ID)
    if (error) throw new Error(error.message)
  }

  const { data: finalRows, error: finalError } = await supabase
    .from('students')
    .select('id, chinese_name')
    .eq('tenant_id', TENANT_ID)
    .in('chinese_name', STUDENT_NAMES)
    .order('chinese_name')

  if (finalError) throw new Error(finalError.message)
  if ((finalRows ?? []).length !== STUDENT_NAMES.length) {
    throw new Error('Failed to ensure all E2E students')
  }
  return finalRows
}

async function ensureClass(supabase) {
  const { data: existing, error: existingError } = await supabase
    .from('classes')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('class_code', CLASS_CODE)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)

  const payload = {
    tenant_id: TENANT_ID,
    class_name: CLASS_NAME,
    class_code: CLASS_CODE,
    department: 'E2E',
    level: 'test',
    class_type: 'intensive',
    weekday1: 2,
    weekday2: 4,
    system_sessions: TEAM_DATES.length + INTENSIVE_DATES.length,
    status: 'active',
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('classes')
      .update(payload)
      .eq('id', existing.id)
      .eq('tenant_id', TENANT_ID)
      .select('id, tenant_id, class_name, class_code')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const { data, error } = await supabase
    .from('classes')
    .insert(payload)
    .select('id, tenant_id, class_name, class_code')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function ensureEnrollments(supabase, classId, students) {
  const studentIds = students.map((student) => student.id)
  const { data: existingRows, error: existingError } = await supabase
    .from('class_enrollments')
    .select('id, student_id, status')
    .eq('tenant_id', TENANT_ID)
    .eq('class_id', classId)
    .in('student_id', studentIds)

  if (existingError) throw new Error(existingError.message)

  const existingByStudentId = new Map((existingRows ?? []).map((row) => [row.student_id, row]))

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index]
    const existing = existingByStudentId.get(student.id)
    if (existing) {
      const { error } = await supabase
        .from('class_enrollments')
        .update({ status: 'active', slot_order: index + 1 })
        .eq('id', existing.id)
        .eq('tenant_id', TENANT_ID)
      if (error) throw new Error(error.message)
      continue
    }

    const { error } = await supabase.from('class_enrollments').insert({
      tenant_id: TENANT_ID,
      class_id: classId,
      student_id: student.id,
      status: 'active',
      slot_order: index + 1,
    })
    if (error) throw new Error(error.message)
  }
}

async function ensureSeason(supabase) {
  const { data: existing, error: existingError } = await supabase
    .from('billing_seasons')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('season_code', SEASON_CODE)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)

  const payload = {
    tenant_id: TENANT_ID,
    season_code: SEASON_CODE,
    year: SEASON_YEAR,
    quarter: SEASON_QUARTER,
    start_date: SEASON_START,
    end_date: SEASON_END,
    label: SEASON_LABEL,
    status: 'active',
    holiday_dates: [],
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('billing_seasons')
      .update(payload)
      .eq('id', existing.id)
      .eq('tenant_id', TENANT_ID)
      .select('id, season_code')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const { data, error } = await supabase
    .from('billing_seasons')
    .insert(payload)
    .select('id, season_code')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function loadBillingService() {
  registerProjectHooks(ROOT)
  return import(pathToFileURL(path.join(ROOT, 'lib/billing/service.ts')).href)
}

function buildSelectedStudents(students) {
  return students.map((student) => ({
    studentId: student.id,
    teamDates: TEAM_DATES,
    intensiveDates: INTENSIVE_DATES,
    intensiveUnscheduled: 0,
    tuitionAmount: 6000,
    tuitionLabel: 'E2E 學費',
    tuitionPresetKey: null,
    bookRows: [],
    miscRows: [],
    discountRows: [],
    carryoverAmount: 0,
    carryoverNote: null,
    adjustments: [],
  }))
}

async function collectSummary(supabase, classId, bagId) {
  const { data: lineRows, error: lineError } = await supabase
    .from('payment_bag_lines')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('bag_id', bagId)

  if (lineError) throw new Error(lineError.message)

  const lineIds = (lineRows ?? []).map((row) => row.id)
  const { data: sessionRows, error: sessionError } = lineIds.length > 0
    ? await supabase
        .from('payment_bag_line_sessions')
        .select('slot_index, session_kind')
        .eq('tenant_id', TENANT_ID)
        .in('line_id', lineIds)
        .neq('session_kind', 'makeup')
        .not('slot_index', 'is', null)
    : { data: [], error: null }

  if (sessionError) throw new Error(sessionError.message)

  const slotCount = new Set((sessionRows ?? []).map((row) => row.slot_index)).size

  const { data: commentTasks, error: commentTaskError } = await supabase
    .from('class_tasks')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('class_id', classId)
    .eq('bag_id', bagId)
    .eq('task_type', 'comment')

  if (commentTaskError) throw new Error(commentTaskError.message)

  const commentTaskIds = (commentTasks ?? []).map((row) => row.id)
  const { count: commentRecordCount, error: commentRecordError } = commentTaskIds.length > 0
    ? await supabase
        .from('student_task_records')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID)
        .in('class_task_id', commentTaskIds)
    : { count: 0, error: null }

  if (commentRecordError) throw new Error(commentRecordError.message)

  return {
    slotCount,
    commentTaskCount: commentTaskIds.length,
    commentRecordCount: commentRecordCount ?? 0,
  }
}

async function main() {
  const reopenMode = process.argv.includes('--reopen')
  const env = readEnv(ENV_FILE)
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'seed-script-not-used'

  const supabase = serviceSupabase(env)
  await confirmTenant(supabase)

  const students = await ensureStudents(supabase)
  const cls = await ensureClass(supabase)
  await ensureEnrollments(supabase, cls.id, students)
  const season = await ensureSeason(supabase)

  const { openPaymentBag } = await loadBillingService()
  const bag = await openPaymentBag({
    seasonId: season.id,
    classId: cls.id,
    issueDate: ISSUE_DATE,
    dueDate: DUE_DATE,
    tuitionAmount: 6000,
    bookName: null,
    bookFee: 0,
    miscLabel: null,
    miscFee: 0,
    discountLabel: null,
    discountAmount: 0,
    note: reopenMode ? 'seed-e2e-comment-test reopen' : 'seed-e2e-comment-test',
    selectedStudents: buildSelectedStudents(students),
  })

  const summary = await collectSummary(supabase, cls.id, bag.id)

  console.log(`mode=${reopenMode ? 'reopen' : 'seed'}`)
  console.log(`class_id=${cls.id}`)
  console.log(`bag_id=${bag.id}`)
  console.log(`slot_count=${summary.slotCount}`)
  console.log(`comment_task_count=${summary.commentTaskCount}`)
  console.log(`comment_record_count=${summary.commentRecordCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
