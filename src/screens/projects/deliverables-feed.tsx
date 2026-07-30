import { useProjectTasks } from '@/hooks/use-project-tasks'
import { useDeliverables } from '@/hooks/use-deliverables'
import { DeliverableCard } from '@/components/projects/deliverable-card'
import type { Deliverable } from '@/lib/projects-types'

interface DeliverablesFeedProps {
  projectId: string
}

// Component to fetch and display deliverables for a single task
function TaskDeliverables({
  taskId,
  taskTitle,
}: {
  taskId: string
  taskTitle: string
}) {
  const { data: deliverablesData } = useDeliverables(taskId)
  const deliverables = deliverablesData?.deliverables ?? []

  if (deliverables.length === 0) return null

  return (
    <div>
      <p className="text-[10px] text-[var(--theme-muted)] mb-1.5 font-medium uppercase tracking-wide">
        {taskTitle}
      </p>
      <div className="space-y-2">
        {deliverables.map((d: Deliverable) => (
          <DeliverableCard key={d.id} deliverable={d} />
        ))}
      </div>
    </div>
  )
}

export function DeliverablesFeed({ projectId }: DeliverablesFeedProps) {
  const { data: tasksData, isLoading } = useProjectTasks(projectId)
  const tasks = tasksData?.tasks ?? []

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--theme-border)] shrink-0">
        <h2 className="text-sm font-medium text-[var(--theme-text)]">Entregas</h2>
        <p className="text-xs text-[var(--theme-muted)] mt-0.5">
          Todos os deliverables deste projeto, agrupados por task
        </p>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-lg border border-[var(--theme-border)] animate-pulse bg-[var(--theme-card)]"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--theme-muted)]">
            <p className="text-2xl mb-2">📦</p>
            <p className="text-sm font-medium">Nenhuma entrega ainda</p>
          </div>
        ) : (
          <div className="space-y-6">
            {tasks.map((task) => (
              <TaskDeliverables
                key={task.id}
                taskId={task.id}
                taskTitle={task.title}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
