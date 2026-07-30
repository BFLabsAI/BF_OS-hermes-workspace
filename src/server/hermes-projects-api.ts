/**
 * TypeScript client for the Hermes Projects dashboard plugin
 * (mounted at :9119/api/plugins/projects/*).
 *
 * Projects is a structured project/task/note management layer with deliverable
 * tracking and agent-run linkage.
 *
 * Auth: dashboard plugin routes are unauthenticated on loopback by design.
 * We gate at the workspace proxy layer with `isAuthenticated()`.
 */

import { dashboardFetch } from './gateway-capabilities'
import type {
  CreateDeliverableInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateTaskInput,
  Deliverable,
  Project,
  ProjectNote,
  ProjectTask,
  ProjectTaskDetail,
  TaskFilters,
  UpdateNoteInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from '../lib/projects-types'
import { ProjectsApiError } from '../lib/projects-types'

const BASE = '/api/plugins/projects'

async function projectsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ProjectsApiError(path, res.status, text)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

function buildTaskFilterParams(
  filters?: TaskFilters,
): Record<string, string | number | boolean | undefined | null> {
  if (!filters) return {}
  const params: Record<string, string | number | boolean | undefined | null> =
    {}
  if (filters.status !== undefined) {
    params.status = Array.isArray(filters.status)
      ? filters.status.join(',')
      : filters.status
  }
  if (filters.include_archived !== undefined) {
    params.include_archived = filters.include_archived
  }
  if (filters.deadline_before !== undefined) {
    params.deadline_before = filters.deadline_before
  }
  return params
}

// ── Projects ─────────────────────────────────────────────────────────

export async function listProjects(): Promise<{ projects: Project[] }> {
  return projectsJson<{ projects: Project[] }>(`${BASE}/projects`)
}

export async function getProject(
  id: string,
): Promise<{ project: Project }> {
  return projectsJson<{ project: Project }>(
    `${BASE}/projects/${encodeURIComponent(id)}`,
  )
}

export async function createProject(
  input: CreateProjectInput,
): Promise<{ project: Project }> {
  return projectsJson<{ project: Project }>(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updateProject(
  id: string,
  patch: UpdateProjectInput,
): Promise<{ project: Project }> {
  return projectsJson<{ project: Project }>(
    `${BASE}/projects/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export async function archiveProject(id: string): Promise<{ ok: boolean }> {
  return projectsJson<{ ok: boolean }>(
    `${BASE}/projects/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

// ── Tasks ─────────────────────────────────────────────────────────────

export async function listTasks(
  projectId: string,
  filters?: TaskFilters,
): Promise<{ tasks: ProjectTask[] }> {
  const params = buildTaskFilterParams(filters)
  return projectsJson<{ tasks: ProjectTask[] }>(
    `${BASE}/projects/${encodeURIComponent(projectId)}/tasks${qs(params)}`,
  )
}

export async function listAllTasks(
  filters?: TaskFilters,
): Promise<{ tasks: ProjectTask[] }> {
  const params = buildTaskFilterParams(filters)
  return projectsJson<{ tasks: ProjectTask[] }>(
    `${BASE}/tasks${qs(params)}`,
  )
}

export async function getTask(
  id: string,
): Promise<{ task: ProjectTaskDetail }> {
  return projectsJson<{ task: ProjectTaskDetail }>(
    `${BASE}/tasks/${encodeURIComponent(id)}`,
  )
}

export async function createTask(
  projectId: string,
  input: CreateTaskInput,
): Promise<{ task: ProjectTask }> {
  return projectsJson<{ task: ProjectTask }>(
    `${BASE}/projects/${encodeURIComponent(projectId)}/tasks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
): Promise<{ task: ProjectTask }> {
  return projectsJson<{ task: ProjectTask }>(
    `${BASE}/tasks/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export async function archiveTask(id: string): Promise<{ ok: boolean }> {
  return projectsJson<{ ok: boolean }>(
    `${BASE}/tasks/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function getTaskContext(
  id: string,
): Promise<{ title: string; description_markdown: string }> {
  return projectsJson<{ title: string; description_markdown: string }>(
    `${BASE}/tasks/${encodeURIComponent(id)}/context`,
  )
}

// ── Notes ─────────────────────────────────────────────────────────────

export async function listNotes(
  projectId: string,
): Promise<{ notes: ProjectNote[] }> {
  return projectsJson<{ notes: ProjectNote[] }>(
    `${BASE}/projects/${encodeURIComponent(projectId)}/notes`,
  )
}

export async function getNote(id: string): Promise<{ note: ProjectNote }> {
  return projectsJson<{ note: ProjectNote }>(
    `${BASE}/notes/${encodeURIComponent(id)}`,
  )
}

export async function createNote(
  projectId: string,
  input: CreateNoteInput,
): Promise<{ note: ProjectNote }> {
  return projectsJson<{ note: ProjectNote }>(
    `${BASE}/projects/${encodeURIComponent(projectId)}/notes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export async function updateNote(
  id: string,
  patch: UpdateNoteInput,
): Promise<{ note: ProjectNote }> {
  return projectsJson<{ note: ProjectNote }>(
    `${BASE}/notes/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export async function archiveNote(id: string): Promise<{ ok: boolean }> {
  return projectsJson<{ ok: boolean }>(
    `${BASE}/notes/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function getNoteContext(
  id: string,
): Promise<{ title: string; description_markdown: string }> {
  return projectsJson<{ title: string; description_markdown: string }>(
    `${BASE}/notes/${encodeURIComponent(id)}/context`,
  )
}

// ── Deliverables ──────────────────────────────────────────────────────

export async function listDeliverables(
  taskId: string,
): Promise<{ deliverables: Deliverable[] }> {
  return projectsJson<{ deliverables: Deliverable[] }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/deliverables`,
  )
}

export async function addDeliverable(
  taskId: string,
  input: CreateDeliverableInput,
): Promise<{ deliverable: Deliverable }> {
  return projectsJson<{ deliverable: Deliverable }>(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/deliverables`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

// ── Re-exports ────────────────────────────────────────────────────────

export { ProjectsApiError }
