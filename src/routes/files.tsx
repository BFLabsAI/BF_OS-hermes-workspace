import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Editor, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  File01Icon,
  Folder01Icon,
  FloppyDiskIcon,
  SourceCodeIcon,
  ViewIcon,
  LayoutLeftIcon,
} from '@hugeicons/core-free-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { usePageTitle } from '@/hooks/use-page-title'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { resolveTheme, useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', mdx: 'markdown', css: 'css', html: 'html',
  yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust',
  sh: 'shell', bash: 'shell', toml: 'ini', ini: 'ini',
  sql: 'sql', xml: 'xml', dockerfile: 'dockerfile',
  c: 'c', cpp: 'cpp', h: 'cpp', java: 'java', kt: 'kotlin',
  swift: 'swift', php: 'php', rb: 'ruby', lua: 'lua',
  txt: 'plaintext', log: 'plaintext', conf: 'shell',
}

function getExtension(p: string): string {
  const base = p.split('/').pop() || ''
  const parts = base.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

function isImageFile(p: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(getExtension(p))
}

function isMarkdownFile(p: string): boolean {
  return ['md', 'mdx'].includes(getExtension(p))
}

function getLanguage(p: string): string {
  if (!p) return 'plaintext'
  const base = (p.split('/').pop() || '').toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  if (base.startsWith('.bash') || base === '.profile' || base === '.zshrc' || base === '.env') return 'shell'
  return LANGUAGE_MAP[getExtension(p)] || 'plaintext'
}

export const Route = createFileRoute('/files')({
  ssr: false,
  component: FilesRoute,
})

type MarkdownMode = 'split' | 'editor' | 'preview'

function FilesRoute() {
  usePageTitle('Files')
  const { settings } = useSettings()
  const [isMobile, setIsMobile] = useState(false)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false)
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  // fileContent holds the latest value for save — NOT fed back into Monaco (avoids cursor jump)
  const fileContentRef = useRef<string>('')
  const [initialContent, setInitialContent] = useState<string>('')
  const [fileDataUrl, setFileDataUrl] = useState<string>('')
  const [fileType, setFileType] = useState<'text' | 'image' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>('split')
  // live markdown preview content (kept in sync via onChange)
  const [markdownPreview, setMarkdownPreview] = useState<string>('')
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const resolvedTheme = resolveTheme(settings.theme)
  const language = useMemo(() => getLanguage(openedPath || ''), [openedPath])
  const isMarkdown = openedPath ? isMarkdownFile(openedPath) : false

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

  useEffect(() => {
    if (!openedPath) {
      fileContentRef.current = ''
      setInitialContent('')
      setMarkdownPreview('')
      setFileDataUrl('')
      setFileType(null)
      setError(null)
      setDirty(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDirty(false)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/files?action=read&path=${encodeURIComponent(openedPath)}`,
        )
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error((errBody as { error?: string }).error || `Failed to read (${res.status})`)
        }
        const data = (await res.json()) as { type: 'text' | 'image'; content: string }
        if (cancelled) return
        if (data.type === 'image') {
          setFileDataUrl(data.content)
          fileContentRef.current = ''
          setInitialContent('')
          setMarkdownPreview('')
          setFileType('image')
        } else {
          fileContentRef.current = data.content
          setInitialContent(data.content)
          setMarkdownPreview(data.content)
          setFileDataUrl('')
          setFileType('text')
        }
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

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const handleEditorChange = useCallback((value: string | undefined) => {
    const v = value ?? ''
    fileContentRef.current = v
    setDirty(true)
    if (isMarkdown) setMarkdownPreview(v)
  }, [isMarkdown])

  const handleSave = useCallback(async () => {
    if (!openedPath || fileType !== 'text') return
    setSaving(true)
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'write', path: openedPath, content: fileContentRef.current }),
      })
      if (!res.ok) throw new Error('Save failed')
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [openedPath, fileType])

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

  const monacoEditor = (
    <Editor
      key={openedPath ?? '__empty'}
      height="100%"
      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
      language={language}
      defaultValue={initialContent}
      onMount={handleEditorMount}
      onChange={handleEditorChange}
      options={{
        minimap: { enabled: settings.editorMinimap },
        fontSize: settings.editorFontSize ?? 14,
        lineHeight: 1.6,
        scrollBeyondLastLine: false,
        wordWrap: settings.editorWordWrap ? 'on' : 'off',
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        cursorBlinking: 'smooth',
        renderLineHighlight: 'all',
        padding: { top: 12, bottom: 12 },
        fontLigatures: true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        occurrencesHighlight: 'multiFile',
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
      }}
    />
  )

  const markdownPreviewPane = (
    <div className="h-full overflow-y-auto px-8 py-6 markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
        {markdownPreview}
      </ReactMarkdown>
    </div>
  )

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface text-primary-900">
      <div className="flex h-full min-h-0 overflow-hidden">
        <FileExplorerSidebar
          collapsed={fileExplorerCollapsed}
          onToggle={() => setFileExplorerCollapsed((prev) => !prev)}
          onInsertReference={() => {}}
          onFileOpen={(p) => {
            setOpenedPath(p)
            if (isMobile) setFileExplorerCollapsed(true)
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-primary-200 px-3 py-2 shrink-0">
            <button
              type="button"
              onClick={() => setFileExplorerCollapsed((prev) => !prev)}
              className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-100 hover:text-primary-800 transition-colors shrink-0"
              title={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
            >
              <HugeiconsIcon icon={Folder01Icon} size={18} strokeWidth={1.5} />
            </button>

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <HugeiconsIcon icon={File01Icon} size={14} className="text-primary-400 shrink-0" />
              <span className="text-xs font-mono text-primary-700 truncate">
                {openedPath
                  ? `/${openedPath}`
                  : <span className="italic text-primary-400">No file selected</span>
                }
              </span>
              {dirty && <span className="text-[11px] text-amber-500 shrink-0 font-medium">● unsaved</span>}
            </div>

            {/* Markdown mode toggle */}
            {openedPath && isMarkdown && fileType === 'text' && !loading && !error && (
              <div className="flex items-center gap-0.5 border border-primary-200 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  title="Editor only"
                  onClick={() => setMarkdownMode('editor')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    markdownMode === 'editor' ? 'bg-primary-200 text-primary-900' : 'text-primary-500 hover:text-primary-800 hover:bg-primary-100',
                  )}
                >
                  <HugeiconsIcon icon={SourceCodeIcon} size={14} />
                </button>
                <button
                  type="button"
                  title="Split view"
                  onClick={() => setMarkdownMode('split')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    markdownMode === 'split' ? 'bg-primary-200 text-primary-900' : 'text-primary-500 hover:text-primary-800 hover:bg-primary-100',
                  )}
                >
                  <HugeiconsIcon icon={LayoutLeftIcon} size={14} />
                </button>
                <button
                  type="button"
                  title="Preview only"
                  onClick={() => setMarkdownMode('preview')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    markdownMode === 'preview' ? 'bg-primary-200 text-primary-900' : 'text-primary-500 hover:text-primary-800 hover:bg-primary-100',
                  )}
                >
                  <HugeiconsIcon icon={ViewIcon} size={14} />
                </button>
              </div>
            )}

            {openedPath && fileType === 'text' && (
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="shrink-0 h-7 text-xs gap-1">
                <HugeiconsIcon icon={FloppyDiskIcon} size={13} />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </header>

          {/* Content area */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {!openedPath ? (
              <div className="flex flex-col items-center justify-center h-full text-primary-400 gap-3">
                <HugeiconsIcon icon={File01Icon} size={40} strokeWidth={1.2} className="opacity-30" />
                <div className="text-center">
                  <p className="text-sm font-medium text-primary-600">No file open</p>
                  <p className="text-xs text-primary-400 mt-1">Select a file from the tree to start editing.</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-primary-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-r-transparent" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
                <p className="text-sm font-semibold text-rose-600">{error}</p>
                <p className="text-xs font-mono text-primary-500">/{openedPath}</p>
              </div>
            ) : fileType === 'image' ? (
              <div className="flex items-center justify-center h-full p-8 bg-primary-50 overflow-auto">
                <img src={fileDataUrl} alt={openedPath} className="max-h-full max-w-full rounded-xl shadow-lg" />
              </div>
            ) : isMarkdown ? (
              <div className="flex h-full min-h-0 overflow-hidden">
                {markdownMode !== 'preview' && (
                  <div className={cn('min-h-0 overflow-hidden', markdownMode === 'split' ? 'w-1/2 border-r border-primary-200' : 'w-full')}>
                    {monacoEditor}
                  </div>
                )}
                {markdownMode !== 'editor' && (
                  <div className={cn('min-h-0 bg-surface', markdownMode === 'split' ? 'w-1/2' : 'w-full')}>
                    {markdownPreviewPane}
                  </div>
                )}
              </div>
            ) : (
              monacoEditor
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
