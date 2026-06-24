---
name: frontend-design
description: Use when editing React/Tailwind UI components in the aios frontend.
tags: [frontend, react, tailwind, typescript]
---

# Skill: Frontend Design

Use this skill when editing React/Tailwind UI components in the aios frontend.

## Stack
- React 19, Vite, TypeScript
- Tailwind CSS with `darkMode: 'class'`
- shadcn/ui component primitives (Button, Input from `@/components/ui/`)
- CVA (class-variance-authority) for variant patterns
- `cn()` utility from `@/lib/utils` for conditional classNames
- lucide-react for icons

## File locations
- Pages: `aios/frontend/src/pages/<Section>/<Page>.tsx`
- Shell/nav: `aios/frontend/src/Shell.tsx`
- Hooks: `aios/frontend/src/hooks/`
- Components: `aios/frontend/src/components/ui/`
- Entry: `aios/frontend/src/App.tsx` (routes)

## Patterns

### Page layout
```tsx
export default function PageName() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Title</h1>
      {/* content */}
    </div>
  )
}
```

### Chat-style page (full height, scroll)
```tsx
export default function ChatPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* messages */}
      </div>
      <div className="border-t border-border bg-background px-4 py-3 shrink-0">
        {/* input bar */}
      </div>
    </div>
  )
}
```

### Status badge
```tsx
const badge = cn(
  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
  status === 'active' && 'bg-green-500/20 text-green-400',
  status === 'pending' && 'bg-amber-500/20 text-amber-400',
)
```

### Data fetch pattern
```tsx
const [data, setData] = useState<Thing[]>([])
useEffect(() => {
  fetch('/api/things').then(r => r.json()).then(d => setData(d.things ?? []))
}, [])
```

## Dark mode
The OKF domain (`onekeyflow.com`) uses dark mode. `IS_OKF` in Shell.tsx applies
`dark` class to `<html>`. All components use `text-foreground`, `bg-background`,
`border-border`, `text-muted-foreground` — never hardcoded colors.

## Build check
After any edit: `cd aios/frontend && npm run build`
Watch for TypeScript errors — fix before committing.

## After editing
Stage only changed files, commit with a clear message, then push:
```bash
git add aios/frontend/src/...
git commit -m "feat: describe the change"
git push private master && git push origin master
```
