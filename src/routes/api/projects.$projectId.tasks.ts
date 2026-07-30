/**
 * GET  /api/projects/:projectId/tasks — list tasks for a project
 *   Filters: ?status=&include_archived=&deadline_before=
 * POST /api/projects/:projectId/tasks — create a task
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createTask,
  listTasks,
  ProjectsApiError,
} from '../../server/hermes-projects-api'
import {
  isTaskPriority,
  isTaskStatus,
  type CreateTaskInput,
  type TaskFilters,
  type TaskStatus,
} from '../../lib/projects-types'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function handleApiError(err: unknown): Response {
  if (err instanceof ProjectsApiError) {
    return jsonResponse({ error: err.message, status: err.status }, err.status)
  }
  return jsonResponse({ error: String(err) }, 502)
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

export const Route = createFileRoute('/api/projects/$projectId/tasks')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        const status = parseStatusFilter(url.searchParams.get('status'))
        const include_archived =
          url.searchParams.get('include_archived') === 'true' ? true : undefined
        const deadline_before_raw = url.searchParams.get('deadline_before')
        const deadline_before = deadline_before_raw
          ? Number(deadline_before_raw) || undefined
          : undefined

        const filters: TaskFilters = {}
        if (status) filters.status = status
        if (include_archived !== undefined)
          filters.include_archived = include_archived
        if (deadline_before !== undefined)
          filters.deadline_before = deadline_before

        try {
          const data = await listTasks(params.projectId, filters)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        if (!body.title || typeof body.title !== 'string') {
          return jsonResponse({ error: 'title is required' }, 400)
        }

        const input: CreateTaskInput = { title: body.title }
        if (typeof body.body_json === 'string') input.body_json = body.body_json
        if (isTaskStatus(body.status)) input.status = body.status
        if (body.deadline === null || typeof body.deadline === 'number')
          input.deadline = body.deadline as number | null
        if (isTaskPriority(body.priority)) input.priority = body.priority

        try {
          const data = await createTask(params.projectId, input)
          return jsonResponse(data, 201)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
