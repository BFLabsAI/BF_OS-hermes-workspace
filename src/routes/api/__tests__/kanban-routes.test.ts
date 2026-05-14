import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

const apiMocks = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getStats: vi.fn(),
  getAssignees: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  addComment: vi.fn(),
  reclaimTask: vi.fn(),
  reassignTask: vi.fn(),
  nudgeDispatcher: vi.fn(),
  KanbanApiError: class KanbanApiError extends Error {
    status: number
    path: string
    constructor(path: string, status: number, message: string) {
      super(`Hermes kanban ${path}: ${status} ${message}`)
      this.name = 'KanbanApiError'
      this.path = path
      this.status = status
    }
  },
}))

vi.mock('../../../server/hermes-kanban-api', () => apiMocks)

async function getHandler(routeFile: string, method: string) {
  vi.resetModules()
  const mod = await import(routeFile)
  return (mod as any).Route.server.handlers[method]
}

beforeEach(() => {
  for (const k of Object.keys(apiMocks)) {
    const fn = (apiMocks as any)[k]
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset()
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/kanban-board', () => {
  it('passes filters to getBoard', async () => {
    apiMocks.getBoard.mockResolvedValue({
      columns: [],
      tenants: [],
      assignees: [],
      latest_event_id: 0,
      now: 0,
    })
    const handler = await getHandler('../kanban-board', 'GET')
    const req = new Request(
      'http://localhost/api/kanban-board?tenant=acme&include_archived=true&board=main',
    )
    const res = await handler({ request: req })
    expect(res.status).toBe(200)
    expect(apiMocks.getBoard).toHaveBeenCalledWith({
      tenant: 'acme',
      include_archived: true,
      board: 'main',
    })
  })

  it('returns 401 when not authenticated', async () => {
    vi.doMock('../../../server/auth-middleware', () => ({
      isAuthenticated: () => false,
    }))
    const handler = await getHandler('../kanban-board', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-board'),
    })
    expect(res.status).toBe(401)
    vi.doUnmock('../../../server/auth-middleware')
  })

  it('translates KanbanApiError to upstream status', async () => {
    apiMocks.getBoard.mockRejectedValue(
      new apiMocks.KanbanApiError('/board', 503, 'upstream down'),
    )
    const handler = await getHandler('../kanban-board', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-board'),
    })
    expect(res.status).toBe(503)
  })
})

describe('GET /api/kanban-stats', () => {
  it('returns stats payload', async () => {
    apiMocks.getStats.mockResolvedValue({
      by_status: { ready: 2 },
      by_assignee: {},
      oldest_ready_age_seconds: null,
      now: 0,
    })
    const handler = await getHandler('../kanban-stats', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-stats'),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.by_status.ready).toBe(2)
  })
})

describe('GET /api/kanban-assignees', () => {
  it('returns raw plugin shape by default', async () => {
    apiMocks.getAssignees.mockResolvedValue({
      assignees: [{ name: 'codex', on_disk: true, counts: { ready: 1 } }],
    })
    const handler = await getHandler('../kanban-assignees', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-assignees'),
    })
    const body = await res.json()
    expect(body.assignees[0].name).toBe('codex')
  })

  it('maps to UI shape when compat=ui', async () => {
    apiMocks.getAssignees.mockResolvedValue({
      assignees: [{ name: 'codex', on_disk: true, counts: {} }],
    })
    const handler = await getHandler('../kanban-assignees', 'GET')
    const res = await handler({
      request: new Request(
        'http://localhost/api/kanban-assignees?compat=ui',
      ),
    })
    const body = await res.json()
    expect(body.assignees[0]).toEqual({
      id: 'codex',
      label: 'codex',
      isHuman: false,
      on_disk: true,
      counts: {},
    })
  })
})

describe('GET /api/kanban-tasks', () => {
  it('parses status filter as comma-separated', async () => {
    apiMocks.listTasks.mockResolvedValue([])
    const handler = await getHandler('../kanban-tasks', 'GET')
    await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks?status=ready,running',
      ),
    })
    expect(apiMocks.listTasks).toHaveBeenCalledWith({
      status: ['ready', 'running'],
      assignee: undefined,
      tenant: undefined,
      include_archived: undefined,
      board: undefined,
    })
  })

  it('rejects invalid status values silently', async () => {
    apiMocks.listTasks.mockResolvedValue([])
    const handler = await getHandler('../kanban-tasks', 'GET')
    await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks?status=bogus,ready',
      ),
    })
    expect(apiMocks.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ready'] }),
    )
  })
})

describe('POST /api/kanban-tasks', () => {
  it('rejects empty body', async () => {
    const handler = await getHandler('../kanban-tasks', 'POST')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('creates a task and returns 201', async () => {
    apiMocks.createTask.mockResolvedValue({
      task: { id: 't_1', title: 'hi', status: 'ready' },
    })
    const handler = await getHandler('../kanban-tasks', 'POST')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'hi',
          assignee: 'codex',
          skills: ['python', 'docker'],
        }),
      }),
    })
    expect(res.status).toBe(201)
    expect(apiMocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'hi',
        assignee: 'codex',
        skills: ['python', 'docker'],
      }),
      { board: undefined },
    )
  })
})

