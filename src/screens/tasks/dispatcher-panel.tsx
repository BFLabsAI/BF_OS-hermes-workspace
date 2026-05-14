'use client'

import { useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { nudgeDispatcher } from '@/lib/tasks-api'
import { useKanbanEvents } from '@/lib/use-kanban-events'

/**
 * Small visible card on the tasks screen that shows the dispatcher's pulse.
 *
 * The dispatcher daemon runs inside the gateway (config: `kanban.dispatch_in_gateway`).
 * We can't query its state directly today, but we can infer activity:
 *  - When did we last see `claimed` / `spawned` / `reclaimed` events?
 *  - How many tasks did the last manual nudge dispatch?
 *  - Approximate cadence from config.
 */
export function DispatcherPanel({
  intervalSeconds = 60,
}: {
  intervalSeconds?: number
}) {
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const [lastEventKind, setLastEventKind] = useState<string | null>(null)
  const [lastNudge, setLastNudge] = useState<{
    at: number
    spawned: number
    reclaimed: number
    auto_blocked: number
  } | null>(null)
  const [nudging, setNudging] = useState(false)
  const [nowTick, setNowTick] = useState(Math.floor(Date.now() / 1000))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNowTick(Math.floor(Date.now() / 1000))
    }, 5_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useKanbanEvents((msg) => {
    if (msg.type !== 'event') return
    if (
      msg.kind === 'claimed' ||
      msg.kind === 'spawned' ||
      msg.kind === 'reclaimed' ||
      msg.kind === 'crashed' ||
      msg.kind === 'timed_out' ||
      msg.kind === 'gave_up'
    ) {
      setLastEventAt(msg.createdAt)
      setLastEventKind(msg.kind)
    }
  })

  async function handleNudge() {
    setNudging(true)
    try {
      const result = await nudgeDispatcher()
      const r = result as unknown as {
        spawned?: unknown[]
        reclaimed?: number
        auto_blocked?: unknown[]
        count?: number
      }
      setLastNudge({
        at: Math.floor(Date.now() / 1000),
        spawned: Array.isArray(r.spawned) ? r.spawned.length : r.count ?? 0,
        reclaimed: typeof r.reclaimed === 'number' ? r.reclaimed : 0,
        auto_blocked: Array.isArray(r.auto_blocked) ? r.auto_blocked.length : 0,
      })
    } finally {
      setNudging(false)
    }
  }

  const idleSeconds =
    lastEventAt != null ? Math.max(0, nowTick - lastEventAt) : null

  const pulseColor =
    idleSeconds == null
      ? '#71717a'
      : idleSeconds < 30
        ? '#10b981'
        : idleSeconds < 120
          ? '#0ea5e9'
          : idleSeconds < intervalSeconds * 3
            ? '#f59e0b'
            : '#ef4444'

  function formatRelative(sec: number): string {
    if (sec < 60) return `${sec}s ago`
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
    if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`
    return `${Math.floor(sec / 86_400)}d ago`
  }

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: pulseColor, boxShadow: `0 0 8px ${pulseColor}` }}
        />
        <span className="text-xs font-semibold text-[var(--theme-text)]">
          Dispatcher
        </span>
      </div>

      <span className="text-xs text-[var(--theme-muted)]">
        Tick interval:{' '}
        <span className="text-[var(--theme-text)]">{intervalSeconds}s</span>
      </span>

      <span className="text-xs text-[var(--theme-muted)]">
        Last activity:{' '}
        <span className="text-[var(--theme-text)]">
          {lastEventAt == null
            ? '—'
            : `${lastEventKind} ${formatRelative(idleSeconds ?? 0)}`}
        </span>
      </span>

      {lastNudge && (
        <span className="text-xs text-[var(--theme-muted)]">
          Last nudge:{' '}
          <span className="text-[var(--theme-text)]">
            {lastNudge.spawned} spawned
            {lastNudge.reclaimed > 0 && `, ${lastNudge.reclaimed} reclaimed`}
            {lastNudge.auto_blocked > 0 &&
              `, ${lastNudge.auto_blocked} auto-blocked`}
          </span>{' '}
          ({formatRelative(nowTick - lastNudge.at)})
        </span>
      )}

      <button
        onClick={handleNudge}
        disabled={nudging}
        className={cn(
          'ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
          'border-[var(--theme-border)] text-[var(--theme-muted)]',
          'hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)] disabled:opacity-50',
        )}
        title="Force a dispatcher tick immediately"
      >
        <HugeiconsIcon icon={Add01Icon} size={12} />
        {nudging ? 'Nudging…' : 'Nudge now'}
      </button>
    </div>
  )
}
