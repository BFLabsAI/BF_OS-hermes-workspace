import { useCallback, useEffect, useMemo, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { File01Icon, Folder01Icon, FloppyDiskIcon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { resolveTheme, useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html',
  yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust',
  sh: 'shell', bash: 'shell', toml: 'ini', ini: 'ini',
  sql: 'sql', xml: 'xml', dockerfile: 'dockerfile',
  c: 'c', cpp: 'cpp', h: 'cpp', java: 'java', kt: 'kotlin',
  swift: 'swift', php: 'php', rb: 'ruby', lua: 'lua',
  txt: 'plaintext', log: 'plaintext', conf: 'shell',
}

function getExtension(path: string): string {
  const base = path.split('/').pop() || ''
  const parts = base.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

function isImageFile(path: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(getExtension(path))
}

function getLanguage(path: string): string {
  if (!path) return 'plaintext'
  const base = (path.split('/').pop() || '').toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  if (base.startsWith('.bash') || base === '.profile' || base === '.zshrc' || base === '.env') return 'shell'
  return LANGUAGE_MAP[getExtension(path)] || 'plaintext'
}

export const Route = createFileRoute('/files')({
  ssr: false,
  component: FilesRoute,
  errorComponent: function FilesError({ error }) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-primary-50">
        <h2 className="text-xl font-semibold text-primary-900 mb-3">Failed to Load Files</h2>
        <p className="text-sm text-primary-600 mb-4 max-w-md">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function FilesPending() {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent mb-3" />
          <p className="text-sm text-primary-500">Loading file explorer...</p>
        </div>
      </div>
    )
  },
})

function FilesRoute() {
  usePageTitle('Files')
  const { settings } = useSettings()
  const [isMobile, setIsMobile] = useState(false)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false)
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [fileDataUrl, setFileDataUrl] = useState<string>('')
  const [fileType, setFileType] = useState<'text' | 'image' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const resolvedTheme = resolveTheme(settings.theme)
  const language = useMemo(() => getLanguage(openedPath || ''), [openedPath])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    setFileExplorerCollapsed(true)
  }, [isMobile])

  // Load file content when openedPath changes
  useEffect(() => {
    if (!openedPath) {
      setFileContent('')
      setFileDataUrl('')
      setFileType(null)
      setError(null)
      setDirty(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/files?action=read&path=${encodeURIComponent(openedPath)}`,
        )
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `Failed to read (${res.status})`)
        }
        const data = (await res.json()) as { type: 'text' | 'image'; content: string }
        if (cancelled) return
        if (data.type === 'image') {
          setFileDataUrl(data.content)
          setFileContent('')
          setFileType('image')
        } else {
          setFileContent(data.content)
          setFileDataUrl('')
          setFileType('text')
        }
        setDirty(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setFileType(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [openedPath])

  const handleSave = useCallback(async () => {
    if (!openedPath || fileType !== 'text') return
    setSaving(true)
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'write', path: openedPath, content: fileContent }),
      })
      if (!res.ok) throw new Error('Save failed')
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [openedPath, fileContent, fileType])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && openedPath && dirty) {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openedPath, dirty, handleSave])

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface text-primary-900">
      <div className="flex h-full min-h-0 overflow-hidden">
        <FileExplorerSidebar
          collapsed={fileExplorerCollapsed}
          onToggle={() => setFileExplorerCollapsed((prev) => !prev)}
          onInsertReference={() => { /* no-op — file opens in right panel */ }}
          onFileOpen={(p) => setOpenedPath(p)}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-primary-200 px-3 py-2 md:px-4 md:py-3">
            <button
              type="button"
              onClick={() => setFileExplorerCollapsed((prev) => !prev)}
              className="rounded-lg p-1.5 text-primary-600 hover:bg-primary-100 transition-colors"
              aria-label={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
              title={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
            >
              <HugeiconsIcon icon={Folder01Icon} size={20} strokeWidth={1.5} />
            </button>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <HugeiconsIcon icon={File01Icon} size={16} strokeWidth={1.6} className="text-primary-500 shrink-0" />
              <h1 className="text-sm font-mono text-primary-800 truncate">
                {openedPath || <span className="italic text-primary-500">No file selected</span>}
              </h1>
              {dirty && <span className="text-xs text-amber-500 shrink-0">● unsaved</span>}
            </div>
            {openedPath && fileType === 'text' && (
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="shrink-0">
                <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </header>
          <div className="min-h-0 flex-1 pb-24 md:pb-0">
            {!openedPath ? (
              <div className="flex flex-col items-center justify-center h-full text-primary-500 gap-3">
                <HugeiconsIcon icon={File01Icon} size={48} strokeWidth={1.2} className="opacity-30" />
                <div className="text-center">
                  <p className="text-sm font-medium text-primary-700">No file open</p>
                  <p className="text-xs text-primary-500 mt-1">Click a file in the tree to view it here.</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-r-transparent" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                <p className="text-sm font-medium text-rose-600">{error}</p>
                <p className="text-xs text-primary-500 font-mono">{openedPath}</p>
              </div>
            ) : fileType === 'image' ? (
              <div className="flex items-center justify-center h-full p-6 bg-primary-100/50 overflow-auto">
                <img src={fileDataUrl} alt={openedPath || ''} className="max-h-full max-w-full rounded-lg shadow-lg" />
              </div>
            ) : (
              <Editor
                height="100%"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
                language={language}
                path={openedPath || undefined}
                value={fileContent}
                onChange={(value) => {
                  setFileContent(value || '')
                  setDirty(true)
                }}
                options={{
                  minimap: { enabled: settings.editorMinimap },
                  fontSize: settings.editorFontSize,
                  scrollBeyondLastLine: false,
                  wordWrap: settings.editorWordWrap ? 'on' : 'off',
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
