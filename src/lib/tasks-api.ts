/**
 * Client API for the canonical Hermes Kanban.
 *
 * Talks to /api/kanban-* routes (which proxy to the dashboard plugin at
 * :9119/api/plugins/kanban/*). The schema is the canonical kanban.db
 * schema — see src/lib/kanban-types.ts.
 *
 * Legacy aliases (HermesTask, TaskColumn, TaskPriority) are kept as type
 * exports so existing imports compile while screens are migrated to the
 * new canonical names.
 */

import type {
  CreateTaskInput,
  KanbanAssignee,
  KanbanBoardView,
  KanbanComment,
  KanbanEvent,
  KanbanRun,
  KanbanStats,
  KanbanTask,
  KanbanTaskDetail,
  KanbanTaskSummary,
  TaskStatus,
  UpdateTaskInput,
} from './kanban-types'

export type {
  CreateTaskInput,
  KanbanAssignee,
  KanbanBoardView,
  KanbanComment,
  KanbanEvent,
  KanbanRun,
  KanbanStats,
  KanbanTask,
  KanbanTaskDetail,
  KanbanTaskSummary,
  TaskStatus,
  UpdateTaskInput,
} from './kanban-types'

export {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_ORDER,
  VALID_STATUSES,
  TERMINAL_TASK_STATUSES,
  isTaskStatus,
  isTerminalStatus,
  nowSec,
  secToIso,
  ageSec,
} from './kanban-types'

const BASE = '/api/kanban-tasks'
const BOARD_BASE = '/api/kanban-board'
const STATS_BASE = '/api/kanban-stats'
const ASSIGNEES_BASE = '/api/kanban-assignees'
const DISPATCH_BASE = '/api/kanban-dispatch'

// ── Legacy aliases (kept for incremental migration) ──────────────────

/** @deprecated use TaskStatus from kanban-types */
export type TaskColumn = TaskStatus

/** @deprecated priority is now an integer on canonical schema */
export type TaskPriority = 'high' | 'medium' | 'low'

/** @deprecated use KanbanTask / KanbanTaskSummary directly */
export type HermesTask = KanbanTaskSummary

/** @deprecated use KanbanAssignee */
export type TaskAssignee = KanbanAssignee & {
  id: string
  label: string
  isHuman?: boolean
}

export type AssigneesResponse = {
  assignees: Array<TaskAssignee>
  humanReviewer: string | null
}

// ── Fetch helpers ────────────────────────────────────────────────────

async function jsonOrThrow<T>(res: Response, msg: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>)
    const detail = (body as { error?: string }).error || `${msg}: ${res.status}`
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

// ── Assignees ────────────────────────────────────────────────────────

export async function fetchAssignees(): Promise<AssigneesResponse> {
  const res = await fetch(`${ASSIGNEES_BASE}?compat=ui`)
  if (!res.ok) return { assignees: [], humanReviewer: null }
  const data = (await res.json()) as { assignees: TaskAssignee[] }
  // No "humanReviewer" concept in canonical store — left null for legacy callers.
  return { assignees: data.assignees ?? [], humanReviewer: null }
}

// ── Board / list ─────────────────────────────────────────────────────

export async function fetchBoard(params?: {
  tenant?: string
  include_archived?: boolean
  board?: string
}): Promise<KanbanBoardView> {
  const q = new URLSearchParams()
  if (params?.tenant) q.set('tenant', params.tenant)
  if (params?.include_archived) q.set('include_archived', 'true')
  if (params?.board) q.set('board', params.board)
  const url = q.toString() ? `${BOARD_BASE}?${q}` : BOARD_BASE
  const res = await fetch(url)
  return jsonOrThrow<KanbanBoardView>(res, 'Failed to fetch board')
}

export async function fetchTasks(params?: {
  status?: TaskStatus | TaskStatus[]
  assignee?: string
  tenant?: string
  include_archived?: boolean
  board?: string
  /** @deprecated legacy alias for include_archived */
  include_done?: boolean
}): Promise<Array<KanbanTaskSummary>> {
  const q = new URLSearchParams()
  if (params?.status) {
    const value = Array.isArray(params.status) ? params.status.join(',') : params.status
    q.set('status', value)
  }
  if (params?.assignee) q.set('assignee', params.assignee)
  if (params?.tenant) q.set('tenant', params.tenant)
  if (params?.include_archived || params?.include_done) q.set('include_archived', 'true')
  if (params?.board) q.set('board', params.board)
  const url = q.toString() ? `${BASE}?${q}` : BASE
  const res = await fetch(url)
  const data = await jsonOrThrow<{ tasks: KanbanTaskSummary[] }>(
    res,
    'Failed to fetch tasks',
  )
  return data.tasks ?? []
}

