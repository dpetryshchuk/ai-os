'use client'

import { useState } from 'react'

export function EmailCopy() {
  const [copied, setCopied] = useState(false)

  function handleClick() {
    navigator.clipboard.writeText('d.petryshchuk@gmail.com')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontStyle: 'inherit',
        color: copied ? 'var(--ink-soft)' : 'var(--accent)',
        borderBottom: '1px solid currentColor',
        lineHeight: 'inherit',
        transition: 'color 0.2s',
      }}
    >
      {copied ? 'copied!' : 'd.petryshchuk [at] gmail.com'}
    </button>
  )
}
