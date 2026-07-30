/**
 * GET    /api/project-tasks/:taskId — get task detail (with deliverables + links)
 * PATCH  /api/project-tasks/:taskId — update task
 * DELETE /api/project-tasks/:taskId — archive task
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  archiveTask,
  getTask,
  ProjectsApiError,
  updateTask,
} from '../../server/hermes-projects-api'
import {
  isTaskPriority,
  isTaskStatus,
  type UpdateTaskInput,
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

function parseUpdateInput(body: Record<string, unknown>): UpdateTaskInput {
  const patch: UpdateTaskInput = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.body_json === 'string') patch.body_json = body.body_json
  if (isTaskStatus(body.status)) patch.status = body.status
  if (body.deadline === null || typeof body.deadline === 'number')
    patch.deadline = body.deadline as number | null
  if (isTaskPriority(body.priority)) patch.priority = body.priority
  return patch
}

export const Route = createFileRoute('/api/project-tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await getTask(params.taskId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400)
        }

        const patch = parseUpdateInput(body)
        try {
          const data = await updateTask(params.taskId, patch)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await archiveTask(params.taskId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
