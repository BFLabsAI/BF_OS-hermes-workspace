import { cn } from '@/lib/utils'

interface DeadlineChipProps {
  deadline: number | null
}

export function DeadlineChip({ deadline }: DeadlineChipProps) {
  if (deadline === null) return null

  const now = Date.now()
  const deadlineMs = deadline * 1000
  const formatted = new Date(deadlineMs).toLocaleDateString('pt-BR')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDay = new Date(deadlineMs)
  deadlineDay.setHours(0, 0, 0, 0)

  const isOverdue = deadlineMs < now
  const isToday = deadlineDay.getTime() === today.getTime()

  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md font-medium',
        isOverdue
          ? 'bg-red-500/20 text-red-400'
          : isToday
            ? 'bg-orange-500/20 text-orange-400'
            : 'bg-neutral-700 text-neutral-400',
      )}
    >
      {isOverdue ? '⚠ ' : isToday ? '⏰ ' : '📅 '}
      {formatted}
    </span>
  )
}
