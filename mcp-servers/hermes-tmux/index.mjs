#!/usr/bin/env node
// Hermes Tmux MCP Server
// Bridges MCP clients (Claude Code, etc.) to the Hermes Workspace tmux HTTP API.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.HERMES_WORKSPACE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const AUTH_COOKIE = process.env.HERMES_AUTH_COOKIE || ''

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function buildHeaders(method) {
  const headers = {}
  if (method && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json'
  }
  if (AUTH_COOKIE) {
    headers['Cookie'] = `hermes-auth=${AUTH_COOKIE}`
  }
  return headers
}

async function api(path, { method = 'GET', body } = {}) {
  const url = `${BASE_URL}${path}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers: buildHeaders(method),
      body: body == null ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Network error calling ${method} ${url}: ${msg}`)
  }

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // not JSON
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'error' in data
        ? data.error
        : text || `HTTP ${res.status}`
    throw new Error(`${method} ${path} failed: ${res.status} ${detail}`)
  }

  return data ?? {}
}

// ---------------------------------------------------------------------------
// Terminal resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a free-form terminal identifier (name | tabId | paneId) to a
 * concrete pane id. Throws if it can't be resolved.
 *
 * Returns { paneId, session } where session is the matched session entry
 * (may be undefined if the input matched a pane that isn't in the listing).
 */
async function resolveTerminal(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('terminal identifier is required')
  }

  const data = await api('/api/tmux/list')
  const sessions = Array.isArray(data.sessions) ? data.sessions : []

  // 1) session by tabId
  let session = sessions.find((s) => s.tabId === input)
  if (session && session.panes && session.panes.length > 0) {
    return { paneId: session.panes[0].paneId, session }
  }

  // 2) session by name
  session = sessions.find((s) => s.name && s.name === input)
  if (session && session.panes && session.panes.length > 0) {
    return { paneId: session.panes[0].paneId, session }
  }

  // 3) session by sessionName (the underlying tmux name)
  session = sessions.find((s) => s.sessionName === input)
  if (session && session.panes && session.panes.length > 0) {
    return { paneId: session.panes[0].paneId, session }
  }

  // 4) any pane by paneId
  for (const s of sessions) {
    const pane = (s.panes || []).find((p) => p.paneId === input)
    if (pane) return { paneId: pane.paneId, session: s }
  }

  throw new Error(
    `terminal not found: "${input}" — expected a tab id, name, or pane id from tmux_list_terminals`,
  )
}

/**
 * Resolve to a session record (for operations on the whole tab, like close/rename).
 */
async function resolveSession(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('terminal identifier is required')
  }

  const data = await api('/api/tmux/list')
  const sessions = Array.isArray(data.sessions) ? data.sessions : []

  let session = sessions.find((s) => s.tabId === input)
  if (session) return session
  session = sessions.find((s) => s.name && s.name === input)
  if (session) return session
  session = sessions.find((s) => s.sessionName === input)
  if (session) return session
  for (const s of sessions) {
    if ((s.panes || []).some((p) => p.paneId === input)) return s
  }

  throw new Error(`terminal not found: "${input}"`)
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function formatSessionList(sessions) {
  if (!sessions || sessions.length === 0) {
    return 'No tmux terminals are open.'
  }
  const lines = [`Found ${sessions.length} terminal(s):`, '']
  for (const s of sessions) {
    const label = s.name ? `${s.name} (tab ${s.tabId})` : `tab ${s.tabId}`
    lines.push(`- ${label}`)
    lines.push(`    sessionName: ${s.sessionName}`)
    if (s.panes && s.panes.length > 0) {
      for (const p of s.panes) {
        const flag = p.active ? ' [active]' : ''
        const title = p.title ? ` "${p.title}"` : ''
        lines.push(`    pane ${p.paneId}${flag}${title}`)
      }
    } else {
      lines.push('    (no panes)')
    }
  }
  return lines.join('\n')
}

async function toolListTerminals() {
  const data = await api('/api/tmux/list')
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  return {
    content: [
      { type: 'text', text: formatSessionList(sessions) },
      { type: 'text', text: `\nRaw:\n${JSON.stringify(sessions, null, 2)}` },
    ],
  }
}

async function toolGetOutput(args) {
  const terminal = String(args?.terminal ?? '')
  const linesRaw = args?.lines
  const lines =
    typeof linesRaw === 'number' && Number.isFinite(linesRaw) && linesRaw > 0
      ? Math.floor(linesRaw)
      : 200

  const { paneId, session } = await resolveTerminal(terminal)
  const data = await api(`/api/tmux/pane/${encodeURIComponent(paneId)}/capture?lines=${lines}`)
  const text = typeof data.text === 'string' ? data.text : ''
  const label = session
    ? `Output from ${session.name || session.tabId} (pane ${paneId}, ${lines} lines):`
    : `Output from pane ${paneId} (${lines} lines):`
  return {
    content: [
      { type: 'text', text: label },
      { type: 'text', text: text || '(empty)' },
    ],
  }
}

