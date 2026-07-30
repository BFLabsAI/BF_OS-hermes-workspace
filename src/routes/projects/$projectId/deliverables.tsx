import { createFileRoute } from '@tanstack/react-router'
import { DeliverablesFeed } from '@/screens/projects/deliverables-feed'

export const Route = createFileRoute('/projects/$projectId/deliverables')({
  ssr: false,
  component: DeliverablesRoute,
})

function DeliverablesRoute() {
  const { projectId } = Route.useParams()
  return <DeliverablesFeed projectId={projectId} />
}
