/**
 * useKanbanEvents — subscribes to /api/kanban-events (SSE) and invokes a
 * callback on each event. Used by the tasks screen and the chat to keep
 * the UI live without polling.
 *
 * Events:
 *   - connected: SSE opened
 *   - disconnected: upstream WS dropped
 *   - <kind>: any kanban event (created, claimed, completed, archived, ...)
 *
 * The callback receives a normalised `KanbanLiveEvent` with `type` ('control'
 * or 'event'), `kind`, `taskId`, `runId`, `payload`, `createdAt`. Control
 * events have no taskId.
 */

import { useEffect, useRef } from 'react'
import type { EventKind } from './kanban-types'

export type KanbanLiveControl = {
  type: 'control'
  kind: 'connected' | 'disconnected' | 'error'
  payload: Record<string, unknown>
}

export type KanbanLiveEvent = {
  type: 'event'
  kind: EventKind
  taskId: string
  runId: number | null
  payload: Record<string, unknown> | null
  createdAt: number
  id: number
}

export type LiveMessage = KanbanLiveControl | KanbanLiveEvent

type UseKanbanEventsOptions = {
  /** Optional board slug filter. Defaults to the active board. */
  board?: string
  /** Whether to actually subscribe. Use false to pause when offscreen. */
  enabled?: boolean
}

export function useKanbanEvents(
  onMessage: (msg: LiveMessage) => void,
  options: UseKanbanEventsOptions = {},
): { connected: boolean } {
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage
  const connectedRef = useRef(false)

  useEffect(() => {
    if (options.enabled === false) return
    if (typeof EventSource === 'undefined') return

    const params = new URLSearchParams()
    if (options.board) params.set('board', options.board)
    const url = params.toString()
      ? `/api/kanban-events?${params}`
      : '/api/kanban-events'

    const es = new EventSource(url)

    function dispatch(kind: string, raw: string): void {
      let payload: Record<string, unknown> = {}
      try {
        payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      } catch {
        // ignore parse failures
      }
      if (kind === 'connected' || kind === 'disconnected' || kind === 'error') {
        connectedRef.current = kind === 'connected'
        handlerRef.current({ type: 'control', kind: kind as 'connected', payload })
        return
      }
      const taskId = typeof payload.task_id === 'string' ? payload.task_id : ''
      if (!taskId) return
      handlerRef.current({
        type: 'event',
        kind: kind as EventKind,
        taskId,
        runId: typeof payload.run_id === 'number' ? payload.run_id : null,
        payload: (payload.payload as Record<string, unknown> | null) ?? null,
        createdAt: typeof payload.created_at === 'number' ? payload.created_at : 0,
        id: typeof payload.id === 'number' ? payload.id : 0,
      })
    }

    // Each event arrives with its `event:` line. Attach a listener for each
    // known kind plus a fallback for `message` (default event).
    const knownKinds = [
      'connected',
      'disconnected',
      'created',
      'assigned',
      'linked',
      'unlinked',
      'commented',
      'promoted',
      'claimed',
      'spawned',
      'heartbeat',
      'completed',
      'completion_blocked_hallucination',
      'suspected_hallucinated_references',
      'edited',
      'blocked',
      'unblocked',
      'archived',
      'reclaimed',
      'crashed',
      'timed_out',
      'spawn_failed',
      'gave_up',
      'reprioritized',
    ] as const

    const cleanups: Array<() => void> = []
    for (const kind of knownKinds) {
      const fn = (e: MessageEvent) => dispatch(kind, e.data)
      es.addEventListener(kind, fn)
      cleanups.push(() => es.removeEventListener(kind, fn))
    }

    const onError = () => {
      connectedRef.current = false
      handlerRef.current({
        type: 'control',
        kind: 'error',
        payload: {},
      })
    }
    es.addEventListener('error', onError)
    cleanups.push(() => es.removeEventListener('error', onError))

    return () => {
      for (const c of cleanups) c()
      es.close()
    }
  }, [options.board, options.enabled])

  return { connected: connectedRef.current }
}
