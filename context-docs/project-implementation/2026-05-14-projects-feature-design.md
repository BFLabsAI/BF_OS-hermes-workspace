# Projects Feature — Design Spec

**Status:** Draft for review
**Date:** 2026-05-14
**Author:** Bruno (via brainstorm com Claude)

## 1. Resumo

Nova aba **Projects** no Hermes Workspace. Um projeto agrupa **Tasks** (itens de planejamento estilo Notion, com status + deadline + descrição rich-text) e **Notes** (documentos Notion-like livres). Tasks e Notes podem ser referenciadas como contexto ao spawnar Agent Tasks (a aba antiga "Tasks") e em chat sessions. Quando uma Agent Task ou session está linkada a uma Task, os entregáveis da IA (arquivos, links, ações, textos, imagens) são automaticamente capturados como **Deliverables** dentro da Task.

A aba antiga "Tasks" é relabeled para **"Agent Tasks"** (apenas o label do menu; rota `/tasks` permanece igual para não quebrar deep-links).

## 2. Entidades

```
Project (1) ─┬─ (N) Task ─┬─ (N) Deliverable
             │            ├─ (N) AgentTask (linked_project_task_id)
             │            └─ (N) ChatSession (linked_project_task_id)
             └─ (N) Note
```

### 2.1 Project
- `id`, `slug`, `name`, `icon`, `color`, `description` (curta), `created_at`, `updated_at`, `archived_at`

### 2.2 Task (planejamento)
- `id`, `project_id`, `title`, `body_json` (BlockNote JSON)
- `status`: enum `backlog | todo | doing | review | done`
- `deadline`: date opcional
- `priority`: enum `low | med | high`, opcional
- `created_at`, `updated_at`, `archived_at`
- Relações computadas: `deliverables[]`, `linked_runs[]` (kanban-tasks), `linked_sessions[]` (chat sessions)

### 2.3 Note
- `id`, `project_id`, `title`, `body_json` (BlockNote JSON), `created_at`, `updated_at`, `archived_at`
- Sem status/deadline/deliverables. Pode ser usada como contexto, igual Task.

### 2.4 Deliverable
- `id`, `task_id`
- `kind`: `file | link | text | image | action`
- `title`
- `payload_json`: estrutura varia por kind
  - `file`: `{ path, mime, size, download_url }`
  - `link`: `{ url, preview_title?, preview_image? }`
  - `text`: `{ markdown }`
  - `image`: `{ url, alt }`
  - `action`: `{ description, target, completed_at }`
- `source_type`: `run | session`
- `source_id`: id da kanban-task ou session
- `source_agent`: nome do agente que produziu
- `created_at`

### 2.5 Agent Task (renomeada da existente)
- O `kanban-task` atual ganha **uma coluna nova**: `linked_project_task_id TEXT NULL` (FK lógica). Tudo o mais permanece igual.

### 2.6 Chat Session (existente)
- Ganha **uma coluna nova**: `linked_project_task_id TEXT NULL`.

## 3. Decisões-chave (de onde vêm)

| # | Decisão | Origem |
|---|---|---|
| 1 | Link Task↔Run é **opcional**; quando linkado, Run vira filha da Task | "podem ser isoladas, mas podem ser conectadas" |
| 2 | Hermes detecta intenção de link via chat e linka automaticamente | "Hermes deve ser inteligente o suficiente" |
| 3 | Notes são docs Notion-like livres, podem virar contexto | escolha direta |
| 4 | Status set: **5-col kanban** (backlog/todo/doing/review/done) | escolha direta |
| 5 | Deliverables são **tipados** (file/link/text/image/action) + summary | exemplos: HTML file, Cloudflare URL, Instagram action |
| 6 | Sessions usam **mesmo modelo** de deliverables que Runs | escolha direta |
| 7 | Persistência no **backend Hermes Agent** (não local no workspace) | escolha direta |
| 8 | Sidebar Notion-style + item "Tudo" pra view global | escolha direta |
| 9 | Tabs internas: Tasks / Notes / Deliverables | escolha direta |
| 10 | Aba antiga = "Agent Tasks"; nova entidade = "Tasks" | escolha direta |
| 11 | V1 inclui: link manual, auto-link via chat, auto-capture | escolha direta |
| 12 | Editor: **BlockNote** (Notion-like block editor), fallback markdown | "block editor se não for muito complexo" |

