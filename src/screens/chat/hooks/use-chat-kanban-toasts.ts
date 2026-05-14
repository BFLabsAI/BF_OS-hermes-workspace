/**
 * Surface kanban activity inside the chat screen as toast notifications.
 *
 * Subscribes to /api/kanban-events (SSE proxy of the dashboard plugin's
 * task_events WebSocket) and toasts a brief, human-readable summary when
 * a task changes meaningful state. Suppresses noisy `heartbeat` events.
 */

import { useRef } from 'react'
import { toast } from '@/components/ui/toast'
import { useKanbanEvents, type KanbanLiveEvent } from '@/lib/use-kanban-events'
import type { EventKind } from '@/lib/kanban-types'

/** Event kinds that are worth surfacing to the chat user. */
const VISIBLE_EVENTS: Partial<Record<EventKind, true>> = {
  created: true,
  assigned: true,
  claimed: true,
  spawned: true,
  completed: true,
  blocked: true,
  unblocked: true,
  archived: true,
  reclaimed: true,
  crashed: true,
  timed_out: true,
  gave_up: true,
  spawn_failed: true,
  completion_blocked_hallucination: true,
}

/** Map kind → toast type so failures look red, successes green, others default. */
function toastTypeFor(kind: EventKind): 'info' | 'success' | 'warning' | 'error' {
  switch (kind) {
    case 'completed':
    case 'unblocked':
      return 'success'
    case 'blocked':
    case 'reclaimed':
      return 'warning'
    case 'crashed':
    case 'timed_out':
    case 'gave_up':
    case 'spawn_failed':
    case 'completion_blocked_hallucination':
      return 'error'
    default:
      return 'info'
  }
}

function formatEvent(evt: KanbanLiveEvent): string {
  const short = evt.taskId.slice(0, 8)
  switch (evt.kind) {
    case 'created':
      return `📋 Task ${short} created${
        evt.payload?.assignee ? ` for ${evt.payload.assignee}` : ''
      }`
    case 'assigned':
      return `📋 Task ${short} → ${evt.payload?.assignee ?? '?'}`
    case 'claimed':
      return `🤖 ${short} claimed by worker`
    case 'spawned':
      return `🚀 ${short} worker spawned (pid ${evt.payload?.pid ?? '?'})`
    case 'completed':
      return `✅ ${short} completed`
    case 'blocked':
      return `⛔ ${short} blocked${
        evt.payload?.reason ? `: ${String(evt.payload.reason).slice(0, 80)}` : ''
      }`
    case 'unblocked':
      return `▶️ ${short} unblocked`
    case 'archived':
      return `🗑 ${short} archived`
    case 'reclaimed':
      return `♻️ ${short} reclaimed${
        evt.payload?.manual ? ' (manual)' : ' (stale claim)'
      }`
    case 'crashed':
      return `💥 ${short} crashed (pid ${evt.payload?.pid ?? '?'})`
    case 'timed_out':
      return `⏰ ${short} timed out`
    case 'gave_up':
      return `🛑 ${short} gave up after ${evt.payload?.failures ?? '?'} failures`
    case 'spawn_failed':
      return `❌ ${short} spawn failed`
    case 'completion_blocked_hallucination':
      return `🚧 ${short} completion blocked: phantom child cards`
    default:
      return `${evt.kind} on ${short}`
  }
}

type Options = {
  /** Set to false to disable (e.g. on mobile or when chat is not active). */
  enabled?: boolean
}

export function useChatKanbanToasts(options: Options = {}) {
  // Track event IDs we've already toasted in this session so a reconnect
  // replay (when SSE resumes from since=) doesn't double-toast.
  const seenRef = useRef<Set<number>>(new Set())

  useKanbanEvents(
    (msg) => {
      if (msg.type !== 'event') return
      if (!VISIBLE_EVENTS[msg.kind]) return
      if (seenRef.current.has(msg.id)) return
      seenRef.current.add(msg.id)
      // Keep set bounded.
      if (seenRef.current.size > 1000) {
        const arr = Array.from(seenRef.current)
        seenRef.current = new Set(arr.slice(-500))
      }
      const text = formatEvent(msg)
      toast(text, { type: toastTypeFor(msg.kind) })
    },
    { enabled: options.enabled !== false },
  )
}
