'use client'

import { useEffect, useRef, useState } from 'react'

type Mode = 'light' | 'dark' | 'auto'

function applyTheme(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('light')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Mode | null) ?? 'auto'
    setMode(saved)
    applyTheme(saved)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const current = (localStorage.getItem('theme') as Mode | null) ?? 'light'
      if (current === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function select(m: Mode) {
    setMode(m)
    localStorage.setItem('theme', m)
    applyTheme(m)
    setOpen(false)
  }

  return (
    <div ref={ref} className="theme-toggle-root" style={{ position: 'fixed', top: 16, right: 'max(20px, calc((100vw - 1280px) / 2 + 20px))', zIndex: 100 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Theme settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          color: 'var(--ink-faint)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: 5,
          zIndex: 100,
          minWidth: 110,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        }}>
          {(['light', 'dark', 'auto'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => select(m)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'inherit',
                background: mode === m ? 'var(--rule)' : 'transparent',
                color: mode === m ? 'var(--ink)' : 'var(--ink-soft)',
                fontWeight: mode === m ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
