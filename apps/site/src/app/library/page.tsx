import Link from 'next/link'
import { librarySections, coverUrl } from '@/data/library'

export default function LibraryPage() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 32px 80px' }}>

        {librarySections.map(section => (
          <div key={section.label} style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {section.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)' }}>
                ({section.items.length})
              </span>
            </div>
            {section.items.map((item) => {
              const url = coverUrl(item)
              return (
                <div key={item.title} style={{ display: 'flex', gap: 12, padding: url ? '8px 0' : '6px 0', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" width={34} height={50} style={{ objectFit: 'cover', flexShrink: 0, opacity: 0.92 }} />
                  )}
                  <span style={{ flex: 1, fontSize: 16, color: 'var(--ink)' }}>{item.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{item.author}</span>
                </div>
              )
            })}
          </div>
        ))}

      </div>
    </div>
  )
}
