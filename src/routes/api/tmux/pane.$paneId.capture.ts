import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { capturePane } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/pane/$paneId/capture')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const url = new URL(request.url)
        const linesParam = url.searchParams.get('lines')
        const lines = linesParam ? Math.max(10, Math.min(10000, parseInt(linesParam, 10))) : 1000

        const text = capturePane(params.paneId, lines)
        return new Response(JSON.stringify({ ok: true, text }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
