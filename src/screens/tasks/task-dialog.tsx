import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DialogContent,
  DialogRoot,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TaskPicker } from '@/components/projects/task-picker'
import type {
  CreateTaskInput,
  KanbanTaskSummary,
  TaskAssignee,
  TaskStatus,
  UpdateTaskInput,
} from '@/lib/tasks-api'
import type { WorkspaceKind } from '@/lib/kanban-types'
import {
  STATUS_LABELS,
  STATUS_ORDER,
  addComment,
  fetchTaskDetail,
} from '@/lib/tasks-api'

type DialogTab = 'details' | 'comments' | 'events' | 'runs'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Task being edited. When null/undefined → create mode. */
  task?: KanbanTaskSummary | null
  /** Status pre-selected when creating from a specific column. */
  defaultStatus?: TaskStatus
  assignees: Array<TaskAssignee>
  /** Called in create mode. */
  onCreate?: (input: CreateTaskInput) => Promise<void>
  /** Called in edit mode with a partial patch. */
  onUpdate?: (input: UpdateTaskInput) => Promise<void>
  /** Archive the current (editing) task. */
  onArchive?: () => Promise<void>
  isSubmitting: boolean
}

const WORKSPACE_KINDS: WorkspaceKind[] = ['scratch', 'dir', 'worktree']