## 4. Arquitetura

Segue o **mesmo padrão do plugin kanban** (canonical reference: `src/server/hermes-kanban-api.ts`):

1. **Backend (Hermes Agent — repo separado):** plugin `projects` mountado em `/api/plugins/projects/*` no dashboard port (loopback auth).
2. **Workspace client tipado:** `src/server/hermes-projects-api.ts` chamando `dashboardFetch(...)`.
3. **Workspace route proxies:** file-routes TanStack em `src/routes/api/` que autenticam via `isAuthenticated()` e chamam o client.
4. **Types compartilhados:** `src/lib/projects-types.ts`.
5. **Frontend stores:** Zustand em `src/stores/`.
6. **WS de eventos:** plugin emite eventos `task.created`, `task.updated`, `deliverable.added`, etc.; frontend assina e invalida cache.

### 4.1 Backend — endpoints

```
GET    /api/plugins/projects/projects                       lista projetos
POST   /api/plugins/projects/projects                       cria projeto
GET    /api/plugins/projects/projects/{id}                  detalhe (com counts)
PATCH  /api/plugins/projects/projects/{id}                  atualiza
DELETE /api/plugins/projects/projects/{id}                  arquiva soft

GET    /api/plugins/projects/projects/{id}/tasks            lista tasks (filtros: status, deadline_before)
POST   /api/plugins/projects/projects/{id}/tasks            cria task
GET    /api/plugins/projects/tasks/{id}                     detalhe (body + deliverables + linked_runs + linked_sessions)
PATCH  /api/plugins/projects/tasks/{id}                     atualiza
DELETE /api/plugins/projects/tasks/{id}                     arquiva

GET    /api/plugins/projects/projects/{id}/notes            lista
POST   /api/plugins/projects/projects/{id}/notes            cria
GET    /api/plugins/projects/notes/{id}                     detalhe
PATCH  /api/plugins/projects/notes/{id}                     atualiza
DELETE /api/plugins/projects/notes/{id}                     arquiva

POST   /api/plugins/projects/tasks/{id}/deliverables        agente reporta deliverable
GET    /api/plugins/projects/tasks/{id}/deliverables        lista

GET    /api/plugins/projects/tasks/all                      cross-projeto (view "Tudo")

GET    /api/plugins/projects/events                         WS de eventos
```

Migração necessária no kanban plugin (existing):
```sql
ALTER TABLE kanban_tasks ADD COLUMN linked_project_task_id TEXT NULL;
ALTER TABLE chat_sessions ADD COLUMN linked_project_task_id TEXT NULL;
```

### 4.2 Backend — tools novas no Hermes Agent

| Tool | Quando o agente chama |
|---|---|
| `set_active_project_task(task_id)` | Detectou intenção do user de trabalhar numa task específica via NLU |
| `report_deliverable(kind, title, payload, task_id?)` | Produziu output entregável e há task ativa |
| `link_run_to_task(run_id, task_id)` | Spawnou kanban-task associada a uma project-task ativa |

Prompt-addendum no system message do Hermes: instruções pra detectar referências a tasks/projects na conversa e chamar `set_active_project_task` antes de spawnar agents ou produzir deliverables.

### 4.3 Workspace — arquivos novos

