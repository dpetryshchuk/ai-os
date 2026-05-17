import Link from 'next/link'
import { getEssays, formatEssayDate } from '@/lib/essays'


export default function EssaysPage() {
  const essays = getEssays().sort((a, b) => b.date.localeCompare(a.date))

  const byFolder: Record<string, typeof essays> = {}
  for (const essay of essays) {
    if (!byFolder[essay.folder]) byFolder[essay.folder] = []
    byFolder[essay.folder].push(essay)
  }

  const folders = Object.keys(byFolder).sort()

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="site-grid" style={{
        maxWidth: 1280,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        backgroundColor: 'var(--paper)',
        backgroundImage: [
          'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
          'radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '3px 3px, 7px 7px',
        backgroundPosition: '0 0, 1px 1px',
        minHeight: '100vh',
      }}>

        <aside className="toc-col" style={{
          background: 'var(--toc-bg)',
          borderRight: '1px solid var(--rule)',
          padding: '28px 20px',
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <Link href="/" style={{ fontSize: 11, color: 'var(--ink-faint)', textDecoration: 'none', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>
            ← Home
          </Link>
          <div style={{ height: 1, background: 'var(--rule)', marginBottom: 12 }} />
          <div style={{ fontSize: 10, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
            Folders
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-sans)' }}>
            {folders.map(folder => (
              <a key={folder} href={`#${folder}`} style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none' }}>
                {folder} <span style={{ fontSize: 10 }}>({byFolder[folder].length})</span>
              </a>
            ))}
          </div>
        </aside>

        <main className="main-col" style={{ padding: '44px 52px', maxWidth: 740 }}>
          <h1 className="site-title" style={{ fontSize: 44, fontWeight: 700, margin: '0 0 36px', lineHeight: 1, fontFamily: 'var(--font-sans)', letterSpacing: '-0.03em', borderBottom: '1px solid var(--rule)', paddingBottom: 24 }}>
            Essays
          </h1>

          {folders.map(folder => (
            <div key={folder} id={folder} style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
                {folder}
              </div>
              {byFolder[folder].map(essay => (
                <Link key={essay.slug} href={`/essays/${essay.folder}/${essay.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: essay.description ? 4 : 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                        {essay.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {essay.status !== 'finished' && <span style={{ marginRight: 8, opacity: 0.6 }}>{essay.status}</span>}
                        {formatEssayDate(essay.date)}
                      </span>
                    </div>
                    {essay.description && (
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                        {essay.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ))}

          <div style={{ marginBottom: 60 }} />
        </main>
      </div>
    </div>
  )
}
