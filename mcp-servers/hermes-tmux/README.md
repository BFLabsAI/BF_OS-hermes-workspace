# hermes-tmux-mcp

An MCP (Model Context Protocol) server that exposes the [Hermes Workspace](../../) tmux multiplexer to MCP-compatible clients like Claude Code. It talks to the running workspace over its HTTP API (`/api/tmux/*`), so the workspace process must be up (e.g. the `hermes-workspace.service` systemd unit) for the tools to work. Multiple MCP clients can connect simultaneously and the auth model is the same as the UI: a `hermes-auth` cookie when `HERMES_PASSWORD` is set on the server, otherwise no auth.

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `HERMES_WORKSPACE_URL` | `http://127.0.0.1:3000` | Base URL of the running Hermes Workspace. |
| `HERMES_AUTH_COOKIE` | _(empty)_ | Value of the `hermes-auth` cookie. Only required when `HERMES_PASSWORD` is set on the workspace server. |

## Tools

| Tool | Parameters | Description |
|---|---|---|
| `tmux_list_terminals` | _(none)_ | Lists every open terminal tab and its panes. Use this first to discover names, tab ids, and pane ids. |
| `tmux_get_output` | `terminal` (string), `lines?` (number, default `200`) | Captures the most recent output from a pane. `terminal` may be a name, tab id, or pane id; when a tab is given, the first pane is used. |
| `tmux_send_command` | `terminal` (string), `command` (string), `submit?` (boolean, default `true`) | Sends a command (or keystrokes) to a pane. Set `submit:false` to send without pressing Enter. |
| `tmux_create_terminal` | `name?` (string), `cwd?` (string) | Creates a new terminal tab. Returns the generated `tabId` and the created `paneId`. |
| `tmux_close_terminal` | `terminal` (string) | Closes a terminal tab (kills the underlying tmux session). Accepts name, tab id, or pane id. |
| `tmux_rename_terminal` | `tabId` (string), `name` (string) | Renames an existing terminal tab. |

### Resolution rules for `terminal`

The MCP server resolves the `terminal` argument by querying `GET /api/tmux/list` and matching, in order:

1. `session.tabId === terminal`
2. `session.name === terminal`
3. `session.sessionName === terminal`
4. any `pane.paneId === terminal`

If a session is matched, its first pane is used. If nothing matches, the tool returns an error.

## Running

```bash
node /root/hermes-workspace/mcp-servers/hermes-tmux/index.mjs
```

Or via the package script:

```bash
cd /root/hermes-workspace/mcp-servers/hermes-tmux
npm start
```

The server speaks MCP over stdio; stderr is used for human-readable logs.

## Registering with Claude Code

```bash
claude mcp add hermes-tmux node /root/hermes-workspace/mcp-servers/hermes-tmux/index.mjs \
  --env HERMES_WORKSPACE_URL=http://127.0.0.1:3000 \
  --env HERMES_AUTH_COOKIE=<paste-hermes-auth-cookie-value>
```

If your workspace has no password (`HERMES_PASSWORD` unset), the `--env HERMES_AUTH_COOKIE=...` flag can be omitted.

## Troubleshooting

- **`Network error calling …`** — the workspace process isn't reachable at `HERMES_WORKSPACE_URL`. Check the `hermes-workspace.service` status.
- **`401 Unauthorized`** — `HERMES_PASSWORD` is set on the server and the cookie value is missing or stale. Re-login via the UI and copy the `hermes-auth` cookie.
- **`terminal not found`** — call `tmux_list_terminals` to see the exact names / ids available.
