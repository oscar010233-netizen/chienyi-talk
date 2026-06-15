const SUPA = 'https://pmoyvpnbbitnigchvluz.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtb3l2cG5iYml0bmlnY2h2bHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NzYzNSwiZXhwIjoyMDk2NzMzNjM1fQ.S40WYf7LRIjHLXOnKC6shxUOyJmny_tuNNvI2cDt7n8'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function q(table, params = '') {
  const r = await fetch(`${SUPA}/rest/v1/${table}?${params}`, { headers: H })
  return r.json()
}

const [tenants, classes, students, rooms, days, events, tasks, records] = await Promise.all([
  q('tenants', 'select=id,name'),
  q('classes', 'select=id,class_name,class_code,class_type,weekday1,weekday2,status&order=class_name'),
  q('students', 'select=id,chinese_name,english_name,grade,status&order=chinese_name'),
  q('rooms', 'select=name,display_order,status&order=display_order'),
  q('schedule_days', 'select=date,weekday,status&order=date.desc&limit=5'),
  q('schedule_events', 'select=title,event_type,start_time,end_time,status&limit=20'),
  q('class_tasks', 'select=id'),
  q('student_task_records', 'select=id,status'),
])

console.log('╔══════════════════════════════════════')
console.log('║ 📋 Supabase DB 現況')
console.log('╠══════════════════════════════════════')

console.log(`\n【tenants】${tenants.length} 筆`)
tenants.forEach(r => console.log(`  • ${r.name} (${r.id.slice(0,8)}…)`))

console.log(`\n【classes】${classes.length} 筆`)
classes.length === 0
  ? console.log('  （空）')
  : classes.forEach(c => console.log(`  • [${c.class_code ?? '—'}] ${c.class_name}  type=${c.class_type}  status=${c.status}`))

console.log(`\n【students】${students.length} 筆`)
students.length === 0
  ? console.log('  （空）')
  : students.forEach(s => console.log(`  • ${s.chinese_name ?? '—'} / ${s.english_name ?? '—'}  年級=${s.grade ?? '—'}  status=${s.status}`))

console.log(`\n【rooms】${rooms.length} 筆`)
rooms.forEach(r => console.log(`  ${r.display_order}. ${r.name}  (${r.status})`))

console.log(`\n【schedule_days】最近 ${days.length} 筆`)
days.length === 0
  ? console.log('  （空）')
  : days.forEach(d => console.log(`  • ${d.date} (weekday ${d.weekday})  ${d.status}`))

console.log(`\n【schedule_events】${events.length} 筆`)
events.length === 0
  ? console.log('  （空）')
  : events.forEach(e => console.log(`  • ${e.start_time?.slice(0,5)}-${e.end_time?.slice(0,5)} ${e.event_type} "${e.title ?? '（無標題）'}" ${e.status}`))

console.log(`\n【class_tasks】${tasks.length} 筆`)
console.log(`\n【student_task_records】${records.length} 筆`)
const byStatus = records.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc }, {})
Object.entries(byStatus).forEach(([k,v]) => console.log(`  ${k}: ${v}`))

console.log('\n╚══════════════════════════════════════')
