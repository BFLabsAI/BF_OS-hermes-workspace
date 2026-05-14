/**
 * Canonical Hermes Kanban types.
 *
 * Source of truth: /root/.hermes/hermes-agent/hermes-agent/hermes_cli/kanban_db.py
 * Schema spec: /tmp/kanban-canonical-spec.md
 *
 * These types mirror the SQLite schema in ~/.hermes/kanban.db. Timestamps are
 * epoch SECONDS (UTC), not milliseconds. JSON-typed columns (skills, payload,
 * metadata) are TEXT in SQLite — the dashboard plugin parses them before
 * returning, but raw DB rows store strings.
 */

export type TaskStatus =
  | 'triage'
  | 'todo'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'done'
  | 'archived'

export const VALID_STATUSES: readonly TaskStatus[] = [
  'triage',
  'todo',
  'ready',
  'running',
  'blocked',
  'done',
  'archived',
] as const

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'done',
  'archived',
] as const

export type WorkspaceKind = 'scratch' | 'worktree' | 'dir'

export const VALID_WORKSPACE_KINDS: readonly WorkspaceKind[] = [
  'scratch',
  'worktree',
  'dir',
] as const

// Values actually written today + reserved comment values for forward compat.
export type RunStatus =
  | 'running'
  | 'done'
  | 'blocked'
  | 'crashed'
  | 'timed_out'
  | 'gave_up'
  | 'reclaimed'
  | 'spawn_failed'
  | 'failed'
  | 'released'

export type RunOutcome =
  | 'completed'
  | 'blocked'
  | 'crashed'
  | 'timed_out'
  | 'spawn_failed'
  | 'gave_up'
  | 'reclaimed'

export const TERMINAL_RUN_OUTCOMES: readonly RunOutcome[] = [
  'completed',
  'blocked',
  'crashed',
  'timed_out',
  'spawn_failed',
  'gave_up',
  'reclaimed',
] as const

export type EventKind =
  | 'created'
  | 'assigned'
  | 'linked'
  | 'unlinked'
  | 'commented'
  | 'promoted'
  | 'claimed'
  | 'spawned'
  | 'heartbeat'
  | 'completed'
  | 'completion_blocked_hallucination'
  | 'suspected_hallucinated_references'
  | 'edited'
  | 'blocked'
  | 'unblocked'
  | 'archived'
  | 'reclaimed'
  | 'crashed'
  | 'timed_out'
  | 'spawn_failed'
  | 'gave_up'
  | 'reprioritized'

// ── Row interfaces ───────────────────────────────────────────────────

export interface KanbanTask {
  id: string
  title: string
  body: string | null
  assignee: string | null
  status: TaskStatus
  priority: number
  created_by: string | null
  created_at: number
  started_at: number | null
  completed_at: number | null
  workspace_kind: WorkspaceKind
  workspace_path: string | null
  claim_lock: string | null
  claim_expires: number | null
  tenant: string | null
  result: string | null
  idempotency_key: string | null
  consecutive_failures: number
  worker_pid: number | null
  last_failure_error: string | null
  max_runtime_seconds: number | null
  last_heartbeat_at: number | null
  current_run_id: number | null
  workflow_template_id: string | null
  current_step_key: string | null
  skills: string[] | null
}

export interface KanbanTaskAge {
  created_age_seconds: number | null
  started_age_seconds: number | null
  time_to_complete_seconds: number | null
}

export interface KanbanTaskSummary extends KanbanTask {
  age?: KanbanTaskAge
  link_counts?: { parents: number; children: number }
  comment_count?: number
  progress?: number | null
  diagnostics?: Array<KanbanDiagnostic>
  warnings?: string[]
  latest_summary?: string | null
}

export interface KanbanRun {
  id: number
  task_id: string
  profile: string | null
  step_key: string | null
  status: RunStatus
  claim_lock: string | null
  claim_expires: number | null
  worker_pid: number | null
  max_runtime_seconds: number | null
  last_heartbeat_at: number | null
  started_at: number
  ended_at: number | null
  outcome: RunOutcome | null
  summary: string | null
  metadata: Record<string, unknown> | null
  error: string | null
}

export interface KanbanEvent {
  id: number
  task_id: string
  run_id: number | null
  kind: EventKind
  payload: Record<string, unknown> | null
  created_at: number
}

export interface KanbanComment {
  id: number
  task_id: string
  author: string
  body: string
  created_at: number
}

export interface KanbanLink {
  parent_id: string
  child_id: string
}

export interface KanbanNotifySub {
  task_id: string
  platform: string
  chat_id: string
  thread_id: string
  user_id: string | null
  created_at: number
  last_event_id: number
}

// ── Aggregate / response shapes (dashboard plugin) ───────────────────

export interface KanbanColumn {
  name: TaskStatus
  tasks: KanbanTaskSummary[]
}

