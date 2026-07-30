import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAllTasks, type ProjectTaskWithMeta } from '@/hooks/use-all-tasks'
import { StatusBadge } from '@/components/projects/status-badge'
import { DeadlineChip } from '@/components/projects/deadline-chip'
import type { TaskStatus } from '@/lib/projects-types'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: Array<{ value: TaskStatus | ''; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Fazendo' },
  { value: 'review', label: 'Revisão' },
  { value: 'done', label: 'Feito' },
]

export function AllView() {
  const navigate = useNavigate()
  const { data: tasksData, isLoading } = useAllTasks()
  const tasks = tasksData?.tasks ?? []
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [search, setSearch] = useState('')

  const filtered = useMemo((): ProjectTaskWithMeta[] => {
    return tasks.filter((task) => {
      if (statusFilter && task.status !== statusFilter) return false
      if (search && !task.title.toLowerCase().includes(search.toLowerCase()))
        return false
      return true
    })
  }, [tasks, statusFilter, search])

  function handleTaskClick(task: { id: string; project_id: string }) {
    void navigate({
      to: '/projects/$projectId/tasks/$taskId',
      params: { projectId: task.project_id, taskId: task.id },
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl mx-4 mt-4 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-medium text-ink">Todas as Tasks</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              placeholder="Buscar por título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg border',
                'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
                'placeholder:text-[var(--theme-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
              )}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
              className={cn(
                'text-xs px-2 py-1.5 rounded-lg border bg-transparent',
                'border-[var(--theme-border)] text-[var(--theme-muted)]',
              )}
              style={{ colorScheme: 'dark' }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--theme-muted)]">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-sm font-medium">Nenhuma task encontrada</p>
            <p className="text-xs mt-1">Tente ajustar os filtros</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleTaskClick(task)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                  'bg-[var(--theme-card)] border-[var(--theme-border)]',
                  'hover:border-[var(--theme-accent)] hover:shadow-md',
                )}
              >
                <span className="text-base shrink-0">
                  {task.project_icon ?? '📁'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--theme-muted)] shrink-0">
                      {task.project_name}
                    </span>
                    <span className="text-[10px] text-[var(--theme-muted)]">·</span>
                    <span className="text-xs font-medium text-[var(--theme-text)] truncate">
                      {task.title}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <DeadlineChip deadline={task.deadline ?? null} />
                  <StatusBadge status={task.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
