/**
 * Cmd+K command palette for the terminal panel.
 *
 * Actions:
 *  - Summarize output of <terminal>
 *  - Send command to <terminal>
 *  - Rename <terminal>
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon } from '@hugeicons/core-free-icons'

type TmuxSession = {
  tabId: string
  sessionName: string
  name?: string
  panes: Array<{ paneId: string; active: boolean; title?: string }>
}

type Props = {
  open: boolean
  onClose: () => void
}

type Action =
  | { kind: 'summarize'; session: TmuxSession }
  | { kind: 'send'; session: TmuxSession }
  | { kind: 'rename'; session: TmuxSession }

export function TerminalCommandPalette({ open, onClose }: Props) {
  const [sessions, setSessions] = useState<Array<TmuxSession>>([])
  const [filter, setFilter] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [stage, setStage] = useState<
    | { phase: 'list' }
    | { phase: 'input'; action: Action; prompt: string; value: string }
    | { phase: 'result'; text: string; busy?: boolean }
  >({ phase: 'list' })
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setStage({ phase: 'list' })
    setFilter('')
    setSelectedIdx(0)
    void fetch('/api/tmux/list')
      .then((r) => r.json())
      .then((body) => {
        if (body && Array.isArray(body.sessions)) setSessions(body.sessions)
      })
      .catch(() => undefined)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const actions = useMemo<Array<Action & { label: string; sublabel?: string }>>(() => {
    const list: Array<Action & { label: string; sublabel?: string }> = []
    for (const s of sessions) {
      const name = s.name ?? s.tabId.slice(0, 8)
      list.push({
        kind: 'summarize',
        session: s,
        label: `Summarize: ${name}`,
        sublabel: `last 500 lines from ${s.panes[0]?.paneId ?? '(no pane)'}`,
      })
      list.push({
        kind: 'send',
        session: s,
        label: `Send command to: ${name}`,
      })
      list.push({
        kind: 'rename',
        session: s,
        label: `Rename: ${name}`,
      })
    }
    if (!filter) return list
    const q = filter.toLowerCase()
    return list.filter((a) => a.label.toLowerCase().includes(q))
  }, [sessions, filter])

  useEffect(() => {
    if (selectedIdx >= actions.length) setSelectedIdx(0)
  }, [actions, selectedIdx])

  const runAction = async (action: Action) => {
    if (action.kind === 'summarize') {
      const paneId = action.session.panes[0]?.paneId
      if (!paneId) {
        setStage({ phase: 'result', text: 'No pane available' })
        return
      }
      setStage({ phase: 'result', text: 'Loading…', busy: true })
      try {
        const r = await fetch(
          `/api/tmux/pane/${encodeURIComponent(paneId)}/capture?lines=500`,
        )
        const body = (await r.json()) as { ok: boolean; text?: string }
        const text = body.text ?? '(empty)'
        // Trim very large output for display
        const display =
          text.length > 8000 ? `${text.slice(-8000)}\n\n[…truncated]` : text
        setStage({
          phase: 'result',
          text: `Output of ${action.session.name ?? action.session.tabId.slice(0, 8)}:\n\n${display}`,
        })
      } catch (err) {
        setStage({ phase: 'result', text: `Error: ${String(err)}` })
      }
      return
    }
    if (action.kind === 'send') {
      setStage({
        phase: 'input',
        action,
        prompt: `Command to send to ${action.session.name ?? action.session.tabId.slice(0, 8)}:`,
        value: '',
      })
      setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
    if (action.kind === 'rename') {
      setStage({
        phase: 'input',
        action,
        prompt: `New name for ${action.session.tabId.slice(0, 8)}:`,
        value: action.session.name ?? '',
      })
      setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
  }

  const submitInput = async () => {
    if (stage.phase !== 'input') return
    const { action, value } = stage
    if (action.kind === 'send') {
      const paneId = action.session.panes[0]?.paneId
      if (!paneId) {
        setStage({ phase: 'result', text: 'No pane' })
        return
      }
      try {
        await fetch(`/api/tmux/pane/${encodeURIComponent(paneId)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: value, submit: true }),
        })
        setStage({ phase: 'result', text: `Sent: ${value}` })
      } catch (err) {
        setStage({ phase: 'result', text: `Error: ${String(err)}` })
      }
      return
    }
    if (action.kind === 'rename') {
      try {
        await fetch(`/api/tmux/session/${encodeURIComponent(action.session.tabId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: value }),
        })
        setStage({ phase: 'result', text: `Renamed to "${value}".` })
      } catch (err) {
        setStage({ phase: 'result', text: `Error: ${String(err)}` })
      }
      return
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[90vw] rounded-lg border border-primary-300 bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {stage.phase === 'list' && (
          <>
            <div className="flex items-center gap-2 border-b border-primary-200 px-3 py-2">
              <HugeiconsIcon icon={Search01Icon} size={14} className="text-primary-400" />
              <input
                ref={inputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose()
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIdx((i) => Math.min(actions.length - 1, i + 1))
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIdx((i) => Math.max(0, i - 1))
                  }
                  if (e.key === 'Enter') {
                    const action = actions[selectedIdx]
                    if (action) void runAction(action)
                  }
                }}
                placeholder="Search terminal actions…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {actions.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-primary-400">
                  No terminals open. Open a terminal first.
                </div>
              ) : (
                actions.map((a, idx) => (
                  <button
                    key={`${a.kind}-${a.session.tabId}-${idx}`}
                    onClick={() => void runAction(a)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                      idx === selectedIdx
                        ? 'bg-primary-100 text-primary-900'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                  >
                    <span>{a.label}</span>
                    {a.sublabel && (
                      <span className="text-xs text-primary-400">{a.sublabel}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {stage.phase === 'input' && (
          <div className="p-4 space-y-3">
            <p className="text-sm text-primary-700">{stage.prompt}</p>
            <input
              ref={inputRef}
              value={stage.value}
              onChange={(e) =>
                setStage({ ...stage, value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
                if (e.key === 'Enter') void submitInput()
              }}
              className="w-full rounded border border-primary-300 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStage({ phase: 'list' })}
                className="text-xs text-primary-500 hover:text-primary-700"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitInput()}
                className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {stage.phase === 'result' && (
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <pre className="whitespace-pre-wrap font-mono text-xs text-primary-800">
              {stage.text}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
