# Terminal Multiplexer — Hermes Workspace

Plano técnico e referência de implementação do terminal multiplexer baseado em **tmux** com integração **MCP**.

---

## 1. Motivação

O terminal atual tem problemas críticos:

1. **Latência alta** — cada keystroke dispara um `POST /api/terminal-input` separado; em conexão pela internet (50–150ms RTT) a fila enche e o terminal "trava".
2. **Não permite zero terminais abertos** — gate `tabs.length > 1` no botão X e init que force-cria "Terminal 1" se localStorage estiver vazio.
3. **Sem multi-panel** — não há splits estilo VS Code/tmux.
4. **Sem leitura cruzada** — não há como ler output de um terminal e usar em outro contexto (ex: "resuma o que aconteceu no Terminal 3").

## 2. Objetivos

- Keystroke → PTY ≤ 1 frame (trocar SSE+POST por WebSocket).
- Empty state real: usuário pode fechar tudo sem quebrar o app.
- Splits horizontais e verticais dentro de cada aba.
- Cada terminal com nome legível (ex: `logs:gateway`, `dev:vite`).
- MCP server expondo as operações: o Claude pode ler/escrever em qualquer terminal nomeado.

## 3. Tecnologias

- **tmux** — multiplexador real instalado no host
- **xterm.js** — frontend (já em uso)
- **WebSocket (ws)** — transporte realtime substituindo SSE + POST
- **react-resizable-panels** — splits no frontend
- **MCP (stdio)** — exposição via Claude Code

## 4. Arquitetura

```
hermes-workspace (Node server)
├── tmux server (gerenciado pelo Node, mata sessions hermes-* no startup/shutdown)
│   ├── session hermes-<tabId1>
│   │   ├── pane 0  ← WS conectado ao xterm.js
│   │   └── pane 1  ← split criado pelo usuário
│   ├── session hermes-<tabId2> / pane 0
│   └── session hermes-<tabId3> / panes…
│
├── REST /api/tmux/*  (CRUD de sessions/panes, capture, send)
├── WS   /api/tmux/ws (streaming bidirecional multiplexado)
└── MCP server (stdio) → expõe operações via Claude Code
```

### Lifecycle

| Evento UI | Ação no servidor |
|---|---|
| Abrir aba | `tmux new-session -d -s hermes-<tabId>` |
| Fechar aba | `tmux kill-session -t hermes-<tabId>` |
| Split | `tmux split-window -t <pane> -h\|-v` |
| Reload do hermes-workspace | sessions `hermes-*` órfãs destruídas no startup |

**Não há persistência entre reloads** — decisão explícita pra evitar lixo acumulado.

## 5. Fase 0 — Fix imediato: fechar todos os terminais

**Mudanças em `src/components/terminal/terminal-panel.tsx`:**

1. Remover gate `tabs.length > 1` no botão X ✓ (já editado)
2. Init aceitar `[]` quando localStorage vazio ✓ (já editado)
3. `activeTabId` aceitar `undefined`
4. Empty state na área central: ícone + "Nenhum terminal aberto" + botão **"Novo terminal"** chamando `handleAddTab`
5. Esconder input de search + linha "cwd:" quando vazio

**Riscos**: nenhum. SSE só inicia quando `connectSession` é chamado dentro de `TerminalView`, que só monta quando há aba.

**Esforço**: 15 min.

## 6. Fase 1 — Backend tmux + WebSocket

### 6.1. Endpoints REST `/api/tmux/*`

| Método | Path | Body | Retorno | Descrição |
|---|---|---|---|---|
| POST | `/api/tmux/session` | `{ tabId, name? }` | `{ sessionId, paneId }` | Cria session `hermes-<tabId>` + pane inicial |
| DELETE | `/api/tmux/session/:tabId` | — | `{ ok }` | `kill-session` |
| POST | `/api/tmux/session/:tabId/rename` | `{ name }` | `{ ok }` | `rename-session` (afeta também o nome exibido na UI) |
| POST | `/api/tmux/pane/:paneId/split` | `{ direction: 'h'\|'v' }` | `{ paneId }` | `split-window` |
| DELETE | `/api/tmux/pane/:paneId` | — | `{ ok }` | `kill-pane` |
| GET | `/api/tmux/pane/:paneId/capture` | `?lines=1000` | `{ text }` | `capture-pane -p -S -<lines>` |
| POST | `/api/tmux/pane/:paneId/send` | `{ keys, submit? }` | `{ ok }` | `send-keys` (com `Enter` se `submit`) |
| GET | `/api/tmux/list` | — | `{ sessions: [...] }` | Lista sessions/panes ativos com nomes |

### 6.2. WebSocket `/api/tmux/ws`

Uma conexão por aba do browser; multiplexa todos os panes da aba.

**Cliente → servidor:**
```ts
{ type: 'subscribe', paneId: string }
{ type: 'input', paneId: string, data: string }
{ type: 'resize', paneId: string, cols: number, rows: number }
```

**Servidor → cliente:**
```ts
{ type: 'output', paneId: string, data: string }
{ type: 'exit', paneId: string, code: number }
```

Backend escuta cada pane via `tmux pipe-pane` (decidido após spike — control mode `tmux -CC` é alternativa).

### 6.3. Cleanup automático

