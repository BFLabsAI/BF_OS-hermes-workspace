# Changelog — Hermes Workspace

Registro cronológico de todos os ajustes, correções e melhorias realizados no workspace.

---

## Instruções de preenchimento

Cada entrada deve usar um **timestamp ISO 8601 completo** como cabeçalho de seção:

```
## 2026-05-14T08:20:00+02:00 — Título curto da mudança
```

- Formato: `AAAA-MM-DDTHH:MM:SS±HH:MM` (data + hora local + offset de fuso)
- Fuso padrão do servidor: `Europe/Berlin` (CEST `+02:00` no verão, CET `+01:00` no inverno)
- **Nunca usar apenas a data** — o horário é obrigatório para ordenação e rastreabilidade
- Entradas dentro do mesmo dia devem ter timestamps distintos
- Ordem: mais recente no topo
- Toda entrada deve conter:
  - **Contexto:** o porquê da mudança em 1–3 linhas
  - **Arquivos modificados:** lista de paths relativos ao repositório
  - Descrição agrupada por subsistema, com bullets curtos descrevendo o **o que** mudou
  - Quando aplicável: notas sobre build, migração, breaking changes ou pontos de atenção

---

## 2026-05-14T14:30:00+02:00 — Settings: providers customizados aparecem no dialog compacto + botão Refresh

**Contexto:** OmniRoute (configurado em `custom_providers` no `config.yaml`) não aparecia como card de provider no dialog compacto de Settings (Model & Provider). Os providers hardcoded (`PROVIDER_CARDS`) eram os únicos exibidos. Além disso, ao selecionar um provider, a lista de modelos não exibia as opções do OmniRoute. Dois problemas corrigidos: (1) normalização de casing apagava o ID original do provider; (2) o dialog compacto não consultava os providers dinâmicos.

**Arquivos modificados:**
- `src/components/settings-dialog/settings-dialog.tsx`
- `src/screens/settings/providers-screen.tsx`

**Settings dialog compacto (`settings-dialog.tsx`):**
- `HermesContent` agora busca `/api/models` ao montar → extrai `configuredProviders` e `models`
- `dynamicCards` = providers em `configuredProviders` que **não** estão no `PROVIDER_CARDS` hardcoded
- Grid de providers renderiza `allProviderCards = [...PROVIDER_CARDS, ...dynamicCards]`
- Cards dinâmicos exibem avatar com inicial do nome, contagem de modelos ("20 models") e indicador verde
- `fetchModelsForProvider` checa `modelsData` primeiro → retorna modelos do OmniRoute sem precisar de endpoint extra
- Adicionado botão **↻ Refresh** ao lado do label "Model" — re-busca `/api/models` e recarrega lista de modelos do provider ativo
- Runtime info usa `allProviderCards` para exibir o nome correto de providers dinâmicos

**Settings completo (`providers-screen.tsx`):**
- `readProviderId` removeu chamada a `normalizeProviderId` — retorna o provider string original (ex.: `'OmniRoute'`, não `'omniroute'`)
- `buildProviderSummaries` usa Map `lowercase → original` para deduplicação case-insensitive, preservando o casing canônico
- Provider summaries agora têm `id: 'OmniRoute'` e `name: 'OmniRoute'` correspondendo exatamente ao valor em `config.yaml`
- Select de provider no `ModelConfigSection` encontra a opção corretamente sem precisar do fallback de "add current value"

**Pontos de atenção:**
- Dependências do CodeMirror (`@lezer/highlight`, `@codemirror/theme-one-dark`) instaladas via npm por causa do mismatch de store pnpm v10/v11

---

## 2026-05-14T12:40:00+02:00 — Terminal: multiplexer tmux com WebSocket + MCP server

**Contexto:** O terminal antigo usava SSE para output + `POST /api/terminal-input` por keystroke. Latência alta (50–150ms/tecla), terminal travando em conexões com latência. Além disso, não permitia fechar todos os terminais (forçava sempre 1 aberto), não tinha multi-panel, e não tinha jeito de inspecionar/comandar terminais a partir do Claude. Migração completa para tmux real + WebSocket único + MCP server.

