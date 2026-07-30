# Projects Feature — Implementation Tasks

**Spec:** [2026-05-14-projects-feature-design.md](./2026-05-14-projects-feature-design.md)
**Date:** 2026-05-14

Plano de execução em **5 fases sequenciais**. Cada fase produz um incremento utilizável. Tasks marcadas `[BACKEND]` rodam no repo do Hermes Agent (separado); `[WORKSPACE]` aqui em `hermes-workspace/`.

---

## Fase 0 — Pré-requisitos (resolver antes de começar)

- [ ] **P0.1** — Localizar repo do Hermes Agent na VPS. Confirmar caminho e linguagem (Python presumido pelo `pty-helper.py`). Sem isso, Fase 1 backend está blocked.
- [ ] **P0.2** — Confirmar que o kanban plugin atual está em SQLite e expõe `/api/plugins/kanban/*` no dashboard port. Verificar versão do schema e backup antes do ALTER TABLE.
- [ ] **P0.3** — Decidir: BlockNote tema final (`@blocknote/mantine` ou `@blocknote/shadcn` ou CSS custom). Recomendação: começar com `@blocknote/mantine` (mais maduro) e sobrescrever via CSS variables; reavaliar se conflitar com Tailwind dark mode.
- [ ] **P0.4** — Backup completo das DBs antes de migrações: `kanban.db`, `sessions.db` (se separado).

---

## Fase 1 — Fundação backend + tipos no workspace

**Goal:** plugin `projects` no Hermes Agent rodando com CRUD completo; types e proxies no workspace; nada de UI ainda. Endpoints testáveis via curl.

### 1.1 Backend Hermes Agent

- [ ] **B1.1** — `[BACKEND]` Criar diretório do plugin `projects` (espelhar layout do kanban plugin)
- [ ] **B1.2** — `[BACKEND]` Schema SQLite: tabelas `projects`, `tasks`, `notes`, `deliverables`. Migration inicial idempotente.
- [ ] **B1.3** — `[BACKEND]` Migration: `ALTER TABLE kanban_tasks ADD COLUMN linked_project_task_id TEXT NULL;`
- [ ] **B1.4** — `[BACKEND]` Migration: `ALTER TABLE chat_sessions ADD COLUMN linked_project_task_id TEXT NULL;` (verificar nome real da tabela)
- [ ] **B1.5** — `[BACKEND]` Endpoint `GET /api/plugins/projects/projects` (lista)
- [ ] **B1.6** — `[BACKEND]` Endpoint `POST /api/plugins/projects/projects` (cria)
- [ ] **B1.7** — `[BACKEND]` Endpoints `GET/PATCH/DELETE /api/plugins/projects/projects/{id}`
- [ ] **B1.8** — `[BACKEND]` Endpoint `GET /api/plugins/projects/projects/{id}/tasks` (lista com filtros: `?status=`, `?deadline_before=`)
- [ ] **B1.9** — `[BACKEND]` Endpoint `POST /api/plugins/projects/projects/{id}/tasks` (cria)
- [ ] **B1.10** — `[BACKEND]` Endpoints `GET/PATCH/DELETE /api/plugins/projects/tasks/{id}` (detalhe inclui deliverables, linked_runs query reversa, linked_sessions query reversa)
- [ ] **B1.11** — `[BACKEND]` Endpoints `GET/POST /api/plugins/projects/projects/{id}/notes`
- [ ] **B1.12** — `[BACKEND]` Endpoints `GET/PATCH/DELETE /api/plugins/projects/notes/{id}`
- [ ] **B1.13** — `[BACKEND]` Endpoint `GET /api/plugins/projects/tasks/all` (cross-projeto, paginado)
- [ ] **B1.14** — `[BACKEND]` Endpoints `GET/POST /api/plugins/projects/tasks/{id}/deliverables`
- [ ] **B1.15** — `[BACKEND]` Testes unitários: criar projeto → criar task → criar deliverable → ler detalhe completo → arquivar
- [ ] **B1.16** — `[BACKEND]` Registrar plugin no dashboard mounting (mesmo lugar onde kanban é mountado)
- [ ] **B1.17** — `[BACKEND]` Smoke test via curl: `curl localhost:9119/api/plugins/projects/projects` retorna `{"projects": []}`

