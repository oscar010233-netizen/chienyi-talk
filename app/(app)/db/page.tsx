'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Play, Pause, Loader2, AlertTriangle } from 'lucide-react'

interface TableInfo {
  name: string
  group: string
  note: string | null
  columns: string[]
  count: number | null
  error: string | null
}

interface AuditEntry {
  id: number
  table_name: string
  op: 'INSERT' | 'UPDATE' | 'DELETE' | string
  row_id: string | null
  changed_columns: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  actor: string | null
  created_at: string
}

const OP_STYLE: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25',
  UPDATE: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25',
  DELETE: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25',
}
const OP_LABEL: Record<string, string> = { INSERT: '新增', UPDATE: '更動', DELETE: '刪除' }

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-TW', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0').slice(0, 2)
}

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : '—'
}

function cell(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    const s = JSON.stringify(value)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }
  const s = String(value)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

// Pick a human-friendly label from a row's jsonb for INSERT/DELETE feed entries.
function rowLabel(data: Record<string, unknown> | null): string {
  if (!data) return ''
  for (const k of ['title', 'task_name', 'content', 'chinese_name', 'class_name', 'name', 'bag_code', 'season_code']) {
    if (data[k]) return String(data[k])
  }
  return ''
}

export default function DbMonitorPage() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [rows, setRows] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [newIds, setNewIds] = useState<Set<number>>(new Set())
  const [auto, setAuto] = useState(true)
  const maxId = useRef(0)

  const loadSnapshot = useCallback(async () => {
    const res = await fetch('/api/db/snapshot')
    const data = await res.json()
    setTables(data.tables ?? [])
  }, [])

  const loadRows = useCallback(async (table: string) => {
    setSelected(table)
    setRowsLoading(true)
    try {
      const res = await fetch(`/api/db/rows?table=${table}`)
      const data = await res.json()
      setRows(res.ok ? data : { columns: [], rows: [] })
    } finally {
      setRowsLoading(false)
    }
  }, [])

  const pollAudit = useCallback(async (initial = false) => {
    const url = initial || maxId.current === 0
      ? '/api/db/audit?limit=80'
      : `/api/db/audit?sinceId=${maxId.current}&limit=80`
    const res = await fetch(url)
    if (!res.ok) return
    const data = await res.json()
    const entries: AuditEntry[] = data.entries ?? []
    if (entries.length === 0) return
    maxId.current = Math.max(maxId.current, ...entries.map((e) => e.id))
    if (initial) {
      setAudit(entries)
    } else {
      setNewIds(new Set(entries.map((e) => e.id)))
      setAudit((prev) => [...entries, ...prev].slice(0, 200))
      window.setTimeout(() => setNewIds(new Set()), 2500)
    }
  }, [])

  useEffect(() => {
    void loadSnapshot()
    void pollAudit(true)
  }, [loadSnapshot, pollAudit])

  useEffect(() => {
    if (!auto) return
    const timer = window.setInterval(() => {
      void pollAudit(false)
      void loadSnapshot()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [auto, pollAudit, loadSnapshot])

  const groups = Array.from(new Set(tables.map((t) => t.group)))
  const selectedMeta = tables.find((t) => t.name === selected)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mac-glass mac-hairline sticky top-0 z-40 border-b px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">DB 監看</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">即時顯示 Supabase 各表內容與寫入 / 更動 / 刪除紀錄</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuto((v) => !v)}
              className={[
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                auto
                  ? 'border-gold/40 bg-gold/10 text-gold dark:border-[#ff4d4f]/40 dark:bg-[#ff4d4f]/10 dark:text-[#ff4d4f]'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              ].join(' ')}
            >
              {auto ? <Pause size={13} /> : <Play size={13} />}
              {auto ? '自動更新中' : '已暫停'}
            </button>
            <button
              onClick={() => { void loadSnapshot(); void pollAudit(false); if (selected) void loadRows(selected) }}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RefreshCw size={13} /> 重新整理
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-4 p-4 md:gap-5 md:p-5">

        {/* Left: table list */}
        <div className="w-52 shrink-0 overflow-y-auto rounded-xl border border-border bg-background/50">
          {groups.map((g) => (
            <div key={g} className="border-b border-border/60 last:border-0">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g}</div>
              {tables.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.name}
                  onClick={() => void loadRows(t.name)}
                  className={[
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors',
                    selected === t.name ? 'bg-gold/10 text-gold dark:bg-[#ff4d4f]/10 dark:text-[#ff4d4f]' : 'text-foreground/80 hover:bg-muted',
                  ].join(' ')}
                  title={t.note ?? undefined}
                >
                  <span className="flex min-w-0 items-center gap-1 truncate font-mono">
                    {t.note && <AlertTriangle size={11} className="shrink-0 text-amber-500" />}
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 text-[11px] tabular-nums text-muted-foreground dark:bg-white/10">
                    {t.count ?? '?'}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Middle: rows */}
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-background/50">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">← 點左側表格檢視內容</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <span className="font-mono text-sm font-semibold text-foreground">{selected}</span>
                <span className="text-xs text-muted-foreground">{rows?.rows.length ?? 0} 筆（最多 100）</span>
              </div>
              {selectedMeta?.note && (
                <div className="flex items-start gap-1.5 border-b border-amber-200/60 bg-amber-50/60 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />{selectedMeta.note}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                {rowsLoading ? (
                  <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
                ) : (
                  <table className="w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {(rows?.columns ?? []).map((c) => (
                          <th key={c} className="whitespace-nowrap border-b border-border bg-muted/80 px-2.5 py-1.5 text-left font-medium text-muted-foreground backdrop-blur">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rows?.rows ?? []).length === 0 ? (
                        <tr><td colSpan={rows?.columns.length || 1} className="px-3 py-10 text-center text-muted-foreground">（無資料）</td></tr>
                      ) : (
                        rows!.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            {rows!.columns.map((c) => (
                              <td key={c} className="max-w-[220px] truncate whitespace-nowrap border-b border-border/50 px-2.5 py-1 font-mono text-foreground/80" title={cell(r[c])}>{cell(r[c])}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: change feed */}
        <div className="flex w-80 shrink-0 flex-col rounded-xl border border-border bg-background/50">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-sm font-semibold text-foreground">即時變更</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={['size-1.5 rounded-full', auto ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'].join(' ')} />
              {audit.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {audit.length === 0 ? (
              <div className="px-2 py-8 text-center text-xs text-muted-foreground">操作前端時，這裡會即時跳出每筆 DB 變更</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {audit.map((e) => (
                  <li
                    key={e.id}
                    className={[
                      'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      newIds.has(e.id) ? 'border-gold/50 bg-gold/10 dark:border-[#ff4d4f]/40 dark:bg-[#ff4d4f]/10' : 'border-border/60 bg-background',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className={['rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1', OP_STYLE[e.op] ?? 'bg-muted text-muted-foreground ring-border'].join(' ')}>
                          {OP_LABEL[e.op] ?? e.op}
                        </span>
                        <span className="font-mono font-medium text-foreground">{e.table_name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{fmtTime(e.created_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">#{shortId(e.row_id)}</span>
                      {e.op === 'UPDATE' && e.changed_columns && e.changed_columns.length > 0 && (
                        <span className="text-foreground/70">改：{e.changed_columns.join(', ')}</span>
                      )}
                      {(e.op === 'INSERT' || e.op === 'DELETE') && (
                        <span className="truncate text-foreground/70">{rowLabel(e.new_data ?? e.old_data)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
