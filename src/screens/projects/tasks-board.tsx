import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Outlet } from '@tanstack/react-router'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useProjectTasks, useUpdateTask, useCreateTask } from '@/hooks/use-project-tasks'
import { TaskCardProject } from './task-card-project'
import type { ProjectTask, TaskStatus } from '@/lib/projects-types'
import { cn } from '@/lib/utils'

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'A fazer' },
  { status: 'doing', label: 'Fazendo' },
  { status: 'review', label: 'Revisão' },
  { status: 'done', label: 'Feito' },
]

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: '#6b7280',
  todo: '#3b82f6',
  doing: '#eab308',
  review: '#a855f7',
  done: '#22c55e',
}

interface SortableTaskCardProps {
  task: ProjectTask
  onClick: () => void
}

function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardProject task={task} onClick={onClick} />
    </div>
  )
}

interface TasksBoardProps {
  projectId: string
}

export function TasksBoard({ projectId }: TasksBoardProps) {
  const navigate = useNavigate()
  const { data: tasksData, isLoading } = useProjectTasks(projectId)
  const tasks = tasksData?.tasks ?? []
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, ProjectTask[]> = {
      backlog: [],
      todo: [],
      doing: [],
      review: [],
      done: [],
    }
    for (const task of tasks) {
      if (map[task.status]) {
        map[task.status].push(task)
      }
    }
    return map
  }, [tasks])

  const activeTask = tasks.find((t) => t.id === activeTaskId)

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null)
    const { active, over } = event
    if (!over) return

    // The over.id could be a column ID (status) or a task ID in a sortable list.
    // We check if over.id is a column status first.
    let newStatus: TaskStatus | null = null
    const columnMatch = COLUMNS.find((c) => c.status === over.id)
    if (columnMatch) {
      newStatus = columnMatch.status
    } else {
      // Dropped on a task — find the task's column
      const overTask = tasks.find((t) => t.id === over.id)
      if (overTask) newStatus = overTask.status
    }

    if (!newStatus) return
    const task = tasks.find((t) => t.id === active.id)
    if (!task || task.status === newStatus) return

    updateTask.mutate({ id: task.id, patch: { status: newStatus } })
  }

  const handleTaskClick = useCallback(
    (taskId: string) => {
      void navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: { projectId, taskId },
      })
    },
    [navigate, projectId],
  )

  const handleAddTask = useCallback(
    async (status: TaskStatus) => {
      const title = window.prompt('Título da nova task:')
      if (!title?.trim()) return
      await createTask.mutateAsync({ projectId, input: { title: title.trim(), status } })
    },
    [createTask, projectId],
  )

  return (
    <div className="relative flex h-full min-h-0">
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 p-4 overflow-x-auto min-h-0 h-full">
        {COLUMNS.map(({ status, label }) => {
          const colTasks = tasksByStatus[status]
          const colColor = STATUS_COLORS[status]

          return (
            <div
              key={status}
              className={cn(
                'flex flex-col rounded-xl border min-w-[200px] w-full shrink-0 flex-1',
                'bg-[var(--theme-card)] border-[var(--theme-border)]',
                'shadow-[0_2px_12px_rgba(0,0,0,0.25)]',
              )}
              style={{ maxWidth: 280 }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--theme-border)] rounded-t-xl"
                style={{
                  borderTopWidth: 2,
                  borderTopColor: colColor,
                  borderTopStyle: 'solid',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: colColor }}
                  />
                  <span className="text-xs font-semibold text-[var(--theme-text)]">
                    {label}
                  </span>
                  <span className="text-xs text-[var(--theme-muted)]">
                    ({isLoading ? '…' : colTasks.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddTask(status)}
                  className="rounded p-0.5 hover:bg-[var(--theme-hover)] transition-colors text-[var(--theme-muted)] text-sm"
                  title={`Nova task em ${label}`}
                >
                  +
                </button>
              </div>

              {/* Droppable area */}
              <SortableContext
                id={status}
                items={colTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto min-h-[60px]"
                  data-droppable-id={status}
                >
                  {isLoading ? (
                    <>
                      {[...Array(2)].map((_, i) => (
                        <div
                          key={i}
                          className="h-16 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-hover)] animate-pulse"
                        />
                      ))}
                    </>
                  ) : colTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-[var(--theme-muted)] opacity-50">
                      <p className="text-xs">Vazio</p>
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        onClick={() => handleTaskClick(task.id)}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 opacity-90">
            <TaskCardProject task={activeTask} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
    {/* Task detail panel renders as child route overlay */}
    <Outlet />
    </div>
  )
}