```
src/lib/projects-types.ts                       Project, Task, Note, Deliverable
src/server/hermes-projects-api.ts               typed client (espelha hermes-kanban-api.ts)
src/server/projects-event-bus.ts                WS subscriber (espelha kanban-event-bus.ts)

src/routes/api/projects.ts                      GET/POST /api/projects
src/routes/api/projects.$projectId.ts           GET/PATCH/DELETE
src/routes/api/projects.$projectId.tasks.ts     lista/cria tasks do projeto
src/routes/api/projects.$projectId.notes.ts     lista/cria notes
src/routes/api/project-tasks.$taskId.ts         detalhe/PATCH/DELETE
src/routes/api/project-tasks.$taskId.deliverables.ts
src/routes/api/project-notes.$noteId.ts
src/routes/api/project-tasks-all.ts             view global
src/routes/api/project-events.ts                WS proxy

src/routes/projects.tsx                         shell aba
src/routes/projects/index.tsx                   view "Tudo"
src/routes/projects/$projectId.tsx              project shell
src/routes/projects/$projectId/index.tsx        redirect → tasks
src/routes/projects/$projectId/tasks.tsx        kanban board
src/routes/projects/$projectId/tasks/$taskId.tsx  task detail
src/routes/projects/$projectId/notes.tsx        notes list
src/routes/projects/$projectId/notes/$noteId.tsx note editor
src/routes/projects/$projectId/deliverables.tsx deliverables feed

src/screens/projects/projects-shell.tsx
src/screens/projects/all-view.tsx
src/screens/projects/project-shell.tsx
src/screens/projects/tasks-board.tsx
src/screens/projects/task-detail-panel.tsx
src/screens/projects/notes-list.tsx
src/screens/projects/note-editor.tsx
src/screens/projects/deliverables-feed.tsx

src/components/projects/project-sidebar.tsx     sidebar interna
src/components/projects/block-editor.tsx        wrapper BlockNote
src/components/projects/status-badge.tsx
src/components/projects/deadline-chip.tsx
src/components/projects/deliverable-card.tsx
src/components/projects/run-link-card.tsx
src/components/projects/session-link-card.tsx
src/components/projects/task-picker.tsx         combobox reutilizável
src/components/projects/task-card.tsx
src/components/projects/new-project-dialog.tsx

src/stores/projects-store.ts
src/stores/project-tasks-store.ts
src/stores/project-notes-store.ts

src/hooks/use-projects.ts                       React Query hooks
src/hooks/use-project-events.ts                 WS subscription hook
```

### 4.4 Workspace — arquivos modificados

- `src/components/workspace-shell.tsx` — adicionar item "Projects" no menu; relabel "Tasks" → "Agent Tasks"
- `src/screens/tasks/task-dialog.tsx` — adicionar `<TaskPicker />` opcional (campo "Linked Project Task")
- `src/components/chat-panel.tsx` — adicionar context-chip "🎯 Context: …" que abre TaskPicker; persiste em `session.linked_project_task_id`
- `src/stores/chat-store.ts` — propagar `linked_project_task_id` no payload de chat
- `package.json` — adicionar deps: `@blocknote/core`, `@blocknote/react`, e um pacote de tema (`@blocknote/mantine` ou `@blocknote/shadcn`; decisão final durante a Fase 3 — workspace hoje usa `@base-ui/react` + Tailwind, sem Mantine nem shadcn); `@dnd-kit/core`, `@dnd-kit/sortable`

### 4.5 Editor — BlockNote

- Lazy-load via `dynamic import` na rota (rotas têm `ssr: false`, mas o BlockNote precisa de window — confirmar no integration)
- Blocos default: heading, paragraph, list, todo, code, quote, image, table
- Storage: `Block[]` JSON no campo `body_json` da DB
- Quando uma Task vira contexto pra agente, o backend (ou workspace antes de mandar) converte via `blocksToMarkdownLossy()`
- Tema customizado pra casar com o Tailwind/dark mode do workspace
- Bundle: ~250-300KB minified, route-lazy

### 4.6 Fluxo de Linking — manual

