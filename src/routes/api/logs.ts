/**
 * GET /api/logs — returns recent log entries as JSON.
 * Query params: limit, level (debug|info|warn|error|all), search, since (id)
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { ensureLogStoreStarted, getLogsFromFile } from '../../server/log-store'

export const Route = createFileRoute('/api/logs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        ensureLogStoreStarted()

        const url = new URL(request.url)
        const limit = parseInt(url.searchParams.get('limit') ?? '500', 10)
        const level = (url.searchParams.get('level') ?? 'all') as 'all' | 'debug' | 'info' | 'warn' | 'error'
        const search = url.searchParams.get('search') ?? undefined

        // Read from the persisted JSONL file — avoids cross-chunk ring buffer isolation
        const entries = await getLogsFromFile({ limit, level, search })

        return new Response(JSON.stringify({ entries }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
