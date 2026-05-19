// onekeyflow/frontend/src/components/ui/badge.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import * as React from 'react'

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground',
        secondary:   'bg-secondary text-secondary-foreground',
        outline:     'border-border text-foreground',
        destructive: 'bg-destructive/10 text-destructive',
        ghost:       'bg-muted text-muted-foreground',
        success:     'bg-emerald-100 text-emerald-800',
        warning:     'bg-amber-100 text-amber-800',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
