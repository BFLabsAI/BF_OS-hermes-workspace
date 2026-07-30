import { cn } from '@/lib/utils'
import type { ProjectTask } from '@/lib/projects-types'
import { StatusBadge } from '@/components/projects/status-badge'
import { DeadlineChip } from '@/components/projects/deadline-chip'

import type { TaskPriority } from '@/lib/projects-types'

const PRIORITY_META: Record<TaskPriority, { label: string; hex: string }> = {
  low: { label: 'Low', hex: '#6b7280' },
  med: { label: 'Med', hex: '#f97316' },
  high: { label: 'High', hex: '#ef4444' },
}

function priorityMeta(priority: TaskPriority | null | undefined) {
  if (!priority) return { label: '—', hex: '#6b7280' }
  return PRIORITY_META[priority] ?? { label: priority, hex: '#a855f7' }
}

interface TaskCardProjectProps {
  task: ProjectTask
  onClick: () => void
}

export function TaskCardProject({ task, onClick }: TaskCardProjectProps) {
  const { label: priorityLabel, hex: priorityColor } = priorityMeta(task.priority)

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-3 cursor-pointer transition-all select-none',
        'bg-[var(--theme-card)] border-[var(--theme-border)]',
        'hover:border-[var(--theme-accent)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
      )}
    >
      {/* Priority badge */}
      <span
        className="absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white"
        style={{ background: priorityColor }}
        title={`Priority ${task.priority}`}
      >
        {priorityLabel}
      </span>

      <p className="text-sm font-medium text-[var(--theme-text)] leading-snug mb-2 line-clamp-2 pr-10">
        {task.title}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusBadge status={task.status} />
        <DeadlineChip deadline={task.deadline ?? null} />
      </div>
    </div>
  )
}
