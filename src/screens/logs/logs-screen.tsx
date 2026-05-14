import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { LogLevel, LogEntry } from '@/server/log-store'
import type { HermesLogLine, HermesLogSource } from '@/server/hermes-log-tailer'

// ─── Shared helpers ──────────────────────────────────────────────────────────

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_STYLE: Record<Level, string> = {
  debug: 'text-[var(--theme-muted)]',
  info:  'text-[var(--theme-text)]',
  warn:  'text-amber-400',
  error: 'text-rose-400',
}

const LEVEL_BADGE: Record<Level, string> = {
  debug: 'bg-[var(--theme-hover)] text-[var(--theme-muted)]',
  info:  'bg-sky-500/15 text-sky-400',
  warn:  'bg-amber-500/15 text-amber-400',
  error: 'bg-rose-500/15 text-rose-400',
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

interface ToolbarProps {
  live: boolean
  connected: boolean
  onToggleLive: () => void
  levelFilter: Level | 'all'
  onLevelFilter: (l: Level | 'all') => void
  search: string
  onSearch: (s: string) => void
  extraFilters?: React.ReactNode
  shown: number
  total: number
  onClear: () => void
  autoScroll: boolean
  onScrollToBottom: () => void
}

function Toolbar({
  live, connected, onToggleLive, levelFilter, onLevelFilter,
  search, onSearch, extraFilters, shown, total, onClear, autoScroll, onScrollToBottom,
}: ToolbarProps) {
  const LEVELS: Array<Level | 'all'> = ['all', 'error', 'warn', 'info', 'debug']
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--theme-border)] shrink-0 flex-wrap bg-[var(--theme-sidebar)]">
      <button
        onClick={onToggleLive}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
          live
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-[var(--theme-hover)] text-[var(--theme-muted)] border border-[var(--theme-border)]',
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', live && connected ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--theme-muted)]')} />
        {live ? (connected ? 'Live' : 'Connecting…') : 'Paused'}
      </button>

      <div className="flex items-center gap-1">
        {LEVELS.map((l) => (
          <button key={l} onClick={() => onLevelFilter(l)}
            className={cn('px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors',
              levelFilter === l
                ? 'bg-[var(--theme-accent)] text-white'
                : 'bg-[var(--theme-hover)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
            )}
          >{l}</button>
        ))}
      </div>

      {extraFilters}

      <input type="text" value={search} onChange={(e) => onSearch(e.target.value)}
        placeholder="filter…"
        className="flex-1 min-w-[120px] max-w-xs bg-[var(--theme-card)] border border-[var(--theme-border)] rounded px-2 py-0.5 text-[11px] placeholder:text-[var(--theme-muted)] focus:outline-none focus:border-[var(--theme-accent)]"
      />

      <span className="text-[var(--theme-muted)] text-[10px] tabular-nums">{shown} / {total}</span>

      <button onClick={onClear}
        className="px-2 py-0.5 rounded text-[10px] bg-[var(--theme-hover)] text-[var(--theme-muted)] hover:text-rose-400 transition-colors"
      >Clear</button>

      {!autoScroll && (
        <button onClick={onScrollToBottom}
          className="px-2 py-0.5 rounded text-[10px] bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] border border-[var(--theme-accent)]/30 hover:bg-[var(--theme-accent)]/30 transition-colors"
        >↓ Bottom</button>
      )}
    </div>
  )
}

interface LogTableProps {
  rows: Array<{ id: number; ts: number; level: Level; label: string; text: string }>
  bottomRef: React.RefObject<HTMLDivElement | null>
  listRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}

function LogTable({ rows, bottomRef, listRef, onScroll }: LogTableProps) {
  return (
    <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-auto">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-[var(--theme-muted)] gap-2">
          <span className="text-2xl opacity-30">◎</span>
          <span>Waiting for logs…</span>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}
                className={cn('border-b border-[var(--theme-border)]/30 hover:bg-[var(--theme-hover)] transition-colors',
                  e.level === 'error' && 'bg-rose-500/5',
                  e.level === 'warn' && 'bg-amber-500/5',
                )}
              >
                <td className="px-3 py-0.5 whitespace-nowrap text-[var(--theme-muted)] tabular-nums w-[90px] shrink-0 text-[11px]">
                  {fmtTime(e.ts)}
                </td>
                <td className="px-1 py-0.5 w-[52px] shrink-0">
                  <span className={cn('inline-block px-1.5 rounded text-[9px] font-bold uppercase', LEVEL_BADGE[e.level])}>
                    {e.level}
                  </span>
                </td>
                <td className="px-1 py-0.5 whitespace-nowrap text-[var(--theme-muted)] w-[100px] shrink-0 truncate max-w-[100px] text-[10px]">
                  {e.label}
                </td>
                <td className={cn('px-2 py-0.5 break-all whitespace-pre-wrap text-[11px]', LEVEL_STYLE[e.level])}>
                  {e.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// ─── Workspace logs tab ───────────────────────────────────────────────────────

function WorkspaceLogs() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [search, setSearch] = useState('')
  const [live, setLive] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [connected, setConnected] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    if (!live) { setConnected(false); return }
    const url = new URL('/api/logs-stream', window.location.origin)
    url.searchParams.set('tail', '500')
    const es = new EventSource(url.toString())
    es.addEventListener('connected', () => setConnected(true))
    es.addEventListener('log', (e) => {
      if (!liveRef.current) return
      try {
        const entry = JSON.parse((e as MessageEvent).data) as LogEntry
        setEntries((prev) => { const n = [...prev, entry]; return n.length > 10_000 ? n.slice(-10_000) : n })
      } catch { /* ignore */ }
    })
    es.onerror = () => setConnected(false)
    return () => { es.close(); setConnected(false) }
  }, [live])

  useEffect(() => {
    if (!live) {
      fetch('/api/logs?limit=2000').then((r) => r.json()).then((d: { entries: LogEntry[] }) => setEntries(d.entries)).catch(() => {})
    }
  }, [live])

  useEffect(() => { if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'instant' }) }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    const el = listRef.current; if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }, [])

  const filtered = entries.filter((e) => {
    if (level !== 'all' && e.level !== level) return false
    if (search) { const q = search.toLowerCase(); return e.msg.toLowerCase().includes(q) || e.source.toLowerCase().includes(q) }
    return true
  })

  const rows = filtered.map((e) => ({ id: e.id, ts: e.ts, level: e.level as Level, label: e.source, text: e.msg }))

  return (
    <div className="flex flex-col h-full min-h-0">
      <Toolbar
        live={live} connected={connected} onToggleLive={() => setLive((v) => !v)}
        levelFilter={level} onLevelFilter={(l) => setLevel(l as LogLevel | 'all')}
        search={search} onSearch={setSearch}
        shown={filtered.length} total={entries.length}
        onClear={() => setEntries([])}
        autoScroll={autoScroll}
        onScrollToBottom={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
      />
      <LogTable rows={rows} bottomRef={bottomRef} listRef={listRef} onScroll={handleScroll} />
    </div>
  )
}

