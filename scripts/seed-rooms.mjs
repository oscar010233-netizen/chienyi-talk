const SUPA_URL = 'https://pmoyvpnbbitnigchvluz.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtb3l2cG5iYml0bmlnY2h2bHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NzYzNSwiZXhwIjoyMDk2NzMzNjM1fQ.S40WYf7LRIjHLXOnKC6shxUOyJmny_tuNNvI2cDt7n8'
const TENANT_ID = '5b2f677e-8488-4f65-89fc-ebed4a5f8924'

const rooms = [
  { tenant_id: TENANT_ID, name: 'Public',    display_order: 1 },
  { tenant_id: TENANT_ID, name: '延伸A',     display_order: 2 },
  { tenant_id: TENANT_ID, name: 'A教室',     display_order: 3 },
  { tenant_id: TENANT_ID, name: 'B教室',     display_order: 4 },
  { tenant_id: TENANT_ID, name: '階梯教室',  display_order: 5 },
]

const res = await fetch(`${SUPA_URL}/rest/v1/rooms`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(rooms),
})

const data = await res.json()
console.log(JSON.stringify(data, null, 2))
