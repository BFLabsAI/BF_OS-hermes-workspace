/**
 * GET    /api/project-notes/:noteId — get note detail
 * PATCH  /api/project-notes/:noteId — update note
 * DELETE /api/project-notes/:noteId — archive note
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  archiveNote,
  getNote,
  ProjectsApiError,
  updateNote,
} from '../../server/hermes-projects-api'
import type { UpdateNoteInput } from '../../lib/projects-types'

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

export const Route = createFileRoute('/api/project-notes/$noteId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        try {
          const data = await getNote(params.noteId)
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

        const patch: UpdateNoteInput = {}
        if (typeof body.title === 'string') patch.title = body.title
        if (typeof body.body_json === 'string') patch.body_json = body.body_json

        try {
          const data = await updateNote(params.noteId, patch)
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
          const data = await archiveNote(params.noteId)
          return jsonResponse(data)
        } catch (err) {
          return handleApiError(err)
        }
      },
    },
  },
})