**Arquivos criados:**
- `src/server/tmux-sessions.ts` — backend tmux (sessions, panes, capture, send, FIFO streaming via `tmux pipe-pane`)
- `src/server/tmux-ws.ts` — WebSocket multiplexado `/api/tmux/ws` (subscribe/input/resize/output/exit)
- `src/routes/api/tmux/session.ts`, `session.$tabId.ts`, `pane.$paneId.ts`, `pane.$paneId.split.ts`, `pane.$paneId.capture.ts`, `pane.$paneId.send.ts`, `list.ts` — REST endpoints
- `src/components/terminal/use-tmux-ws.ts` — hook React com WS auto-reconnect e fila de mensagens
- `src/components/terminal/terminal-command-palette.tsx` — Cmd+K palette (summarize/send/rename)
- `mcp-servers/hermes-tmux/{index.mjs, package.json, README.md}` — MCP server stdio com 6 ferramentas
- `context-docs/terminal-multiplexed/PLAN.md` — plano técnico consolidado

**Arquivos modificados:**
- `src/components/terminal/terminal-panel.tsx` (reescrito para usar WS+tmux; mantém Fase 0 close-all + empty state; adiciona rename inline por duplo-clique e atalho Cmd+K)
- `server-entry.js` (registra `tsx/esm` loader e chama `attachTmuxWebSocket(httpServer)` após `listen`)
- `package.json` (adicionadas: `react-resizable-panels@^4.11.1`, `@modelcontextprotocol/sdk@^1.29.0`)

**Backend (tmux):**
- Cada aba do frontend = uma session tmux dedicada `hermes-<tabId>`
- Lifecycle 1:1: criar aba → `tmux new-session`; fechar aba → `tmux kill-session`
- Streaming: cada pane redireciona output via `tmux pipe-pane -o -t <pane> "cat > /tmp/hermes-tmux-fifos/pane-X.fifo"`; Node lê da FIFO e emite via WebSocket
- Capture: `tmux capture-pane -p -S -<lines> -J` (escape sequences preservados)
- Send-keys literal: `tmux send-keys -t <pane> -l <data>` — xterm já encoda Enter como `\r`, Ctrl-C como `\x03` etc.
- Resize: `tmux resize-window -t <session> -x cols -y rows`
- Cleanup automático: ao iniciar o servidor, `tmux list-sessions | grep ^hermes-` é matado; handler SIGINT/SIGTERM faz o mesmo
- Estado compartilhado via `globalThis[Symbol.for('hermes.tmux-sessions.store')]` — REST endpoints (bundlados em `dist/server/server.js`) e o WS (carregado em runtime via tsx) compartilham o mesmo Map de sessions

**WebSocket protocol (JSON text frames):**
- Cliente → servidor: `subscribe`, `unsubscribe`, `input`, `resize`
- Servidor → cliente: `output`, `exit`, `error`
- Auth via cookie `hermes-auth` (mesmo helper de `auth-middleware.ts`)
- Uma conexão por aba do browser, multiplexa todos os panes

**Frontend:**
- Hook `useTmuxWs()` mantém WS estável, com reconnect automático e re-subscribe pós-reconnect
- xterm.onData → `sendInput`; xterm.onResize → `sendResize`; eventos `output` do servidor → `terminal.write`
- Cmd+K abre command palette com ações: "Summarize: <nome>", "Send command to: <nome>", "Rename: <nome>"
- Duplo-clique no título da aba abre input inline pra renomear (chama `PATCH /api/tmux/session/:tabId`)
- Botão ⌘K visível na barra superior; status "tmux: %N" mostra o paneId atual

**MCP Server (`mcp-servers/hermes-tmux/`):**
- Stdio MCP server que se comunica com o workspace via REST API
- Ferramentas expostas:
  - `tmux_list_terminals` — lista sessions/panes com nomes
  - `tmux_get_output(terminal, lines?)` — captura scrollback
  - `tmux_send_command(terminal, command, submit?)` — envia comando
  - `tmux_create_terminal(name?, cwd?)` — cria aba programaticamente
  - `tmux_close_terminal(terminal)` — fecha aba
  - `tmux_rename_terminal(tabId, name)` — renomeia
- Resolução flexível: aceita name, tabId ou paneId em `terminal`
- Registro manual: `claude mcp add hermes-tmux node /root/hermes-workspace/mcp-servers/hermes-tmux/index.mjs --env HERMES_WORKSPACE_URL=http://127.0.0.1:3001`

**Testes end-to-end realizados:**
- `POST /api/tmux/session` cria session e retorna `paneId` ✓
- `POST /api/tmux/pane/%X/send` + `GET /api/tmux/pane/%X/capture` → output esperado ✓
- WebSocket subscribe → input → output flui em tempo real ✓
- MCP handshake + `tmux_list_terminals` + `tmux_send_command` + `tmux_get_output` ✓
- `DELETE /api/tmux/session/:tabId` mata `hermes-*` session ✓

