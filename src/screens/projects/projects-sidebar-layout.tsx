import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { ProjectSidebar } from '@/components/projects/project-sidebar'
import { cn } from '@/lib/utils'

export function ProjectsSidebarLayout() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Try to extract projectId from path /projects/$projectId/...
  const projectIdMatch = pathname.match(/^\/projects\/([^/]+)/)
  const activeProjectId = projectIdMatch ? projectIdMatch[1] : null

  // Don't treat trailing slash as a project ID
  const isIndex = pathname === '/projects' || pathname === '/projects/'
  const effectiveProjectId = isIndex ? null : activeProjectId

  function handleSelectProject(id: string | null) {
    if (id === null) {
      void navigate({ to: '/projects' })
    } else {
      void navigate({
        to: '/projects/$projectId/tasks',
        params: { projectId: id },
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Project sidebar */}
      <div
        className={cn(
          'w-56 shrink-0 border-r border-[var(--theme-border)] h-full overflow-hidden',
          'bg-[var(--theme-sidebar,var(--theme-bg))]',
        )}
      >
        <ProjectSidebar
          activeProjectId={effectiveProjectId}
          onSelectProject={handleSelectProject}
        />
      </div>

      {/* Main content — TanStack Router Outlet renders child routes here */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
