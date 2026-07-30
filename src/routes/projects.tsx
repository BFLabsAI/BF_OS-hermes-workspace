import { createFileRoute } from '@tanstack/react-router'
import { ProjectsSidebarLayout } from '@/screens/projects/projects-sidebar-layout'
import { usePageTitle } from '@/hooks/use-page-title'

export const Route = createFileRoute('/projects')({
  ssr: false,
  component: ProjectsRoute,
})

function ProjectsRoute() {
  usePageTitle('Projects')
  return <ProjectsSidebarLayout />
}