1. User abre spawn dialog em Agent Tasks
2. Clica "Linked Project Task" → TaskPicker abre (combobox: project cascateando para task)
3. Seleciona → form salva `linked_project_task_id`
4. POST `/api/kanban-tasks` envia o campo novo
5. Backend Hermes registra; durante a execução, o agent chama `report_deliverable(...)` para cada arquivo/link/ação/imagem/texto-final relevante (ver §4.9); ao final, a run aparece como `linked_run` na task e seus deliverables ficam visíveis no detail panel

### 4.7 Fluxo de Linking — chat session

1. User abre sessão (existente ou nova)
2. Header do chat tem chip "🎯 Context: nenhum" — click abre TaskPicker
3. Seleciona task → PATCH `/api/sessions/{id}` com `linked_project_task_id`
4. Toda msg da sessão passa pro Hermes com um system-prompt-addendum contendo o título + body markdown da task
5. Quando o Hermes produz deliverable, chama `report_deliverable` → backend posta em `tasks/{id}/deliverables`

### 4.8 Fluxo de Linking — auto via chat (NLU)

1. User está numa sessão com `linked_project_task_id` setado
2. Manda "spawna 3 agentes pra dividir essa task em partes"
3. Hermes (via prompt-addendum + ferramentas) detecta intenção, chama `link_run_to_task(run_id, task_id)` ao criar cada agent task
4. Cada agent task fica filha da project-task; deliverables fluem de volta

### 4.9 Captura automática de deliverables

- Hermes Agent recebe instruções no system prompt: "se há uma task ativa, ao produzir arquivo/link/ação/imagem/texto-final, chame `report_deliverable`"
- Tipos detectáveis automaticamente:
  - **File**: agente gerou arquivo (HTML, código) → kind=`file`, payload com path
  - **Link**: agente publicou em URL (Cloudflare tunnel, deploy) → kind=`link`
  - **Action**: agente executou ação externa (postou no Instagram) → kind=`action` com confirmação
  - **Image**: agente gerou imagem → kind=`image`
  - **Text**: resposta final relevante (resumo, plano) → kind=`text` markdown

## 5. UI/UX

### 5.1 Sidebar interna da aba Projects
- Topo: item fixo "🌐 Tudo"
- Lista vertical de projetos: ícone + nome + badge (qtd tasks abertas; overdue em vermelho)
- Rodapé: botão "+ Novo Projeto"
- Estado collapsed/expanded persistido em zustand

### 5.2 View "Tudo"
- Lista filtrável de todas as tasks cross-projeto
- Filtros: por projeto, status, deadline, priority, "tem deliverable?"
- Ordenação: deadline asc por padrão
- Não tem kanban global no V1 (escopo)

### 5.3 Project shell
- Header: ícone + nome do projeto + descrição editável inline
- Tabs: Tasks / Notes / Deliverables
- Tab Tasks é a default

### 5.4 Tasks board (tab Tasks)
- Kanban com 5 colunas (Backlog / Todo / Doing / Review / Done)
- Cards: título, deadline-chip, priority, badges (qtd deliverables, qtd runs)
- Drag-drop entre colunas muda status (otimista + PATCH no backend)
- Click no card abre **task detail** em drawer-side (60% da tela) — fechar volta pro board

### 5.5 Task detail panel
- Header: título editável inline, status-select, deadline-picker, priority-select
- BlockNote no corpo (body)
- Seção "Deliverables" — lista de cards agrupados por tipo, mais recentes em cima
- Seção "Linked Runs" — cards de cada agent task linkada com status e link pros logs
- Seção "Linked Sessions" — cards de chat sessions com deep-link
- Botão "Spawn agent for this task" — atalho que abre o spawn dialog já com a task linkada

### 5.6 Notes list / editor
- Lista: cards simples (título + preview do body + last-updated)
- Editor: BlockNote em tela cheia (sem header complexo, foco no doc)
- Search no topo da lista

