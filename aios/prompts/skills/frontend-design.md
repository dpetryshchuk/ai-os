---
name: frontend-design
description: Use when making any visual or UI change to the aios frontend. Covers both design philosophy (distinctive, non-templated aesthetics) and technical implementation (React/Tailwind stack, file locations, patterns).
tags: [frontend, react, tailwind, typescript, design, ui]
---

# Skill: Frontend Design

Read this before any visual or UI work. It covers design philosophy first, then implementation specifics.

---

## Design Philosophy

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. The client has rejected templated proposals and wants deliberate, opinionated choices about palette, typography, and layout specific to this brief. Take one real aesthetic risk you can justify.

### Ground it in the subject

Name the subject, its audience, and the page's single job before designing. The subject's own world — its materials, artifacts, vernacular — is where distinctive choices come from. Build with real content, not placeholder copy.

### Design principles

**The hero is a thesis.** Open with the most characteristic thing in the subject's world. A big number with a small label and a gradient accent is the template answer — only use it if it's genuinely the best choice.

**Typography carries personality.** Pair display and body faces deliberately. This project uses Geist Variable (body/UI) and Instrument Serif (display/accent). Set a clear type scale with intentional weights. Make the type treatment memorable, not a neutral delivery vehicle.

**Structure is information.** Numbering, eyebrows, dividers, labels should encode something true about the content. Only use numbered markers (01/02/03) if the content is actually a sequence.

**Motion deliberately.** An orchestrated moment lands harder than scattered effects. Extra animation contributes to the AI-generated feeling — less is often more.

**Match complexity to vision.** Maximalist needs elaborate execution. Minimal needs precision in spacing and detail. Elegance is executing the chosen vision well.

### Process

Work in two passes:
1. **Plan**: compact token system — 4–6 named hex colors, typeface roles, layout concept, signature element (the one thing this page will be remembered by).
2. **Critique before building**: check if any part reads like a default you'd produce for any similar brief. If yes, revise and state what changed and why.

### Restraint

Spend boldness in one place. Let the signature element be the memorable thing, keep everything else quiet. Cut decoration that doesn't serve the brief. Responsive to mobile, keyboard focus visible, reduced motion respected.

