import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPage, formatEssayDate } from '@/lib/essays'
import type { TocEntry } from '@/lib/essays'

function Toc({ entries }: { entries: TocEntry[] }) {
  return (
    <nav aria-label="Table of contents" style={{ fontSize: '0.82em', lineHeight: 1.9 }}>
      {entries.map(entry => (
        <div key={entry.id} style={{
          paddingLeft: (entry.level - 1) * 14,
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
        }}>
          <span style={{
            color: 'var(--ink-faint)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9em',
            flexShrink: 0,
            minWidth: 28,
          }}>
            {entry.number}
          </span>
          <a href={`#${entry.id}`} style={{
            fontWeight: entry.level === 1 ? 700 : 400,
            color: entry.level === 1 ? 'var(--ink)' : 'var(--ink-soft)',
            textDecoration: 'none',
          }}>
            {entry.text}
          </a>
        </div>
      ))}
    </nav>
  )
}

export default function ProjectsPage() {
  const essay = getPage('projects')
  if (!essay) notFound()

  const hasToc = essay.toc.length > 0
  const hasAbstract = !!essay.abstract

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 24px 80px' }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontVariant: 'small-caps',
            fontSize: '2.2em',
            fontWeight: 700,
            lineHeight: 1.2,
            color: 'var(--ink)',
            margin: '0 0 0.45em',
          }}>
            {essay.title}
          </h1>

          {essay.description && (
            <p style={{
              margin: '0 0 0.7em',
              fontStyle: 'italic',
              fontSize: '0.97em',
              lineHeight: 1.55,
              color: 'var(--ink-soft)',
            }}>
              {essay.description}
            </p>
          )}

          <p style={{
            margin: 0,
            fontSize: '0.75em',
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.02em',
          }}>
            {formatEssayDate(essay.date)}
            {essay.status !== 'finished' && <span> · {essay.status}</span>}
          </p>
        </header>

        {/* ── TOC + Abstract ──────────────────────────────────────────────────── */}
        {(hasToc || hasAbstract) ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: hasToc && hasAbstract ? '2fr 3fr' : '1fr',
            gap: 20,
            marginBottom: 36,
          }}>
            {hasToc && <Toc entries={essay.toc} />}
            {hasAbstract && (
              <div style={{
                border: '1px solid var(--rule)',
                background: 'var(--paper-deep)',
                padding: '16px 20px',
                fontSize: '0.95em',
                lineHeight: 1.65,
                fontStyle: 'italic',
                color: 'var(--ink)',
              }}>
                {essay.abstract}
              </div>
            )}
          </div>
        ) : null}

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div
          className="article-body"
          dangerouslySetInnerHTML={{ __html: essay.content }}
        />

      </div>
    </div>
  )
}