### 5.7 Deliverables feed
- Agregado de todas as deliverables do projeto
- Renderer por kind:
  - **file**: card com ícone do tipo, nome, tamanho, botão Download/Preview
  - **link**: card clicável com OG preview se disponível
  - **image**: thumb + lightbox no click
  - **text**: snippet com expand
  - **action**: confirmação ("✓ Posted to Instagram on 2026-05-14 by @user")
- Filtro: por kind, por task de origem, por agente
- Ordenação: cronológica desc

## 6. MVP cut (V1)

**Entra:**
- Backend plugin `projects` (CRUD + WS events + tools NLU)
- ADD COLUMN `linked_project_task_id` em kanban-tasks e sessions
- Workspace types + client + proxies + WS subscriber
- Aba Projects no sidebar superior + relabel "Tasks" → "Agent Tasks"
- Sidebar interna + view "Tudo" (lista filtrável)
- Project shell com 3 tabs
- Tasks board kanban drag-drop
- Task detail panel com BlockNote + deliverables/runs/sessions
- Notes list + editor BlockNote
- Deliverables feed
- TaskPicker no spawn dialog (Agent Tasks)
- TaskPicker no chat panel (sessões)
- Auto-link via chat (NLU + tools no Hermes)
- Auto-capture de deliverables

**Fica pra V2:**
- Calendar view
- List view alternativa ao kanban
- Subtasks / checklists
- Status customizável por projeto
- Multi-assignee, comentários
- Filtros avançados / full-text search
- Templates de projeto
- Real-time collaborative editing
- Drag-drop pra reorganizar projetos no sidebar
- Tema por projeto

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Backend Hermes Agent em repo separado | Spec define endpoints claros; coordenar PR; workspace pode mockar via local-session-store enquanto backend não está pronto |
| BlockNote + SSR (precisa de `window`) | Lazy-load + `ssr: false` na rota (padrão de várias rotas aqui já) |
| Drag-drop precisa de lib nova | Adicionar `@dnd-kit/*` — leve (~30KB), bem suportado |
| WS events flapping ao reconectar | Reusar padrão de reconnect do kanban-events |
| Hermes NLU pode errar auto-link | Sempre logar o link automático visível na UI; botão "desfazer link" no task detail |
| BlockNote JSON ↔ markdown lossy | Aceitar lossy pra V1; documentar limitação; oferecer "export markdown" como botão |

## 8. Ordem de implementação (fases)

1. **Fundação backend + tipos** — plugin no Hermes Agent (Project/Task/Note CRUD), ALTER TABLE, types compartilhados, client + route proxies, mock-mode se necessário
2. **UI base sem editor rico** — aba, sidebar interna, project shell, tasks board com textarea no detail, notes list, CRUD end-to-end
3. **BlockNote** — substituir textarea pelo editor de blocos; JSON↔markdown
4. **Linking + deliverables manual** — TaskPicker nos dois pontos, endpoints `/deliverables`, feed, renderers por kind, auto-post quando run termina
5. **Smart-link (NLU)** — prompt-addendum + tools `set_active_project_task` / `link_run_to_task` / `report_deliverable` no Hermes; WS events ativos

## 9. Decisões pendentes / questões abertas

- Qual é o repo do Hermes Agent? Está nesta VPS? Confirmar caminho antes da fase 1.
- O kanban plugin atual tem `parents[]` (FK pra outros kanban-tasks). Vamos reutilizar ou criar `linked_project_task_id` separado? **Recomendação:** separado, semântica diferente.
- View "Tudo" lista flat ou agrupada por projeto? **Sugestão:** flat com filtro por projeto; agrupar é fácil de adicionar depois.
- Hermes detecta deliverable via tool call explícito ou por parsing do output? **Decisão proposta:** tool call explícito (`report_deliverable`); confiável e auditável.

## 10. Próximos passos

1. Aprovação deste spec
2. Plano de implementação detalhado (writing-plans) em `tasks.md` no mesmo diretório
3. Início da Fase 1
