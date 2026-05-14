'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useKanbanEvents } from '@/lib/use-kanban-events'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, CheckListIcon, RefreshIcon } from '@hugeicons/core-free-icons'
import { TaskCard, statusHex } from './task-card'
import { TaskDialog } from './task-dialog'
import { ListView } from './list-view'
import { DashboardView } from './dashboard-view'
import { DispatcherPanel } from './dispatcher-panel'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  STATUS_LABELS,
  STATUS_ORDER,
  archiveTask,
  createTask,
  fetchAssignees,
  fetchStats,
  fetchTasks,
  moveTask,
  nudgeDispatcher,
  updateTask,
} from '@/lib/tasks-api'
import type {
  CreateTaskInput,
  KanbanTaskSummary,
  TaskAssignee,
  TaskStatus,
  UpdateTaskInput,
} from '@/lib/tasks-api'

const QUERY_KEY = ['hermes', 'tasks'] as const
const ASSIGNEES_KEY = ['hermes', 'tasks', 'assignees'] as const
const STATS_KEY = ['hermes', 'tasks', 'stats'] as const

export const TASKS_BOARD_HELP_TEXT =
  'Drag cards to change status. Open a card to set assignee, priority, and view comments.'

// The 6 active columns; archived only when toggled.
const ACTIVE_STATUSES: TaskStatus[] = STATUS_ORDER.filter((s) => s !== 'archived')

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 animate-pulse">
      <div className="h-3.5 bg-[var(--theme-hover)] rounded w-3/4 mb-2" />
      <div className="h-2.5 bg-[var(--theme-hover)] rounded w-full mb-1" />
      <div className="h-2.5 bg-[var(--theme-hover)] rounded w-2/3 mb-3" />
      <div className="flex gap-1.5">
        <div className="h-4 w-12 bg-[var(--theme-hover)] rounded" />
        <div className="h-4 w-10 bg-[var(--theme-hover)] rounded" />
      </div>
    </div>
  )
}

