/**
 * TypeScript client for the Hermes Kanban dashboard plugin
 * (mounted at :9119/api/plugins/kanban/*).
 *
 * This is the canonical HTTP surface for the kanban SQLite store. Same code
 * path as the `hermes kanban` CLI and the agent slash command — zero schema
 * drift.
 *
 * Auth: dashboard plugin routes are unauthenticated on loopback by design
 * (see `web_server.auth_middleware`). We gate at the workspace proxy layer
 * with `isAuthenticated()` from auth-middleware.ts.
 */

import { dashboardFetch } from './gateway-capabilities'
import type {
  BulkResult,
  BulkUpdateInput,
  CreateTaskInput,
  KanbanAssignee,
  KanbanBoardInfo,
  KanbanBoardView,
  KanbanComment,
  KanbanConfig,
  KanbanEvent,
  KanbanLink,
  KanbanNotifySub,
  KanbanRun,
  KanbanStats,
  KanbanTask,
  KanbanTaskDetail,
  TaskFilters,
  UpdateTaskInput,
} from '../lib/kanban-types'

const BASE = '/api/plugins/kanban'

class KanbanApiError extends Error {
  status: number
  path: string
  constructor(path: string, status: number, message: string) {
    super(`Hermes kanban ${path}: ${status} ${message}`)
    this.name = 'KanbanApiError'
    this.path = path
    this.status = status
  }
}

async function kanbanJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new KanbanApiError(path, res.status, text)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

// ── Board view ───────────────────────────────────────────────────────

export async function getBoard(opts: {
  tenant?: string
  include_archived?: boolean
  board?: string
} = {}): Promise<KanbanBoardView> {
  return kanbanJson<KanbanBoardView>(`${BASE}/board${qs(opts)}`)
}

export async function getStats(opts: { board?: string } = {}): Promise<KanbanStats> {
  return kanbanJson<KanbanStats>(`${BASE}/stats${qs(opts)}`)
}

export async function getAssignees(opts: { board?: string } = {}): Promise<{
  assignees: KanbanAssignee[]
}> {
  return kanbanJson<{ assignees: KanbanAssignee[] }>(
    `${BASE}/assignees${qs(opts)}`,
  )
}

export async function getDiagnostics(opts: {
  board?: string
  severity?: 'warning' | 'error' | 'critical'
} = {}): Promise<{
  diagnostics: Array<{
    task_id: string
    task_title: string
    task_status: string
    task_assignee: string | null
    diagnostics: Array<{ code: string; severity: string; message: string }>
  }>
  count: number
}> {
  return kanbanJson(`${BASE}/diagnostics${qs(opts)}`)
}

export async function getConfig(): Promise<KanbanConfig> {
  return kanbanJson<KanbanConfig>(`${BASE}/config`)
}

// ── Task CRUD ────────────────────────────────────────────────────────

export async function getTask(
  taskId: string,
  opts: { board?: string } = {},
): Promise<KanbanTaskDetail> {
  const path = `${BASE}/tasks/${encodeURIComponent(taskId)}${qs(opts)}`
  return kanbanJson<KanbanTaskDetail>(path)
}

export async function createTask(
  input: CreateTaskInput,
  opts: { board?: string } = {},
): Promise<{ task: KanbanTask; warning?: string }> {
  return kanbanJson<{ task: KanbanTask; warning?: string }>(
    `${BASE}/tasks${qs(opts)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export async function updateTask(
  taskId: string,
  patch: UpdateTaskInput,
  opts: { board?: string } = {},
): Promise<{ task: KanbanTask }> {
  return kanbanJson<{ task: KanbanTask }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}${qs(opts)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export async function bulkUpdate(
  input: BulkUpdateInput,
  opts: { board?: string } = {},
): Promise<BulkResult> {
  return kanbanJson<BulkResult>(`${BASE}/tasks/bulk${qs(opts)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

// ── Convenience listing — uses board view, optionally flattens ──────

export async function listTasks(filters: TaskFilters = {}): Promise<KanbanTask[]> {
  const board = await getBoard({
    tenant: filters.tenant,
    include_archived: filters.include_archived,
    board: filters.board,
  })
  let tasks = board.columns.flatMap((col) => col.tasks)

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    const set = new Set(statuses)
    tasks = tasks.filter((t) => set.has(t.status))
  }
  if (filters.assignee !== undefined) {
    tasks = tasks.filter((t) => t.assignee === filters.assignee)
  }
  return tasks
}

// ── Comments + Links ─────────────────────────────────────────────────

export async function addComment(
  taskId: string,
  body: string,
  author?: string,
  opts: { board?: string } = {},
): Promise<{ comment: KanbanComment }> {
  return kanbanJson<{ comment: KanbanComment }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/comments${qs(opts)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, author }),
    },
  )
}