// ─── Hermes logs tab ─────────────────────────────────────────────────────────

const HERMES_SOURCES: Array<{ value: HermesLogSource | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'agent', label: 'Agent' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'errors', label: 'Errors' },
]

const SOURCE_COLOR: Record<HermesLogSource, string> = {
  agent:   'text-violet-400',
  gateway: 'text-sky-400',
  errors:  'text-rose-400',
}

function HermesLogs() {
  const [entries, setEntries] = useState<HermesLogLine[]>([])
  const [level, setLevel] = useState<Level | 'all'>('all')
  const [source, setSource] = useState<HermesLogSource | 'all'>('all')
  const [search, setSearch] = useState('')
  const [live, setLive] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [connected, setConnected] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    if (!live) { setConnected(false); return }
    const url = new URL('/api/hermes-logs-stream', window.location.origin)
    url.searchParams.set('tail', '300')
    const es = new EventSource(url.toString())
    es.addEventListener('connected', () => setConnected(true))
    es.addEventListener('log', (e) => {
      if (!liveRef.current) return
      try {
        const entry = JSON.parse((e as MessageEvent).data) as HermesLogLine
        setEntries((prev) => { const n = [...prev, entry]; return n.length > 10_000 ? n.slice(-10_000) : n })
      } catch { /* ignore */ }
    })
    es.onerror = () => setConnected(false)
    return () => { es.close(); setConnected(false) }
  }, [live])

  useEffect(() => {
    if (!live) {
      fetch('/api/hermes-logs?limit=2000').then((r) => r.json()).then((d: { entries: HermesLogLine[] }) => setEntries(d.entries)).catch(() => {})
    }
  }, [live])

  useEffect(() => { if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'instant' }) }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    const el = listRef.current; if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }, [])

  const filtered = entries.filter((e) => {
    if (level !== 'all' && e.level !== level) return false
    if (source !== 'all' && e.source !== source) return false
    if (search) { const q = search.toLowerCase(); return e.raw.toLowerCase().includes(q) }
    return true
  })

  const rows = filtered.map((e) => ({ id: e.id, ts: e.ts, level: e.level as Level, label: e.source, text: e.raw }))

  const sourceFilter = (
    <div className="flex items-center gap-1">
      {HERMES_SOURCES.map((s) => (
        <button key={s.value} onClick={() => setSource(s.value)}
          className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
            source === s.value
              ? 'bg-[var(--theme-accent)] text-white'
              : 'bg-[var(--theme-hover)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
          )}
        >{s.label}</button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <Toolbar
        live={live} connected={connected} onToggleLive={() => setLive((v) => !v)}
        levelFilter={level} onLevelFilter={setLevel}
        search={search} onSearch={setSearch}
        extraFilters={sourceFilter}
        shown={filtered.length} total={entries.length}
        onClear={() => setEntries([])}
        autoScroll={autoScroll}
        onScrollToBottom={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
      />
      <LogTable rows={rows} bottomRef={bottomRef} listRef={listRef} onScroll={handleScroll} />
    </div>
  )
}

// ─── Root screen ─────────────────────────────────────────────────────────────

type Tab = 'workspace' | 'hermes'

export function LogsScreen() {
  const [tab, setTab] = useState<Tab>('workspace')

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg)] font-mono text-xs">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-[var(--theme-border)] shrink-0 px-3 bg-[var(--theme-sidebar)]">
        {([
          { id: 'workspace', label: 'Workspace Logs' },
          { id: 'hermes',    label: 'Hermes Logs' },
        ] as Array<{ id: Tab; label: string }>).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px',
              tab === t.id
                ? 'border-[var(--theme-accent)] text-[var(--theme-accent)]'
                : 'border-transparent text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — keep both mounted so SSE stays connected */}
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'workspace' && 'hidden')}>
        <WorkspaceLogs />
      </div>
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'hermes' && 'hidden')}>
        <HermesLogs />
      </div>
    </div>
  )
}