**Pontos de atenção:**
- `server-entry.js` registra `tsx/esm` loader (gera warning de deprecation em Node 22 mas funciona)
- O frontend precisa ser rebuildado (`vite build`) para os novos endpoints REST aparecerem em `dist/server/server.js`
- Splits (horizontal/vertical) ficaram fora desta iteração — endpoint `POST /api/tmux/pane/:paneId/split` já existe e pode ser ligado à UI no futuro com `react-resizable-panels`
- MCP server NÃO foi registrado automaticamente — comando de registro está no README dele

---

## 2026-05-14T11:50:00+02:00 — Files: substituição do Monaco pelo CodeMirror 6

**Contexto:** Apesar de várias tentativas (correção da CSP, modo uncontrolled, `key` por arquivo, remoção do `padding`), o Monaco continuava com problemas — cursor invisível em alguns casos, click desalinhado, Enter saltando para a última linha. Decisão: substituir Monaco por CodeMirror 6, que é mais leve, totalmente local (zero CDN) e tem handling de cursor mais previsível.

**Arquivos modificados:**
- `src/routes/files.tsx` (reescrito do zero usando `@uiw/react-codemirror`)
- `src/styles.css` (removido `markdown-preview` CSS, não é mais usado)

**Dependências adicionadas (em `node_modules`):**
- `@uiw/react-codemirror` + `@codemirror/{state,view,language,commands,search,autocomplete}`
- Language packs: `lang-javascript`, `lang-markdown`, `lang-json`, `lang-python`, `lang-css`, `lang-html`, `lang-yaml`, `lang-sql`, `lang-rust`, `lang-go`, `lang-cpp`, `lang-xml`, `lang-php`, `lang-java`
- Theme: `@codemirror/theme-one-dark`
- Transitivas: `@lezer/*`, `@marijn/*`, `style-mod`, `crelt`, `w3c-keyname`, `@babel/runtime`

**Editor:**
- Tema One Dark (estilo VS Code) com fundo `#1e1e2e`, gutters `#181825`
- Cursor ciano (`#7dd3fc`) de 2px, animado, sempre visível
- Active-line highlight + active-line-gutter
- JetBrains Mono, line-height 1.55, font-size do setting global
- Auto-features ativas: bracket matching, close-brackets, autocomplete, code folding, indent-on-input, line wrapping (toggle via setting)
- Sem cursor jumping: editor é controlado via `value`/`onChange` direto — CodeMirror lida bem com isso (diferente do Monaco)
- Suporte a 15+ linguagens via switch em `getLanguageExtension(path)`
- Mantém: imagens inline, mensagens de erro, atalho `Ctrl/Cmd+S` para salvar

**Pontos de atenção:**
- Pacotes foram instalados em `/tmp` com npm e copiados para `node_modules/` porque o projeto usa pnpm com mismatch de store version entre v10 (atual) e v11 (instalado pelo pnpm 11). Para reinstalar do zero seria necessário regenerar o `pnpm-lock.yaml` e fazer `pnpm install` completo
- O Monaco (`@monaco-editor/react`) continua em `package.json` mas não é mais referenciado — pode ser removido em uma limpeza futura

---

## 2026-05-14T11:30:00+02:00 — Terminal: fix Enter não envia comando (stale closure)

**Contexto:** Depois de abrir o novo dialog de terminal e digitar qualquer comando, pressionar Enter não executava nada. Causa raiz: classic stale closure. `terminal.onData(cb)` no xterm é registrado **uma vez** na inicialização. O `cb` capturava `handleSendInput`, que por sua vez tinha `[tabs]` como dependência. Quando a sessão SSE conectava e gravava `sessionId` no tab, o estado `tabs` atualizava — mas o callback registrado no xterm continuava com a referência velha de `handleSendInput`, em que `tab.sessionId === undefined`, então o `fetch('/api/terminal-input')` nunca era chamado.

**Arquivos modificados:**
- `src/components/terminal/terminal-panel.tsx`

**Correção:**
- Novo `tabsRef = useRef(tabs)` sincronizado via `useEffect`
- `handleSendInput` agora lê de `tabsRef.current` (sem dependências reativas)
- `useCallback` de `handleSendInput` passou a ter deps vazias (`[]`) — referência estável, nunca fica obsoleto
- `initializeTerminal` removeu `tabs` das deps (não precisa mais re-criar quando tabs muda)

---

## 2026-05-14T11:15:00+02:00 — Files: editor não-controlado com cursor jumping resolvido + preview Markdown (descontinuado depois)

