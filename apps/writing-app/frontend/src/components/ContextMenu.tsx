import { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  action: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[148px]"
      style={{ top: y, left: x }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose() }}
          className="block w-full text-left px-3 py-1.5 text-[12.5px] text-[#44403c] hover:bg-background transition-colors duration-150"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export type { ContextMenuItem }