### 1.2 Workspace — types + client

- [ ] **W1.1** — `[WORKSPACE]` Criar `src/lib/projects-types.ts` com: `Project`, `Task`, `Note`, `Deliverable`, `DeliverableKind`, `TaskStatus`, `CreateProjectInput`, `UpdateProjectInput`, `CreateTaskInput`, `UpdateTaskInput`, `TaskFilters`
- [ ] **W1.2** — `[WORKSPACE]` Criar `src/server/hermes-projects-api.ts` espelhando o padrão de `hermes-kanban-api.ts`: `kanbanJson`-like helper, todas as funções tipadas, classe `ProjectsApiError`
- [ ] **W1.3** — `[WORKSPACE]` Reusar `dashboardFetch` de `gateway-capabilities.ts`; confirmar que o probe inclui o novo plugin
- [ ] **W1.4** — `[WORKSPACE]` Adicionar capability `projects` ao `gateway-capabilities.ts` (se aplicável)

### 1.3 Workspace — route proxies

- [ ] **W1.5** — `[WORKSPACE]` `src/routes/api/projects.ts` — GET (lista) + POST (cria)
- [ ] **W1.6** — `[WORKSPACE]` `src/routes/api/projects.$projectId.ts` — GET/PATCH/DELETE
- [ ] **W1.7** — `[WORKSPACE]` `src/routes/api/projects.$projectId.tasks.ts` — GET/POST
- [ ] **W1.8** — `[WORKSPACE]` `src/routes/api/projects.$projectId.notes.ts` — GET/POST
- [ ] **W1.9** — `[WORKSPACE]` `src/routes/api/project-tasks.$taskId.ts` — GET/PATCH/DELETE
- [ ] **W1.10** — `[WORKSPACE]` `src/routes/api/project-tasks.$taskId.deliverables.ts` — GET/POST
- [ ] **W1.11** — `[WORKSPACE]` `src/routes/api/project-notes.$noteId.ts` — GET/PATCH/DELETE
- [ ] **W1.12** — `[WORKSPACE]` `src/routes/api/project-tasks-all.ts` — GET (view "Tudo")
- [ ] **W1.13** — `[WORKSPACE]` Todas as routes autenticam via `isAuthenticated()` e re-emitem erros do client como JSON
- [ ] **W1.14** — `[WORKSPACE]` Adicionar testes às routes seguindo padrão de `routes/api/__tests__/`

### 1.4 Acceptance Fase 1

- [ ] Curl POST `/api/projects` (via workspace, com auth) cria um projeto
- [ ] Curl GET `/api/projects` lista o projeto criado
- [ ] Curl POST `/api/projects/{id}/tasks` cria uma task
- [ ] Curl GET `/api/project-tasks/{id}` retorna a task com `deliverables: []`, `linked_runs: []`, `linked_sessions: []`
- [ ] Spawn de uma kanban-task (Agent Task existing) com `linked_project_task_id` no body é aceito (mesmo que não tenha UI ainda)
- [ ] `pnpm test` passa

---

## Fase 2 — UI base sem editor rico

**Goal:** aba Projects funcional ponta-a-ponta. CRUD de projetos/tasks/notes via UI. Editor é apenas `<textarea>` por enquanto. Sem deliverables. Sem linking.

### 2.1 Stack e dependências

- [ ] **W2.1** — `[WORKSPACE]` Adicionar `@dnd-kit/core` e `@dnd-kit/sortable` ao `package.json`
- [ ] **W2.2** — `[WORKSPACE]` `pnpm install` e verificar que build passa

### 2.2 Stores (Zustand)

- [ ] **W2.3** — `[WORKSPACE]` `src/stores/projects-store.ts` — state: `projects[]`, `activeProjectId`, `sidebarCollapsed`; actions: `loadProjects`, `createProject`, `updateProject`, `archiveProject`, `setActiveProject`, `toggleSidebar`
- [ ] **W2.4** — `[WORKSPACE]` `src/stores/project-tasks-store.ts` — state: `tasksByProject: Record<string, Task[]>`, `activeTaskId`, `taskDraft`; actions: `loadTasks(projectId)`, `createTask`, `updateTask`, `moveTask`, `archiveTask`
- [ ] **W2.5** — `[WORKSPACE]` `src/stores/project-notes-store.ts` — state: `notesByProject`, `activeNoteId`, `noteDraft`; actions: `loadNotes`, `createNote`, `updateNote`, `archiveNote`