**Contexto:** Usuário reportou cursor pulando ao digitar e linha sendo selecionada incorretamente. Causa: Monaco em modo controlado (`value` + `onChange`) recebia o state de volta a cada keystroke, reposicionando o cursor. Tentativa de fix: usar `defaultValue` + `key={openedPath}` para isolar o ciclo, e adicionar split-view de preview para arquivos `.md`. Funcionou parcialmente — cursor jumping melhorou mas outros problemas do Monaco persistiam (ver entrada de 11:50 com migração para CodeMirror).

**Arquivos modificados (subsequentemente substituídos):**
- `src/routes/files.tsx`
- `src/styles.css` (adicionado `.markdown-preview` com estilo manual, sem `@tailwindcss/typography`)

**Mudanças que ficaram:**
- Removido `@monaco-editor/react`'s `padding: { top, bottom }` que desalinhava hit areas
- `JetBrains Mono` adotado como fonte do editor
- Detecção de tipo Markdown via extensão `.md` / `.mdx`

---

## 2026-05-14T11:00:00+02:00 — Tasks/Kanban: URL com `?task=<id>` para deep-link

**Contexto:** Ao abrir uma tarefa, a URL não refletia qual task estava aberta — impossível compartilhar link direto para uma tarefa específica. Pedido: sincronizar `editingTask` com query param `?task=<id>` na URL, com `replace` no fechar para não poluir history.

**Arquivos modificados:**
- `src/routes/tasks.tsx` (adicionado `task` ao `searchSchema`)
- `src/screens/tasks/tasks-screen.tsx`

**Mudanças:**
- Novo helper `openTask(task)` faz `setEditingTask` + `navigate({ search: prev => ({...prev, task: task.id }) })`
- Novo helper `closeTask()` faz `setEditingTask(null)` + `navigate({ search: prev => { delete prev.task; return prev } }, { replace: true })`
- `useEffect` faz auto-open quando `search.task` está presente e a task existe no array `tasks` — guarded por `openedFromUrl.current` para não reabrir após fechar manualmente
- Callbacks de mutations (`updateMutation.onSuccess`, `archiveMutation.onSuccess`) agora chamam `closeTask()` em vez de `setEditingTask(null)`
- Substituídos os handlers de `setEditingTask(task)` em `TaskCard.onClick` (board) e `ListView.onOpen` por `openTask(task)`

---

## 2026-05-14T10:35:00+02:00 — Terminal: fix typo `cloudfast` → `claudefast`

**Contexto:** Quick command no dialog de novo terminal mostrava `cloudfast` em vez do nome correto do CLI `claudefast`.

**Arquivos modificados:**
- `src/components/terminal/new-terminal-dialog.tsx`

---

## 2026-05-14T10:30:00+02:00 — Terminal: dialog de novo terminal com seletor de diretório e comandos rápidos

**Contexto:** Ao abrir um novo terminal (botão `+`), o terminal sempre abria em `~/.hermes` sem nenhuma opção de configuração. Usuário pediu um popup para escolher o diretório e opcionalmente executar um comando ao abrir.

**Arquivos novos:**
- `src/components/terminal/new-terminal-dialog.tsx`

**Arquivos modificados:**
- `src/components/terminal/terminal-workspace.tsx`

**Terminal:**
- Botão `+` agora abre um modal em vez de criar o tab diretamente
- Modal tem dois painéis:
  - **Open in**: grid 3 colunas com 12 diretórios pré-definidos (`~ root`, `hermes-workspace`, `itarget-agents`, `hermes`, `.hermes`, `monorepo`, `agno-api-oficial`, `falcon-crm`, `n8n`, `BF-Second-Brain`, `skills`, `workspace-development`)
  - **Run command on open** (opcional): chips `claudefast`, `codex`, `opencode`, `npm run dev`, `pnpm dev`
- Rodapé do modal mostra preview do caminho + comando antes de confirmar
- `connectTab` agora usa `tab.cwd` em vez do `DEFAULT_TERMINAL_CWD` hardcoded
- Comando pendente é enviado ao terminal 300ms após a sessão conectar (via `pendingCommandRef`)
- Tab inicial (ao abrir o workspace) continua abrindo em `~/.hermes` como antes

---

## 2026-05-14T09:06:00+02:00 — Settings: custom providers no dropdown + filtro Active only

**Contexto:** Providers configurados via `custom_providers` no `config.yaml` (ex.: OmniRoute) não apareciam no dropdown de Provider em "Model Configuration" — o campo sempre mostrava "Custom" mesmo com `provider: OmniRoute` salvo. Causa raiz dupla: (1) o backend `/api/models` não lia o bloco `custom_providers` do config; (2) o frontend tinha `ModelProviderOption` como union hardcoded de 4 valores e `parseModelProvider` descartava qualquer coisa fora da lista. Usuário também pediu um toggle "All / Active only" na lista de providers configurados.