export async function fetchStats(opts?: { board?: string }): Promise<KanbanStats> {
  const q = opts?.board ? `?board=${encodeURIComponent(opts.board)}` : ''
  const res = await fetch(`${STATS_BASE}${q}`)
  return jsonOrThrow<KanbanStats>(res, 'Failed to fetch stats')
}

// ── Task CRUD ────────────────────────────────────────────────────────

export async function fetchTaskDetail(taskId: string): Promise<KanbanTaskDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(taskId)}`)
  return jsonOrThrow<KanbanTaskDetail>(res, 'Failed to fetch task')
}

export async function createTask(input: CreateTaskInput): Promise<KanbanTask> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await jsonOrThrow<{ task: KanbanTask; warning?: string }>(
    res,
    'Failed to create task',
  )
  return data.task
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<KanbanTask> {
  const res = await fetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await jsonOrThrow<{ task: KanbanTask }>(res, 'Failed to update task')
  return data.task
}

/** Canonical archive (replaces legacy delete). */
export async function archiveTask(taskId: string): Promise<KanbanTask> {
  const res = await fetch(`${BASE}/${encodeURIComponent(taskId)}?action=archive`, {
    method: 'POST',
  })
  const data = await jsonOrThrow<{ task: KanbanTask }>(res, 'Failed to archive task')
  return data.task
}

/** @deprecated archive is the canonical removal — true deletes are not supported by the plugin. */
export async function deleteTask(taskId: string): Promise<void> {
  await archiveTask(taskId)
}

export async function moveTask(
  taskId: string,
  status: TaskStatus,
): Promise<KanbanTask> {
  return updateTask(taskId, { status })
}

export async function addComment(
  taskId: string,
  body: string,
  author?: string,
): Promise<KanbanComment | { ok: true }> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}?action=comment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, author }),
    },
  )
  return jsonOrThrow(res, 'Failed to add comment')
}

export async function reclaimTask(
  taskId: string,
  reason?: string,
): Promise<KanbanTask> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}?action=reclaim`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  )
  const data = await jsonOrThrow<{ task: KanbanTask }>(res, 'Failed to reclaim')
  return data.task
}

export async function reassignTask(
  taskId: string,
  input: { profile?: string; reclaim_first?: boolean; reason?: string },
): Promise<KanbanTask> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}?action=reassign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  const data = await jsonOrThrow<{ task: KanbanTask }>(res, 'Failed to reassign')
  return data.task
}

export async function nudgeDispatcher(opts?: {
  dry_run?: boolean
  max?: number
  board?: string
}): Promise<{ dispatched: Array<{ id: string; outcome: string }>; count: number }> {
  const q = new URLSearchParams()
  if (opts?.dry_run) q.set('dry_run', 'true')
  if (opts?.max != null) q.set('max', String(opts.max))
  if (opts?.board) q.set('board', opts.board)
  const url = q.toString() ? `${DISPATCH_BASE}?${q}` : DISPATCH_BASE
  const res = await fetch(url, { method: 'POST' })
  return jsonOrThrow(res, 'Failed to nudge dispatcher')
}

// ── Display constants (legacy + canonical merged) ────────────────────

import { STATUS_LABELS as _LABELS, STATUS_COLORS as _COLORS } from './kanban-types'

/** @deprecated use STATUS_LABELS from kanban-types */
export const COLUMN_LABELS = _LABELS

/** @deprecated use STATUS_COLORS from kanban-types — these are tailwind color names now */
export const COLUMN_COLORS = _COLORS

/** @deprecated use STATUS_ORDER from kanban-types */
export const COLUMN_ORDER: TaskStatus[] = [
  'triage',
  'todo',
  'ready',
  'running',
  'blocked',
  'done',
]

/** @deprecated priority is an integer now; this maps int→hex for legacy cards */
export const PRIORITY_COLORS: Record<number | string, string> = {
  // canonical int priority
  0: '#6b7280',
  1: '#3b82f6',
  2: '#f97316',
  3: '#ef4444',
  // legacy string priority (kept so old cards don't crash)
  low: '#6b7280',
  medium: '#f97316',
  high: '#ef4444',
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Returns the latest completed run summary for a task, if present.
 * Used by task-card to show "last result" preview.
 */
export function latestSummary(detail: KanbanTaskDetail): string | null {
  const runs = detail.runs ?? []
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].summary) return runs[i].summary
  }
  return null
}

/**
 * Legacy compatibility: kanban schema has no `due_date` field, so this
 * always returns false. Kept so existing TaskCard imports don't break.
 */
export function isOverdue(_task: KanbanTaskSummary): boolean {
  return false
}
