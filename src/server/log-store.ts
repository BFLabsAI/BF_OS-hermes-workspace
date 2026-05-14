/**
 * Centralized log store — intercepts console.* and fans out to SSE subscribers.
 *
 * Auto-initialised on first import. Call ensureLogStoreStarted() in any API
 * route that needs logs to be available.
 *
 * Persistence: appends to ~/.hermes/workspace-logs.jsonl (NDJSON).
 * In-memory: ring buffer of last LOG_RING_SIZE entries.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  source: string
  msg: string
  args?: string
}

const LOG_RING_SIZE = 5_000
const LOG_FILE = join(homedir(), '.hermes', 'workspace-logs.jsonl')

// Use globalThis so state is shared across Vite chunk boundaries.
// Each chunk that imports log-store gets a fresh module instance but they
// all read/write the same globalThis namespace.
interface LogStoreGlobal {
  nextId: number
  ring: LogEntry[]
  subscribers: Set<(entry: LogEntry) => void>
  fileWriteQueue: LogEntry[]
  flushScheduled: boolean
  initialised: boolean
  writing: boolean
}

const _gk = '__hermesLogStore'
function getG(): LogStoreGlobal {
  const g = globalThis as Record<string, unknown>
  if (!g[_gk]) {
    g[_gk] = {
      nextId: 1,
      ring: [] as LogEntry[],
      subscribers: new Set<(entry: LogEntry) => void>(),
      fileWriteQueue: [] as LogEntry[],
      flushScheduled: false,
      initialised: false,
      writing: false,
    } satisfies LogStoreGlobal
  }
  return g[_gk] as LogStoreGlobal
}

function scheduleFlush() {
  const g = getG()
  if (g.flushScheduled) return
  g.flushScheduled = true
  setImmediate(async () => {
    g.flushScheduled = false
    const batch = g.fileWriteQueue.splice(0)
    if (!batch.length) return
    const chunk = batch.map((e) => JSON.stringify(e)).join('\n') + '\n'
    try {
      await appendFile(LOG_FILE, chunk, 'utf8')
    } catch {
      // best-effort
    }
  })
}

function capture(level: LogLevel, source: string, args: unknown[]) {
  const g = getG()
  if (g.writing) return
  g.writing = true
  try {
    const msg = args
      .map((a) =>
        a instanceof Error
          ? `${a.message}\n${a.stack ?? ''}`
          : typeof a === 'string'
            ? a
            : JSON.stringify(a, null, 0),
      )
      .join(' ')

    const entry: LogEntry = { id: g.nextId++, ts: Date.now(), level, source, msg }
    g.ring.push(entry)
    if (g.ring.length > LOG_RING_SIZE) g.ring.shift()

    g.fileWriteQueue.push(entry)
    scheduleFlush()

    for (const cb of g.subscribers) {
      try {
        cb(entry)
      } catch {
        // ignore broken subscriber
      }
    }
  } finally {
    g.writing = false
  }
}

export function ensureLogStoreStarted() {
  const g = getG()
  if (g.initialised) return
  g.initialised = true

  // Ensure log dir
  mkdir(join(homedir(), '.hermes'), { recursive: true }).catch(() => {})

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  const tag = (args: unknown[]): string => {
    if (typeof args[0] === 'string' && args[0].startsWith('[')) {
      const m = args[0].match(/^\[([^\]]+)\]/)
      return m ? m[1] : 'server'
    }
    return 'server'
  }

  console.log = (...args: unknown[]) => {
    orig.log(...args)
    capture('info', tag(args), args)
  }
  console.info = (...args: unknown[]) => {
    orig.info(...args)
    capture('info', tag(args), args)
  }
  console.warn = (...args: unknown[]) => {
    orig.warn(...args)
    capture('warn', tag(args), args)
  }
  console.error = (...args: unknown[]) => {
    orig.error(...args)
    capture('error', tag(args), args)
  }
  console.debug = (...args: unknown[]) => {
    orig.debug(...args)
    capture('debug', tag(args), args)
  }

  capture('info', 'log-store', ['Log store initialised'])
}

export function subscribeToLogs(cb: (entry: LogEntry) => void): () => void {
  const g = getG()
  g.subscribers.add(cb)
  return () => g.subscribers.delete(cb)
}

export interface LogQuery {
  limit?: number
  level?: LogLevel | 'all'
  search?: string
  since?: number
}

export function getRecentLogs(query: LogQuery = {}): LogEntry[] {
  const { limit = 500, level = 'all', search, since } = query
  let results = getG().ring.slice()
  if (since !== undefined) results = results.filter((e) => e.id > since)
  if (level !== 'all') results = results.filter((e) => e.level === level)
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (e) => e.msg.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
    )
  }
  return results.slice(-limit)
}

export async function getLogsFromFile(query: LogQuery = {}): Promise<LogEntry[]> {
  try {
    const raw = await readFile(LOG_FILE, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    let entries: LogEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as LogEntry)
      } catch {
        // skip corrupt lines
      }
    }
    const { limit = 2000, level = 'all', search } = query
    if (level !== 'all') entries = entries.filter((e) => e.level === level)
    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter(
        (e) => e.msg.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
      )
    }
    return entries.slice(-limit)
  } catch {
    return []
  }
}
