import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../../server/rate-limit'
import { createSession } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/session')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const ip = getClientIp(request)
        if (!rateLimit(`tmux-session:${ip}`, 30, 60_000)) return rateLimitResponse()

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const tabId = typeof body.tabId === 'string' ? body.tabId : ''
        const name = typeof body.name === 'string' ? body.name : undefined
        const cwd = typeof body.cwd === 'string' ? body.cwd : undefined
        const cols = typeof body.cols === 'number' ? Math.floor(body.cols) : undefined
        const rows = typeof body.rows === 'number' ? Math.floor(body.rows) : undefined

        if (!tabId) {
          return new Response(JSON.stringify({ ok: false, error: 'tabId required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const result = await createSession({ tabId, name, cwd, cols, rows })
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
