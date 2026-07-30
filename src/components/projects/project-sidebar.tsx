import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/use-projects'
import { useProjectTasks } from '@/hooks/use-project-tasks'
import { NewProjectDialog } from './new-project-dialog'
import { useState } from 'react'

interface ProjectSidebarProps {
  activeProjectId: string | null
  onSelectProject: (id: string | null) => void
}

function ProjectBadge({ projectId }: { projectId: string }) {
  const { data } = useProjectTasks(projectId)
  const tasks = data?.tasks ?? []
  const openCount = tasks.filter((t) => t.status !== 'done').length
  if (openCount === 0) return null
  return (
    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] shrink-0">
      {openCount}
    </span>
  )
}

export function ProjectSidebar({
  activeProjectId,
  onSelectProject,
}: ProjectSidebarProps) {
  const { data: projectsData, isLoading } = useProjects()
  const projects = projectsData?.projects ?? []
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[var(--theme-border)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
            Projetos
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* "All" item */}
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors rounded-md mx-1',
              activeProjectId === null
                ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                : 'text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
            )}
          >
            <span>🌐</span>
            <span className="font-medium">Tudo</span>
          </button>

          {/* Project list */}
          {isLoading ? (
            <div className="px-3 py-4 text-xs text-[var(--theme-muted)]">
              Carregando…
            </div>
          ) : projects.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--theme-muted)]">
              Nenhum projeto ainda
            </div>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors rounded-md mx-1',
                  activeProjectId === project.id
                    ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                    : 'text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
                )}
              >
                <span className="shrink-0">{project.icon ?? '📁'}</span>
                <span className="truncate font-medium">{project.name}</span>
                <ProjectBadge projectId={project.id} />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--theme-border)] p-2">
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-colors border border-dashed border-[var(--theme-border)] text-[var(--theme-muted)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
          >
            <span>+</span>
            <span>Novo Projeto</span>
          </button>
        </div>
      </div>

      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
      />
    </>
  )
}