- **Startup**: `tmux list-sessions -F '#S' | grep ^hermes- | xargs -I{} tmux kill-session -t {}`
- **Shutdown**: handler de `SIGTERM`/`SIGINT` faz o mesmo

### 6.4. Frontend refactor

- Remover `connectSession` (SSE) e `handleSendInput` (POST)
- Substituir por hook `useTmuxPane(paneId)` que retorna `{ sendInput, sendResize, output$ }`
- `terminal.onData(data => sendInput(data))` em vez de fetch por keystroke

**Esforço**: ~6h (spike 30min + REST 2h + WS 2h + refactor frontend 1.5h).

## 7. Fase 2 — UI multi-panel + MCP

### 7.1. Splits

- `react-resizable-panels` dentro de cada aba
- Cada painel = `<TerminalView paneId={...} />`
- Toolbar do painel: split-horizontal, split-vertical, close-pane

### 7.2. Naming editável

- Duplo-clique no título da aba → input → `POST /api/tmux/session/:tabId/rename`
- Painel ativo aparece com nome curto na barra superior

### 7.3. Command palette (Cmd+K)

- "Resumir output de *<terminal>*" → `GET /capture` → manda pro LLM com prompt de resumo
- "Enviar comando para *<terminal>*" → escolhe pane + digita
- "Comparar Terminal A vs Terminal B" (bônus)

### 7.4. MCP server

Servidor MCP local rodando **no mesmo processo Node** do hermes-workspace, expondo via stdio.

Ferramentas:

| Ferramenta | Parâmetros | Descrição |
|---|---|---|
| `tmux_list_terminals` | — | Lista sessions/panes com nomes |
| `tmux_get_output` | `name\|paneId`, `lines?` | Retorna scrollback do painel |
| `tmux_send_command` | `name\|paneId`, `command`, `submit?` | Envia comando |
| `tmux_create_terminal` | `name?` | Cria nova aba programaticamente |
| `tmux_close_terminal` | `name\|tabId` | Fecha aba |
| `tmux_rename_terminal` | `paneId`, `name` | Renomeia |

Registrado em `.claude/config` ou via `claude mcp add` apontando pro binário/script local.

**Esforço**: ~6.5h (splits 2h + rename+palette 2h + MCP 2.5h).

## 8. Plano de execução

| # | Tarefa | Esforço | Commit |
|---|---|---|---|
| 0 | Fix close-all + empty state | 15 min | `fix(terminal): permitir zero terminais abertos` |
| 1a | Spike tmux (control mode vs pipe-pane) | 30 min | — |
| 1b | Endpoints REST `/api/tmux/*` | 2h | `feat(terminal): backend tmux com REST API` |
| 1c | WebSocket `/api/tmux/ws` | 2h | (junto com 1b) |
| 1d | Cleanup startup/shutdown | 30 min | (junto com 1b) |
| 1e | Frontend: REST + WS no terminal-panel | 1.5h | `refactor(terminal): substituir SSE+POST por WS+tmux` |
| 2a | Splits com react-resizable-panels | 2h | `feat(terminal): splits horizontal/vertical` |
| 2b | Rename inline + command palette | 2h | (junto com 2a ou separado) |
| 2c | MCP server | 2.5h | `feat(terminal): MCP server para integração com Claude` |

**Total**: ~13h. **3-4 commits independentes** revisáveis isoladamente.

## 9. Decisões de design

| Decisão | Alternativa rejeitada | Razão |
|---|---|---|
| Session por aba | Window por aba em session única | Lifecycle 1:1 simplifica cleanup e mental model |
| WebSocket único multiplexado | WS por pane | Menos overhead de conexões, fácil de routar mensagens |
| Sem persistência entre reloads | Manter sessions vivas | Decisão do usuário; evita lixo acumulado |
| MCP no mesmo processo Node | Processo separado | Compartilha estado, evita autenticação interna |
| `pipe-pane` (a confirmar no spike) | `tmux -CC` control mode | A definir após spike; pipe-pane é mais simples |
| Aba + splits internos | Grid global sem abas | Modelo VS Code é familiar |

## 10. Plano de teste

### Fase 0
- [ ] Fechar todas as abas — botão X aparece mesmo na última
- [ ] Reload da página com 0 abas — não recria Terminal 1 automaticamente
- [ ] Empty state mostra botão "Novo terminal" e funciona
- [ ] Criar aba após estar vazio funciona normalmente

### Fase 1
- [ ] Criar aba → `tmux list-sessions` mostra `hermes-<id>`
- [ ] Fechar aba → `tmux list-sessions` não tem mais
- [ ] Reload do hermes-workspace → sessions órfãs limpas no startup
- [ ] Digitar 100 chars rápido → todos chegam no PTY sem lag
- [ ] `npm install` rodando — output flui sem trava
- [ ] Resize do painel → cols/rows atualizados via WS

### Fase 2
- [ ] Split horizontal/vertical funciona
- [ ] Fechar pane individual funciona
- [ ] Renomear aba reflete no `tmux list-sessions`
- [ ] Cmd+K → "Resumir terminal" retorna resumo correto
- [ ] MCP: `tmux_list_terminals` retorna lista
- [ ] MCP: `tmux_get_output("dev:vite")` retorna últimas N linhas
- [ ] MCP: `tmux_send_command("dev:vite", "ls", true)` executa
