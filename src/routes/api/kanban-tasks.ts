/**
 * GET /api/kanban-tasks — list tasks (canonical kanban.db via plugin).
 * POST /api/kanban-tasks — create a task.
 *
 * Filters: ?status=&assignee=&tenant=&include_archived=&board=
 * Status accepts a single value or comma-separated list:
 *   ?status=ready,running
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createTask,
  KanbanApiError,
  listTasks,
} from '../../server/hermes-kanban-api'
import {
  isTaskStatus,
  isWorkspaceKind,
  type CreateTaskInput,
  type TaskStatus,
} from '../../lib/kanban-types'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseStatusFilter(raw: string | null): TaskStatus[] | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const valid = parts.filter((p): p is TaskStatus => isTaskStatus(p))
  return valid.length > 0 ? valid : undefined
}

function parseCreateInput(body: Record<string, unknown>): CreateTaskInput | null {
  if (!body.title || typeof body.title !== 'string') return null

  const input: CreateTaskInput = { title: body.title }

  if (typeof body.body === 'string') input.body = body.body
  if (typeof body.assignee === 'string') input.assignee = body.assignee
  if (typeof body.tenant === 'string') input.tenant = body.tenant
  if (typeof body.priority === 'number') input.priority = body.priority
  if (isWorkspaceKind(body.workspace_kind)) input.workspace_kind = body.workspace_kind
  if (typeof body.workspace_path === 'string')
    input.workspace_path = body.workspace_path
  if (Array.isArray(body.parents)) {
    input.parents = body.parents.filter(
      (p): p is string => typeof p === 'string',
    )
  }
  if (typeof body.triage === 'boolean') input.triage = body.triage
  if (typeof body.idempotency_key === 'string')
    input.idempotency_key = body.idempotency_key
  if (typeof body.max_runtime_seconds === 'number')
    input.max_runtime_seconds = body.max_runtime_seconds
  if (Array.isArray(body.skills)) {
    input.skills = body.skills.filter(
      (s): s is string => typeof s === 'string',
    )
  }
  return input
}

export const Route = createFileRoute('/api/kanban-tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const status = parseStatusFilter(url.searchParams.get('status'))
        const assignee = url.searchParams.get('assignee')
        const tenant = url.searchParams.get('tenant') || undefined
        const include_archived =
          url.searchParams.get('include_archived') === 'true' ? true : undefined
        const board = url.searchParams.get('board') || undefined

        try {
          const tasks = await listTasks({
            status,
            assignee: assignee ?? undefined,
            tenant,
            include_archived,
            board,
          })
          return jsonResponse({ tasks })
        } catch (err) {
          if (err instanceof KanbanApiError) {
            return jsonResponse(
              { error: err.message, status: err.status },
              err.status,
            )
          }
          return jsonResponse({ error: String(err) }, 502)
        }
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const board = url.searchParams.get('board') || undefined

        let parsed: Record<string, unknown>
        try {
          parsed = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        const input = parseCreateInput(parsed)
        if (!input) {
          return jsonResponse({ error: 'title is required' }, 400)
        }

        try {
          const result = await createTask(input, { board })
          return jsonResponse(result, 201)
        } catch (err) {
          if (err instanceof KanbanApiError) {
            return jsonResponse(
              { error: err.message, status: err.status },
              err.status,
            )
          }
          return jsonResponse({ error: String(err) }, 502)
        }
      },
    },
  },
})
