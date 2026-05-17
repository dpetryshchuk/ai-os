'use client'

import { useState } from 'react'

interface Watercolor {
  src: string
  label: string
}

export function WatercolorLightbox({ watercolors }: { watercolors: Watercolor[] }) {
  const [active, setActive] = useState<Watercolor | null>(null)

  return (
    <>
      <div className="watercolor-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {watercolors.map(({ src, label }) => (
          <button
            key={src}
            onClick={() => setActive({ src, label })}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'zoom-in',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              textAlign: 'center',
            }}
            aria-label={`View ${label} full screen`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={label}
              style={{
                width: '100%',
                aspectRatio: '1 / 1.25',
                objectFit: 'cover',
                display: 'block',
                border: '1px solid var(--rule)',
                transition: 'opacity 0.15s',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)' }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div
          onClick={() => setActive(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: '90vw', maxHeight: '90vh' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.src}
              alt={active.label}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(90vh - 60px)',
                objectFit: 'contain',
                border: '2px solid rgba(255,255,255,0.15)',
                display: 'block',
              }}
            />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>
              {active.label}
            </span>
          </div>
          <button
            onClick={() => setActive(null)}
            aria-label="Close"
            style={{
              position: 'fixed',
              top: 20,
              right: 24,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 20,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