### 2.3 React Query hooks

- [ ] **W2.6** — `[WORKSPACE]` `src/hooks/use-projects.ts` — `useProjects()`, `useProject(id)`, `useCreateProject()`, `useUpdateProject()`
- [ ] **W2.7** — `[WORKSPACE]` `src/hooks/use-project-tasks.ts` — `useProjectTasks(projectId)`, `useTask(id)`, `useCreateTask()`, `useUpdateTask()`
- [ ] **W2.8** — `[WORKSPACE]` `src/hooks/use-project-notes.ts` — análogo
- [ ] **W2.9** — `[WORKSPACE]` `src/hooks/use-all-tasks.ts` — para view "Tudo"

### 2.4 Roteamento

- [ ] **W2.10** — `[WORKSPACE]` `src/routes/projects.tsx` — shell com sidebar interna + Outlet, `ssr: false`
- [ ] **W2.11** — `[WORKSPACE]` `src/routes/projects/index.tsx` — view "Tudo" (vide W2.20)
- [ ] **W2.12** — `[WORKSPACE]` `src/routes/projects/$projectId.tsx` — project shell com header + tabs + Outlet
- [ ] **W2.13** — `[WORKSPACE]` `src/routes/projects/$projectId/index.tsx` — redirect → tasks
- [ ] **W2.14** — `[WORKSPACE]` `src/routes/projects/$projectId/tasks.tsx` — kanban board
- [ ] **W2.15** — `[WORKSPACE]` `src/routes/projects/$projectId/tasks/$taskId.tsx` — task detail (drawer-style)
- [ ] **W2.16** — `[WORKSPACE]` `src/routes/projects/$projectId/notes.tsx` — notes list
- [ ] **W2.17** — `[WORKSPACE]` `src/routes/projects/$projectId/notes/$noteId.tsx` — note editor
- [ ] **W2.18** — `[WORKSPACE]` `src/routes/projects/$projectId/deliverables.tsx` — placeholder por enquanto (vai ficar pronto na Fase 4)
- [ ] **W2.19** — `[WORKSPACE]` Rodar `pnpm dev` e confirmar que `routeTree.gen.ts` foi regenerado com as novas rotas

### 2.5 Componentes

- [ ] **W2.20** — `[WORKSPACE]` `src/components/projects/project-sidebar.tsx` — item "🌐 Tudo" no topo, lista de projetos, botão "+ Novo Projeto", estado collapsed do zustand
- [ ] **W2.21** — `[WORKSPACE]` `src/components/projects/new-project-dialog.tsx` — modal de criação (nome, ícone, cor, descrição)
- [ ] **W2.22** — `[WORKSPACE]` `src/components/projects/status-badge.tsx` — 5 cores (backlog cinza, todo azul, doing amarelo, review roxo, done verde)
- [ ] **W2.23** — `[WORKSPACE]` `src/components/projects/deadline-chip.tsx` — overdue red / today orange / future neutral / sem deadline transparente
- [ ] **W2.24** — `[WORKSPACE]` `src/components/projects/task-card.tsx` — card do kanban (título, status, deadline, priority chip)
- [ ] **W2.25** — `[WORKSPACE]` `src/components/projects/new-task-dialog.tsx` — modal de criação rápida

### 2.6 Screens

- [ ] **W2.26** — `[WORKSPACE]` `src/screens/projects/projects-shell.tsx` — layout grid: sidebar (260px) + main outlet
- [ ] **W2.27** — `[WORKSPACE]` `src/screens/projects/all-view.tsx` — lista flat de todas as tasks com filtros (projeto, status, deadline, priority); ordenação por deadline asc
- [ ] **W2.28** — `[WORKSPACE]` `src/screens/projects/project-shell.tsx` — header (ícone + nome editável + descrição inline) + tab nav (Tasks / Notes / Deliverables)
- [ ] **W2.29** — `[WORKSPACE]` `src/screens/projects/tasks-board.tsx` — kanban 5-col com `@dnd-kit/sortable`; drag-drop muda status com optimistic update + PATCH; vazio mostra empty state com botão "+ Nova Task"
- [ ] **W2.30** — `[WORKSPACE]` `src/screens/projects/task-detail-panel.tsx` — drawer side (60% largura); header com título editável inline, status select, deadline picker, priority select; body com `<textarea>` (substituído na Fase 3); seções vazias "Deliverables", "Linked Runs", "Linked Sessions" (placeholder)
- [ ] **W2.31** — `[WORKSPACE]` `src/screens/projects/notes-list.tsx` — grid de cards (título + preview + last-updated); search box; botão "+ Nova Nota"
- [ ] **W2.32** — `[WORKSPACE]` `src/screens/projects/note-editor.tsx` — tela cheia com header simples + `<textarea>` por enquanto