**Arquivos modificados:**
- `src/routes/api/models.ts`
- `src/screens/settings/providers-screen.tsx`

**Backend (`/api/models`):**
- Nova função `readCustomProviderModels()` lê `custom_providers[]` do `config.yaml`; extrai modelos do dict `models:` e o `model:` padrão de cada entrada
- `provider` de cada modelo assume o campo `name:` do provider (ex.: `OmniRoute`), com fallback para derivação via `key_env`
- Modelos dos custom providers são merged na resposta antes da descoberta local (Ollama/Atomic Chat)

**Frontend (`providers-screen.tsx`):**
- `ModelProviderOption` ampliado de union literal para `string` — aceita qualquer provider
- `MODEL_PROVIDER_VALUES` removido; `parseModelProvider` simplificado para retornar a string trimada ou `'custom'` se vazia
- `ModelConfigSection` recebe nova prop `providerOptions?: Array<SelectOption>`; constrói `selectOptions` via `useMemo`, garantindo que o valor atual do config sempre tenha uma `<option>` correspondente (mesmo que não esteja nos summaries normalizados)
- `ActiveModelCard` recebe `providerSummaries` e constrói o memo `providerOptions` dinamicamente; passa para Primary e Fallback `ModelConfigSection`
- `ProvidersScreen` passa `providerSummaries` para `ActiveModelCard`
- `ProviderManagementSection` ganhou estado local `showOnlyActive` + toggle "All / Active only" no header; contador de providers atualiza para mostrar `X of Y` quando filtrado

---

## 2026-05-14T08:55:00+02:00 — Files: fix CSP bloqueando Monaco Editor (loading eterno)

**Contexto:** Monaco carrega seu runtime de `cdn.jsdelivr.net`, mas a CSP do app (`script-src 'self' 'unsafe-inline'`) bloqueava scripts externos. Resultado: Monaco nunca inicializava e todos os arquivos ficavam em "Loading…" para sempre.

**Arquivos modificados:**
- `src/routes/__root.tsx`

**CSP:**
- Adicionado `https://cdn.jsdelivr.net` ao `script-src` em `APP_CSP`

---

## 2026-05-14T08:50:00+02:00 — Files: fix symlinks-pra-diretório + folder picker no "New File"

**Contexto:** Symlinks que apontam para diretórios (como `.agent/skills/backend-patterns` → `../../.agents/skills/backend-patterns`) eram classificados como `file` porque `entry.isDirectory()` (de `readdir({withFileTypes:true})`) **não resolve symlinks**. Clicar tentava abrir como arquivo e a leitura caía em `Is a directory`. Além disso, criar arquivo só pedia o nome — usuário pediu uma navegação tipo file dialog para escolher a pasta destino com possibilidade de criar pasta em qualquer nível.

**Arquivos modificados:**
- `src/routes/api/files.ts`
- `src/components/file-explorer/file-explorer-sidebar.tsx`

**Arquivos novos:**
- `src/components/file-explorer/new-file-dialog.tsx`

**API:**
- `readDirectory` usa `stats.isDirectory()` (do `fs.stat`, que segue symlinks) em vez de `entry.isDirectory()` (que vê o symlink em si). Resultado: symlinks para diretórios agora aparecem como `type: 'folder'` e expandem normalmente

**`NewFileDialog`:**
- Breadcrumb clicável do caminho atual (`/root` → `.hermes` → `skills` → …), cada segmento navega para aquele nível
- Lista filtrada só com **subpastas** do diretório atual, clique entra na pasta; botão `..` para voltar
- Botão "New folder here" expande input inline; cria a pasta via `/api/files` `action=mkdir` e **auto-navega** pra dentro dela
- Input "File name" com preview do path final que será criado
- Enter no nome do arquivo dispara Create; Enter no nome da pasta confirma criação

**Sidebar:**
- `+` no header, "New file" do empty state e "New file" do menu de contexto agora abrem o `NewFileDialog`
- `initialPath` do dialog vem do alvo do clique direito (pasta clicada → pasta clicada; arquivo clicado → pasta pai); botão do header começa em `/root`
- Após criar, o sidebar é atualizado e, se `onFileOpen` estiver setado, o arquivo é aberto direto no painel direito

---

## 2026-05-14T08:15:00+02:00 — Files: abertura inline no painel direito (sem popup)