### Three default looks to avoid (unless the brief explicitly calls for them)
1. Warm cream (#F4F1EA) + high-contrast serif display + terracotta accent
2. Near-black + single bright acid-green or vermilion accent
3. Broadsheet layout with hairline rules and dense newspaper columns

### Writing in design

Words are design material. Write from the end user's side. Name things by what people control, not how the system is built. Active voice: "Save changes" not "Submit." Errors explain what went wrong and how to fix it — they don't apologize. Empty states are invitations to act.

---

## Technical Stack

- React 19, Vite, TypeScript
- Tailwind CSS with `darkMode: 'class'`
- shadcn/ui component primitives (Button, Input from `@/components/ui/`)
- CVA (class-variance-authority) for variant patterns
- `cn()` from `@/lib/utils` for conditional classNames
- lucide-react for icons
- Fonts: `font-sans` = Geist Variable, `font-serif` = Instrument Serif, `font-mono` = Geist Mono

## File locations

- Pages: `aios/frontend/src/pages/<Section>/<Page>.tsx`
- Shell/nav + Ima drawer: `aios/frontend/src/Shell.tsx`
- Hooks: `aios/frontend/src/hooks/`
- Components: `aios/frontend/src/components/ui/`
- Routes: `aios/frontend/src/App.tsx`
- Global CSS + CSS vars: `aios/frontend/src/index.css`
- Tailwind config: `aios/frontend/tailwind.config.ts`

## Color system (never hardcode)

All colors via CSS variables — use semantic tokens:
- `text-foreground`, `bg-background`, `border-border`
- `text-muted-foreground`, `bg-muted`
- `bg-card`, `text-primary-foreground`

OKF domain (`onekeyflow.com`) uses dark mode. `IS_OKF` in Shell.tsx applies `dark` class to `<html>`.

## Layout patterns

### Page layout
```tsx
export default function PageName() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Title</h1>
    </div>
  )
}
```

### Chat-style page (full height)
```tsx
<div className="flex flex-col h-full">
  <div className="flex-1 overflow-y-auto px-4 py-6">{/* messages */}</div>
  <div className="border-t border-border bg-background px-4 py-3 shrink-0">{/* input */}</div>
</div>
```

### Status badge
```tsx
const badge = cn(
  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
  status === 'active' && 'bg-green-500/20 text-green-400',
  status === 'pending' && 'bg-amber-500/20 text-amber-400',
)
```

## Build → commit loop

After any frontend edit:
1. `run_shell("cd /repo/aios/frontend && npm run build")` — verify it compiles, zero TS errors
2. Fix any errors before proceeding
3. `git_commit_and_push` → CI/CD deploys to VPS

Commit message format: `feat: describe the change` or `fix: describe the fix`
Always push to both remotes: `git push private master && git push origin master`

---

## React Best Practices (Vercel Engineering, 2026)

*Next.js/SSR rules excluded — this project is Vite/SPA.*

### Bundle (CRITICAL)

- **No barrel file imports.** Import directly: `import { Button } from '@/components/ui/button'`, not from an index barrel. Barrels force the bundler to include the entire module.
- **Lazy-load heavy components.** `const Chart = lazy(() => import('./Chart'))` + `<Suspense>`. Use for anything not needed on initial paint.
- **Defer third-party scripts.** Analytics/logging should load after hydration, not in the critical path.

### Re-render (MEDIUM)

- **Never define components inside components.** Every render creates a new reference → child always remounts. Define them at module level.
- **Functional setState.** `setCount(c => c + 1)` not `setCount(count + 1)`. Avoids stale closures in callbacks.
- **Derive state during render, not in useEffect.** `const fullName = firstName + ' ' + lastName` — no effect needed.
- **useRef for transient values.** Interval IDs, animation frame handles, values that change frequently but don't drive UI — use refs, not state.
- **Narrow effect dependencies.** Extract primitive values from objects: `const id = user.id; useEffect(() => ..., [id])` not `[user]`.
- **useTransition for non-urgent updates.** Wrap expensive state updates in `startTransition` to keep input responsive.
- **Hoist default non-primitive props.** `const EMPTY = []; function C({ items = EMPTY })` — inline `[]` creates a new reference every render, breaking memoization.
- **Avoid useMemo for primitives.** `useMemo(() => a + b, [a, b])` is slower than just `a + b`. Only memoize expensive computations or object/array identity.

### Rendering (MEDIUM)

- **Explicit conditional rendering.** `condition ? <Component /> : null` not `condition && <Component />`. The `&&` pattern renders `0` when condition is falsy.
- **Hoist static JSX.** Move JSX that never changes outside the component: `const EMPTY_STATE = <EmptyState />` at module level.
- **useTransition over manual loading state.** `const [isPending, startTransition] = useTransition()` replaces `const [loading, setLoading] = useState(false)` for state transitions.

### JavaScript

- **Early return.** Check guards first, do work last.
- **Set/Map for lookups.** Build a `Map<id, item>` once instead of repeated `.find()` over arrays.
- **toSorted() / toReversed().** Immutable array operations — don't mutate state arrays directly.
- **flatMap for map+filter.** `items.flatMap(x => x.active ? [transform(x)] : [])` over separate `.filter().map()`.

### TypeScript patterns

- **Type event handlers explicitly.** `onClick: React.MouseEventHandler<HTMLButtonElement>` not `onClick: (e: any) => void`.
- **Use `ComponentProps<>` for wrapping.** `type Props = React.ComponentProps<'button'> & { label: string }` to forward all native props.
- **Type refs correctly.** `useRef<HTMLDivElement>(null)` — include `null` in the type, not just `HTMLDivElement`.

---

## View Transitions (React canary / React 19+)

Available in this project — use for: drawer open/close, panel enter/exit, list reorders.

```tsx
import { ViewTransition, startTransition } from 'react'

// Wrap the element that should animate
<ViewTransition enter="slide-in" exit="slide-out" default="none">
  {imaOpen && <ImaPanel />}
</ViewTransition>

// Only startTransition / useDeferredValue / Suspense trigger VTs — regular setState does not
startTransition(() => setImaOpen(true))
```

**Key rules:**
- `default="none"` always — otherwise every Suspense/deferred update cross-fades everything
- `<ViewTransition>` must appear before any DOM nodes in the subtree, not wrapped in a div
- Only one VT with a given `name` can be mounted at a time
- Use type-keyed objects for directional navigation: `enter={{ 'nav-forward': 'slide-from-right', default: 'none' }}`
- Always pair `@media (prefers-reduced-motion: reduce) { * { view-transition-name: none } }` in global CSS
