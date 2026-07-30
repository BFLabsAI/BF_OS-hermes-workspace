import { createFileRoute } from '@tanstack/react-router'
import { TasksBoard } from '@/screens/projects/tasks-board'

export const Route = createFileRoute('/projects/$projectId/tasks')({
  ssr: false,
  component: TasksRoute,
})

function TasksRoute() {
  const { projectId } = Route.useParams()
  return <TasksBoard projectId={projectId} />
}
