import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface StatusPickerProps<T extends string> {
  value: T
  options: readonly T[]
  onChange: (next: T) => void
  className?: string
  styles?: Partial<Record<T, string>>
  disabled?: boolean
}

export function StatusPicker<T extends string>({
  value,
  options,
  onChange,
  className,
  styles,
  disabled,
}: StatusPickerProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          if (!disabled) setOpen(o => !o)
        }}
        disabled={disabled}
        className={cn(
          'text-[11px] font-mono font-medium px-1.5 py-0.5 rounded transition-colors',
          'hover:bg-muted/60 cursor-pointer disabled:cursor-default disabled:hover:bg-transparent',
          styles?.[value] ?? 'text-muted-foreground',
          className,
        )}
      >
        {value}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-[120px] rounded-md border border-border bg-background shadow-lg py-1">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={e => {
                e.stopPropagation()
                setOpen(false)
                if (opt !== value) onChange(opt)
              }}
              className={cn(
                'w-full text-left px-2.5 py-1 text-[11px] font-mono hover:bg-muted',
                opt === value && 'bg-muted/50',
                styles?.[opt] ?? 'text-foreground',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