async function toolSendCommand(args) {
  const terminal = String(args?.terminal ?? '')
  const command = String(args?.command ?? '')
  const submit = args?.submit === false ? false : true
  if (!command) throw new Error('command is required')

  const { paneId, session } = await resolveTerminal(terminal)
  await api(`/api/tmux/pane/${encodeURIComponent(paneId)}/send`, {
    method: 'POST',
    body: { command, submit },
  })

  const where = session ? `${session.name || session.tabId} (pane ${paneId})` : `pane ${paneId}`
  return {
    content: [
      {
        type: 'text',
        text: `Sent to ${where}${submit ? ' (with Enter)' : ' (no Enter)'}: ${command}`,
      },
    ],
  }
}

async function toolCreateTerminal(args) {
  const name = typeof args?.name === 'string' && args.name ? args.name : undefined
  const cwd = typeof args?.cwd === 'string' && args.cwd ? args.cwd : undefined
  // Generate a tabId. The backend expects a tabId string.
  const tabId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const data = await api('/api/tmux/session', {
    method: 'POST',
    body: { tabId, name, cwd },
  })

  return {
    content: [
      {
        type: 'text',
        text: `Created terminal${name ? ` "${name}"` : ''} — tabId=${data.tabId}, paneId=${data.paneId}, sessionName=${data.sessionName}`,
      },
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
  }
}

async function toolCloseTerminal(args) {
  const terminal = String(args?.terminal ?? '')
  const session = await resolveSession(terminal)
  await api(`/api/tmux/session/${encodeURIComponent(session.tabId)}`, { method: 'DELETE' })
  return {
    content: [
      {
        type: 'text',
        text: `Closed terminal ${session.name || session.tabId} (sessionName=${session.sessionName}).`,
      },
    ],
  }
}

async function toolRenameTerminal(args) {
  const tabId = String(args?.tabId ?? '')
  const name = String(args?.name ?? '')
  if (!tabId) throw new Error('tabId is required')
  if (!name) throw new Error('name is required')

  await api(`/api/tmux/session/${encodeURIComponent(tabId)}`, {
    method: 'PATCH',
    body: { name },
  })

  return {
    content: [{ type: 'text', text: `Renamed tab ${tabId} to "${name}".` }],
  }
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'tmux_list_terminals',
    description:
      'List all open Hermes Workspace tmux terminals (tabs) with their panes. ' +
      'Use this first to discover terminal names, tab ids, and pane ids.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    handler: toolListTerminals,
  },
  {
    name: 'tmux_get_output',
    description:
      'Capture the recent output of a terminal pane. Accepts a terminal name, ' +
      'tab id, or pane id. If a tab is given, uses its first pane. Default 200 lines.',
    inputSchema: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal name, tab id, or pane id.',
        },
        lines: {
          type: 'number',
          description: 'Number of trailing lines to capture (default 200).',
          minimum: 1,
        },
      },
      required: ['terminal'],
      additionalProperties: false,
    },
    handler: toolGetOutput,
  },
  {
    name: 'tmux_send_command',
    description:
      'Send a command (or keystrokes) to a terminal. Accepts a terminal name, ' +
      'tab id, or pane id. By default the command is submitted (Enter pressed).',
    inputSchema: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal name, tab id, or pane id.',
        },
        command: {
          type: 'string',
          description: 'The command or text to send to the pane.',
        },
        submit: {
          type: 'boolean',
          description: 'If true (default), press Enter after the command.',
        },
      },
      required: ['terminal', 'command'],
      additionalProperties: false,
    },
    handler: toolSendCommand,
  },
  {
    name: 'tmux_create_terminal',
    description:
      'Create a new tmux terminal (tab) in the Hermes Workspace. Optionally provide a name and working directory.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name to assign to the new terminal.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory the shell should start in.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    handler: toolCreateTerminal,
  },
  {
    name: 'tmux_close_terminal',
    description:
      'Close a tmux terminal (tab) by name, tab id, or pane id. ' +
      'Kills the entire tmux session associated with the tab.',
    inputSchema: {
      type: 'object',
      properties: {
        terminal: {
          type: 'string',
          description: 'Terminal name, tab id, or pane id.',
        },
      },
      required: ['terminal'],
      additionalProperties: false,
    },
    handler: toolCloseTerminal,
  },
  {
    name: 'tmux_rename_terminal',
    description: 'Rename an existing terminal tab. Requires the tabId.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'The tabId to rename.' },
        name: { type: 'string', description: 'The new display name.' },
      },
      required: ['tabId', 'name'],
      additionalProperties: false,
    },
    handler: toolRenameTerminal,
  },
]

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'hermes-tmux', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const tool = TOOL_BY_NAME.get(name)
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    }
  }
  try {
    return await tool.handler(args || {})
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [{ type: 'text', text: `Error in ${name}: ${msg}` }],
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)

// Log to stderr (stdout is the MCP transport)
process.stderr.write(
  `[hermes-tmux-mcp] connected — base=${BASE_URL} auth=${AUTH_COOKIE ? 'cookie' : 'none'}\n`,
)
