import { Link } from '@tanstack/react-router'
import type { LinkedRun } from '@/lib/projects-types'
import { isTaskStatus } from '@/lib/projects-types'
import { StatusBadge } from './status-badge'

interface RunLinkCardProps {
  run: LinkedRun
}

export function RunLinkCard({ run }: RunLinkCardProps) {
  return (
    <Link
      to="/tasks"
      search={{ task: run.id }}
      className="block rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 hover:border-[var(--theme-accent)] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--theme-text)] truncate">
          {run.title ?? `Run #${run.id}`}
        </span>
        {run.status && isTaskStatus(run.status) && <StatusBadge status={run.status} />}
      </div>
    </Link>
  )
}