function formatTimestamp(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return ''
  try {
    return new Date(epochSeconds * 1000).toLocaleString()
  } catch {
    return ''
  }
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultStatus,
  assignees,
  onCreate,
  onUpdate,
  onArchive,
  isSubmitting,
}: Props) {
  const isEdit = Boolean(task)

  const [tab, setTab] = useState<DialogTab>('details')

  // Detail form fields
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'ready')
  const [priority, setPriority] = useState<number>(0)
  const [assignee, setAssignee] = useState<string>('')
  const [workspaceKind, setWorkspaceKind] = useState<WorkspaceKind>('scratch')
  const [skills, setSkills] = useState('')
  const [tenant, setTenant] = useState('')
  const [triage, setTriage] = useState(false)

  // Linked project task (create mode only)
  const [linkedProjectTaskId, setLinkedProjectTaskId] = useState<string | null>(null)

  // Comments tab state
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // Reset when opening or switching task
  useEffect(() => {
    if (!open) return
    if (task) {
      setTitle(task.title)
      setBody(task.body ?? '')
      setStatus(task.status)
      setPriority(task.priority)
      setAssignee(task.assignee ?? '')
      setWorkspaceKind(task.workspace_kind ?? 'scratch')
      setSkills(Array.isArray(task.skills) ? task.skills.join(', ') : '')
      setTenant(task.tenant ?? '')
      setTriage(false)
    } else {
      setTitle('')
      setBody('')
      setStatus(defaultStatus ?? 'ready')
      setPriority(0)
      setAssignee('')
      setWorkspaceKind('scratch')
      setSkills('')
      setTenant('')
      setTriage(false)
    }
    setTab('details')
    setNewComment('')
    setLinkedProjectTaskId(null)
  }, [task, open, defaultStatus])

  // Load full task detail when editing for comments/events/runs.
  const detailQuery = useQuery({
    queryKey: ['hermes', 'tasks', 'detail', task?.id],
    queryFn: () => fetchTaskDetail(task!.id),
    enabled: Boolean(open && task?.id),
    refetchInterval: open ? 30_000 : false,
  })

  const detail = detailQuery.data

  const parsedSkills = useMemo(
    () =>
      skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [skills],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    if (isEdit && onUpdate) {
      // Build patch — only include fields the user can change here.
      const patch: UpdateTaskInput = {
        title: title.trim(),
        body: body.trim() ? body.trim() : null,
        status,
        priority,
        assignee: assignee || null,
      }
      await onUpdate(patch)
      return
    }

    if (onCreate) {
      const input: CreateTaskInput = {
        title: title.trim(),
        priority,
      }
      if (body.trim()) input.body = body.trim()
      if (assignee) input.assignee = assignee
      if (workspaceKind !== 'scratch') input.workspace_kind = workspaceKind
      if (parsedSkills.length > 0) input.skills = parsedSkills
      if (tenant.trim()) input.tenant = tenant.trim()
      if (triage) input.triage = true
      if (linkedProjectTaskId) {
        // @ts-expect-error — field added by projects feature; may not yet be in CreateTaskInput type
        input.linked_project_task_id = linkedProjectTaskId
      }
      await onCreate(input)
    }
  }

  async function handlePostComment() {
    if (!task || !newComment.trim()) return
    try {
      setPostingComment(true)
      await addComment(task.id, newComment.trim())
      setNewComment('')
      await detailQuery.refetch()
    } finally {
      setPostingComment(false)
    }
  }

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  const labelClass = 'block text-xs font-medium text-[var(--theme-muted)] mb-1'

  const tabButtonClass = (active: boolean) =>
    cn(
      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
      active
        ? 'bg-[var(--theme-hover)] text-[var(--theme-text)]'
        : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
    )

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(640px,95vw)] border-[var(--theme-border)] bg-[var(--theme-bg)] overflow-hidden">
        {/* Accent top border */}
        <div className="h-[3px] w-full" style={{ background: 'var(--theme-accent)' }} />

        <div className="p-5">
          <DialogTitle className="text-base font-semibold text-[var(--theme-text)] mb-1">
            {isEdit ? 'Edit Task' : 'New Task'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--theme-muted)] mb-3">
            {isEdit
              ? 'Update the task details, browse comments, events, and runs.'
              : 'Fill in the details for your new task.'}
          </DialogDescription>

          {/* Tabs — only show extras in edit mode */}
          {isEdit && (
            <div className="flex items-center gap-1 mb-4 border-b border-[var(--theme-border)] pb-2">
              <button type="button" onClick={() => setTab('details')} className={tabButtonClass(tab === 'details')}>
                Details
              </button>
              <button type="button" onClick={() => setTab('comments')} className={tabButtonClass(tab === 'comments')}>
                Comments {detail?.comments?.length ? `(${detail.comments.length})` : ''}
              </button>
              <button type="button" onClick={() => setTab('events')} className={tabButtonClass(tab === 'events')}>
                Events {detail?.events?.length ? `(${detail.events.length})` : ''}
              </button>
              <button type="button" onClick={() => setTab('runs')} className={tabButtonClass(tab === 'runs')}>
                Runs {detail?.runs?.length ? `(${detail.runs.length})` : ''}
              </button>
            </div>
          )}

          {tab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className={labelClass}>Title *</label>
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className={labelClass}>Body</label>
                <textarea
                  className={cn(inputClass, 'resize-none')}
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Optional details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isEdit && (
                  <div>
                    <label className={labelClass}>Status</label>
                    <select
                      className={inputClass}
                      style={{ colorScheme: 'dark' }}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelClass}>Priority</label>
                  <input
                    type="number"
                    className={inputClass}
                    style={{ colorScheme: 'dark' }}
                    value={priority}
                    onChange={(e) => setPriority(Number.parseInt(e.target.value, 10) || 0)}
                    min={0}
                    step={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Assignee</label>
                  <select
                    className={inputClass}
                    style={{ colorScheme: 'dark' }}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Workspace kind</label>
                  <select
                    className={inputClass}
                    style={{ colorScheme: 'dark' }}
                    value={workspaceKind}
                    onChange={(e) => setWorkspaceKind(e.target.value as WorkspaceKind)}
                    disabled={isEdit}
                    title={isEdit ? 'Workspace kind is set at creation time.' : undefined}
                  >
                    {WORKSPACE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Skills (comma-separated)</label>
                  <input
                    className={inputClass}
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="python, frontend"
                  />
                </div>
                <div>
                  <label className={labelClass}>Tenant</label>
                  <input
                    className={inputClass}
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="default"
                    disabled={isEdit}
                    title={isEdit ? 'Tenant is set at creation time.' : undefined}
                  />
                </div>
              </div>

              {!isEdit && (
                <label className="flex items-center gap-2 text-xs text-[var(--theme-muted)] select-none">
                  <input
                    type="checkbox"
                    checked={triage}
                    onChange={(e) => setTriage(e.target.checked)}
                  />
                  Start in triage (instead of {defaultStatus ? STATUS_LABELS[defaultStatus] : 'Ready'})
                </label>
              )}

              {!isEdit && (
                <div>
                  <label className={labelClass}>Linked Project Task</label>
                  <TaskPicker
                    value={linkedProjectTaskId}
                    onChange={setLinkedProjectTaskId}
                    placeholder="Selecionar task de projeto (opcional)…"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <p className="text-[10px] text-[var(--theme-muted)]">Press Esc to cancel</p>
                <div className="flex gap-2">
                  {isEdit && onArchive && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void onArchive()}
                      disabled={isSubmitting}
                      className="text-red-400 hover:text-red-300"
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting || !title.trim()}
                    style={{ background: 'var(--theme-accent)', color: 'white' }}
                  >
                    {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Task'}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {isEdit && tab === 'comments' && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {detailQuery.isLoading && (
                <p className="text-xs text-[var(--theme-muted)]">Loading comments…</p>
              )}
              {detail?.comments && detail.comments.length === 0 && (
                <p className="text-xs text-[var(--theme-muted)]">No comments yet.</p>
              )}
              {detail?.comments?.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3"
                >
                  <div className="flex items-center justify-between text-[11px] text-[var(--theme-muted)] mb-1">
                    <span className="font-medium text-[var(--theme-text)]">{c.author}</span>
                    <span>{formatTimestamp(c.created_at)}</span>
                  </div>
                  <p className="text-xs text-[var(--theme-text)] whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}

              <div className="pt-2 border-t border-[var(--theme-border)]">
                <label className={labelClass}>Add a comment</label>
                <textarea
                  className={cn(inputClass, 'resize-none')}
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment…"
                />
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handlePostComment()}
                    disabled={postingComment || !newComment.trim()}
                    style={{ background: 'var(--theme-accent)', color: 'white' }}
                  >
                    {postingComment ? 'Posting…' : 'Post comment'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isEdit && tab === 'events' && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {detailQuery.isLoading && (
                <p className="text-xs text-[var(--theme-muted)]">Loading events…</p>
              )}
              {detail?.events && detail.events.length === 0 && (
                <p className="text-xs text-[var(--theme-muted)]">No events recorded.</p>
              )}
              {detail?.events?.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3"
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medium text-[var(--theme-text)]">{ev.kind}</span>
                    <span className="text-[var(--theme-muted)]">{formatTimestamp(ev.created_at)}</span>
                  </div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <pre className="text-[11px] text-[var(--theme-muted)] whitespace-pre-wrap break-all bg-[var(--theme-hover)] rounded p-2 mt-1">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {isEdit && tab === 'runs' && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {detailQuery.isLoading && (
                <p className="text-xs text-[var(--theme-muted)]">Loading runs…</p>
              )}
              {detail?.runs && detail.runs.length === 0 && (
                <p className="text-xs text-[var(--theme-muted)]">No runs yet.</p>
              )}
              {detail?.runs?.map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3"
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medium text-[var(--theme-text)]">
                      Run #{run.id} — {run.status}
                      {run.outcome ? ` (${run.outcome})` : ''}
                    </span>
                    <span className="text-[var(--theme-muted)]">
                      {formatTimestamp(run.started_at)}
                      {run.ended_at ? ` → ${formatTimestamp(run.ended_at)}` : ''}
                    </span>
                  </div>
                  {run.summary && (
                    <p className="text-xs text-[var(--theme-text)] line-clamp-3 whitespace-pre-wrap">
                      {run.summary}
                    </p>
                  )}
                  {run.error && (
                    <p className="text-xs text-red-400 mt-1 whitespace-pre-wrap break-all">
                      {run.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
