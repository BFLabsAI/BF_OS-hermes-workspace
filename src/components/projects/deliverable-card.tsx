import { useState } from 'react'
import type { Deliverable } from '@/lib/projects-types'

interface DeliverableCardProps {
  deliverable: Deliverable
}

function parsePayload(payloadJson: string | null): Record<string, unknown> {
  if (!payloadJson) return {}
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function DeliverableCard({ deliverable }: DeliverableCardProps) {
  const [expanded, setExpanded] = useState(false)
  const payload = parsePayload(deliverable.payload_json)

  const cardBase =
    'rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3'

  if (deliverable.kind === 'file') {
    const path = payload.path as string | undefined
    return (
      <div className={cardBase}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">📄</span>
            <span className="text-xs font-medium text-[var(--theme-text)] truncate">
              {deliverable.title ?? path ?? 'Arquivo'}
            </span>
          </div>
          {path && (
            <a
              href={path}
              download
              className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/30 transition-colors shrink-0"
            >
              Download
            </a>
          )}
        </div>
      </div>
    )
  }

  if (deliverable.kind === 'link') {
    const url = payload.url as string | undefined
    return (
      <div className={cardBase}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 underline truncate"
            >
              {deliverable.title ?? url}
            </a>
          ) : (
            <span className="text-xs text-[var(--theme-muted)]">
              {deliverable.title ?? 'Link sem URL'}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (deliverable.kind === 'text') {
    const markdown = payload.markdown as string | undefined
    const lines = markdown?.split('\n') ?? []
    const preview = lines.slice(0, 3).join('\n')
    const hasMore = lines.length > 3

    return (
      <div className={cardBase}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">📝</span>
          <span className="text-xs font-medium text-[var(--theme-text)]">
            {deliverable.title ?? 'Texto'}
          </span>
        </div>
        <pre className="text-[11px] text-[var(--theme-muted)] whitespace-pre-wrap font-mono bg-[var(--theme-hover)] rounded p-2">
          {expanded ? markdown : preview}
        </pre>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-[10px] text-[var(--theme-accent)] hover:underline"
          >
            {expanded ? 'Recolher' : 'Expandir'}
          </button>
        )}
      </div>
    )
  }

  if (deliverable.kind === 'image') {
    const url = payload.url as string | undefined
    return (
      <div className={cardBase}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">🖼️</span>
          <span className="text-xs font-medium text-[var(--theme-text)]">
            {deliverable.title ?? 'Imagem'}
          </span>
        </div>
        {url ? (
          <img
            src={url}
            alt={deliverable.title ?? 'Imagem'}
            className="max-w-full rounded-md"
          />
        ) : (
          <p className="text-xs text-[var(--theme-muted)]">URL não disponível</p>
        )}
      </div>
    )
  }

  if (deliverable.kind === 'action') {
    const description = payload.description as string | undefined
    return (
      <div className={cardBase}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-400">✓</span>
          <span className="text-xs font-medium text-green-400">
            {description ?? deliverable.title ?? 'Ação concluída'}
          </span>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className={cardBase}>
      <div className="flex items-center gap-2">
        <span className="text-sm">📦</span>
        <span className="text-xs text-[var(--theme-muted)]">
          {deliverable.title ?? deliverable.kind}
        </span>
      </div>
    </div>
  )
}
