import type { Metadata } from 'next'
import { Source_Serif_4, Source_Sans_3, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  style: ['normal', 'italic'],
  weight: ['300', '400', '600'],
})

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '600', '700'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Dmytro Petryshchuk',
  description: 'Builder. Curious about people and systems.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <div style={{ maxWidth: 895, margin: '0 auto', padding: '24px 24px 0' }}>
          <div style={{ display: 'flex', marginBottom: 28 }}>
            <Link href="/" className="site-logo" style={{
              width: 64, height: 64, flexShrink: 0,
              border: '1px solid',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2.4em',
              textDecoration: 'none',
              userSelect: 'none',
            }}>
              𝔇
            </Link>
            <nav style={{ display: 'flex', flexWrap: 'wrap' }}>
              {([
                ['/me',         'Me',          false],
                ['/projects',   'Work',        false],
                ['/library',    'Library',     false],
                ['https://building-log.beehiiv.com', 'Newsletter', true],
              ] as const).map(([href, label, external]) => (
                <Link key={href} href={href} {...(external ? { target: '_blank', rel: 'noopener' } : {})} style={{
                  height: 64,
                  padding: '0 20px',
                  display: 'flex', alignItems: 'center',
                  border: '1px solid var(--rule)',
                  marginLeft: '-1px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.65em',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-soft)',
                  textDecoration: 'none',
                }}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        {children}
      </body>
    </html>
  )
}
