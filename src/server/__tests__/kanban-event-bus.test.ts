import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the gateway capabilities so the bus doesn't try a real connection.
vi.mock('../gateway-capabilities', () => ({
  HERMES_DASHBOARD_URL: 'http://127.0.0.1:9119',
  getDashboardToken: vi.fn().mockResolvedValue('mock-token'),
}))

// Mock the ws module so no real socket is opened during the test.
const wsInstances: any[] = []
vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1
    static CLOSED = 3
    static CLOSING = 2
    static CONNECTING = 0
    readyState = MockWebSocket.CONNECTING
    listeners: Record<string, ((...args: any[]) => void)[]> = {}
    constructor(public url: string) {
      wsInstances.push(this)
    }
    on(event: string, fn: (...args: any[]) => void) {
      ;(this.listeners[event] ??= []).push(fn)
      return this
    }
    emit(event: string, ...args: any[]) {
      for (const fn of this.listeners[event] ?? []) fn(...args)
    }
    close() {
      this.readyState = MockWebSocket.CLOSED
      this.emit('close', 1000, Buffer.from(''))
    }
  }
  return { default: MockWebSocket }
})

// Reset module state between tests so the globalThis singleton is fresh.
beforeEach(() => {
  vi.resetModules()
  wsInstances.length = 0
  delete (globalThis as any).__hermes_kanban_event_bus__
})

afterEach(() => {
  delete (globalThis as any).__hermes_kanban_event_bus__
})

describe('kanban-event-bus: subscribe + broadcast', () => {
  it('subscribers receive broadcasted events', async () => {
    const mod = await import('../kanban-event-bus')
    const events: any[] = []
    const unsub = mod.subscribeToKanbanEvents((evt) => events.push(evt))

    await mod.ensureKanbanBusStarted()
    expect(wsInstances).toHaveLength(1)
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    // Simulate an upstream message with one event.
    const frame = JSON.stringify({
      events: [
        {
          id: 7,
          task_id: 't_x',
          run_id: null,
          kind: 'created',
          payload: { status: 'ready' },
          created_at: 1778700000,
        },
      ],
    })
    ws.emit('message', frame)

    expect(events.length).toBeGreaterThanOrEqual(2) // 'connected' + 'created'
    const created = events.find((e) => e.event === 'created')
    expect(created?.data.task_id).toBe('t_x')
    expect(mod.getKanbanBusState().lastEventId).toBe(7)

    unsub()
  })

  it('accepts a bare event object as a frame', async () => {
    const mod = await import('../kanban-event-bus')
    const events: any[] = []
    mod.subscribeToKanbanEvents((evt) => events.push(evt))
    await mod.ensureKanbanBusStarted()
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    ws.emit(
      'message',
      JSON.stringify({
        id: 42,
        task_id: 't_y',
        run_id: 3,
        kind: 'completed',
        payload: { result_len: 100 },
        created_at: 1778700001,
      }),
    )

    expect(events.find((e) => e.event === 'completed')).toBeTruthy()
    expect(mod.getKanbanBusState().lastEventId).toBe(42)
  })

  it('accepts a plain array frame', async () => {
    const mod = await import('../kanban-event-bus')
    const events: any[] = []
    mod.subscribeToKanbanEvents((evt) => events.push(evt))
    await mod.ensureKanbanBusStarted()
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    ws.emit(
      'message',
      JSON.stringify([
        {
          id: 1,
          task_id: 't_a',
          run_id: null,
          kind: 'created',
          payload: null,
          created_at: 1,
        },
        {
          id: 2,
          task_id: 't_b',
          run_id: null,
          kind: 'archived',
          payload: null,
          created_at: 2,
        },
      ]),
    )

    expect(events.filter((e) => e.event === 'created')).toHaveLength(1)
    expect(events.filter((e) => e.event === 'archived')).toHaveLength(1)
    expect(mod.getKanbanBusState().lastEventId).toBe(2)
  })

  it('unsubscribe with no remaining subscribers closes upstream WS', async () => {
    const mod = await import('../kanban-event-bus')
    const unsub = mod.subscribeToKanbanEvents(() => {})
    await mod.ensureKanbanBusStarted()
    expect(wsInstances).toHaveLength(1)
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    unsub()
    expect(mod.getKanbanBusState().subscriberCount).toBe(0)
    expect(ws.readyState).toBe(3) // CLOSED
  })

  it('ignores invalid JSON frames silently', async () => {
    const mod = await import('../kanban-event-bus')
    const events: any[] = []
    mod.subscribeToKanbanEvents((evt) => events.push(evt))
    await mod.ensureKanbanBusStarted()
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    ws.emit('message', '{ not valid json')
    expect(events.find((e) => e.event !== 'connected')).toBeUndefined()
    expect(mod.getKanbanBusState().lastEventId).toBe(0)
  })

  it('ignores entries that lack required event fields', async () => {
    const mod = await import('../kanban-event-bus')
    const events: any[] = []
    mod.subscribeToKanbanEvents((evt) => events.push(evt))
    await mod.ensureKanbanBusStarted()
    const ws = wsInstances[0]
    ws.readyState = 1
    ws.emit('open')

    ws.emit(
      'message',
      JSON.stringify({
        events: [
          { id: 1 }, // missing task_id, kind
          {
            id: 2,
            task_id: 't_x',
            run_id: null,
            kind: 'created',
            payload: null,
            created_at: 0,
          },
        ],
      }),
    )
    expect(events.filter((e) => e.event === 'created')).toHaveLength(1)
    expect(mod.getKanbanBusState().lastEventId).toBe(2)
  })
})

describe('kanban-event-bus: state', () => {
  it('reports disconnected by default', async () => {
    const mod = await import('../kanban-event-bus')
    const state = mod.getKanbanBusState()
    expect(state.connected).toBe(false)
    expect(state.subscriberCount).toBe(0)
    expect(state.lastEventId).toBe(0)
  })
})
