import 'xterm/css/xterm.css'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTmuxWs, type TmuxWsHandle } from './use-tmux-ws'
import { TerminalCommandPalette } from './terminal-command-palette'

const PANEL_HEIGHT_KEY = 'terminal.panel.height'
const PANEL_OPEN_KEY = 'terminal.panel.open'
const TABS_KEY = 'terminal.tabs.v2'
const ACTIVE_TAB_KEY = 'terminal.active.v2'

const DEFAULT_HEIGHT = 360
const MIN_HEIGHT = 300
const MAX_HEIGHT = 480

type TerminalTabState = {
  tabId: string
  title: string
  // Single-pane for v1; Phase 2 will expand to a tree of panes.
  paneId?: string
}

type TerminalPanelProps = {
  isMobile?: boolean
}

export function TerminalPanel({ isMobile }: TerminalPanelProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = window.localStorage.getItem(PANEL_OPEN_KEY)
    return stored ? stored === 'true' : false
  })
  const [height, setHeight] = useState(() => {
    const stored = window.localStorage.getItem(PANEL_HEIGHT_KEY)
    const parsed = stored ? Number(stored) : DEFAULT_HEIGHT
    return Number.isFinite(parsed) ? parsed : DEFAULT_HEIGHT
  })
  const [tabs, setTabs] = useState<Array<TerminalTabState>>(() => {
    const stored = window.localStorage.getItem(TABS_KEY)
    if (!stored) return []
    try {
      // Only restore title; paneId is server state and not persisted.
      const parsed = JSON.parse(stored) as Array<{ tabId: string; title: string }>
      return parsed.map((p) => ({ tabId: p.tabId, title: p.title }))
    } catch {
      return []
    }
  })
  const [activeTabId, setActiveTabId] = useState<string | undefined>(() => {
    const stored = window.localStorage.getItem(ACTIVE_TAB_KEY)
    return stored || tabs[0]?.tabId
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const ws = useTmuxWs()
  const wsRef = useRef<TmuxWsHandle>(ws)
  useEffect(() => {
    wsRef.current = ws
  }, [ws])

  const resizingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // xterm instance + addons per paneId (one pane per tab in v1)
  const terminalMap = useRef(new Map<string, Terminal>())
  const fitMap = useRef(new Map<string, FitAddon>())
  const searchMap = useRef(new Map<string, SearchAddon>())

  useEffect(() => {
    window.localStorage.setItem(PANEL_OPEN_KEY, String(isOpen))
  }, [isOpen])

  useEffect(() => {
    const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))
    window.localStorage.setItem(PANEL_HEIGHT_KEY, String(clamped))
  }, [height])

  useEffect(() => {
    // Persist only stable identifiers + title (paneId is recreated server-side).
    window.localStorage.setItem(
      TABS_KEY,
      JSON.stringify(tabs.map((t) => ({ tabId: t.tabId, title: t.title }))),
    )
  }, [tabs])

  useEffect(() => {
    if (activeTabId) {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
    } else {
      window.localStorage.removeItem(ACTIVE_TAB_KEY)
    }
  }, [activeTabId])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.tabId === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  )

  const handleAddTab = useCallback(() => {
    const tabId = crypto.randomUUID()
    const newTab: TerminalTabState = {
      tabId,
      title: `Terminal ${tabs.length + 1}`,
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(tabId)
    setIsOpen(true)
  }, [tabs.length])

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      // Kill server session
      void fetch(`/api/tmux/session/${encodeURIComponent(tabId)}`, {
        method: 'DELETE',
      }).catch(() => undefined)

      const closingTab = tabs.find((t) => t.tabId === tabId)
      if (closingTab?.paneId) {
        wsRef.current.unsubscribe(closingTab.paneId)
        const term = terminalMap.current.get(closingTab.paneId)
        term?.dispose()
        terminalMap.current.delete(closingTab.paneId)
        fitMap.current.delete(closingTab.paneId)
        searchMap.current.delete(closingTab.paneId)
      }

      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      if (activeTabId === tabId) {
        const remaining = tabs.filter((t) => t.tabId !== tabId)
        setActiveTabId(remaining[0]?.tabId)
      }
    },
    [activeTabId, tabs],
  )

  const handleToggleOpen = useCallback(() => setIsOpen((p) => !p), [])

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      if (!panelRef.current) return
      resizingRef.current = true
      const startY = event.clientY
      const startHeight = height

      const handleMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return
        const delta = startY - moveEvent.clientY
        const nextHeight = Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, startHeight + delta),
        )
        setHeight(nextHeight)
        for (const fit of fitMap.current.values()) fit.fit()
      }

      const handleUp = () => {
        resizingRef.current = false
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [height],
  )

  // Provision a server-side tmux session for a tab that doesn't have one yet,
  // then subscribe to the WS for output.
  const provisionTab = useCallback(
    async (tab: TerminalTabState, container: HTMLDivElement) => {
      const terminal = new Terminal({
        theme: { background: '#0b0f1a' },
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
        scrollback: 5000,
        convertEol: true,
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      const searchAddon = new SearchAddon()
      terminal.loadAddon(searchAddon)
      terminal.open(container)
      fitAddon.fit()

      // POST /api/tmux/session
      let paneId: string | undefined
      try {
        const res = await fetch('/api/tmux/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tabId: tab.tabId,
            name: tab.title,
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        })
        const body = (await res.json()) as { ok: boolean; paneId?: string; error?: string }
        if (!body.ok || !body.paneId) {
          terminal.writeln(`\r\n[tmux] failed to create session: ${body.error ?? 'unknown'}\r\n`)
          return
        }
        paneId = body.paneId
      } catch (err) {
        terminal.writeln(`\r\n[tmux] connection error: ${String(err)}\r\n`)
        return
      }

      terminalMap.current.set(paneId, terminal)
      fitMap.current.set(paneId, fitAddon)
      searchMap.current.set(paneId, searchAddon)

      setTabs((prev) =>
        prev.map((t) => (t.tabId === tab.tabId ? { ...t, paneId } : t)),
      )

      wsRef.current.subscribe(
        paneId,
        (data) => terminal.write(data),
        () => terminal.writeln('\r\n\x1b[2m[session ended]\x1b[0m'),
      )

      terminal.onData((data) => {
        if (paneId) wsRef.current.sendInput(paneId, data)
      })

      terminal.onResize(({ cols, rows }) => {
        if (paneId) wsRef.current.sendResize(paneId, cols, rows)
      })

      // Initial resize event so the server matches xterm's geometry
      wsRef.current.sendResize(paneId, terminal.cols, terminal.rows)
    },
    [],
  )

  const handleSearch = useCallback((paneId: string | undefined, query: string) => {
    if (!paneId) return
    searchMap.current.get(paneId)?.findNext(query)
  }, [])

  // Cmd+K / Ctrl+K opens the command palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submitRename = useCallback(
    async (tabId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        setRenamingTabId(null)
        return
      }
      setTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, title: trimmed } : t)))
      setRenamingTabId(null)
      try {
        await fetch(`/api/tmux/session/${encodeURIComponent(tabId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        })
      } catch {
        /* */
      }
    },
    [],
  )

  if (isMobile) return null

  return (
    <>
    <TerminalCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    <div className="flex flex-col bg-surface border-t border-primary-200">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={ComputerTerminal01Icon}
            size={18}
            strokeWidth={1.4}
          />
          Terminal
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleToggleOpen}
          className="text-xs"
        >
          {isOpen ? 'Hide' : 'Show'}
        </Button>
      </div>

      {isOpen ? (
        <div
          ref={panelRef}
          className="relative border-t border-primary-200"
          style={{ height }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-2 cursor-row-resize"
            onMouseDown={handleResizeStart}
          />

          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-primary-200 px-3 py-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                {tabs.map((tab) => (
                  <div
                    key={tab.tabId}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1 text-xs cursor-pointer',
                      tab.tabId === activeTab?.tabId
                        ? 'border-primary-400 bg-primary-100 text-primary-900'
                        : 'border-primary-200 text-primary-700',
                    )}
                    onClick={() => setActiveTabId(tab.tabId)}
                    onDoubleClick={() => {
                      setRenamingTabId(tab.tabId)
                      setRenameValue(tab.title)
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    {renamingTabId === tab.tabId ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => submitRename(tab.tabId, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitRename(tab.tabId, renameValue)
                          if (e.key === 'Escape') setRenamingTabId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-b border-primary-400 focus:outline-none w-24"
                      />
                    ) : (
                      <span>{tab.title}</span>
                    )}
                    <span
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleCloseTab(tab.tabId)
                      }}
                      className="text-primary-500 hover:text-primary-900"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </span>
                  </div>
                ))}
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleAddTab}
                className="ml-auto"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.4} />
              </Button>
            </div>

            {tabs.length > 0 ? (
              <>
                <div className="flex items-center gap-2 border-b border-primary-200 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-primary-500">
                    <HugeiconsIcon icon={Search01Icon} size={14} />
                    <input
                      className="rounded border border-primary-200 bg-transparent px-2 py-1 text-xs focus:outline-none"
                      placeholder="Search output"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSearch(activeTab?.paneId, event.currentTarget.value)
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={() => setPaletteOpen(true)}
                    className="ml-auto text-xs text-primary-500 hover:text-primary-700 border border-primary-200 rounded px-2 py-0.5"
                    title="Open command palette (Cmd+K)"
                  >
                    ⌘K
                  </button>
                  <div className="text-xs text-primary-500">
                    tmux: {activeTab?.paneId ?? 'connecting…'}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  {tabs.map((tab) => (
                    <TerminalView
                      key={tab.tabId}
                      tab={tab}
                      isActive={tab.tabId === activeTab?.tabId}
                      onReady={(container) => provisionTab(tab, container)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-primary-500">
                <HugeiconsIcon icon={ComputerTerminal01Icon} size={32} strokeWidth={1.2} />
                <p className="text-sm">No terminals open</p>
                <Button size="sm" onClick={handleAddTab} className="text-xs">
                  <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.4} />
                  New terminal
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
    </>
  )
}

type TerminalViewProps = {
  tab: TerminalTabState
  isActive: boolean
  onReady: (container: HTMLDivElement) => void
}

function TerminalView({ tab, isActive, onReady }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    if (!containerRef.current) return
    initialized.current = true
    onReady(containerRef.current)
  }, [onReady])

  return (
    <div
      ref={containerRef}
      data-tab-id={tab.tabId}
      data-pane-id={tab.paneId}
      className={cn(
        'h-full w-full bg-[#0b0f1a] text-primary-100',
        isActive ? 'block' : 'hidden',
      )}
      onClick={() => {
        const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
          '.xterm-helper-textarea',
        )
        textarea?.focus()
      }}
    />
  )
}
