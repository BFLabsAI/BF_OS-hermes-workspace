import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { yaml } from '@codemirror/lang-yaml'
import { sql } from '@codemirror/lang-sql'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { cpp } from '@codemirror/lang-cpp'
import { xml } from '@codemirror/lang-xml'
import { php } from '@codemirror/lang-php'
import { java } from '@codemirror/lang-java'
import type { Extension } from '@codemirror/state'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { File01Icon, Folder01Icon, FloppyDiskIcon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'

function getExtension(p: string): string {
  const base = p.split('/').pop() || ''
  const parts = base.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

function isImageFile(p: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(getExtension(p))
}

function getLanguageExtension(p: string): Extension[] {
  const ext = getExtension(p)
  const base = (p.split('/').pop() || '').toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx':
      return [javascript({ jsx: true, typescript: true })]
    case 'js': case 'jsx': case 'mjs': case 'cjs':
      return [javascript({ jsx: true })]
    case 'md': case 'mdx':
      return [markdown()]
    case 'json':
      return [json()]
    case 'py':
      return [python()]
    case 'css': case 'scss': case 'less':
      return [css()]
    case 'html': case 'htm':
      return [html()]
    case 'yml': case 'yaml':
      return [yaml()]
    case 'sql':
      return [sql()]
    case 'rs':
      return [rust()]
    case 'go':
      return [go()]
    case 'c': case 'cpp': case 'cc': case 'h': case 'hpp':
      return [cpp()]
    case 'xml': case 'svg':
      return [xml()]
    case 'php':
      return [php()]
    case 'java': case 'kt':
      return [java()]
    default:
      if (base === 'dockerfile') return []
      return []
  }
}

export const Route = createFileRoute('/files')({
  ssr: false,
  component: FilesRoute,
})

function FilesRoute() {
  usePageTitle('Files')
  const { settings } = useSettings()
  const [isMobile, setIsMobile] = useState(false)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false)
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [fileDataUrl, setFileDataUrl] = useState<string>('')
  const [fileType, setFileType] = useState<'text' | 'image' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const cmRef = useRef<ReactCodeMirrorRef>(null)

  const langExtensions = useMemo(
    () => (openedPath ? getLanguageExtension(openedPath) : []),
    [openedPath],
  )

  const extensions = useMemo<Extension[]>(() => {
    const base: Extension[] = [
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: `${settings.editorFontSize ?? 14}px`,
        },
        '.cm-scroller': {
          fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
          lineHeight: '1.55',
        },
        '.cm-content': { caretColor: '#7dd3fc' },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftWidth: '2px',
          borderLeftColor: '#7dd3fc',
        },
        '&.cm-focused .cm-cursor': { borderLeftColor: '#7dd3fc' },
        '.cm-activeLine': { backgroundColor: 'rgba(125, 211, 252, 0.07)' },
        '.cm-gutters': {
          backgroundColor: '#181825',
          color: '#6c7086',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(125, 211, 252, 0.07)' },
      }),
      ...langExtensions,
    ]
    if (!settings.editorWordWrap) {
      // override: remove lineWrapping by replacing with a no-op (lineWrapping is just an extension)
      base[0] = EditorView.theme({})
    }
    return base
  }, [langExtensions, settings.editorFontSize, settings.editorWordWrap])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isMobile) setFileExplorerCollapsed(true)
  }, [isMobile])

  useEffect(() => {
    if (!openedPath) {
      setContent('')
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
        const res = await fetch(`/api/files?action=read&path=${encodeURIComponent(openedPath)}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error || `Error ${res.status}`)
        }
        const data = await res.json() as { type: 'text' | 'image'; content: string }
        if (cancelled) return
        if (data.type === 'image') {
          setFileDataUrl(data.content)
          setContent('')
          setFileType('image')
        } else {
          setContent(data.content)
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

  const handleChange = useCallback((value: string) => {
    setContent(value)
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!openedPath || fileType !== 'text') return
    setSaving(true)
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'write', path: openedPath, content }),
      })
      if (!res.ok) throw new Error('Save failed')
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [openedPath, fileType, content])

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
    <div className="h-full min-h-0 flex overflow-hidden bg-[#1e1e2e] text-primary-100">
      <FileExplorerSidebar
        collapsed={fileExplorerCollapsed}
        onToggle={() => setFileExplorerCollapsed((p) => !p)}
        onInsertReference={() => {}}
        onFileOpen={(p) => {
          setOpenedPath(p)
          if (isMobile) setFileExplorerCollapsed(true)
        }}
      />

      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#181825] shrink-0">
          <button
            type="button"
            onClick={() => setFileExplorerCollapsed((p) => !p)}
            className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors shrink-0"
            title={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
          >
            <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.5} />
          </button>

          <HugeiconsIcon icon={File01Icon} size={13} className="text-white/30 shrink-0" />
          <span className="flex-1 min-w-0 text-xs font-mono text-white/60 truncate">
            {openedPath ? `/${openedPath}` : <span className="italic text-white/30">No file selected</span>}
          </span>
          {dirty && <span className="text-[11px] text-amber-400 shrink-0">●</span>}

          {openedPath && fileType === 'text' && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="shrink-0 h-6 text-xs px-2.5 bg-white/10 hover:bg-white/20 text-white/80 border-0"
            >
              <HugeiconsIcon icon={FloppyDiskIcon} size={12} />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {!openedPath ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
              <HugeiconsIcon icon={File01Icon} size={36} strokeWidth={1.2} />
              <p className="text-sm">Select a file to edit</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full gap-3 text-white/40">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-r-transparent" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              <p className="text-xs font-mono text-white/30">/{openedPath}</p>
            </div>
          ) : fileType === 'image' ? (
            <div className="flex items-center justify-center h-full p-8 overflow-auto">
              <img src={fileDataUrl} alt={openedPath} className="max-h-full max-w-full rounded-lg" />
            </div>
          ) : (
            <CodeMirror
              ref={cmRef}
              value={content}
              onChange={handleChange}
              theme={oneDark}
              extensions={extensions}
              height="100%"
              style={{ height: '100%' }}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                foldGutter: true,
                indentOnInput: true,
                tabSize: 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