export function TasksScreen() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [createStatus, setCreateStatus] = useState<TaskStatus>('ready')
  const [editingTask, setEditingTask] = useState<KanbanTaskSummary | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'dashboard'>('board')

  const search = useSearch({ from: '/tasks' })
  const initialAssignee = typeof search.assignee === 'string' ? search.assignee : null
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(initialAssignee)

  const tasksQuery = useQuery({
    queryKey: [...QUERY_KEY, { showArchived }],
    queryFn: () => fetchTasks({ include_archived: showArchived }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })

  // Live-refresh: invalidate queries whenever a kanban event arrives upstream.
  // Coalesce bursts (e.g. a dispatcher tick that emits several events) by
  // deferring the invalidate to the next frame.
  const invalidatePendingRef = useRef(false)
  useKanbanEvents((msg) => {
    if (msg.type !== 'event') return
    if (invalidatePendingRef.current) return
    invalidatePendingRef.current = true
    queueMicrotask(() => {
      invalidatePendingRef.current = false
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: STATS_KEY })
    })
  })

  const assigneesQuery = useQuery({
    queryKey: ASSIGNEES_KEY,
    queryFn: fetchAssignees,
    staleTime: 5 * 60_000,
  })

  const statsQuery = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  })

  const assignees: Array<TaskAssignee> = assigneesQuery.data?.assignees ?? []

  const assigneeLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of assignees) map[a.id] = a.label
    return map
  }, [assignees])

  const tasks = tasksQuery.data ?? []

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, KanbanTaskSummary[]> = {
      triage: [],
      todo: [],
      ready: [],
      running: [],
      blocked: [],
      done: [],
      archived: [],
    }
    for (const t of tasks) {
      if (assigneeFilter && t.assignee !== assigneeFilter) continue
      if (map[t.status]) map[t.status].push(t)
    }
    // Order: priority desc, then most-recently-created first.
    for (const s of STATUS_ORDER) {
      map[s].sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority
        return (b.created_at ?? 0) - (a.created_at ?? 0)
      })
    }
    return map
  }, [tasks, assigneeFilter])

  const stats = statsQuery.data
  const totalActive = useMemo(() => {
    if (!stats) return tasks.length
    const by = stats.by_status ?? {}
    return Object.entries(by)
      .filter(([k]) => k !== 'archived')
      .reduce((sum, [, n]) => sum + (n ?? 0), 0)
  }, [stats, tasks.length])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: STATS_KEY })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate()
      toast('Task created')
      setShowCreate(false)
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Failed to create task', { type: 'error' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      updateTask(id, input),
    onSuccess: () => {
      invalidate()
      toast('Task updated')
      setEditingTask(null)
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Failed to update task', { type: 'error' }),
  })

  const archiveMutation = useMutation({
    mutationFn: archiveTask,
    onSuccess: () => {
      invalidate()
      toast('Task archived')
      setEditingTask(null)
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Failed to archive task', { type: 'error' }),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      moveTask(id, status),
    onSuccess: () => invalidate(),
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Failed to move task', { type: 'error' }),
  })

  const dispatchMutation = useMutation({
    mutationFn: () => nudgeDispatcher(),
    onSuccess: (result) => {
      const n = result?.count ?? 0
      toast(
        n > 0
          ? `Dispatcher nudged — ${n} task${n === 1 ? '' : 's'} picked up`
          : 'Dispatcher nudged — no ready tasks to claim',
      )
      invalidate()
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Failed to nudge dispatcher', {
        type: 'error',
      }),
  })

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId)
    setDraggingId(taskId)
  }

  function handleDragOver(e: React.DragEvent, col: TaskStatus) {
    e.preventDefault()
    setDragOverColumn(col)
  }

  function handleDrop(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === targetStatus) {
      setDraggingId(null)
      setDragOverColumn(null)
      return
    }
    moveMutation.mutate({ id: taskId, status: targetStatus })
    setDraggingId(null)
    setDragOverColumn(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverColumn(null)
  }

  const visibleColumns: TaskStatus[] = showArchived
    ? [...ACTIVE_STATUSES, 'archived']
    : ACTIVE_STATUSES
  const colMaxWidth = Math.floor(1400 / Math.max(visibleColumns.length, 1))

  return (
    <div className="min-h-full overflow-y-auto bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        {/* Header */}
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl font-medium text-ink">Tasks</h1>
              {assigneeFilter && (
                <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
                  <span>
                    Filtered by:{' '}
                    <span className="capitalize" style={{ color: '#f59e0b' }}>
                      {assigneeFilter}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssigneeFilter(null)}
                    className="text-[var(--theme-muted)] hover:text-[var(--theme-text)] transition-colors"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}

              {/* Stats bar */}
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)] flex-wrap">
                <span>{totalActive} active</span>
                {stats && STATUS_ORDER.filter((s) => s !== 'archived').map((s) => {
                  const n = stats.by_status?.[s] ?? 0
                  if (n === 0) return null
                  return (
                    <span key={s} className="hidden sm:inline-flex items-center gap-1">
                      <span>·</span>
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: statusHex(s) }}
                      />
                      <span>
                        {n} {STATUS_LABELS[s].toLowerCase()}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Assignee filter */}
              <select
                className={cn(
                  'text-xs px-2 py-1 rounded-lg border bg-transparent',
                  'border-[var(--theme-border)] text-[var(--theme-muted)]',
                )}
                style={{ colorScheme: 'dark' }}
                value={assigneeFilter ?? ''}
                onChange={(e) => setAssigneeFilter(e.target.value || null)}
              >
                <option value="">All assignees</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>

              {/* View mode switcher */}
              <div className="inline-flex rounded-lg border border-[var(--theme-border)] overflow-hidden">
                {(['board', 'list', 'dashboard'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'text-xs px-2.5 py-1 capitalize transition-colors',
                      viewMode === mode
                        ? 'bg-[var(--theme-accent)] text-white'
                        : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowArchived((v) => !v)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  showArchived
                    ? 'border-[var(--theme-accent)] text-[var(--theme-accent)] bg-[var(--theme-hover)]'
                    : 'border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)]',
                )}
              >
                {showArchived ? 'Hide Archived' : 'Show Archived'}
              </button>
              <button
                onClick={() => dispatchMutation.mutate()}
                disabled={dispatchMutation.isPending}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  'border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)] disabled:opacity-50',
                )}
                title="Trigger a dispatcher tick to pick up ready tasks now"
              >
                {dispatchMutation.isPending ? 'Nudging…' : 'Nudge dispatcher'}
              </button>
              <button
                onClick={invalidate}
                className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
                title="Refresh"
              >
                <HugeiconsIcon icon={RefreshIcon} size={16} className="text-[var(--theme-muted)]" />
              </button>
              <button
                onClick={() => {
                  setCreateStatus('ready')
                  setShowCreate(true)
                }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--theme-accent)' }}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                New Task
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--theme-muted)]">
            {viewMode === 'board'
              ? TASKS_BOARD_HELP_TEXT
              : viewMode === 'list'
                ? 'Sort by clicking column headers. Click any row to edit.'
                : 'Aggregated metrics across the canonical kanban store.'}
          </p>
        </header>

        <DispatcherPanel />

        {viewMode === 'list' && (
          <ListView
            tasks={
              assigneeFilter
                ? tasks.filter((t) => t.assignee === assigneeFilter)
                : tasks
            }
            assigneeLabels={assigneeLabels}
            onOpen={(t) => setEditingTask(t)}
          />
        )}

        {viewMode === 'dashboard' && (
          <DashboardView
            tasks={
              assigneeFilter
                ? tasks.filter((t) => t.assignee === assigneeFilter)
                : tasks
            }
            stats={stats}
            assigneeLabels={assigneeLabels}
          />
        )}

        {/* Board */}
        {viewMode === 'board' && (
        <div
          className="mx-auto flex w-full max-w-[1400px] flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4 min-h-0"
          style={{ boxShadow: 'inset 0 8px 24px rgba(0,0,0,0.2)' }}
        >
          {visibleColumns.map((col) => {
            const colTasks = tasksByStatus[col]
            const colColor = statusHex(col)
            const isDragOver = dragOverColumn === col

            return (
              <div
                key={col}
                className={cn(
                  'flex flex-col rounded-xl border min-w-[200px] w-full shrink-0 flex-1',
                  'bg-[var(--theme-card)] border-[var(--theme-border)]',
                  'transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.25)]',
                  isDragOver && 'border-[var(--theme-accent)] bg-[var(--theme-hover)]',
                )}
                style={{ maxWidth: colMaxWidth }}
                onDragOver={(e) => handleDragOver(e, col)}
                onDrop={(e) => handleDrop(e, col)}
                onDragLeave={() => setDragOverColumn(null)}
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
                      {STATUS_LABELS[col]}
                    </span>
                    <span className="text-xs text-[var(--theme-muted)]">
                      ({tasksQuery.isFetching && tasksQuery.data === undefined
                        ? '…'
                        : colTasks.length})
                    </span>
                  </div>
                  {col !== 'archived' && (
                    <button
                      onClick={() => {
                        setCreateStatus(col)
                        setShowCreate(true)
                      }}
                      className="rounded p-0.5 hover:bg-[var(--theme-hover)] transition-colors"
                      title={`Add to ${STATUS_LABELS[col]}`}
                    >
                      <HugeiconsIcon
                        icon={Add01Icon}
                        size={14}
                        className="text-[var(--theme-muted)]"
                      />
                    </button>
                  )}
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto">
                  {tasksQuery.isError ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-8 gap-2 text-red-400"
                    >
                      <p className="text-xs font-medium">Failed to load tasks</p>
                      <button
                        onClick={() => tasksQuery.refetch()}
                        className="text-xs text-[var(--theme-accent)] hover:underline"
                      >
                        Retry
                      </button>
                    </motion.div>
                  ) : tasksQuery.isLoading ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : (
                    <AnimatePresence initial={false}>
                      {colTasks.length === 0 ? (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center py-8 gap-2 text-[var(--theme-muted)] opacity-60"
                        >
                          <HugeiconsIcon icon={CheckListIcon} size={22} />
                          <p className="text-xs font-medium">No tasks</p>
                          <p className="text-[10px]">Drop here or click + to add</p>
                        </motion.div>
                      ) : (
                        colTasks.map((task) => (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            onDragEnd={handleDragEnd}
                          >
                            <TaskCard
                              task={task}
                              assigneeLabels={assigneeLabels}
                              isDragging={draggingId === task.id}
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => setEditingTask(task)}
                            />
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Create dialog */}
        <TaskDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          defaultStatus={createStatus}
          assignees={assignees}
          isSubmitting={createMutation.isPending}
          onCreate={async (input: CreateTaskInput) => {
            await createMutation.mutateAsync(input)
          }}
        />

        {/* Edit dialog */}
        <TaskDialog
          open={editingTask !== null}
          onOpenChange={(open) => {
            if (!open) setEditingTask(null)
          }}
          task={editingTask}
          assignees={assignees}
          isSubmitting={updateMutation.isPending || archiveMutation.isPending}
          onUpdate={async (input: UpdateTaskInput) => {
            if (!editingTask) return
            await updateMutation.mutateAsync({ id: editingTask.id, input })
          }}
          onArchive={async () => {
            if (!editingTask) return
            await archiveMutation.mutateAsync(editingTask.id)
          }}
        />
      </div>
    </div>
  )
}
