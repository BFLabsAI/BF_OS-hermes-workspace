import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { TaskDetailPanel } from '@/screens/projects/task-detail-panel'

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  ssr: false,
  component: TaskDetailRoute,
})

function TaskDetailRoute() {
  const { projectId, taskId } = Route.useParams()
  const navigate = useNavigate()

  function handleClose() {
    void navigate({
      to: '/projects/$projectId/tasks',
      params: { projectId },
    })
  }

  return (
    <div className="absolute inset-0 flex items-stretch justify-end z-20 pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div
        className="flex-1 bg-black/20 pointer-events-auto cursor-pointer"
        onClick={handleClose}
        aria-hidden
      />
      {/* Detail panel — slides in from right */}
      <div className="w-full max-w-[520px] h-full border-l border-[var(--theme-border)] overflow-hidden pointer-events-auto shadow-2xl"
        style={{ background: 'var(--theme-bg)' }}
      >
        <TaskDetailPanel
          taskId={taskId}
          projectId={projectId}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
