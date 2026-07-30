/**
 * GET  /api/projects/:projectId/notes — list notes for a project
 * POST /api/projects/:projectId/notes — create a note
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createNote,
  listNotes,
  ProjectsApiError,
} from '../../server/hermes-projects-api'
import type { CreateNoteInput } from '../../lib/projects-types'

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

export const Route = createFileRoute('/api/projects/$projectId/notes')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await listNotes(params.projectId)
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

        const input: CreateNoteInput = { title: body.title }
        if (typeof body.body_json === 'string') input.body_json = body.body_json

        try {
          const data = await createNote(params.projectId, input)
          return jsonResponse(data, 201)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