### 2.7 Integração com workspace-shell

- [ ] **W2.33** — `[WORKSPACE]` Editar `src/components/workspace-shell.tsx`: adicionar item "Projects" no menu lateral (ícone hugeicons apropriado); relabel "Tasks" → "Agent Tasks" (apenas string do label, rota `/tasks` igual)
- [ ] **W2.34** — `[WORKSPACE]` Adicionar entry de keyboard shortcut pra `/projects` (se a feature `keyboard-shortcuts-modal.tsx` lista atalhos)
- [ ] **W2.35** — `[WORKSPACE]` Verificar `mobile-tab-bar.tsx` e `mobile-hamburger-menu.tsx` — adicionar Projects também na navegação mobile

### 2.8 Acceptance Fase 2

- [ ] Criar projeto via UI funciona
- [ ] Criar task via UI funciona (textarea simples)
- [ ] Drag-drop entre colunas muda status (visivel imediatamente, PATCH no backend)
- [ ] Criar nota via UI funciona
- [ ] View "Tudo" mostra todas as tasks cross-projeto com filtros
- [ ] Item "Agent Tasks" no menu continua funcional (label apenas mudou)
- [ ] Mobile nav inclui Projects
- [ ] `pnpm test` passa, `pnpm lint` zero erros

---

## Fase 3 — BlockNote (editor Notion-like)

**Goal:** substituir todas as `<textarea>` por BlockNote. JSON serializado no DB. Render de markdown ainda funciona para visualização.

### 3.1 Setup

- [ ] **W3.1** — `[WORKSPACE]` Adicionar deps: `@blocknote/core`, `@blocknote/react`, e o tema escolhido em P0.3
- [ ] **W3.2** — `[WORKSPACE]` Verificar SSR: BlockNote precisa de `window`; confirmar que rotas de projetos têm `ssr: false`
- [ ] **W3.3** — `[WORKSPACE]` Lazy-load: `const BlockEditor = lazy(() => import('@/components/projects/block-editor'))`

### 3.2 Wrapper

- [ ] **W3.4** — `[WORKSPACE]` `src/components/projects/block-editor.tsx` — wrapper:
  - props: `initialContent`, `onChange(blocks)`, `readOnly`, `placeholder`
  - blocos default habilitados: heading, paragraph, list, todo, code, quote, image, table
  - tema customizado pra casar com tailwind dark mode (CSS variables)
  - debounce de 500ms no onChange antes de PATCH
  - expõe método imperativo `getMarkdown()` (via `blocksToMarkdownLossy`) pra consumo externo
- [ ] **W3.5** — `[WORKSPACE]` Estilizar para dark/light mode usando `prefers-color-scheme` + variável do tema atual
- [ ] **W3.6** — `[WORKSPACE]` Garantir que o slash-menu não conflita com `slash-command-menu.tsx` (do chat) — escopado ao container do editor

### 3.3 Integração

- [ ] **W3.7** — `[WORKSPACE]` Substituir `<textarea>` em `task-detail-panel.tsx` por `<BlockEditor>` com `initialContent=task.body_json` e `onChange` salvando via `useUpdateTask().mutate({ body_json })`
- [ ] **W3.8** — `[WORKSPACE]` Substituir `<textarea>` em `note-editor.tsx` por `<BlockEditor>`
- [ ] **W3.9** — `[WORKSPACE]` Migração: se body for string (vinda da Fase 2 textarea), converter pra `[{ type: 'paragraph', content: oldString }]` ao carregar pela primeira vez
- [ ] **W3.10** — `[WORKSPACE]` Botão "Export Markdown" no header da task/note pra exportar via `blocksToMarkdownLossy()`

