import Link from 'next/link'
import { getEssays } from '@/lib/essays'
import type { Essay } from '@/lib/essays'
import { EmailCopy } from '@/components/EmailCopy'

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-serif)',
      fontVariant: 'small-caps',
      fontSize: '1.15em',
      fontWeight: 700,
      color: 'var(--ink)',
      paddingBottom: 5,
      borderBottom: '1px solid var(--rule)',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

export default function Home() {
  const essays = getEssays().sort((a, b) => b.date.localeCompare(a.date))

  const byFolder: Record<string, Essay[]> = {}
  for (const essay of essays) {
    if (!byFolder[essay.folder]) byFolder[essay.folder] = []
    byFolder[essay.folder].push(essay)
  }
  const folders = Object.keys(byFolder).sort()

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 895, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* ── Intro ──────────────────────────────────────────────────────────── */}
        <p style={{ margin: '0 0 1.6em', lineHeight: 1.65 }}>
          Hey, I&apos;m <strong>Dmytro (or Dima)</strong>. I write about philosophy, business, and craft.
          <br />
          <br />
          Find my full bio <Link href="/me">here</Link>.
          <br />
          My work history <Link href="/projects">here</Link>.
          <br />
          My GitHub is <a href="https://github.com/dpetryshchuk" target="_blank" rel="noopener noreferrer">here</a>.
          <br />
          Email me at <EmailCopy />.
        </p>

        {/* ── Three-column index ─────────────────────────────────────────────── */}
        <div className="home-columns">

          {/* Recent */}
          <div>
            <SectionHeader>Recent</SectionHeader>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {essays.map(essay => (
                <li key={`${essay.folder}/${essay.slug}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                  <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontSize: '0.78em', flexShrink: 0, lineHeight: 1.6 }}>◈</span>
                  <Link href={`/essays/${essay.folder}/${essay.slug}`} style={{
                    fontSize: '0.92em',
                    fontStyle: essay.status === 'draft' ? 'italic' : 'normal',
                    color: essay.status === 'draft' ? 'var(--ink-faint)' : 'var(--accent)',
                  }}>
                    {essay.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* By Topic */}
          <div>
            <SectionHeader>By Topic</SectionHeader>
            {folders.map(folder => (
              <div key={folder} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: '0.62em', fontWeight: 700,
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--ink-faint)', marginBottom: 6,
                }}>
                  {folder}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {byFolder[folder].map(essay => (
                    <li key={essay.slug} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                      <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontSize: '0.78em', flexShrink: 0, lineHeight: 1.6 }}>✦</span>
                      <Link href={`/essays/${essay.folder}/${essay.slug}`} style={{ fontSize: '0.92em' }}>
                        {essay.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  )
}