export interface KanbanBoardView {
  columns: KanbanColumn[]
  tenants: string[]
  /** Board response embeds just the names; for full assignee objects call getAssignees(). */
  assignees: string[]
  latest_event_id: number
  now: number
}

/** Returned by /api/plugins/kanban/assignees. */
export interface KanbanAssignee {
  name: string
  on_disk: boolean
  counts: Record<string, number>
}

export interface KanbanDiagnostic {
  code: string
  severity: 'warning' | 'error' | 'critical'
  message: string
  hint?: string | null
}

export interface KanbanStats {
  by_status: Partial<Record<TaskStatus, number>>
  by_assignee: Record<string, number>
  oldest_ready_age_seconds: number | null
  now: number
}

export interface KanbanTaskDetail {
  task: KanbanTaskSummary
  comments: KanbanComment[]
  events: KanbanEvent[]
  links: { parents: KanbanTask[]; children: KanbanTask[] }
  runs: KanbanRun[]
}

export interface KanbanBoardInfo {
  slug: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  is_current?: boolean
  task_count?: number
  archived?: boolean
}

export interface KanbanConfig {
  default_tenant: string
  lane_by_profile: boolean
  include_archived_by_default: boolean
  render_markdown: boolean
}

// ── Inputs ───────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string
  body?: string
  assignee?: string
  tenant?: string
  priority?: number
  workspace_kind?: WorkspaceKind
  workspace_path?: string
  parents?: string[]
  triage?: boolean
  idempotency_key?: string
  max_runtime_seconds?: number
  skills?: string[]
}

export interface UpdateTaskInput {
  status?: TaskStatus
  assignee?: string | null
  priority?: number
  title?: string
  body?: string | null
  result?: string | null
  block_reason?: string
  summary?: string
  metadata?: Record<string, unknown>
}

export interface BulkUpdateInput {
  ids: string[]
  status?: TaskStatus
  assignee?: string | null
  priority?: number
  archive?: boolean
  result?: string
  summary?: string
  metadata?: Record<string, unknown>
}

export interface BulkResult {
  results: Array<{ id: string; ok: boolean; error?: string }>
}

// ── Filters ──────────────────────────────────────────────────────────

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[]
  assignee?: string | null
  tenant?: string
  include_archived?: boolean
  board?: string
}

// ── Key constants ────────────────────────────────────────────────────

export const DEFAULT_CLAIM_TTL_SECONDS = 15 * 60
export const DEFAULT_FAILURE_LIMIT = 5
export const DEFAULT_LOG_ROTATE_BYTES = 2 * 1024 * 1024
export const CTX_MAX_PRIOR_ATTEMPTS = 10
export const CTX_MAX_COMMENTS = 30
export const CTX_MAX_FIELD_BYTES = 4 * 1024
export const CTX_MAX_BODY_BYTES = 8 * 1024
export const CTX_MAX_COMMENT_BYTES = 2 * 1024
export const DEFAULT_BOARD = 'default'
export const BOARD_SLUG_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/
export const TASK_ID_RE = /^t_[a-f0-9]{8,}$/
export const FAILURE_ERROR_TRUNCATE = 500
export const DEFAULT_GC_AGE_SECONDS = 30 * 24 * 3600

// ── View modes (workspace UI) ────────────────────────────────────────

export type ViewMode = 'board' | 'list' | 'timeline' | 'swimlanes' | 'dashboard'

export const VIEW_MODES: readonly ViewMode[] = [
  'board',
  'list',
  'timeline',
  'swimlanes',
  'dashboard',
] as const

// ── Status display helpers ───────────────────────────────────────────

export const STATUS_LABELS: Record<TaskStatus, string> = {
  triage: 'Triage',
  todo: 'To Do',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  triage: 'amber',
  todo: 'slate',
  ready: 'sky',
  running: 'violet',
  blocked: 'rose',
  done: 'emerald',
  archived: 'zinc',
}

export const STATUS_ORDER: readonly TaskStatus[] = [
  'triage',
  'todo',
  'ready',
  'running',
  'blocked',
  'done',
  'archived',
] as const

// ── Type guards ──────────────────────────────────────────────────────

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (VALID_STATUSES as readonly string[]).includes(value)
  )
}

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return (
    typeof value === 'string' &&
    (VALID_WORKSPACE_KINDS as readonly string[]).includes(value)
  )
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly string[]).includes(status)
}

export function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID_RE.test(value)
}

// ── Time helpers ─────────────────────────────────────────────────────

/** Epoch seconds, UTC. Matches Python int(time.time()). */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

/** Convert epoch seconds → ISO string for UI display. */
export function secToIso(sec: number | null | undefined): string | null {
  if (sec == null) return null
  return new Date(sec * 1000).toISOString()
}

/** Age in seconds from an epoch-seconds timestamp. */
export function ageSec(sec: number | null | undefined): number | null {
  if (sec == null) return null
  return nowSec() - sec
}
