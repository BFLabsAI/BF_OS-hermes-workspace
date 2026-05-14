import { cn } from '@/lib/utils'
import type { KanbanTaskSummary, TaskStatus } from '@/lib/tasks-api'
import { STATUS_LABELS } from '@/lib/tasks-api'

type Props = {
  task: KanbanTaskSummary
  assigneeLabels?: Record<string, string>
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  isDragging?: boolean
}

export function formatTaskAssigneeLabel(
  assignee: string | null,
  assigneeLabels: Record<string, string>,
): string {
  const resolvedLabel = assignee ? (assigneeLabels[assignee] ?? assignee) : 'Unassigned'
  return `Assignee: ${resolvedLabel}`
}

/**
 * Convert an age in seconds to a compact relative-time string.
 * Returns "just now", "Xm ago", "Xh ago", "Xd ago" (anything older shows days).
 */
export function formatAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

// Integer priority → P-label + hex color. Anything > 3 falls through to a numeric badge.
const PRIORITY_META: Record<number, { label: string; hex: string }> = {
  0: { label: 'P0', hex: '#6b7280' }, // gray
  1: { label: 'P1', hex: '#3b82f6' }, // blue
  2: { label: 'P2', hex: '#f97316' }, // orange
  3: { label: 'P3', hex: '#ef4444' }, // red
}

export function priorityMeta(priority: number): { label: string; hex: string } {
  return (
    PRIORITY_META[priority] ?? { label: `P${priority}`, hex: '#a855f7' }
  )
}

// STATUS_COLORS gives tailwind color *names*; map to concrete hex for inline borders.
const STATUS_HEX: Record<TaskStatus, string> = {
  triage: '#f59e0b', // amber-500
  todo: '#64748b', // slate-500
  ready: '#0ea5e9', // sky-500
  running: '#8b5cf6', // violet-500
  blocked: '#f43f5e', // rose-500
  done: '#10b981', // emerald-500
  archived: '#71717a', // zinc-500
}

export function statusHex(status: TaskStatus): string {
  return STATUS_HEX[status] ?? '#64748b'
}

export function TaskCard({ task, assigneeLabels = {}, onClick, onDragStart, isDragging }: Props) {
  const { label: priorityLabel, hex: priorityColor } = priorityMeta(task.priority)
  const assigneeLabel = formatTaskAssigneeLabel(task.assignee, assigneeLabels)
  const statusColor = statusHex(task.status)
  const ageStr = formatAge(task.age?.created_age_seconds ?? null)
  const commentCount = task.comment_count ?? 0
  const parents = task.link_counts?.parents ?? 0
  const children = task.link_counts?.children ?? 0

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-3 cursor-pointer transition-all select-none',
        'bg-[var(--theme-card)] border-[var(--theme-border)]',
        'hover:border-[var(--theme-accent)]',
        isDragging ? 'opacity-40 rotate-1 shadow-2xl' : 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: statusColor }}
    >
      {/* Priority badge top-right */}
      <span
        className="absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white"
        style={{ background: priorityColor }}
        title={`Priority ${task.priority}`}
      >
        {priorityLabel}
      </span>

      <p className="text-sm font-medium text-[var(--theme-text)] leading-snug mb-1 line-clamp-2 pr-10">
        {task.title}
      </p>

      {task.body && (
        <p className="text-xs text-[var(--theme-muted)] line-clamp-2 mb-2">
          {task.body}
        </p>
      )}

      {task.status === 'done' && task.result && (
        <div className="text-[11px] rounded-md px-2 py-1 mb-2 bg-emerald-500/10 text-emerald-400 line-clamp-3 leading-relaxed">
          {task.result}
        </div>
      )}

      {!task.result && task.latest_summary && (
        <p className="text-[11px] italic text-[var(--theme-muted)] line-clamp-1 mb-2">
          {task.latest_summary}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
            style={{ background: `${statusColor}22`, color: statusColor }}
            title={`Status: ${STATUS_LABELS[task.status]}`}
          >
            {STATUS_LABELS[task.status]}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--theme-hover)] text-[var(--theme-muted)]">
            {assigneeLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] tabular-nums text-[var(--theme-muted)]">
          {commentCount > 0 && (
            <span title="Comments">💬 {commentCount}</span>
          )}
          {parents > 0 && (
            <span title="Parent links">↑{parents}</span>
          )}
          {children > 0 && (
            <span title="Child links">↓{children}</span>
          )}
          {ageStr && <span>{ageStr}</span>}
        </div>
      </div>
    </div>
  )
}
