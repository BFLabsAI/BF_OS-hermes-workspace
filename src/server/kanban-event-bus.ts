/**
 * Kanban event bus — maintains a single upstream WebSocket to the
 * dashboard plugin's /api/plugins/kanban/events feed and fans out
 * received events to browser subscribers (consumed via SSE at
 * /api/kanban-events).
 *
 * The upstream stream batches events from task_events and ships them in
 * frames of up to 200/frame, polling every ~300ms. Each event has shape:
 *   { id, task_id, run_id, kind, payload, created_at }
 *
 * We hold the `latest_event_id` watermark in module state so reconnects
 * resume cleanly without replaying the world.
 */

import WebSocket from 'ws'
import type { RawData } from 'ws'
import {
  HERMES_DASHBOARD_URL,
  getDashboardToken,
} from './gateway-capabilities'
import type { KanbanEvent } from '../lib/kanban-types'

export interface KanbanSseEvent {
  event: string
  data: Record<string, unknown>
}

type Subscriber = (event: KanbanSseEvent) => void

// ── Singleton state (survives Vite HMR via globalThis) ───────────────

const BUS_KEY = '__hermes_kanban_event_bus__' as const

interface BusState {
  subscribers: Set<Subscriber>
  ws: WebSocket | null
  connecting: boolean
  lastEventId: number
  board: string | undefined
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  startedAt: number
  /** One-shot flag to bust the cached token on the next reconnect. */
  didForceRefresh: boolean
}

function getBus(): BusState {
  const g = globalThis as Record<string, unknown>
  if (!g[BUS_KEY]) {
    g[BUS_KEY] = {
      subscribers: new Set<Subscriber>(),
      ws: null,
      connecting: false,
      lastEventId: 0,
      board: undefined,
      reconnectTimer: null,
      reconnectDelayMs: 1000,
      startedAt: 0,
      didForceRefresh: false,
    } satisfies BusState
  }
  return g[BUS_KEY] as BusState
}

function broadcast(event: string, data: Record<string, unknown>): void {
  const bus = getBus()
  for (const sub of bus.subscribers) {
    try {
      sub({ event, data })
    } catch {
      // ignore subscriber errors
    }
  }
}

function isKanbanEvent(value: unknown): value is KanbanEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    'task_id' in value &&
    'kind' in value
  )
}

function handleFrame(raw: RawData): void {
  const bus = getBus()
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))
  } catch {
    return
  }

  const events: KanbanEvent[] = []
  if (Array.isArray(parsed)) {
    for (const item of parsed) if (isKanbanEvent(item)) events.push(item)
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.events)) {
      for (const item of obj.events) if (isKanbanEvent(item)) events.push(item)
    } else if (isKanbanEvent(parsed)) {
      events.push(parsed)
    }
  }

  for (const evt of events) {
    if (evt.id > bus.lastEventId) bus.lastEventId = evt.id
    broadcast(evt.kind, {
      id: evt.id,
      task_id: evt.task_id,
      run_id: evt.run_id,
      kind: evt.kind,
      payload: evt.payload,
      created_at: evt.created_at,
    })
  }
}

function scheduleReconnect(forceTokenRefresh = false): void {
  const bus = getBus()
  if (bus.reconnectTimer) return
  const delay = Math.min(bus.reconnectDelayMs, 30_000)
  bus.reconnectTimer = setTimeout(() => {
    bus.reconnectTimer = null
    bus.reconnectDelayMs = Math.min(bus.reconnectDelayMs * 2, 30_000)
    void connectUpstream(forceTokenRefresh)
  }, delay)
}

