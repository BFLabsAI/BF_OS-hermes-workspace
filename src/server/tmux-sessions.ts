/**
 * tmux-backed terminal multiplexer.
 *
 * Each "tab" in the UI maps to one tmux session named `hermes-<tabId>`.
 * Each pane inside the session is identified by tmux's pane id (e.g. `%5`).
 *
 * Streaming model:
 *   - Each pane runs `tmux pipe-pane -o -t <paneId> "cat > <fifo>"` so new
 *     output is mirrored to a FIFO on disk.
 *   - The Node side opens the FIFO for reading and emits 'data' events.
 *   - Input is sent via `tmux send-keys -t <paneId> -l "<data>"` (literal mode).
 *   - Resize is per-pane via `tmux resize-window -t <session> -x <cols> -y <rows>`.
 *
 * Lifecycle:
 *   - Module init calls killOrphanHermesSessions() to wipe leftovers.
 *   - process.on('SIGTERM'|'SIGINT') replays the cleanup before exiting.
 */
import { spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SESSION_PREFIX = 'hermes-'
const FIFO_DIR = join(tmpdir(), 'hermes-tmux-fifos')

if (!existsSync(FIFO_DIR)) {
  mkdirSync(FIFO_DIR, { recursive: true })
}

type PaneRecord = {
  paneId: string // tmux pane id, e.g. "%5"
  sessionName: string
  fifoPath: string
  closeFifo: () => Promise<void>
  emitter: EventEmitter
}

type SessionRecord = {
  tabId: string
  sessionName: string
  name?: string // human label
  panes: Map<string, PaneRecord>
  createdAt: number
}

// Share state across module instances. Both the bundled REST handlers
// (in dist/server/server.js) and the tsx-loaded WebSocket module
// (src/server/tmux-ws.ts) import this file separately and would otherwise
// each have their own copy of these maps — causing the WS to never see
// panes created via REST and vice versa.
type GlobalStore = {
  sessions: Map<string, SessionRecord>
  panesByPaneId: Map<string, PaneRecord>
  tabIdByPaneId: Map<string, string>
  cleanedOrphans: boolean
  shutdownHooked: boolean
}
const globalKey = Symbol.for('hermes.tmux-sessions.store')
const g = globalThis as unknown as Record<symbol, GlobalStore>
if (!g[globalKey]) {
  g[globalKey] = {
    sessions: new Map(),
    panesByPaneId: new Map(),
    tabIdByPaneId: new Map(),
    cleanedOrphans: false,
    shutdownHooked: false,
  }
}
const store = g[globalKey]
const sessions = store.sessions
const panesByPaneId = store.panesByPaneId
const tabIdByPaneId = store.tabIdByPaneId

// ---------------------------------------------------------------------------
// Low-level tmux exec helpers
// ---------------------------------------------------------------------------

function tmuxExec(args: Array<string>): { stdout: string; code: number } {
  const result = spawnSync('tmux', args, { encoding: 'utf8' })
  return {
    stdout: result.stdout?.trim() ?? '',
    code: result.status ?? 1,
  }
}

function tmuxExecOrThrow(args: Array<string>): string {
  const r = spawnSync('tmux', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(
      `tmux ${args.join(' ')} failed (code ${r.status}): ${r.stderr?.trim()}`,
    )
  }
  return r.stdout?.trim() ?? ''
}

function sessionNameFor(tabId: string): string {
  return `${SESSION_PREFIX}${tabId}`
}

function makeFifo(paneId: string): string {
  const safePaneId = paneId.replace(/[^a-zA-Z0-9]/g, '_')
  const fifoPath = join(FIFO_DIR, `pane-${safePaneId}.fifo`)
  // Remove any stale file/fifo
  try {
    spawnSync('rm', ['-f', fifoPath])
  } catch {
    /* */
  }
  const r = spawnSync('mkfifo', [fifoPath])
  if (r.status !== 0) {
    throw new Error(`mkfifo failed for ${fifoPath}: ${r.stderr?.toString()}`)
  }
  return fifoPath
}

// ---------------------------------------------------------------------------
// Pane streaming
// ---------------------------------------------------------------------------

async function attachPaneStream(pane: PaneRecord): Promise<void> {
  // Set up tmux pipe-pane → FIFO
  tmuxExecOrThrow([
    'pipe-pane',
    '-o',
    '-t',
    pane.paneId,
    `cat > '${pane.fifoPath}'`,
  ])

  // Open FIFO for reading (non-blocking).
  // The reader stays open even when no writers; tmux is the writer side.
  const handle = await open(pane.fifoPath, 'r+') // r+ so it doesn't block waiting for writer
  const readStream = handle.createReadStream({ highWaterMark: 64 * 1024 })

  readStream.on('data', (chunk: Buffer | string) => {
    const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    pane.emitter.emit('data', data)
  })

  readStream.on('error', (err) => {
    pane.emitter.emit('error', err)
  })

  pane.closeFifo = async () => {
    try {
      readStream.destroy()
      await handle.close()
    } catch {
      /* */
    }
    try {
      await unlink(pane.fifoPath)
    } catch {
      /* */
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CreateSessionResult = {
  tabId: string
  sessionName: string
  paneId: string
}

export async function createSession(params: {
  tabId: string
  name?: string
  cwd?: string
  cols?: number
  rows?: number
}): Promise<CreateSessionResult> {
  const { tabId, name, cwd, cols, rows } = params
  const sessionName = sessionNameFor(tabId)

  if (sessions.has(tabId)) {
    throw new Error(`Session for tabId ${tabId} already exists`)
  }

  const shell = process.env.SHELL ?? '/bin/bash'
  const home = process.env.HOME ?? '/tmp'
  const startDir = (cwd ?? home).replace(/^~/, home)

  // Create detached session
  tmuxExecOrThrow([
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    startDir,
    '-x',
    String(cols ?? 120),
    '-y',
    String(rows ?? 30),
    shell,
  ])

  // Get the initial pane id
  const paneId = tmuxExecOrThrow([
    'list-panes',
    '-t',
    sessionName,
    '-F',
    '#{pane_id}',
  ]).split('\n')[0]

  const fifoPath = makeFifo(paneId)
  const pane: PaneRecord = {
    paneId,
    sessionName,
    fifoPath,
    emitter: new EventEmitter(),
    closeFifo: async () => {},
  }

  await attachPaneStream(pane)

  const session: SessionRecord = {
    tabId,
    sessionName,
    name,
    panes: new Map([[paneId, pane]]),
    createdAt: Date.now(),
  }
  sessions.set(tabId, session)
  panesByPaneId.set(paneId, pane)
  tabIdByPaneId.set(paneId, tabId)

  // Replay backlog: tmux pipe-pane only mirrors NEW output. The shell prompt
  // is usually already drawn by now. Capture the current buffer and emit it
  // so the client sees what's there.
  setImmediate(() => {
    try {
      const initial = tmuxExec([
        'capture-pane',
        '-t',
        paneId,
        '-p',
        '-e', // include escape sequences (colors)
        '-J', // preserve trailing spaces
      ]).stdout
      if (initial) {
        pane.emitter.emit('data', initial + '\r\n')
      }
    } catch {
      /* */
    }
  })

  return { tabId, sessionName, paneId }
}

export function killSession(tabId: string): boolean {
  const session = sessions.get(tabId)
  if (!session) return false

  // Cleanup panes
  for (const pane of session.panes.values()) {
    void pane.closeFifo()
    panesByPaneId.delete(pane.paneId)
    tabIdByPaneId.delete(pane.paneId)
  }
  sessions.delete(tabId)

  tmuxExec(['kill-session', '-t', session.sessionName])
  return true
}

export function renameSession(tabId: string, name: string): boolean {
  const session = sessions.get(tabId)
  if (!session) return false
  session.name = name
  // tmux session names can't have spaces/special chars, so only rename the
  // human label. We could optionally tmux rename-session to a sanitized
  // version, but that breaks our `hermes-<uuid>` lookup convention.
  return true
}

export async function splitPane(params: {
  paneId: string
  direction: 'h' | 'v'
}): Promise<{ paneId: string }> {
  const { paneId, direction } = params
  const flag = direction === 'h' ? '-h' : '-v'

  const sourcePane = panesByPaneId.get(paneId)
  if (!sourcePane) throw new Error(`Pane ${paneId} not found`)

  const newPaneId = tmuxExecOrThrow([
    'split-window',
    flag,
    '-t',
    paneId,
    '-P', // print the new pane info
    '-F',
    '#{pane_id}',
  ])

  const fifoPath = makeFifo(newPaneId)
  const pane: PaneRecord = {
    paneId: newPaneId,
    sessionName: sourcePane.sessionName,
    fifoPath,
    emitter: new EventEmitter(),
    closeFifo: async () => {},
  }
  await attachPaneStream(pane)

  const tabId = tabIdByPaneId.get(paneId)!
  const session = sessions.get(tabId)!
  session.panes.set(newPaneId, pane)
  panesByPaneId.set(newPaneId, pane)
  tabIdByPaneId.set(newPaneId, tabId)

  return { paneId: newPaneId }
}

export function killPane(paneId: string): boolean {
  const pane = panesByPaneId.get(paneId)
  if (!pane) return false

  const tabId = tabIdByPaneId.get(paneId)
  void pane.closeFifo()
  panesByPaneId.delete(paneId)
  tabIdByPaneId.delete(paneId)
  if (tabId) {
    const session = sessions.get(tabId)
    session?.panes.delete(paneId)
  }

  tmuxExec(['kill-pane', '-t', paneId])
  return true
}

export function capturePane(paneId: string, lines: number = 1000): string {
  const pane = panesByPaneId.get(paneId)
  if (!pane) {
    // Allow capture by tmux pane id even if not tracked (resilience)
    const r = tmuxExec([
      'capture-pane',
      '-t',
      paneId,
      '-p',
      '-S',
      `-${lines}`,
      '-J',
    ])
    return r.stdout
  }
  const r = tmuxExec([
    'capture-pane',
    '-t',
    paneId,
    '-p',
    '-S',
    `-${lines}`,
    '-J',
  ])
  return r.stdout
}

export function sendInput(paneId: string, data: string): boolean {
  const pane = panesByPaneId.get(paneId)
  if (!pane) return false
  // -l = literal mode (don't translate key names like "Enter")
  // We pass the raw bytes; xterm.js already encodes Enter as \r, Ctrl-C as \x03, etc.
  const r = spawnSync('tmux', ['send-keys', '-t', paneId, '-l', data], {
    encoding: 'utf8',
  })
  return r.status === 0
}

export function sendCommand(
  paneIdOrName: string,
  command: string,
  submit: boolean = true,
): boolean {
  const paneId = resolvePaneIdentifier(paneIdOrName)
  if (!paneId) return false
  if (!sendInput(paneId, command)) return false
  if (submit) {
    spawnSync('tmux', ['send-keys', '-t', paneId, 'Enter'])
  }
  return true
}

export function resizePane(
  paneId: string,
  cols: number,
  rows: number,
): boolean {
  const pane = panesByPaneId.get(paneId)
  if (!pane) return false
  const r = tmuxExec([
    'resize-window',
    '-t',
    pane.sessionName,
    '-x',
    String(cols),
    '-y',
    String(rows),
  ])
  return r.code === 0
}

export function subscribePane(
  paneId: string,
  onData: (chunk: string) => void,
  onExit?: () => void,
): () => void {
  const pane = panesByPaneId.get(paneId)
  if (!pane) {
    if (onExit) setImmediate(onExit)
    return () => {}
  }
  pane.emitter.on('data', onData)
  if (onExit) pane.emitter.once('exit', onExit)
  return () => {
    pane.emitter.off('data', onData)
    if (onExit) pane.emitter.off('exit', onExit)
  }
}

export type ListedPane = {
  paneId: string
  tabId: string
  sessionName: string
  name?: string
  active: boolean
}

export function listAll(): Array<{
  tabId: string
  sessionName: string
  name?: string
  panes: Array<{ paneId: string; active: boolean; title?: string }>
}> {
  const result: Array<{
    tabId: string
    sessionName: string
    name?: string
    panes: Array<{ paneId: string; active: boolean; title?: string }>
  }> = []

  for (const session of sessions.values()) {
    const paneInfo = tmuxExec([
      'list-panes',
      '-t',
      session.sessionName,
      '-F',
      '#{pane_id}|#{pane_active}|#{pane_title}',
    ]).stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [paneId, active, title] = line.split('|')
        return {
          paneId,
          active: active === '1',
          title: title || undefined,
        }
      })

    result.push({
      tabId: session.tabId,
      sessionName: session.sessionName,
      name: session.name,
      panes: paneInfo,
    })
  }
  return result
}

export function resolvePaneIdentifier(idOrName: string): string | null {
  // Direct pane id (starts with %)
  if (idOrName.startsWith('%') && panesByPaneId.has(idOrName)) return idOrName
  // Tab name → first pane
  for (const session of sessions.values()) {
    if (session.name === idOrName || session.tabId === idOrName) {
      const first = [...session.panes.keys()][0]
      if (first) return first
    }
  }
  return null
}

export function getPaneByTabId(tabId: string): string | null {
  const session = sessions.get(tabId)
  if (!session) return null
  return [...session.panes.keys()][0] ?? null
}

// ---------------------------------------------------------------------------
// Startup cleanup
// ---------------------------------------------------------------------------

export function killOrphanHermesSessions(): void {
  const r = tmuxExec(['list-sessions', '-F', '#{session_name}'])
  if (r.code !== 0) return
  for (const name of r.stdout.split('\n')) {
    if (name.startsWith(SESSION_PREFIX)) {
      tmuxExec(['kill-session', '-t', name])
    }
  }
}

// Run cleanup at module init (only once across all import instances)
if (!store.cleanedOrphans) {
  store.cleanedOrphans = true
  killOrphanHermesSessions()
}

function hookShutdown() {
  if (store.shutdownHooked) return
  store.shutdownHooked = true
  const onShutdown = () => {
    for (const tabId of [...sessions.keys()]) killSession(tabId)
  }
  process.once('SIGINT', onShutdown)
  process.once('SIGTERM', onShutdown)
  process.once('beforeExit', onShutdown)
}
hookShutdown()