### 3.4 Backend (markdown como input pra agente)

- [ ] **B3.1** — `[BACKEND]` Endpoint `GET /api/plugins/projects/tasks/{id}/context` — retorna `{ title, description_markdown }`; usado pelo Hermes quando uma session ou run referencia a task
- [ ] **B3.2** — `[BACKEND]` Endpoint análogo `GET /api/plugins/projects/notes/{id}/context`

### 3.5 Acceptance Fase 3

- [ ] Abrir task → BlockNote carrega com conteúdo
- [ ] Digitar / formatar (heading, lista, código) funciona
- [ ] Mudança é persistida (PATCH após debounce)
- [ ] Reabrir task em outra aba mostra mesmo conteúdo
- [ ] Botão "Export Markdown" baixa `.md` com conversão lossy
- [ ] Notas idem
- [ ] Bundle inicial não cresce em mais de ~50KB (BlockNote é route-lazy)

---

## Fase 4 — Linking manual + deliverables

**Goal:** UI de linking pelo spawn dialog e pelo chat. Deliverables fluem manualmente (sem NLU ainda). Feed de deliverables operacional.

### 4.1 TaskPicker

- [ ] **W4.1** — `[WORKSPACE]` `src/components/projects/task-picker.tsx` — combobox em cascata:
  - Step 1: select de projeto (com search)
  - Step 2: select de task dentro do projeto (com search + status filter)
  - Opção "Nenhum" / clear
  - Callback `onSelect(taskId | null)`
  - Reutilizado em 2 lugares (W4.2, W4.5)

### 4.2 Integração no spawn dialog (Agent Tasks)

- [ ] **W4.2** — `[WORKSPACE]` Editar `src/screens/tasks/task-dialog.tsx`: adicionar campo "Linked Project Task" com `<TaskPicker />`; valor controlado; salvo em state local
- [ ] **W4.3** — `[WORKSPACE]` POST `/api/kanban-tasks` envia `linked_project_task_id` quando preenchido
- [ ] **W4.4** — `[WORKSPACE]` Atualizar `CreateTaskInput` em `lib/kanban-types.ts` pra incluir `linked_project_task_id?: string`

### 4.3 Integração no chat panel (Sessões)

- [ ] **W4.5** — `[WORKSPACE]` Editar `src/components/chat-panel.tsx`: adicionar chip "🎯 Context: …" no header; click abre `<TaskPicker />` em popover
- [ ] **W4.6** — `[WORKSPACE]` PATCH `/api/sessions/{id}` com `linked_project_task_id` quando muda
- [ ] **W4.7** — `[WORKSPACE]` Antes de cada msg da sessão: se há `linked_project_task_id`, fetch `tasks/{id}/context` e injetar como system-prompt-addendum no payload
- [ ] **W4.8** — `[WORKSPACE]` Mostrar feedback visual ("Context: Tarefa X do projeto Y") no chip

### 4.4 Endpoints de deliverable (já em Fase 1, refinar)

- [ ] **B4.1** — `[BACKEND]` Garantir validação de payload por kind no POST `/deliverables`:
  - `file`: `{ path, mime, size }` obrigatórios
  - `link`: `{ url }` obrigatório
  - `text`: `{ markdown }` obrigatório
  - `image`: `{ url }` obrigatório
  - `action`: `{ description, target }` obrigatórios
- [ ] **B4.2** — `[BACKEND]` Quando uma kanban-task com `linked_project_task_id` termina (status final), o backend cria um deliverable resumido automaticamente: kind=`text`, payload com final output, source=`run`

### 4.5 UI de deliverables

- [ ] **W4.9** — `[WORKSPACE]` `src/components/projects/deliverable-card.tsx` — renderer multi-kind:
  - `file`: ícone do mime, nome, tamanho, botões Download/Preview (preview via `/api/files`?)
  - `link`: card clicável com favicon e título; se `payload.preview_*` presente, mostrar OG
  - `image`: thumb + lightbox modal no click
  - `text`: snippet com expand/collapse + render markdown
  - `action`: confirmação visual ("✓ Action completed at ...")
