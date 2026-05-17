# Shared Design System Implementation Design

## Goal

Unify all three apps (jobsearch, writing-app, daily-log) under a single warm light design system. Migrate writing-app and daily-log frontends from JavaScript to TypeScript, then extract shared UI components into `packages/ui` consumed by all three apps via a Vite path alias.

## Architecture

Two sequential phases:

**Phase 1 — TypeScript migration**
Convert `apps/writing-app/frontend` and `apps/daily-log/frontend` from `.jsx`/`.js` to `.tsx`/`.ts`. Jobsearch is already TypeScript; no changes needed there.

**Phase 2 — Shared component library**
Expand `packages/ui` to export typed React components. All three apps consume them via a Vite path alias (`@ui → ../../packages/ui/src`). No build step — apps import source directly through the alias.

## packages/ui structure

```
packages/ui/
  src/
    components/
      button.tsx
      input.tsx
      textarea.tsx
      badge.tsx
      separator.tsx
    lib/
      utils.ts        # cn() = clsx + tailwind-merge
    index.ts          # barrel export
  tokens.css          # CSS custom properties (update to light palette)
  tailwind.config.base.mjs
  tsconfig.json
  package.json
```

## Design tokens (tokens.css)

```css
:root {
  --background:        #f7f6f3;
  --foreground:        #1a1916;
  --surface:           #ffffff;
  --muted:             #e8e6e1;
  --muted-foreground:  #6b6762;
  --border:            #c4bfb9;
  --ring:              #1a1916;
  --primary:           #1a1916;
  --primary-foreground:#f7f6f3;
  --font-sans: 'Geist Variable', system-ui, sans-serif;
}
```

Tailwind config base maps these via `var(--token-name)` so all utility classes respect the tokens.

## Component scope (v1)

All components use CVA for variants and `@base-ui/react` primitives where appropriate (same pattern already in jobsearch).

| Component   | Variants                                      | Source         |
|-------------|-----------------------------------------------|----------------|
| `Button`    | default, outline, ghost, destructive; sm/md/lg| jobsearch      |
| `Input`     | default; sm/md                                | jobsearch      |
| `Textarea`  | default                                       | new            |
| `Badge`     | default, success, warning, destructive        | jobsearch      |
| `Separator` | horizontal/vertical                           | jobsearch      |
| `cn()`      | clsx + tailwind-merge utility                 | jobsearch      |

## How apps consume components

Each app's `vite.config.ts` gets one alias, and its `tsconfig.json` gets a matching path mapping so type-checking works too:

```ts
// vite.config.ts
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
})
```

```json
// tsconfig.json (compilerOptions)
{
  "paths": {
    "@ui/*": ["../../packages/ui/src/*"]
  }
}
```

Usage in any app:

```tsx
import { Button } from '@ui/components/button'
import { Input }  from '@ui/components/input'
import { cn }     from '@ui/lib/utils'
```

## TypeScript migration (Phase 1)

### writing-app/frontend

- Rename `*.jsx` → `*.tsx`, `*.js` → `*.ts`
- Add `tsconfig.json` (copy jobsearch's frontend tsconfig as base)
- Add `@types/react`, `@types/react-dom`, `@types/node` to devDependencies
- Add types for CodeMirror packages (already typed upstream — no stubs needed)
- Annotate component props with interfaces; let TS infer the rest
- Fix any type errors (expect: event handlers, CodeMirror view state, marked output)

### daily-log/frontend

- Rename `*.jsx` → `*.tsx`, `*.js` → `*.ts`
- Add `tsconfig.json`
- Add `@types/react`, `@types/react-dom`, `@types/node`
- Annotate props and API response shapes with interfaces
- Fix type errors (expect: habit_logs jsonb value, date strings, form events)

## Theming: replacing hardcoded colors

writing-app currently has hardcoded hex values (`#f7f6f3`, `#c4bfb9`, etc.) scattered across className strings. During Phase 2, replace with Tailwind utilities backed by the CSS variables:

| Old hardcoded | New utility class   |
|---------------|---------------------|
| `#f7f6f3`     | `bg-background`     |
| `#1a1916`     | `text-foreground`   |
| `#e8e6e1`     | `bg-muted`          |
| `#6b6762`     | `text-muted-foreground` |
| `#c4bfb9`     | `border-border`     |
| `#ffffff`     | `bg-surface`        |

## Dependencies

All three apps already have: `clsx`, `tailwind-merge`, `@fontsource-variable/geist`.

Phase 2 adds to writing-app and daily-log:
- `class-variance-authority` (CVA for component variants)
- `@base-ui/react` (headless primitives — already in jobsearch)

`packages/ui/package.json` lists these as `peerDependencies` so each app owns its own copy.

## What this does NOT include

- Storybook or component documentation site
- Dark mode toggle (unified light only for now)
- App-level layout components (nav, sidebar) — those stay per-app
- Backend changes of any kind
