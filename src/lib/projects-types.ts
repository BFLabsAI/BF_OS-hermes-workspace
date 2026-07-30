/**
 * Canonical Hermes Projects types.
 *
 * Projects is a lightweight project/task management layer built on top of
 * Hermes. Timestamps are epoch SECONDS (UTC). JSON-typed columns (body_json,
 * payload_json) are TEXT in SQLite — the dashboard plugin parses them before
 * returning.
 */

// ── Status / kind enums ──────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done'
export type DeliverableKind = 'file' | 'link' | 'text' | 'image' | 'action'
export type TaskPriority = 'low' | 'med' | 'high'

export const VALID_TASK_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
] as const

export const VALID_TASK_PRIORITIES: readonly TaskPriority[] = [
  'low',
  'med',
  'high',
] as const

export const VALID_DELIVERABLE_KINDS: readonly DeliverableKind[] = [
  'file',
  'link',
  'text',
  'image',
  'action',
] as const

// ── Type guards ──────────────────────────────────────────────────────

export function isTaskStatus(v: unknown): v is TaskStatus {
  return (
    typeof v === 'string' &&
    (VALID_TASK_STATUSES as readonly string[]).includes(v)
  )
}

export function isTaskPriority(v: unknown): v is TaskPriority {
  return (
    typeof v === 'string' &&
    (VALID_TASK_PRIORITIES as readonly string[]).includes(v)
  )
}

export function isDeliverableKind(v: unknown): v is DeliverableKind {
  return (
    typeof v === 'string' &&
    (VALID_DELIVERABLE_KINDS as readonly string[]).includes(v)
  )
}

// ── Row interfaces ───────────────────────────────────────────────────

export interface Project {
  id: string
  slug: string
  name: string
  icon: string
  color: string
  description: string
  created_at: number
  updated_at: number
  archived_at: number | null
  // computed counts (from backend)
  task_count?: number
  open_task_count?: number
}

export interface ProjectTask {
  id: string
  project_id: string
  title: string
  body_json: string  // BlockNote JSON or plain text
  status: TaskStatus
  deadline: number | null  // unix timestamp
  priority: TaskPriority
  created_at: number
  updated_at: number
  archived_at: number | null
}

export interface ProjectTaskDetail extends ProjectTask {
  deliverables: Deliverable[]
  linked_runs: LinkedRun[]
  linked_sessions: LinkedSession[]
}

export interface ProjectNote {
  id: string
  project_id: string
  title: string
  body_json: string
  created_at: number
  updated_at: number
  archived_at: number | null
}

export interface Deliverable {
  id: string
  task_id: string
  kind: DeliverableKind
  title: string
  payload_json: string  // JSON string, parse per kind
  source_type: 'run' | 'session' | null
  source_id: string | null
  source_agent: string | null
  created_at: number
}

export interface LinkedRun {
  id: string
  title: string
  status: string
  assignee: string | null
  created_at: number
  linked_project_task_id: string
}

export interface LinkedSession {
  id: string
  title: string | null
  preview: string | null
  started_at: number
}

// ── Input types ──────────────────────────────────────────────────────

export interface CreateProjectInput {
  name: string
  icon?: string
  color?: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  icon?: string
  color?: string
  description?: string
}

export interface CreateTaskInput {
  title: string
  body_json?: string
  status?: TaskStatus
  deadline?: number | null
  priority?: TaskPriority
}

export interface UpdateTaskInput {
  title?: string
  body_json?: string
  status?: TaskStatus
  deadline?: number | null
  priority?: TaskPriority
}

export interface CreateNoteInput {
  title: string
  body_json?: string
}

export interface UpdateNoteInput {
  title?: string
  body_json?: string
}

export interface CreateDeliverableInput {
  kind: DeliverableKind
  title: string
  payload?: Record<string, unknown>
  source_type?: 'run' | 'session'
  source_id?: string
  source_agent?: string
}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[]
  include_archived?: boolean
  deadline_before?: number
}

// ── Error class ──────────────────────────────────────────────────────

export class ProjectsApiError extends Error {
  status: number
  path: string
  constructor(path: string, status: number, message: string) {
    super(`Projects API ${path}: ${status} ${message}`)
    this.name = 'ProjectsApiError'
    this.path = path
    this.status = status
  }
}

// ── Display helpers ──────────────────────────────────────────────────

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
}

export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
] as const

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  med: 'Medium',
  high: 'High',
}
