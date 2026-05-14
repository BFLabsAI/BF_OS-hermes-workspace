/**
 * Tails ~/.hermes/logs/*.log files and fans out new lines to SSE subscribers.
 * Uses fs.watch + byte-offset tracking to detect appended content.
 */
import { createReadStream, watch } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type HermesLogSource = 'agent' | 'errors' | 'gateway'

export interface HermesLogLine {
  id: number
  ts: number
  source: HermesLogSource
  raw: string
  level: 'debug' | 'info' | 'warn' | 'error'
}

const LOG_DIR = join(homedir(), '.hermes', 'logs')
const LOG_FILES: Record<HermesLogSource, string> = {
  agent: join(LOG_DIR, 'agent.log'),
  errors: join(LOG_DIR, 'errors.log'),
  gateway: join(LOG_DIR, 'gateway.log'),
}

const TAIL_LINES = 300
const RING_SIZE = 5_000

interface TailerGlobal {
  nextId: number
  ring: HermesLogLine[]
  subscribers: Set<(line: HermesLogLine) => void>
  started: boolean
}
const _gk = '__hermesTailer'
function getG(): TailerGlobal {
  const g = globalThis as Record<string, unknown>
  if (!g[_gk]) {
    g[_gk] = {
      nextId: 1,
      ring: [] as HermesLogLine[],
      subscribers: new Set<(line: HermesLogLine) => void>(),
      started: false,
    } satisfies TailerGlobal
  }
  return g[_gk] as TailerGlobal
}

function detectLevel(raw: string): HermesLogLine['level'] {
  const u = raw.toUpperCase()
  if (u.includes(' ERROR ') || u.includes('CRITICAL') || u.includes('FATAL')) return 'error'
  if (u.includes(' WARNING ') || u.includes(' WARN ')) return 'warn'
  if (u.includes(' DEBUG ')) return 'debug'
  return 'info'
}

function emit(source: HermesLogSource, raw: string) {
  if (!raw.trim()) return
  const g = getG()
  const line: HermesLogLine = {
    id: g.nextId++,
    ts: Date.now(),
    source,
    raw: raw.trimEnd(),
    level: detectLevel(raw),
  }
  g.ring.push(line)
  if (g.ring.length > RING_SIZE) g.ring.shift()
  for (const cb of g.subscribers) {
    try { cb(line) } catch { /* ignore */ }
  }
}

// Read last N lines of a file without loading the whole file
async function tailFile(path: string, lines: number): Promise<string[]> {
  let fh: Awaited<ReturnType<typeof open>> | null = null
  try {
    fh = await open(path, 'r')
    const { size } = await fh.stat()
    if (size === 0) return []
    const chunkSize = Math.min(size, lines * 200)
    const start = Math.max(0, size - chunkSize)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    const text = buf.toString('utf8')
    const all = text.split('\n')
    return all.slice(-lines - 1).filter(Boolean)
  } catch {
    return []
  } finally {
    await fh?.close()
  }
}

// Watch a single file for new appended content
async function watchFile(source: HermesLogSource, path: string) {
  let offset = 0
  try {
    const s = await stat(path)
    offset = s.size
  } catch {
    return
  }

  let partial = ''
  const watcher = watch(path, { persistent: false }, async (event) => {
    if (event !== 'change') return
    try {
      const s = await stat(path)
      if (s.size <= offset) {
        // truncated / rotated
        offset = 0
        partial = ''
        return
      }
      const newBytes = s.size - offset
      const buf = Buffer.alloc(newBytes)
      const fh = await open(path, 'r')
      try {
        await fh.read(buf, 0, newBytes, offset)
      } finally {
        await fh.close()
      }
      offset = s.size
      const chunk = partial + buf.toString('utf8')
      const lines = chunk.split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        emit(source, line)
      }
    } catch {
      // file may be temporarily unavailable
    }
  })

  return watcher
}

export async function ensureHermesLogTailerStarted() {
  const g = getG()
  if (g.started) return
  g.started = true

  // Load initial tail for each source
  for (const [src, path] of Object.entries(LOG_FILES) as [HermesLogSource, string][]) {
    const lines = await tailFile(path, TAIL_LINES)
    for (const line of lines) {
      emit(src, line)
    }
  }

  // Start watchers
  for (const [src, path] of Object.entries(LOG_FILES) as [HermesLogSource, string][]) {
    watchFile(src, path).catch(() => {})
  }
}

export function subscribeToHermesLogs(cb: (line: HermesLogLine) => void): () => void {
  const g = getG()
  g.subscribers.add(cb)
  return () => g.subscribers.delete(cb)
}

export interface HermesLogQuery {
  limit?: number
  source?: HermesLogSource | 'all'
  level?: HermesLogLine['level'] | 'all'
  search?: string
  since?: number
}

export function getRecentHermesLogs(query: HermesLogQuery = {}): HermesLogLine[] {
  const { limit = 500, source = 'all', level = 'all', search, since } = query
  let results = getG().ring.slice()
  if (since !== undefined) results = results.filter((e) => e.id > since)
  if (source !== 'all') results = results.filter((e) => e.source === source)
  if (level !== 'all') results = results.filter((e) => e.level === level)
  if (search) {
    const q = search.toLowerCase()
    results = results.filter((e) => e.raw.toLowerCase().includes(q))
  }
  return results.slice(-limit)
}
