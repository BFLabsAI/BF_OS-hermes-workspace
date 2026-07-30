import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/projects-types'

interface StatusBadgeProps {
  status: TaskStatus
  size?: 'sm' | 'md'
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  backlog: 'bg-neutral-600 text-neutral-100',
  todo: 'bg-blue-600 text-blue-100',
  doing: 'bg-yellow-500 text-yellow-950',
  review: 'bg-purple-600 text-purple-100',
  done: 'bg-green-600 text-green-100',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A fazer',
  doing: 'Fazendo',
  review: 'Revisão',
  done: 'Feito',
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
