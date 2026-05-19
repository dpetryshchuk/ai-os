import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-border bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Input }