**Contexto:** O clique em arquivo abria um `FilePreviewDialog` (popup). O usuário quer o conteúdo inline no painel direito da rota `/files`, igual a um VS Code minimalista. Pop-up removido; abertura passa por `onFileOpen` no sidebar.

**Arquivos modificados:**
- `src/routes/files.tsx`
- `src/components/file-explorer/file-explorer-sidebar.tsx`
- `src/routes/api/files.ts`

**Sidebar:**
- Nova prop `onFileOpen(path)` em `FileExplorerSidebar`
- `handleFileClick` chama `onFileOpen` quando definido; o caminho do popup (`setPreviewPath`) vira fallback apenas se a prop não for passada

**Rota `/files`:**
- Estado de abertura inline (`openedPath`, `fileContent`, `fileDataUrl`, `fileType`, `loading`, `error`, `dirty`, `saving`)
- Carregamento via `fetch('/api/files?action=read&path=...')` quando `openedPath` muda; cancelamento em re-execução para evitar race
- Render no painel direito:
  - Texto → `<Editor>` (Monaco) com `path={openedPath}`, `language` detectado por extensão (mapa expandido: TS/JS/Py/Go/Rust/Shell/Dockerfile/YAML/TOML/INI/SQL/etc.)
  - Imagem → `<img>` com `max-h-full max-w-full`
  - Estado vazio → ícone + "No file open"
  - Loading → spinner; erro → mensagem em rosa com path em monospace
- Header da página mostra path do arquivo em fonte monoespaçada, badge `● unsaved` quando dirty, botão **Save** (mostrado só para `fileType==='text'`, desabilitado quando não há mudanças)
- Atalho global `Ctrl+S` / `Cmd+S` salva o arquivo aberto

**API `/api/files?action=read`:**
- Recusa diretórios (`400` "Is a directory")
- Tamanho máximo de leitura: **8 MiB** (`413` com mensagem explicando o limite)
- Detecção de binário: NUL no primeiro sample de 8 KiB → `415` "Binary file — preview not supported"
- Imagens continuam sendo retornadas como `data:` URL base64

---

## 2026-05-14T07:40:00+02:00 — Files: navegação em `/root` com lazy-load e dot-files

**Contexto:** O `FileExplorerSidebar` só mostrava `~/.hermes` e filtrava dot-files. O usuário quer navegar `/root` inteiro com pastas colapsadas por padrão (lazy-fetch ao clicar) e poder criar arquivos/pastas pelo botão ou pelo menu de contexto.

**Arquivos modificados:**
- `src/routes/api/files.ts`
- `src/components/file-explorer/file-explorer-sidebar.tsx`

**API:**
- `WORKSPACE_ROOT` agora é `process.env.HERMES_WORKSPACE_DIR` || `os.homedir()` || `/root`
- `IGNORED_DIRS` reduzido para apenas `node_modules` (dot-files visíveis: `.git`, `.hermes`, `.bashrc`, etc.)
- `DEFAULT_DIRECTORY_DEPTH = 1` — leitura inicial vai apenas um nível abaixo
- `readDirectory` empurra pastas **sem `children`** quando atinge o limite de profundidade, sinalizando à UI que o conteúdo está pendente de fetch

**UI:**
- `fetchFileTree(targetPath?)` aceita `path` para lazy-fetch direto
- `attachChildren(tree, targetPath, children)` mescla a resposta da pasta clicada no lugar certo da árvore (preserva o resto)
- `toggleFolder(entry)` é async: ao expandir pela primeira vez (`entry.children === undefined`), busca os filhos e seta `loadingPaths` para mostrar `…` no header da pasta
- Pastas vazias após expandir mostram `(empty)` em itálico
- `ROOT_LABEL` mudou de `Workspace` para `/root`
- Menu de contexto (rename / new file / new folder / upload / download / delete) e botão `+` já existiam — continuam funcionando

---

## 2026-05-14T07:35:00+02:00 — Terminal: corrige `failed to connect` via Cloudflare tunnel

**Contexto:** Acessando pelo Cloudflare tunnel com `TRUST_PROXY=1`, `getRequestIp` lê o IP público do `x-forwarded-for`, que **não** passa em `isLocalRequest`. A rota `/api/terminal-stream` usava `requireLocalOrAuth`, então o stream retornava 401, e `terminal-resize` 404 em cascata.

**Arquivos modificados:**
- `src/routes/api/terminal-stream.ts`

