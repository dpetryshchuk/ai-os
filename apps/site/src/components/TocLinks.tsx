'use client'

interface Props {
  items: [string, string][]
}

export function TocLinks({ items }: Props) {
  function handleClick(label: string) {
    const id = label.toLowerCase()
    const section = document.getElementById(id)
    if (!section) return
    const details = section.querySelector('details')
    if (details) details.open = true
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-sans)' }}>
      {items.map(([num, label]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--ink-soft)' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', flexShrink: 0, paddingTop: 1 }}>
            {num}.
          </span>
          <button
            onClick={() => handleClick(label)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              textAlign: 'left',
            }}
          >
            {label}
          </button>
        </div>
      ))}
    </div>
  )
}
