import { createFileRoute } from '@tanstack/react-router'
import { ProjectShell } from '@/screens/projects/project-shell'

export const Route = createFileRoute('/projects/$projectId')({
  ssr: false,
  component: ProjectRoute,
})

function ProjectRoute() {
  const { projectId } = Route.useParams()
  return <ProjectShell projectId={projectId} />
}
