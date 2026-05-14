'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/tasks-api'
import type {
  KanbanStats,
  KanbanTaskSummary,
  TaskStatus,
} from '@/lib/tasks-api'
import { formatAge, priorityMeta, statusHex } from './task-card'

type Props = {
  tasks: KanbanTaskSummary[]
  stats: KanbanStats | undefined
  assigneeLabels: Record<string, string>
}

function StatCard({
  label,
  value,
  hint,
  color,
}: {
  label: string
  value: string | number
  hint?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 flex flex-col gap-1">
      <span className="text-xs text-[var(--theme-muted)] uppercase tracking-wider">
        {label}
      </span>
      <span
        className="text-2xl font-semibold"
        style={{ color: color ?? 'var(--theme-text)' }}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-[var(--theme-muted)]">{hint}</span>
      )}
    </div>
  )
}

/** Pure-CSS stacked bar showing status distribution. */
function StatusDistribution({
  counts,
  total,
}: {
  counts: Array<{ status: TaskStatus; count: number; color: string }>
  total: number
}) {
  if (total === 0) {
    return (
      <div className="h-[40px] flex items-center justify-center text-xs text-[var(--theme-muted)]">
        No active tasks.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="h-3 flex w-full overflow-hidden rounded-full bg-[var(--theme-hover)]">
        {counts.map((c) => {
          const pct = (c.count / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={c.status}
              style={{ width: `${pct}%`, background: c.color }}
              title={`${STATUS_LABELS[c.status]}: ${c.count}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {counts
          .filter((c) => c.count > 0)
          .map((c) => (
            <span
              key={c.status}
              className="inline-flex items-center gap-1"
              style={{ color: c.color }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: c.color }}
              />
              <span className="font-medium">{STATUS_LABELS[c.status]}</span>
              <span className="text-[var(--theme-muted)]">{c.count}</span>
            </span>
          ))}
      </div>
    </div>
  )
}

export function DashboardView({ tasks, stats, assigneeLabels }: Props) {
  const totalActive = useMemo(() => {
    if (stats) {
      return Object.entries(stats.by_status ?? {})
        .filter(([k]) => k !== 'archived')
        .reduce((sum, [, n]) => sum + (n ?? 0), 0)
    }
    return tasks.filter((t) => t.status !== 'archived').length
  }, [stats, tasks])

  const inFlight = useMemo(() => {
    if (stats?.by_status) {
      return (stats.by_status.running ?? 0) + (stats.by_status.blocked ?? 0)
    }
    return tasks.filter((t) => t.status === 'running' || t.status === 'blocked')
      .length
  }, [stats, tasks])

  const completedToday = useMemo(() => {
    const dayAgo = Math.floor(Date.now() / 1000) - 86_400
    return tasks.filter(
      (t) => t.status === 'done' && (t.completed_at ?? 0) >= dayAgo,
    ).length
  }, [tasks])

  const statusCounts = useMemo(() => {
    const source = stats?.by_status ?? {}
    return STATUS_ORDER.filter((s) => s !== 'archived').map((s) => ({
      status: s,
      count: source[s] ?? tasks.filter((t) => t.status === s).length,
      color: statusHex(s),
    }))
  }, [stats, tasks])

  const assigneeData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      if (t.status === 'archived') continue
      const k = t.assignee ?? '(unassigned)'
      counts[k] = (counts[k] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({
        name: assigneeLabels[name] ?? name,
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [tasks, assigneeLabels])

  const priorityData = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const t of tasks) {
      if (t.status === 'archived') continue
      counts[t.priority ?? 0] = (counts[t.priority ?? 0] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([k, v]) => {
        const p = Number(k)
        const meta = priorityMeta(p)
        return { name: meta.label, value: v, color: meta.hex, priority: p }
      })
      .sort((a, b) => b.priority - a.priority)
  }, [tasks])

  const recentDone = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
      .slice(0, 5)
  }, [tasks])

  const oldestReady = useMemo(() => {
    const ready = tasks
      .filter((t) => t.status === 'ready')
      .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
    return ready[0]
  }, [tasks])

  return (
    <div className="flex flex-col gap-4">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active" value={totalActive} hint="not archived" />
        <StatCard
          label="In flight"
          value={inFlight}
          hint="running + blocked"
          color={statusHex('running')}
        />
        <StatCard
          label="Done today"
          value={completedToday}
          hint="last 24 hours"
          color={statusHex('done')}
        />
        <StatCard
          label="Oldest ready"
          value={
            stats?.oldest_ready_age_seconds != null
              ? formatAge(stats.oldest_ready_age_seconds)
              : oldestReady?.age?.created_age_seconds != null
                ? formatAge(oldestReady.age.created_age_seconds)
                : '—'
          }
          hint="dispatcher backlog"
          color={statusHex('ready')}
        />
      </div>

      {/* Status distribution */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
        <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-3 uppercase tracking-wider">
          Status distribution
        </h3>
        <StatusDistribution counts={statusCounts} total={totalActive} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-3 uppercase tracking-wider">
            Top assignees
          </h3>
          {assigneeData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-[var(--theme-muted)]">
              No assigned tasks.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={assigneeData}
                layout="vertical"
                margin={{ left: 8 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11, fill: 'var(--theme-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--theme-card)',
                    border: '1px solid var(--theme-border)',
                    fontSize: 11,
                  }}
                  cursor={{ fill: 'var(--theme-hover)' }}
                />
                <Bar
                  dataKey="value"
                  fill="var(--theme-accent)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-3 uppercase tracking-wider">
            Priority breakdown
          </h3>
          {priorityData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-[var(--theme-muted)]">
              No active tasks.
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              {priorityData.map((p) => {
                const max = Math.max(...priorityData.map((x) => x.value))
                const pct = (p.value / max) * 100
                return (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-8 inline-block text-right font-semibold"
                      style={{ color: p.color }}
                    >
                      {p.name}
                    </span>
                    <div className="flex-1 h-5 bg-[var(--theme-hover)] rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${pct}%`,
                          background: p.color,
                          minWidth: '4px',
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-[var(--theme-muted)] tabular-nums">
                      {p.value}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recently completed */}
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
        <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-3 uppercase tracking-wider">
          Recently completed
        </h3>
        {recentDone.length === 0 ? (
          <div className="text-xs text-[var(--theme-muted)] py-6">
            Nothing completed yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentDone.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="line-clamp-1 text-[var(--theme-text)] flex-1">
                  {t.title}
                </span>
                <span className="text-[var(--theme-muted)] shrink-0">
                  {formatAge(t.age?.time_to_complete_seconds ?? null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