**Mudança:**
- `requireLocalOrAuth` → `isAuthenticated`, alinhando com `terminal-input`, `terminal-resize` e `terminal-close`
- Comportamento agora é o mesmo do resto do workspace: sem `HERMES_PASSWORD` setado tudo passa; com senha, exige cookie de sessão válido

---

## 2026-05-14T07:20:00+02:00 — Logs: aba "Hermes Logs" com tail dos arquivos em `~/.hermes/logs/`

**Contexto:** Logs do workspace Node não são os mesmos do agent Python. Usuário quer ver ambos: workspace internals **e** logs do Hermes (gateway, runs, erros). Página `/logs` agora tem **duas abas**.

**Arquivos novos:**
- `src/server/hermes-log-tailer.ts`
- `src/routes/api/hermes-logs.ts`
- `src/routes/api/hermes-logs-stream.ts`

**Arquivos modificados:**
- `src/screens/logs/logs-screen.tsx`

**Tailer:**
- Acompanha `agent.log`, `errors.log`, `gateway.log` em `~/.hermes/logs/`
- Estratégia: ler tail inicial (300 linhas) + `fs.watch` para detectar appends; lê apenas os bytes novos via `offset`
- Detecta truncate/rotate (size < offset) e reseta
- Ring buffer de 5 000 linhas em `globalThis.__hermesTailer` (mesma estratégia do log-store para cruzar fronteiras de chunk do Vite)
- `detectLevel(raw)` infere nível pelo padrão `ERROR|WARNING|DEBUG` na linha

**Endpoints:**
- `GET /api/hermes-logs` — JSON com filtros (`limit`, `source`, `level`, `search`, `since`)
- `GET /api/hermes-logs-stream` — SSE; envia history (tail) + cada nova linha como `event: log`

**UI:**
- Tabs `Workspace Logs` / `Hermes Logs` (ambas montadas — SSE permanece conectado ao trocar de aba)
- Aba Hermes tem filtro extra de source (`All` / `Agent` / `Gateway` / `Errors`)
- Componente compartilhado: `Toolbar`, `LogTable`

---

## 2026-05-14T07:05:00+02:00 — Logs: instrumentação ampla do workspace

**Contexto:** Pedido explícito — "logs de tudo, chamadas de API, todas as funções, tudo que o workspace tem". Interceptação isolada do `console.*` não basta; precisa cobrir HTTP de entrada e chamadas de saída.

**Arquivos modificados:**
- `server-entry.js`
- `src/server/gateway-capabilities.ts`
- `src/server/log-store.ts`
- `src/server/hermes-log-tailer.ts`

**HTTP de entrada (`server-entry.js`):**
- `res.on('finish', …)` loga `[http] METHOD url → status (ms)` para cada request
- `SILENT_PREFIXES` (`/assets/`, `/api/logs-stream`, `/api/kanban-events`, `/api/chat-events`) suprime ruído de SSE e estáticos

**Saída ao Hermes (`gateway-capabilities.ts`):**
- `dashboardFetch` agora loga `[dashboard] METHOD path → status (ms)` antes de retornar
- `ensureLogStoreStarted()` chamado no topo do módulo — garante interceptor de `console.*` ativo desde o load do chunk

**Compartilhamento entre chunks Vite:**
- `log-store` e `hermes-log-tailer` migrados de variáveis de módulo para `globalThis.__hermesLogStore` / `globalThis.__hermesTailer`
- Sem isso, cada chunk recebia uma cópia isolada do ring buffer — quem patcheava `console.*` no chunk router não compartilhava ring com o handler de `/api/logs`

**API endpoint:**
- `/api/logs` (GET) agora lê do **arquivo persistido** (`~/.hermes/workspace-logs.jsonl`) em vez do ring em memória — bypassa qualquer dúvida sobre cross-chunk e ainda traz a história inteira do processo

---

## 2026-05-14T06:50:00+02:00 — Logs: página `/logs` (Workspace Logs)

**Contexto:** Nova página no menu para ver logs verbosos do servidor Node em tempo real. Sem dependência nova (SQLite descartado — usa JSONL append-only).

**Arquivos novos:**
- `src/server/log-store.ts`
- `src/routes/api/logs.ts`
- `src/routes/api/logs-stream.ts`
- `src/routes/logs.tsx`
- `src/screens/logs/logs-screen.tsx`

**Arquivos modificados:**
- `src/screens/chat/components/chat-sidebar.tsx`
- `src/components/workspace-shell.tsx`