async function connectUpstream(forceTokenRefresh = false): Promise<void> {
  const bus = getBus()
  if (bus.connecting) return
  if (bus.ws && bus.ws.readyState === WebSocket.OPEN) return
  bus.connecting = true

  let token = ''
  try {
    token = await getDashboardToken(forceTokenRefresh ? { force: true } : undefined)
  } catch (err) {
    console.warn('[kanban-events] token fetch failed:', err)
    token = ''
  }

  const wsBase = HERMES_DASHBOARD_URL.replace(/^http/i, 'ws')
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (bus.lastEventId > 0) params.set('since', String(bus.lastEventId))
  if (bus.board) params.set('board', bus.board)
  const url = `${wsBase}/api/plugins/kanban/events?${params.toString()}`

  if (process.env.KANBAN_EVENTS_DEBUG === '1') {
    const masked = token ? `${token.slice(0, 4)}…${token.slice(-3)}` : '(empty)'
    console.log(`[kanban-events] connecting wsBase=${wsBase} token=${masked} since=${bus.lastEventId} board=${bus.board ?? '(default)'}`)
  }

  let ws: WebSocket
  try {
    ws = new WebSocket(url)
  } catch (err) {
    bus.connecting = false
    console.warn('[kanban-events] failed to construct WebSocket:', err)
    scheduleReconnect()
    return
  }

  bus.ws = ws

  ws.on('open', () => {
    bus.connecting = false
    bus.reconnectDelayMs = 1000
    // Successful open means whatever token we have is valid — allow another
    // refresh attempt on a future auth failure.
    bus.didForceRefresh = false
    broadcast('connected', { since: bus.lastEventId, ts: Date.now() })
  })

  ws.on('message', (data) => {
    handleFrame(data)
  })

  let lastErrorMessage = ''
  ws.on('error', (err) => {
    lastErrorMessage = err.message
    // Plenty of transient errors during reconnect — log once but don't spam
    if (process.env.KANBAN_EVENTS_DEBUG === '1') {
      console.warn('[kanban-events] WS error:', err.message)
    }
  })

  ws.on('close', (code, reason) => {
    bus.connecting = false
    bus.ws = null
    broadcast('disconnected', {
      code,
      reason: reason?.toString('utf-8') || '',
    })
    // If the upstream rejected us with 401/403, the cached token is stale.
    // Force a token refresh on the next reconnect (single shot).
    const looksLikeAuthFailure =
      /response:\s*40[13]/.test(lastErrorMessage) || code === 1008
    if (bus.subscribers.size > 0) {
      if (looksLikeAuthFailure && !bus.didForceRefresh) {
        bus.didForceRefresh = true
        scheduleReconnect(true)
      } else {
        scheduleReconnect()
      }
    }
  })
}

/**
 * Ensure the upstream connection is live. Called by the SSE route on
 * each new subscriber. Idempotent.
 */
export async function ensureKanbanBusStarted(opts?: {
  board?: string
}): Promise<void> {
  const bus = getBus()
  if (opts?.board && opts.board !== bus.board) {
    // Board switch — tear down so reconnect picks up new board.
    bus.board = opts.board
    bus.lastEventId = 0
    if (bus.ws) {
      try {
        bus.ws.close()
      } catch {
        // ignore
      }
      bus.ws = null
    }
  }
  if (bus.startedAt === 0) {
    bus.startedAt = Date.now()
  }
  if (!bus.ws || bus.ws.readyState !== WebSocket.OPEN) {
    await connectUpstream()
  }
}

export function subscribeToKanbanEvents(subscriber: Subscriber): () => void {
  const bus = getBus()
  bus.subscribers.add(subscriber)
  return () => {
    bus.subscribers.delete(subscriber)
    // If nobody is listening, close upstream to free the WS.
    if (bus.subscribers.size === 0 && bus.ws) {
      try {
        bus.ws.close()
      } catch {
        // ignore
      }
      bus.ws = null
      if (bus.reconnectTimer) {
        clearTimeout(bus.reconnectTimer)
        bus.reconnectTimer = null
      }
    }
  }
}

/** Inspect bus state (used by health checks / debugging). */
export function getKanbanBusState(): {
  connected: boolean
  subscriberCount: number
  lastEventId: number
  board: string | undefined
} {
  const bus = getBus()
  return {
    connected: !!bus.ws && bus.ws.readyState === WebSocket.OPEN,
    subscriberCount: bus.subscribers.size,
    lastEventId: bus.lastEventId,
    board: bus.board,
  }
}
