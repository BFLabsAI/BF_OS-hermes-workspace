import { Link, useRouterState } from '@tanstack/react-router'
import { useProjects } from '@/hooks/use-projects'
import { cn } from '@/lib/utils'
import { Outlet } from '@tanstack/react-router'

interface ProjectShellProps {
  projectId: string
}

export function ProjectShell({ projectId }: ProjectShellProps) {
  const { data: projectsData } = useProjects()
  const projects = projectsData?.projects ?? []
  const project = projects.find((p) => p.id === projectId)

  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const tabs = [
    {
      label: 'Tasks',
      to: '/projects/$projectId/tasks' as const,
      params: { projectId },
    },
    {
      label: 'Notas',
      to: '/projects/$projectId/notes' as const,
      params: { projectId },
    },
    {
      label: 'Entregas',
      to: '/projects/$projectId/deliverables' as const,
      params: { projectId },
    },
  ]

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--theme-muted)] text-sm">
        Carregando projeto…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Project header */}
      <div className="px-4 pt-4 pb-0">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/85 backdrop-blur-xl px-4 pt-4 pb-0">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-3xl">{project.icon ?? '📁'}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-medium text-ink leading-tight">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-xs text-[var(--theme-muted)] mt-0.5 line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
            {project.color && (
              <span
                className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                style={{ background: project.color }}
              />
            )}
          </div>

          {/* Tab nav */}
          <div className="flex items-center gap-0.5">
            {tabs.map((tab) => {
              const fullPath = `/projects/${projectId}/${tab.label === 'Tasks' ? 'tasks' : tab.label === 'Notas' ? 'notes' : 'deliverables'}`
              const isActive = pathname.startsWith(fullPath)
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  params={tab.params}
                  className={cn(
                    'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-[var(--theme-accent)] text-[var(--theme-accent)]'
                      : 'border-transparent text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
