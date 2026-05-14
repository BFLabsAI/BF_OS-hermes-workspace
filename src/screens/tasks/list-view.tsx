'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/tasks-api'
import type { KanbanTaskSummary, TaskStatus } from '@/lib/tasks-api'
import { formatAge, priorityMeta, statusHex } from './task-card'

type ListViewProps = {
  tasks: KanbanTaskSummary[]
  assigneeLabels: Record<string, string>
  onOpen: (task: KanbanTaskSummary) => void
}

type SortKey = 'updated' | 'created' | 'title' | 'status' | 'priority' | 'assignee'

const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Updated',
  created: 'Created',
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
}

export function ListView({ tasks, assigneeLabels, onOpen }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  const sorted = useMemo(() => {
    const filtered = statusFilter === 'all'
      ? tasks
      : tasks.filter((t) => t.status === statusFilter)
    const result = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'priority':
          cmp = (a.priority ?? 0) - (b.priority ?? 0)
          break
        case 'created':
          cmp = (a.created_at ?? 0) - (b.created_at ?? 0)
          break
        case 'updated': {
          const aU = a.completed_at ?? a.started_at ?? a.created_at ?? 0
          const bU = b.completed_at ?? b.started_at ?? b.created_at ?? 0
          cmp = aU - bU
          break
        }
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'status':
          cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
          break
        case 'assignee':
          cmp = (a.assignee ?? '').localeCompare(b.assignee ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [tasks, sortKey, sortDir, statusFilter])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        scope="col"
        onClick={() => toggleSort(k)}
        className={cn(
          'px-3 py-2 text-left font-medium cursor-pointer select-none',
          'hover:text-[var(--theme-text)] transition-colors',
          active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-muted)]',
        )}
      >
        {label}
        {active && (
          <span className="ml-1 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
        )}
      </th>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
          <span>{sorted.length} task{sorted.length === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>
            Sort: <span className="text-[var(--theme-text)]">{SORT_LABELS[sortKey]}</span> {sortDir === 'asc' ? '↑' : '↓'}
          </span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          className="text-xs px-2 py-1 rounded-lg border bg-transparent border-[var(--theme-border)] text-[var(--theme-muted)]"
          style={{ colorScheme: 'dark' }}
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--theme-hover)]/50">
            <tr className="border-b border-[var(--theme-border)]">
              <SortHeader k="title" label="Task" />
              <SortHeader k="status" label="Status" />
              <SortHeader k="priority" label="P" />
              <SortHeader k="assignee" label="Assignee" />
              <SortHeader k="created" label="Created" />
              <SortHeader k="updated" label="Updated" />
              <th className="px-3 py-2 text-right font-medium text-[var(--theme-muted)]">
                Activity
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-[var(--theme-muted)]"
                >
                  No tasks match the current filter.
                </td>
              </tr>
            )}
            {sorted.map((t) => {
              const pri = priorityMeta(t.priority ?? 0)
              return (
                <tr
                  key={t.id}
                  onClick={() => onOpen(t)}
                  className={cn(
                    'border-b border-[var(--theme-border)]/50 cursor-pointer',
                    'hover:bg-[var(--theme-hover)] transition-colors',
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-[var(--theme-text)] line-clamp-1">
                        {t.title}
                      </span>
                      {t.body && (
                        <span className="text-[10px] text-[var(--theme-muted)] line-clamp-1">
                          {t.body}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: `${statusHex(t.status)}22`,
                        color: statusHex(t.status),
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: statusHex(t.status) }}
                      />
                      {STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: `${pri.hex}22`, color: pri.hex }}
                    >
                      {pri.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--theme-muted)]">
                    {t.assignee ? assigneeLabels[t.assignee] ?? t.assignee : '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--theme-muted)]">
                    {formatAge(t.age?.created_age_seconds ?? null)}
                  </td>
                  <td className="px-3 py-2 text-[var(--theme-muted)]">
                    {formatAge(
                      t.age?.time_to_complete_seconds ??
                        t.age?.started_age_seconds ??
                        t.age?.created_age_seconds ??
                        null,
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--theme-muted)]">
                    <div className="flex items-center justify-end gap-2 text-[10px]">
                      {(t.comment_count ?? 0) > 0 && (
                        <span title="Comments">💬 {t.comment_count}</span>
                      )}
                      {(t.link_counts?.parents ?? 0) > 0 && (
                        <span title="Parents">⬆ {t.link_counts!.parents}</span>
                      )}
                      {(t.link_counts?.children ?? 0) > 0 && (
                        <span title="Children">⬇ {t.link_counts!.children}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
