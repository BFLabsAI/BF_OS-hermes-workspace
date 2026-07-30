/**
 * GET /api/project-tasks-all — global task view across all projects
 * Filters: ?status=&project_id=&include_archived=&deadline_before=
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  listAllTasks,
  ProjectsApiError,
} from '../../server/hermes-projects-api'
import {
  isTaskStatus,
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

export const Route = createFileRoute('/api/project-tasks-all')({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
          const data = await listAllTasks(filters)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