**Log store:**
- Intercepta `console.log/info/warn/error/debug` globalmente
- Ring buffer de 5 000 entradas (`LogEntry { id, ts, level, source, msg }`)
- Persistência em `~/.hermes/workspace-logs.jsonl` (NDJSON, append batched via `setImmediate`)
- `subscribeToLogs(cb)` para fan-out a SSE; flag `writing` evita recursão infinita quando um subscriber loga algo
- `tag(args)` extrai o prefixo `[xxx]` da primeira string como `source` (`[gateway] foo` → `source: gateway`)

**Endpoints:**
- `GET /api/logs` — JSON, lê do arquivo, filtros `limit`/`level`/`search`
- `GET /api/logs-stream` — SSE com history + subscriber live

**UI:**
- Tema dark monospace, linha por entrada (`time | LEVEL pill | source | msg`)
- Toggle Live/Paused com pulse dot
- Filtro por nível (all/error/warn/info/debug), busca por texto, contador `shown / total`
- Botão Clear; botão "↓ Bottom" aparece quando o usuário rola para cima

**Navegação:**
- Item "Logs" adicionado em `systemItems` da `chat-sidebar` com ícone `ConsoleIcon`
- `workspace-shell` reconhece `/logs` no `getTabIndex` (índice 11) e no título de página mobile

---

## 2026-05-14T05:45:00+02:00 — Task card: exibe `result` quando a tarefa conclui

**Contexto:** Worker concluía tarefa via `kanban_complete(result=...)`, mas o card no kanban ficava vazio. `latest_summary` aparecia, mas o resultado em si (`tasks.result`) não.

**Arquivos modificados:**
- `src/screens/tasks/task-card.tsx`

**Mudança:**
- Quando `task.status === 'done' && task.result`, renderiza box verde (`bg-emerald-500/10 text-emerald-400`) com `line-clamp-3` mostrando o resultado
- Fallback para `latest_summary` quando `result` é null (tarefa ainda não concluída ou worker não preencheu `result`)

---

## 2026-05-14T01:30:00+02:00 — Kanban migration: workspace passa a ser proxy do dashboard plugin

**Contexto:** Implementação completa do plano em `BF Labs/Projetos internos/hermes-workspace/SWARM/kanban-migration.md`. Pivô arquitetural: em vez de reimplementar o store SQLite em TS, o workspace passa a proxiar o plugin `kanban` do dashboard (~30 endpoints + WebSocket de eventos). Elimina duplicação de dispatcher, CAS predicates, WAL e broadcast.

**Arquivos novos:**
- `src/lib/kanban-types.ts` (tipos canônicos espelhando o schema Python)
- `src/server/hermes-kanban-api.ts` (cliente para os 30 endpoints do plugin)
- `src/server/kanban-event-bus.ts` (singleton WS cliente → fan-out SSE)
- `src/lib/use-kanban-events.ts` (hook React para SSE `/api/kanban-events`)
- `src/screens/tasks/list-view.tsx`
- `src/screens/tasks/dashboard-view.tsx`
- `src/screens/tasks/dispatcher-panel.tsx`
- `src/screens/chat/hooks/use-chat-kanban-toasts.ts`

**Arquivos modificados:**
- `src/lib/tasks-api.ts` (reescrito com `fetchBoard`, `fetchTaskDetail`, `archiveTask`, `nudgeDispatcher`; aliases legados preservados)
- `src/screens/tasks/task-card.tsx` (status pill, P0–P3 badge, comment count, link counts, body + latest_summary preview)
- `src/screens/tasks/task-dialog.tsx` (4 tabs: Details / Comments / Events / Runs)
- `src/screens/tasks/tasks-screen.tsx` (7 colunas: `triage|todo|ready|running|blocked|done|archived`, view switcher board/list/dashboard, SSE live refresh)

**Arquivos removidos:**
- `src/routes/api/hermes-tasks.ts`
- `src/routes/api/hermes-tasks.$taskId.ts`
- `src/routes/api/hermes-tasks-assignees.ts`
- `src/stores/tasks-store.ts`

**Pontos de atenção:**
- Auth do dashboard plugin via `HERMES_DASHBOARD_TOKEN` no `.env`; o token é rotacionado pelo dashboard no restart — quando o WS bate 401/403, `kanban-event-bus` faz `force: true` no `fetchDashboardToken()` e refaz a conexão (backoff exponencial)
- Toasts no chat para 14 kinds de evento kanban via `use-chat-kanban-toasts`
- `recharts` Pie/Cell apresentou erro de tipos no build; contornado substituindo o pie de status por barra empilhada CSS pura no `dashboard-view`
- Timestamps em **segundos** (epoch s), não ms — consistente com o schema Python
