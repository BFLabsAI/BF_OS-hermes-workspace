import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../gateway-capabilities', () => {
  return {
    dashboardFetch: vi.fn(),
  }
})

import { dashboardFetch } from '../gateway-capabilities'
import {
  KanbanApiError,
  addComment,
  buildEventsWsUrl,
  bulkUpdate,
  createBoard,
  createLink,
  createTask,
  deleteBoard,
  deleteLink,
  getAssignees,
  getBoard,
  getConfig,
  getDiagnostics,
  getStats,
  getTask,
  listBoards,
  listTasks,
  nudgeDispatcher,
  reassignTask,
  reclaimTask,
  switchBoard,
  updateBoard,
  updateTask,
} from '../hermes-kanban-api'

type FetchCall = { path: string; init: RequestInit | undefined }
const calls: FetchCall[] = []
const responseQueue: Response[] = []

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response
}

function mockEmptyResponse(status = 204): Response {
  return new Response(null, { status }) as unknown as Response
}

/** Queue a response for the next dashboardFetch call. */
function enqueue(response: Response): void {
  responseQueue.push(response)
}

/** Convenience for JSON 200 responses. */
function enqueueJson(body: unknown, status = 200): void {
  enqueue(mockJsonResponse(body, status))
}

beforeEach(() => {
  calls.length = 0
  responseQueue.length = 0
  vi.mocked(dashboardFetch).mockReset()
  vi.mocked(dashboardFetch).mockImplementation(
    async (path: string, init?: RequestInit) => {
      calls.push({ path, init })
      const next = responseQueue.shift()
      if (next) return next
      return mockJsonResponse({ ok: true })
    },
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('hermes-kanban-api: board view endpoints', () => {
  it('getBoard hits /api/plugins/kanban/board with no params by default', async () => {
    enqueueJson({
        columns: [{ name: 'ready', tasks: [] }],
        tenants: [],
        assignees: [],
        latest_event_id: 0,
        now: 1778702510,
      })
    const result = await getBoard()
    expect(calls[0].path).toBe('/api/plugins/kanban/board')
    expect(result.columns).toHaveLength(1)
  })

  it('getBoard appends tenant and include_archived to query string', async () => {
    enqueueJson({
        columns: [],
        tenants: [],
        assignees: [],
        latest_event_id: 0,
        now: 0,
      })
    await getBoard({ tenant: 'acme', include_archived: true, board: 'main' })
    expect(calls[0].path).toBe(
      '/api/plugins/kanban/board?tenant=acme&include_archived=true&board=main',
    )
  })

  it('getStats hits /stats', async () => {
    enqueueJson({
        by_status: { ready: 3 },
        by_assignee: {},
        oldest_ready_age_seconds: null,
        now: 0,
      })
    const stats = await getStats()
    expect(calls[0].path).toBe('/api/plugins/kanban/stats')
    expect(stats.by_status.ready).toBe(3)
  })

  it('getAssignees returns unwrapped list', async () => {
    enqueueJson({
        assignees: [{ id: 'codex', label: 'Codex' }],
      })
    const res = await getAssignees()
    expect(res.assignees).toHaveLength(1)
  })

  it('getDiagnostics passes severity filter', async () => {
    enqueueJson({ diagnostics: [], count: 0 })
    await getDiagnostics({ severity: 'error' })
    expect(calls[0].path).toBe('/api/plugins/kanban/diagnostics?severity=error')
  })

  it('getConfig hits /config', async () => {
    enqueueJson({
        default_tenant: '',
        lane_by_profile: true,
        include_archived_by_default: false,
        render_markdown: true,
      })
    const cfg = await getConfig()
    expect(calls[0].path).toBe('/api/plugins/kanban/config')
    expect(cfg.render_markdown).toBe(true)
  })
})

describe('hermes-kanban-api: task CRUD', () => {
  it('getTask URL-encodes the id', async () => {
    enqueueJson({
        task: { id: 't_5a457ba4' },
        comments: [],
        events: [],
        links: { parents: [], children: [] },
        runs: [],
      })
    await getTask('t_5a457ba4')
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/t_5a457ba4')
  })

  it('createTask sends JSON POST', async () => {
    enqueueJson({
        task: { id: 't_abc12345', title: 'hi', status: 'ready' },
      })
    await createTask({ title: 'hi', assignee: 'codex' })
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks')
    expect(calls[0].init?.method).toBe('POST')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.title).toBe('hi')
    expect(body.assignee).toBe('codex')
  })

  it('updateTask sends PATCH', async () => {
    enqueueJson({ task: { id: 't_x', status: 'done' } })
    await updateTask('t_x', { status: 'done', result: 'finished' })
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/t_x')
    expect(calls[0].init?.method).toBe('PATCH')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.status).toBe('done')
    expect(body.result).toBe('finished')
  })

  it('bulkUpdate posts to /tasks/bulk', async () => {
    enqueueJson({ results: [{ id: 't_1', ok: true }] })
    await bulkUpdate({ ids: ['t_1', 't_2'], status: 'done' })
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/bulk')
    expect(calls[0].init?.method).toBe('POST')
  })
})

describe('hermes-kanban-api: listTasks composes from board view', () => {
  it('flattens columns and filters by status', async () => {
    enqueueJson({
        columns: [
          {
            name: 'ready',
            tasks: [
              { id: 't_1', status: 'ready', assignee: 'codex' },
              { id: 't_2', status: 'ready', assignee: 'gemini' },
            ],
          },
          {
            name: 'done',
            tasks: [{ id: 't_3', status: 'done', assignee: 'codex' }],
          },
        ],
        tenants: [],
        assignees: [],
        latest_event_id: 0,
        now: 0,
      })
    const tasks = await listTasks({ status: 'ready' })
    expect(tasks).toHaveLength(2)
    expect(tasks.map((t) => t.id)).toEqual(['t_1', 't_2'])
  })

  it('filters by assignee', async () => {
    enqueueJson({
        columns: [
          {
            name: 'ready',
            tasks: [
              { id: 't_1', status: 'ready', assignee: 'codex' },
              { id: 't_2', status: 'ready', assignee: 'gemini' },
            ],
          },
        ],
        tenants: [],
        assignees: [],
        latest_event_id: 0,
        now: 0,
      })
    const tasks = await listTasks({ assignee: 'codex' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('t_1')
  })

  it('multi-status filter accepts array', async () => {
    enqueueJson({
        columns: [
          {
            name: 'ready',
            tasks: [{ id: 't_1', status: 'ready' }],
          },
          {
            name: 'running',
            tasks: [{ id: 't_2', status: 'running' }],
          },
          {
            name: 'done',
            tasks: [{ id: 't_3', status: 'done' }],
          },
        ],
        tenants: [],
        assignees: [],
        latest_event_id: 0,
        now: 0,
      })
    const tasks = await listTasks({ status: ['ready', 'running'] })
    expect(tasks.map((t) => t.id).sort()).toEqual(['t_1', 't_2'])
  })
})

describe('hermes-kanban-api: comments + links', () => {
  it('addComment posts to /tasks/:id/comments', async () => {
    enqueueJson({
        comment: {
          id: 1,
          task_id: 't_x',
          author: 'bf',
          body: 'hi',
          created_at: 0,
        },
      })
    await addComment('t_x', 'hi', 'bf')
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/t_x/comments')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toEqual({ body: 'hi', author: 'bf' })
  })

  it('createLink posts to /links', async () => {
    enqueueJson({ link: { parent_id: 't_p', child_id: 't_c' } })
    await createLink('t_p', 't_c')
    expect(calls[0].path).toBe('/api/plugins/kanban/links')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toEqual({ parent_id: 't_p', child_id: 't_c' })
  })

  it('deleteLink uses DELETE and query params', async () => {
    enqueueJson({ ok: true })
    await deleteLink('t_p', 't_c')
    expect(calls[0].path).toBe(
      '/api/plugins/kanban/links?parent_id=t_p&child_id=t_c',
    )
    expect(calls[0].init?.method).toBe('DELETE')
  })
})

describe('hermes-kanban-api: recovery', () => {
  it('reclaimTask POSTs with reason', async () => {
    enqueueJson({ task: { id: 't_x', status: 'ready' } })
    await reclaimTask('t_x', 'stuck')
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/t_x/reclaim')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.reason).toBe('stuck')
  })

  it('reassignTask supports reclaim_first', async () => {
    enqueueJson({ task: { id: 't_x', assignee: 'gemini' } })
    await reassignTask('t_x', { profile: 'gemini', reclaim_first: true })
    expect(calls[0].path).toBe('/api/plugins/kanban/tasks/t_x/reassign')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.profile).toBe('gemini')
    expect(body.reclaim_first).toBe(true)
  })
})

describe('hermes-kanban-api: boards', () => {
  it('listBoards', async () => {
    enqueueJson({ boards: [], current: 'default' })
    await listBoards({ include_archived: false })
    expect(calls[0].path).toBe(
      '/api/plugins/kanban/boards?include_archived=false',
    )
  })

  it('createBoard', async () => {
    enqueueJson({ board: { slug: 'main', name: 'Main' } })
    await createBoard({ slug: 'main', name: 'Main', switch: true })
    expect(calls[0].path).toBe('/api/plugins/kanban/boards')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.slug).toBe('main')
  })

  it('updateBoard PATCH', async () => {
    enqueueJson({ board: { slug: 'main', name: 'M2' } })
    await updateBoard('main', { name: 'M2' })
    expect(calls[0].path).toBe('/api/plugins/kanban/boards/main')
    expect(calls[0].init?.method).toBe('PATCH')
  })

  it('deleteBoard with hard-delete flag', async () => {
    enqueueJson({ ok: true })
    await deleteBoard('main', { delete: true })
    expect(calls[0].path).toBe('/api/plugins/kanban/boards/main?delete=true')
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('switchBoard', async () => {
    enqueueJson({ current: 'main' })
    await switchBoard('main')
    expect(calls[0].path).toBe('/api/plugins/kanban/boards/main/switch')
    expect(calls[0].init?.method).toBe('POST')
  })
})

describe('hermes-kanban-api: dispatch', () => {
  it('nudgeDispatcher posts with options', async () => {
    enqueueJson({ dispatched: [], count: 0 })
    await nudgeDispatcher({ dry_run: true, max: 8 })
    expect(calls[0].path).toBe(
      '/api/plugins/kanban/dispatch?dry_run=true&max=8',
    )
    expect(calls[0].init?.method).toBe('POST')
  })
})

describe('hermes-kanban-api: error handling', () => {
  it('throws KanbanApiError on non-2xx', async () => {
    enqueue(new Response('not found', { status: 404 }) as unknown as Response)
    await expect(getTask('t_missing')).rejects.toBeInstanceOf(KanbanApiError)
  })

  it('passes status code through KanbanApiError', async () => {
    enqueue(new Response('boom', { status: 500 }) as unknown as Response)
    try {
      await getStats()
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(KanbanApiError)
      expect((err as KanbanApiError).status).toBe(500)
    }
  })

  it('handles 204 No Content', async () => {
    enqueue(mockEmptyResponse(204))
    const result = await deleteLink('t_p', 't_c')
    expect(result).toBeUndefined()
  })
})

describe('buildEventsWsUrl', () => {
  it('rewrites http→ws and appends params', () => {
    const url = buildEventsWsUrl('http://127.0.0.1:9119', 'secret-token', {
      since: 42,
      board: 'main',
    })
    expect(url).toBe(
      'ws://127.0.0.1:9119/api/plugins/kanban/events?token=secret-token&since=42&board=main',
    )
  })

  it('rewrites https→wss', () => {
    const url = buildEventsWsUrl('https://hermes.example.com', 'tok')
    expect(url).toBe(
      'wss://hermes.example.com/api/plugins/kanban/events?token=tok',
    )
  })
})