- [ ] **W4.10** — `[WORKSPACE]` `src/components/projects/run-link-card.tsx` — card de Linked Run: status badge + agent name + timestamp + link pros logs (rota existing de logs)
- [ ] **W4.11** — `[WORKSPACE]` `src/components/projects/session-link-card.tsx` — card de Linked Session: friendlyId + preview + deep-link pro chat
- [ ] **W4.12** — `[WORKSPACE]` `src/screens/projects/task-detail-panel.tsx`: popular seções Deliverables / Linked Runs / Linked Sessions com os components acima; loading states; empty states
- [ ] **W4.13** — `[WORKSPACE]` `src/screens/projects/deliverables-feed.tsx` — agregado do projeto:
  - Query `GET /api/projects/{id}/tasks?include=deliverables&flatten=true` (criar variante no backend se necessário)
  - Cards agrupados visualmente por kind ou por task
  - Filtro: kind, task de origem, agente
  - Ordenação: data desc

### 4.6 Captura manual (fallback)

- [ ] **W4.14** — `[WORKSPACE]` Botão "→ Salvar como deliverable" em mensagens da IA no chat (quando sessão tem `linked_project_task_id`). Click abre modal pra escolher kind e título, POST `/deliverables`. *Pré-Fase-5 — funciona sem NLU.*

### 4.7 Acceptance Fase 4

- [ ] Spawn de Agent Task com Linked Project Task: ao terminar, deliverable aparece na task de projeto automaticamente (kind=text com final output)
- [ ] Sessão linkada: contexto da task é injetado nas msgs
- [ ] Botão "Salvar como deliverable" funciona em msgs do chat
- [ ] Deliverables feed do projeto agrega corretamente
- [ ] Task detail mostra deliverables, runs, sessions linkadas

---

## Fase 5 — Smart-link (NLU + auto-capture via tools)

**Goal:** Hermes Agent detecta intenção de link e captura deliverables automaticamente sem o user clicar. WS de eventos atualiza UI em tempo real.

### 5.1 Tools novas no Hermes Agent

- [ ] **B5.1** — `[BACKEND]` Implementar tool `set_active_project_task(task_id: str) -> dict`:
  - Marca a task como "ativa" pra essa sessão/agente no estado interno
  - Idempotente
  - Retorna `{ ok: true, task: {...} }`
- [ ] **B5.2** — `[BACKEND]` Implementar tool `link_run_to_task(run_id: str, task_id: str) -> dict`:
  - UPDATE no kanban_tasks setando `linked_project_task_id`
  - Idempotente
  - Retorna `{ ok: true }`
- [ ] **B5.3** — `[BACKEND]` Implementar tool `report_deliverable(kind: str, title: str, payload: dict, task_id: str | None = None) -> dict`:
  - Se `task_id` não passado, usa a task ativa da sessão (set via B5.1)
  - Valida kind + payload schema
  - INSERT em `deliverables` table
  - Emite WS event `deliverable.added`
  - Retorna `{ ok: true, deliverable_id }`
- [ ] **B5.4** — `[BACKEND]` Registrar as 3 tools no agent runtime (mesmo lugar onde outras tools são registradas — verificar `src/server/hermes-agent.ts` no workspace ou equivalente no agent repo)

### 5.2 Prompt-addendum no Hermes

- [ ] **B5.5** — `[BACKEND]` Adicionar ao system prompt do Hermes (quando há `linked_project_task_id` na sessão):
  ```
  You are working in the context of project task "{title}". When the user asks you to spawn agents, modify files, generate content, or take external actions related to this task:
  - For each spawned agent task, call `link_run_to_task(run_id, "{task_id}")` after spawning.
  - For each concrete output (file generated, URL published, action completed), call `report_deliverable(...)` with the appropriate kind.
  - Do not narrate these calls to the user; they are bookkeeping.
  ```
- [ ] **B5.6** — `[BACKEND]` Quando o user NÃO tem task ativa mas explicitamente referencia uma ("trabalha na task X do projeto Y"), Hermes chama `set_active_project_task` antes
- [ ] **B5.7** — `[BACKEND]` Testes de prompt: gerar HTML → deliverable kind=file; publicar Cloudflare URL → kind=link; postar Instagram → kind=action

### 5.3 WS de eventos

