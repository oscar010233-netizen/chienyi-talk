// One-shot script: clear billing + attendance data for testing
// Usage: node scripts/clear-data.mjs
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const URL = env['NEXT_PUBLIC_SUPABASE_URL']
const KEY = env['SUPABASE_SERVICE_ROLE_KEY']

async function clearTable(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'return=minimal',
    },
  })
  console.log(`${table}: ${res.status} ${res.ok ? 'OK' : await res.text()}`)
}

// Order matters: child tables first
await clearTable('student_task_records')
await clearTable('class_tasks')
await clearTable('default_attendance')
await clearTable('payment_bag_lines')
await clearTable('payment_bags')
console.log('Done.')
