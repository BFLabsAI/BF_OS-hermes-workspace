import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/use-projects'
import { useProjectTasks } from '@/hooks/use-project-tasks'

interface TaskPickerProps {
  value: string | null
  onChange: (taskId: string | null) => void
  placeholder?: string
}

function ProjectTaskList({
  projectId,
  value,
  onChange,
}: {
  projectId: string
  value: string | null
  onChange: (taskId: string | null) => void
}) {
  const { data: tasksData, isLoading } = useProjectTasks(projectId)
  const tasks = tasksData?.tasks ?? []

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--theme-muted)]">
        Carregando tasks…
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--theme-muted)]">
        Nenhuma task neste projeto
      </div>
    )
  }

  return (
    <>
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onChange(task.id)}
          className={cn(
            'w-full text-left px-3 py-1.5 text-xs transition-colors truncate',
            value === task.id
              ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
              : 'text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
          )}
        >
          {task.title}
        </button>
      ))}
    </>
  )
}

export function TaskPicker({
  value,
  onChange,
  placeholder = 'Selecionar task de projeto…',
}: TaskPickerProps) {
  const { data: projectsData, isLoading: projectsLoading } = useProjects()
  const projects = projectsData?.projects ?? []
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Find task title for display
  const { data: selectedTasksData } = useProjectTasks(selectedProjectId ?? '')
  const selectedTasks = selectedTasksData?.tasks ?? []
  const selectedTask = selectedTasks.find((t) => t.id === value)

  function handleClear() {
    onChange(null)
    setSelectedProjectId(null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full text-left rounded-lg border px-3 py-2 text-xs',
          'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
          'flex items-center justify-between gap-2',
        )}
      >
        <span className={value ? 'text-[var(--theme-text)]' : 'text-[var(--theme-muted)]'}>
          {selectedTask ? selectedTask.title : placeholder}
        </span>
        <span className="text-[var(--theme-muted)] shrink-0">▾</span>
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 w-full mt-1 rounded-lg border shadow-lg overflow-hidden',
            'bg-[var(--theme-bg)] border-[var(--theme-border)]',
          )}
        >
          {/* Project select */}
          <div className="border-b border-[var(--theme-border)] px-2 py-2">
            <p className="text-[10px] text-[var(--theme-muted)] mb-1 px-1">Projeto</p>
            {projectsLoading ? (
              <div className="px-1 py-1 text-xs text-[var(--theme-muted)]">Carregando…</div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={cn(
                    'w-full text-left px-2 py-1 text-xs rounded transition-colors',
                    selectedProjectId === project.id
                      ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                      : 'text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
                  )}
                >
                  {project.icon ?? '📁'} {project.name}
                </button>
              ))
            )}
          </div>

          {/* Task list for selected project */}
          {selectedProjectId && (
            <div className="max-h-48 overflow-y-auto">
              <p className="text-[10px] text-[var(--theme-muted)] px-3 py-1">Task</p>
              <ProjectTaskList
                projectId={selectedProjectId}
                value={value}
                onChange={(id) => {
                  onChange(id)
                  setOpen(false)
                }}
              />
            </div>
          )}

          {/* Clear button */}
          {value && (
            <div className="border-t border-[var(--theme-border)] p-2">
              <button
                type="button"
                onClick={handleClear}
                className="w-full text-xs text-red-400 hover:text-red-300 transition-colors py-1"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
