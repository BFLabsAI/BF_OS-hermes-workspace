import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTask, useUpdateTask } from '@/hooks/use-project-tasks'
import { useDeliverables } from '@/hooks/use-deliverables'
import { DeliverableCard } from '@/components/projects/deliverable-card'
import { RunLinkCard } from '@/components/projects/run-link-card'
import { StatusBadge } from '@/components/projects/status-badge'
import type { TaskStatus } from '@/lib/projects-types'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: TaskStatus[] = ['backlog', 'todo', 'doing', 'review', 'done']
const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A fazer',
  doing: 'Fazendo',
  review: 'Revisão',
  done: 'Feito',
}

interface TaskDetailPanelProps {
  taskId: string
  projectId: string
  onClose: () => void
}

export function TaskDetailPanel({ taskId, projectId, onClose }: TaskDetailPanelProps) {
  const navigate = useNavigate()
  const { data: taskData, isLoading } = useTask(taskId)
  const task = taskData?.task
  const { data: deliverablesData } = useDeliverables(taskId)
  const deliverables = deliverablesData?.deliverables ?? []
  const updateTask = useUpdateTask()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')

  const bodyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync with task data
  useEffect(() => {
    if (!task) return
    setTitle(task.title ?? '')
    setBody(task.body_json ?? '')
    setStatus(task.status ?? 'todo')
  }, [task])

  const handleStatusChange = useCallback(
    (newStatus: TaskStatus) => {
      setStatus(newStatus)
      updateTask.mutate({ id: taskId, patch: { status: newStatus } })
    },
    [taskId, updateTask],
  )

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle)
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
      titleDebounceRef.current = setTimeout(() => {
        updateTask.mutate({ id: taskId, patch: { title: newTitle } })
      }, 800)
    },
    [taskId, updateTask],
  )

  const handleBodyChange = useCallback(
    (newBody: string) => {
      setBody(newBody)
      if (bodyDebounceRef.current) clearTimeout(bodyDebounceRef.current)
      bodyDebounceRef.current = setTimeout(() => {
        updateTask.mutate({ id: taskId, patch: { body_json: newBody } })
      }, 800)
    },
    [taskId, updateTask],
  )

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )
  const labelClass = 'block text-xs font-medium text-[var(--theme-muted)] mb-1'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--theme-muted)] text-xs">
        Carregando task…
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--theme-muted)] text-xs">
        Task não encontrada
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--theme-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)] shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} size="md" />
          {updateTask.isPending && (
            <span className="text-[10px] text-[var(--theme-muted)]">Salvando…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void navigate({ to: '/tasks', search: { task: taskId } })
            }
            className="text-xs px-2.5 py-1 rounded-lg border border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)] transition-colors"
          >
            🤖 Spawn agent
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-hover)] transition-colors text-sm"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className={labelClass}>Título</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Título da task"
          />
        </div>

        {/* Status select */}
        <div>
          <label className={labelClass}>Status</label>
          <select
            className={inputClass}
            style={{ colorScheme: 'dark' }}
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        <div>
          <label className={labelClass}>Descrição</label>
          <textarea
            className={cn(inputClass, 'resize-none')}
            rows={6}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Detalhes da task…"
          />
        </div>

        {/* Deliverables */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-2">
            Entregas ({deliverables.length})
          </h3>
          {deliverables.length === 0 ? (
            <p className="text-xs text-[var(--theme-muted)]">Nenhuma entrega ainda</p>
          ) : (
            <div className="space-y-2">
              {deliverables.map((d) => (
                <DeliverableCard key={d.id} deliverable={d} />
              ))}
            </div>
          )}
        </div>

        {/* Linked Runs */}
        {task?.linked_runs && task.linked_runs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[var(--theme-text)] mb-2">
              Runs vinculadas ({task.linked_runs.length})
            </h3>
            <div className="space-y-2">
              {task.linked_runs.map((run) => (
                <RunLinkCard key={run.id} run={run} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
