import { notFound } from 'next/navigation'
import { getPage } from '@/lib/essays'
import { EmailCopy } from '@/components/EmailCopy'

export default function MePage() {
  const essay = getPage('me')
  if (!essay) notFound()

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 24px 80px' }}>

        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontVariant: 'small-caps',
            fontSize: '2.2em',
            fontWeight: 700,
            lineHeight: 1.2,
            color: 'var(--ink)',
            margin: 0,
          }}>
            {essay.title}
          </h1>
        </header>

        <div
          className="article-body"
          dangerouslySetInnerHTML={{ __html: essay.content }}
        />

        <p style={{ marginTop: '1.2em' }}>
          Email me at <EmailCopy />.
        </p>

      </div>
    </div>
  )
}