export async function createLink(
  parent_id: string,
  child_id: string,
  opts: { board?: string } = {},
): Promise<{ link: KanbanLink }> {
  return kanbanJson<{ link: KanbanLink }>(`${BASE}/links${qs(opts)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id, child_id }),
  })
}

export async function deleteLink(
  parent_id: string,
  child_id: string,
  opts: { board?: string } = {},
): Promise<{ ok: boolean }> {
  return kanbanJson<{ ok: boolean }>(
    `${BASE}/links${qs({ parent_id, child_id, ...opts })}`,
    { method: 'DELETE' },
  )
}

// ── Recovery actions ─────────────────────────────────────────────────

export async function reclaimTask(
  taskId: string,
  reason?: string,
  opts: { board?: string } = {},
): Promise<{ task: KanbanTask }> {
  return kanbanJson<{ task: KanbanTask }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/reclaim${qs(opts)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  )
}

export async function reassignTask(
  taskId: string,
  input: { profile?: string; reclaim_first?: boolean; reason?: string },
  opts: { board?: string } = {},
): Promise<{ task: KanbanTask }> {
  return kanbanJson<{ task: KanbanTask }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/reassign${qs(opts)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

// ── Home-channel subscriptions ───────────────────────────────────────

export async function getHomeChannels(opts: {
  task_id?: string
} = {}): Promise<{ subscriptions: KanbanNotifySub[] }> {
  return kanbanJson<{ subscriptions: KanbanNotifySub[] }>(
    `${BASE}/home-channels${qs(opts)}`,
  )
}

export async function subscribeHomeChannel(
  taskId: string,
  platform: string,
  body: { chat_id: string; thread_id?: string; user_id?: string },
  opts: { board?: string } = {},
): Promise<{ ok: boolean }> {
  return kanbanJson<{ ok: boolean }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/home-subscribe/${encodeURIComponent(platform)}${qs(opts)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export async function unsubscribeHomeChannel(
  taskId: string,
  platform: string,
  opts: { board?: string } = {},
): Promise<{ ok: boolean }> {
  return kanbanJson<{ ok: boolean }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/home-subscribe/${encodeURIComponent(platform)}${qs(opts)}`,
    { method: 'DELETE' },
  )
}

// ── Boards (multi-project) ───────────────────────────────────────────

export async function listBoards(
  opts: { include_archived?: boolean } = {},
): Promise<{ boards: KanbanBoardInfo[]; current: string }> {
  return kanbanJson<{ boards: KanbanBoardInfo[]; current: string }>(
    `${BASE}/boards${qs(opts)}`,
  )
}

export async function createBoard(input: {
  slug: string
  name?: string
  description?: string
  icon?: string
  color?: string
  switch?: boolean
}): Promise<{ board: KanbanBoardInfo }> {
  return kanbanJson<{ board: KanbanBoardInfo }>(`${BASE}/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updateBoard(
  slug: string,
  patch: {
    name?: string
    description?: string
    icon?: string
    color?: string
  },
): Promise<{ board: KanbanBoardInfo }> {
  return kanbanJson<{ board: KanbanBoardInfo }>(
    `${BASE}/boards/${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export async function deleteBoard(
  slug: string,
  opts: { delete?: boolean } = {},
): Promise<{ ok: boolean }> {
  return kanbanJson<{ ok: boolean }>(
    `${BASE}/boards/${encodeURIComponent(slug)}${qs(opts)}`,
    { method: 'DELETE' },
  )
}

export async function switchBoard(slug: string): Promise<{ current: string }> {
  return kanbanJson<{ current: string }>(
    `${BASE}/boards/${encodeURIComponent(slug)}/switch`,
    { method: 'POST' },
  )
}

// ── Logs + dispatch nudge ────────────────────────────────────────────

export async function getTaskLog(
  taskId: string,
  opts: { tail?: number; board?: string } = {},
): Promise<{ log: string }> {
  return kanbanJson<{ log: string }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/log${qs(opts)}`,
  )
}

export async function nudgeDispatcher(opts: {
  dry_run?: boolean
  max?: number
  board?: string
} = {}): Promise<{
  dispatched: Array<{ id: string; outcome: string }>
  count: number
}> {
  return kanbanJson(`${BASE}/dispatch${qs(opts)}`, { method: 'POST' })
}

// ── Helpers re-exported for routes ───────────────────────────────────

export { KanbanApiError }

/**
 * Direct passthrough for special routes (event WS upgrade etc.).
 * Returns the underlying fetch Response — callers handle status.
 */
export async function rawDashboardFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return dashboardFetch(path, init)
}

/** Compose the WS URL for /api/plugins/kanban/events. */
export function buildEventsWsUrl(
  baseHttpUrl: string,
  token: string,
  opts: { since?: number; board?: string } = {},
): string {
  const wsBase = baseHttpUrl.replace(/^http/i, 'ws')
  const params = new URLSearchParams()
  params.set('token', token)
  if (opts.since != null) params.set('since', String(opts.since))
  if (opts.board) params.set('board', opts.board)
  return `${wsBase}${BASE}/events?${params.toString()}`
}
