/**
 * GET /api/project-tasks/:taskId/context — returns task context for agent use
 * Response: { title: string, description_markdown: string }
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getTaskContext,
  ProjectsApiError,
} from '../../server/hermes-projects-api'

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

export const Route = createFileRoute('/api/project-tasks/$taskId/context')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await getTaskContext(params.taskId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