- [ ] **B5.8** — `[BACKEND]` Endpoint WS `GET /api/plugins/projects/events` espelhando `kanban-events`
- [ ] **B5.9** — `[BACKEND]` Eventos emitidos: `project.created`, `project.updated`, `project.archived`, `task.created`, `task.updated`, `task.archived`, `note.created`, `note.updated`, `deliverable.added`, `task.linked_run`, `task.linked_session`
- [ ] **W5.1** — `[WORKSPACE]` `src/server/projects-event-bus.ts` — WS subscriber espelhando `kanban-event-bus.ts`
- [ ] **W5.2** — `[WORKSPACE]` `src/hooks/use-project-events.ts` — hook que conecta WS e invalida queries do React Query (`['projects']`, `['project-tasks', projectId]`, etc.) baseado no event type
- [ ] **W5.3** — `[WORKSPACE]` Plug `use-project-events()` no `projects-shell.tsx` pra ficar ativo enquanto a aba estiver aberta

### 5.4 UI feedback de auto-link

- [ ] **W5.4** — `[WORKSPACE]` Quando uma Linked Run aparece automaticamente, mostrar toast "🔗 Linked to task X" com botão "Undo" (chama DELETE `/api/kanban-tasks/{run_id}/link`)
- [ ] **W5.5** — `[WORKSPACE]` Adicionar endpoint `DELETE /api/kanban-tasks/{id}/link` no workspace + backend pra desfazer link

### 5.5 Acceptance Fase 5

- [ ] Sessão linkada + user pede "spawna agentes pra dividir essa task" → cada run criada já fica linkada (sem intervenção manual)
- [ ] Hermes gera arquivo HTML numa sessão linkada → deliverable kind=file aparece na task em tempo real
- [ ] Hermes publica num Cloudflare tunnel → deliverable kind=link aparece com URL
- [ ] Toast de feedback aparece pra cada auto-link, com Undo funcional
- [ ] WS reconecta automaticamente após disconnect (igual kanban-events)

---

## Tasks transversais (qualquer fase)

- [ ] **TR.1** — `[WORKSPACE]` Atualizar `CHANGELOG.md` por fase
- [ ] **TR.2** — `[WORKSPACE]` Atualizar `HANDOFF.md` se houver convenções novas relevantes
- [ ] **TR.3** — `[WORKSPACE]` Adicionar entrada em `FEATURES-INVENTORY.md` quando V1 estiver done
- [ ] **TR.4** — Após cada fase: restart do serviço apropriado (sbot-agent / italo-agent / vfo-agent dependendo do subdir — vide CLAUDE.md user memory)
- [ ] **TR.5** — Mobile responsiveness: testar cada nova tela no viewport mobile; ajustar `mobile-*` components conforme necessário
- [ ] **TR.6** — Documentar deliverable schema em `docs/` (se houver pasta de docs do plugin)

---

## Estimativas grosseiras

| Fase | Esforço | Riscos |
|------|---------|--------|
| 0 — Pré | 0.5d | Acesso ao repo do Hermes Agent |
| 1 — Backend + types | 3-4d | Plugin Python; migrações |
| 2 — UI base | 4-5d | TanStack routing + zustand |
| 3 — BlockNote | 2-3d | SSR / theme tweaks |
| 4 — Linking + deliverables | 3-4d | UX dos pickers + multi-kind renderer |
| 5 — Smart-link + WS | 2-3d | Qualidade do prompt + WS reliability |
| **Total V1** | **~15-20 dias** | |

---

## Critérios de "feature shipped"

- [ ] Todos os checkboxes acima done
- [ ] `pnpm test` passa, `pnpm lint` zero erros, `pnpm build` sucesso
- [ ] Smoke test E2E: criar projeto → criar task → linkar com session → pedir ao Hermes pra gerar HTML → ver deliverable kind=file aparecer em tempo real
- [ ] CHANGELOG + FEATURES-INVENTORY atualizados
- [ ] Services reiniciados
- [ ] Spec original (`2026-05-14-projects-feature-design.md`) revisado pra refletir desvios reais durante a implementação

---

## Decisões registradas durante a implementação

_Quando uma decisão surgir durante a execução que altere o spec, anotar aqui com data e justificativa._

- _(vazio)_
