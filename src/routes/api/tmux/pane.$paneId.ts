import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { killPane } from '../../../server/tmux-sessions'

export const Route = createFileRoute('/api/tmux/pane/$paneId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const ok = killPane(params.paneId)
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