describe('GET /api/kanban-tasks/:taskId', () => {
  it('returns 404-mapped error via KanbanApiError', async () => {
    apiMocks.getTask.mockRejectedValue(
      new apiMocks.KanbanApiError('/tasks/t_missing', 404, 'not found'),
    )
    const handler = await getHandler('../kanban-tasks.$taskId', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-tasks/t_missing'),
      params: { taskId: 't_missing' },
    })
    expect(res.status).toBe(404)
  })

  it('returns detail on success', async () => {
    apiMocks.getTask.mockResolvedValue({
      task: { id: 't_x', title: 'hi' },
      comments: [],
      events: [],
      links: { parents: [], children: [] },
      runs: [],
    })
    const handler = await getHandler('../kanban-tasks.$taskId', 'GET')
    const res = await handler({
      request: new Request('http://localhost/api/kanban-tasks/t_x'),
      params: { taskId: 't_x' },
    })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/kanban-tasks/:taskId', () => {
  it('rejects invalid status', async () => {
    apiMocks.updateTask.mockResolvedValue({ task: { id: 't_x', status: 'done' } })
    const handler = await getHandler('../kanban-tasks.$taskId', 'PATCH')
    await handler({
      request: new Request('http://localhost/api/kanban-tasks/t_x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'bogus', title: 'new title' }),
      }),
      params: { taskId: 't_x' },
    })
    expect(apiMocks.updateTask).toHaveBeenCalledWith(
      't_x',
      expect.objectContaining({ title: 'new title' }),
      { board: undefined },
    )
    expect((apiMocks.updateTask.mock.calls[0][1] as any).status).toBeUndefined()
  })

  it('passes valid status through', async () => {
    apiMocks.updateTask.mockResolvedValue({ task: { id: 't_x', status: 'done' } })
    const handler = await getHandler('../kanban-tasks.$taskId', 'PATCH')
    await handler({
      request: new Request('http://localhost/api/kanban-tasks/t_x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', result: 'finished' }),
      }),
      params: { taskId: 't_x' },
    })
    expect(apiMocks.updateTask).toHaveBeenCalledWith(
      't_x',
      expect.objectContaining({ status: 'done', result: 'finished' }),
      { board: undefined },
    )
  })
})

describe('POST /api/kanban-tasks/:taskId actions', () => {
  it('action=comment creates a comment', async () => {
    apiMocks.addComment.mockResolvedValue({
      comment: { id: 1, task_id: 't_x', author: 'bf', body: 'hi', created_at: 0 },
    })
    const handler = await getHandler('../kanban-tasks.$taskId', 'POST')
    const res = await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks/t_x?action=comment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'hi', author: 'bf' }),
        },
      ),
      params: { taskId: 't_x' },
    })
    expect(res.status).toBe(201)
    expect(apiMocks.addComment).toHaveBeenCalledWith('t_x', 'hi', 'bf', {
      board: undefined,
    })
  })

  it('action=reclaim invokes reclaimTask', async () => {
    apiMocks.reclaimTask.mockResolvedValue({ task: { id: 't_x', status: 'ready' } })
    const handler = await getHandler('../kanban-tasks.$taskId', 'POST')
    const res = await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks/t_x?action=reclaim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'stuck' }),
        },
      ),
      params: { taskId: 't_x' },
    })
    expect(res.status).toBe(200)
    expect(apiMocks.reclaimTask).toHaveBeenCalledWith('t_x', 'stuck', {
      board: undefined,
    })
  })

  it('action=reassign invokes reassignTask', async () => {
    apiMocks.reassignTask.mockResolvedValue({
      task: { id: 't_x', assignee: 'gemini' },
    })
    const handler = await getHandler('../kanban-tasks.$taskId', 'POST')
    await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks/t_x?action=reassign',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: 'gemini', reclaim_first: true }),
        },
      ),
      params: { taskId: 't_x' },
    })
    expect(apiMocks.reassignTask).toHaveBeenCalledWith(
      't_x',
      { profile: 'gemini', reclaim_first: true, reason: undefined },
      { board: undefined },
    )
  })

  it('action=archive sets status=archived', async () => {
    apiMocks.updateTask.mockResolvedValue({
      task: { id: 't_x', status: 'archived' },
    })
    const handler = await getHandler('../kanban-tasks.$taskId', 'POST')
    await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks/t_x?action=archive',
        { method: 'POST' },
      ),
      params: { taskId: 't_x' },
    })
    expect(apiMocks.updateTask).toHaveBeenCalledWith(
      't_x',
      { status: 'archived' },
      { board: undefined },
    )
  })

  it('rejects unknown action', async () => {
    const handler = await getHandler('../kanban-tasks.$taskId', 'POST')
    const res = await handler({
      request: new Request(
        'http://localhost/api/kanban-tasks/t_x?action=nope',
        { method: 'POST' },
      ),
      params: { taskId: 't_x' },
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/kanban-dispatch', () => {
  it('passes dry_run and max as numbers', async () => {
    apiMocks.nudgeDispatcher.mockResolvedValue({ dispatched: [], count: 0 })
    const handler = await getHandler('../kanban-dispatch', 'POST')
    await handler({
      request: new Request(
        'http://localhost/api/kanban-dispatch?dry_run=true&max=4',
        { method: 'POST' },
      ),
    })
    expect(apiMocks.nudgeDispatcher).toHaveBeenCalledWith({
      dry_run: true,
      max: 4,
      board: undefined,
    })
  })
})
