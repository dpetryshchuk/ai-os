# Shared Design System + TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate writing-app and daily-log frontends to TypeScript, expand `packages/ui` with shared typed components and a warm light theme, then wire all three apps to import from the shared package.

**Architecture:** `packages/ui` is source-only (no build step) — apps consume it via a Vite path alias `@ui → ../../packages/ui/src` and a matching `tsconfig` paths entry. Components use `@base-ui/react` headless primitives + CVA variants. Warm light tokens in `packages/ui/src/tokens.css` already flow to all three apps via their `index.css` imports. Phase 1 expands the package; Phase 2 wires jobsearch; Phases 3–4 migrate writing-app and daily-log.

**Aesthetic direction (frontend-design):** "Premium Paper" — warm off-white base (`hsl(45 21% 96%)`), zero pure black/white (everything has warmth), Geist Variable throughout, 150ms transitions, subtle `ring-ring/20` focus rings (not harsh blue), `translate-y-px` press states for physical feel. Warmth is the differentiator in a sea of cold grey tools.

**Tech Stack:** React + Vite + TypeScript 5.x + Tailwind v3 + @base-ui/react + class-variance-authority + clsx + tailwind-merge

**Research notes applied:**
- Use `React.ComponentProps<"el">` (not `HTMLAttributes`) — works cleanly with React 19's unified ref props
- CVA: flat variants, export both component and `variantProps` type for composition
- Tailwind tokens: single source of truth in `tokens.css`, semantic class names over arbitrary values
- `@base-ui/react`: use `render` prop for polymorphism, `data-slot` for CSS targeting
- Remove all `"use client"` directives — Next.js only, not needed in Vite

---

## File Map

### packages/ui
| Action | File |
|---|---|
| Modify | `src/tokens.css` — update to warm light HSL values |
| Modify | `package.json` — add peerDependencies |
| Create | `tsconfig.json` |
| Create | `src/lib/utils.ts` |
| Create | `src/components/button.tsx` |
| Create | `src/components/input.tsx` |
| Create | `src/components/textarea.tsx` |
| Create | `src/components/badge.tsx` |
| Create | `src/components/separator.tsx` |
| Create | `src/components/table.tsx` |
| Create | `src/index.ts` |

### apps/jobsearch/frontend
| Action | File |
|---|---|
| Modify | `tsconfig.json` — add `@ui/*` path |
| Modify | `tsconfig.app.json` — add `@ui/*` path |
| Modify | `vite.config.ts` — add `@ui` alias |
| Modify | All `.tsx` files importing `@/components/ui/*` or `@/lib/utils` |
| Delete | `src/components/ui/` (entire directory) |
| Delete | `src/lib/utils.ts` |

### apps/writing-app/frontend
| Action | File |
|---|---|
| Modify | `package.json` — add typescript + @types |
| Create | `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` |
| Rename | `vite.config.js` → `vite.config.ts` |
| Modify | `tailwind.config.js` — add `.ts,.tsx` to content globs |
| Rename+type | `src/main.jsx` → `src/main.tsx` |
| Rename+type | `src/App.jsx` → `src/App.tsx` |
| Rename+type | `src/lib/api.js` → `src/lib/api.ts` |
| Rename+type | `src/plugins/wikiLinks.js` → `src/plugins/wikiLinks.ts` |
| Rename+type | `src/components/ContextMenu.jsx` → `ContextMenu.tsx` |
| Rename+type | `src/components/FrontmatterBar.jsx` → `FrontmatterBar.tsx` |
| Rename+type | `src/components/Sidebar.jsx` → `Sidebar.tsx` |
| Rename+type | `src/components/Editor.jsx` → `Editor.tsx` |

### apps/daily-log/frontend
| Action | File |
|---|---|
| Modify | `package.json` — add typescript + @types |
| Create | `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` |
| Rename | `vite.config.js` → `vite.config.ts` |
| Modify | `tailwind.config.js` — add `.ts,.tsx` to content globs |
| Rename+type | `src/main.jsx` → `src/main.tsx` |
| Rename+type | `src/App.jsx` → `src/App.tsx` |
| Rename+type | `src/lib/api.js` → `src/lib/api.ts` |
| Rename+type | `src/components/SaveStatus.jsx` → `SaveStatus.tsx` |
| Rename+type | `src/components/Calendar.jsx` → `Calendar.tsx` |
| Rename+type | `src/components/Archive.jsx` → `Archive.tsx` |
| Rename+type | `src/components/DayEditor.jsx` → `DayEditor.tsx` |
| Rename+type | `src/components/HabitManager.jsx` → `HabitManager.tsx` |

---

## Task 1: packages/ui — warm tokens + tsconfig + all components

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/textarea.tsx`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/separator.tsx`
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Update tokens.css to warm light palette**

Replace the entire content of `packages/ui/src/tokens.css`:

```css
@layer base {
  :root {
    /* Warm light palette — "Premium Paper" aesthetic */
    --background:              45 21% 96%;   /* #f7f6f3 warm off-white */
    --foreground:              45  9%  9%;   /* #1a1916 dark warm near-black */
    --card:                     0  0% 100%;  /* #ffffff white card surfaces */
    --card-foreground:         45  9%  9%;
    --popover:                  0  0% 100%;
    --popover-foreground:      45  9%  9%;
    --primary:                 45  9%  9%;   /* same as foreground — ink on paper */
    --primary-foreground:      45 21% 96%;
    --secondary:               43 14% 90%;   /* #e8e6e1 warm light grey */
    --secondary-foreground:    45  9%  9%;
    --muted:                   43 14% 90%;
    --muted-foreground:        33  5% 40%;   /* #6b6762 warm medium grey */
    --accent:                  43 14% 90%;
    --accent-foreground:       45  9%  9%;
    --destructive:              0 84% 60%;
    --destructive-foreground:   0  0% 98%;
    --border:                  33  9% 75%;   /* #c4bfb9 warm border */
    --input:                   33  9% 75%;
    --ring:                    45  9%  9%;   /* warm focus ring */
    --radius:                  0.5rem;
    --sidebar:                 43 14% 93%;   /* slightly warmer than muted */
    --sidebar-foreground:      33  5% 40%;
    --sidebar-primary:         45  9%  9%;
    --sidebar-primary-foreground: 45 21% 96%;
    --sidebar-accent:          43 14% 90%;
    --sidebar-accent-foreground: 45 9% 9%;
    --sidebar-border:          33  9% 85%;   /* lighter sidebar border */
    --sidebar-ring:            45  9%  9%;
  }

  * {
    @apply border-border;
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
    margin: 0;
  }

  body {
    @apply bg-background text-foreground;
    font-family: 'Geist Variable', 'Geist', system-ui, sans-serif;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }

  textarea {
    font-family: inherit;
    font-size: inherit;
  }
}
```

- [ ] **Step 2: Update packages/ui/package.json**

```json
{
  "name": "@vps/ui",
  "version": "0.1.0",
  "private": true,
  "peerDependencies": {
    "@base-ui/react": ">=1.0.0",
    "class-variance-authority": ">=0.7.0",
    "clsx": ">=2.0.0",
    "tailwind-merge": ">=2.0.0"
  }
}
```

- [ ] **Step 3: Create packages/ui/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create packages/ui/src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create packages/ui/src/components/button.tsx**

Relative imports within packages/ui. No `"use client"` (Vite, not Next.js). Warm focus ring (`ring-ring/20`), `translate-y-px` press state.

```typescript
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:     'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:       'hover:bg-muted hover:text-foreground aria-expanded:bg-muted',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5',
        xs:      'h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*="size-"])]:size-3',
        sm:      'h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*="size-"])]:size-3.5',
        lg:      'h-9 gap-1.5 px-3',
        icon:    'size-8',
        'icon-sm': 'size-7 rounded-md',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 6: Create packages/ui/src/components/input.tsx**

```typescript
import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 7: Create packages/ui/src/components/textarea.tsx**

```typescript
import * as React from 'react'
import { cn } from '../lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground transition-colors duration-150 outline-none resize-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 8: Create packages/ui/src/components/badge.tsx**

```typescript
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground',
        secondary:   'bg-secondary text-secondary-foreground',
        outline:     'border-border text-foreground',
        destructive: 'bg-destructive/10 text-destructive',
        ghost:       'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      { className: cn(badgeVariants({ variant }), className) },
      props
    ),
    render,
    state: { slot: 'badge', variant },
  })
}

export { Badge, badgeVariants }
```

- [ ] **Step 9: Create packages/ui/src/components/separator.tsx**

No `"use client"` directive.

```typescript
import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
import { cn } from '../lib/utils'

function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
```

- [ ] **Step 10: Create packages/ui/src/components/table.tsx**

```typescript
import * as React from 'react'
import { cn } from '../lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b transition-colors duration-150 hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground', className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap', className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
```

- [ ] **Step 11: Create packages/ui/src/index.ts**

```typescript
export * from './components/button'
export * from './components/input'
export * from './components/textarea'
export * from './components/badge'
export * from './components/separator'
export * from './components/table'
export { cn } from './lib/utils'
```

- [ ] **Step 12: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): warm light tokens + shared typed components"
```

---

## Task 2: jobsearch — wire @ui alias + migrate local component imports

**Files:**
- Modify: `apps/jobsearch/frontend/tsconfig.json`
- Modify: `apps/jobsearch/frontend/tsconfig.app.json`
- Modify: `apps/jobsearch/frontend/vite.config.ts`
- Modify: all `.tsx` files importing from `@/components/ui/*` or `@/lib/utils`
- Delete: `apps/jobsearch/frontend/src/components/ui/` (whole directory)
- Delete: `apps/jobsearch/frontend/src/lib/utils.ts`

- [ ] **Step 1: Update tsconfig.json — add @ui path**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

- [ ] **Step 2: Update tsconfig.app.json — add @ui path**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "ignoreDeprecations": "6.0",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@ui/*": ["../../packages/ui/src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update vite.config.ts — add @ui alias**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 4: Find all files importing local ui components**

Run from `apps/jobsearch/frontend/`:

```bash
grep -rl "@/components/ui\|@/lib/utils" src --include="*.tsx" --include="*.ts"
```

- [ ] **Step 5: Replace imports in every file found above**

Pattern: replace `@/components/ui/button` → `@ui/components/button`, etc. Do the same for all ui imports, and `@/lib/utils` → `@ui/lib/utils`.

Example — `src/components/Nav.tsx` before:
```typescript
import { cn } from '@/lib/utils'
```
After:
```typescript
import { cn } from '@ui/lib/utils'
```

Example — any page importing Button:
```typescript
// before
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// after
import { Button } from '@ui/components/button'
import { Badge } from '@ui/components/badge'
import { cn } from '@ui/lib/utils'
```

Apply this pattern to every file from Step 4.

- [ ] **Step 6: Delete the now-redundant local ui files**

```bash
rm -rf apps/jobsearch/frontend/src/components/ui
rm apps/jobsearch/frontend/src/lib/utils.ts
```

- [ ] **Step 7: Verify build passes**

Run from `apps/jobsearch/frontend/`:

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds to `../public/`.

- [ ] **Step 8: Commit**

```bash
git add apps/jobsearch/frontend/
git commit -m "refactor(jobsearch): import ui components from shared packages/ui"
```

---

## Task 3: writing-app — TypeScript migration + @ui wiring

**Files:** all listed under writing-app in the File Map above.

- [ ] **Step 1: Update package.json — add TypeScript devDeps**

Replace `apps/writing-app/frontend/package.json`:

```json
{
  "name": "writing-app-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@codemirror/lang-markdown": "^6.3.2",
    "@fontsource-variable/geist": "^5.2.8",
    "codemirror": "^6.0.1",
    "marked": "^15.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.0",
    "vite": "^5.3.4"
  }
}
```

- [ ] **Step 2: Install new devDeps**

```bash
cd apps/writing-app/frontend && npm install
```

Expected: `package-lock.json` updated, `node_modules` has `typescript`, `@types/react`, etc.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@ui/*": ["../../packages/ui/src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create vite.config.ts** (rename from vite.config.js — delete old, create new)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4112',
    },
  },
})
```

Delete the old `vite.config.js`:
```bash
rm apps/writing-app/frontend/vite.config.js
```

- [ ] **Step 7: Update tailwind.config.js content globs**

```javascript
import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
})
```

- [ ] **Step 8: Create src/main.tsx** (rename src/main.jsx — delete old, create new)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
```

Delete the old file:
```bash
rm apps/writing-app/frontend/src/main.jsx
```

- [ ] **Step 9: Create src/lib/api.ts** (typed, rename from api.js)

Define shared types at the top, then typed `request`:

```typescript
export interface Essay {
  folder: string
  slug: string
  title: string
}

export interface EssayData {
  frontmatter: Frontmatter
  body: string
}

export interface Frontmatter {
  title?: string
  tags?: string[]
  status?: string
  date?: string
  [key: string]: unknown
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export const api = {
  essays: {
    list: () => request<{ essays: Essay[] }>('GET', '/essays').then(d => d.essays),
    read: (folder: string, slug: string) =>
      request<{ essay: EssayData }>('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder: string, slug: string, frontmatter: Frontmatter, body: string) =>
      request('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder: string, title: string) =>
      request<{ essay: Essay }>('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder: string, slug: string) =>
      request('DELETE', `/essays/${folder}/${slug}`),
    move: (folder: string, slug: string, targetFolder: string) =>
      request('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => request<{ folders: string[] }>('GET', '/folders').then(d => d.folders),
    create: (name: string) => request('POST', '/folders', { name }),
    rename: (folder: string, name: string) => request('PATCH', `/folders/${folder}`, { name }),
    delete: (folder: string) => request('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => request<{ output: string }>('POST', '/git/pull').then(d => d.output),
    push: (message: string) =>
      request<{ output: string }>('POST', '/git/push', { message }).then(d => d.output),
  },
}
```

Delete old file: `rm apps/writing-app/frontend/src/lib/api.js`

- [ ] **Step 10: Create src/plugins/wikiLinks.ts** (rename from .js)

```typescript
import { ViewPlugin, Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const WIKI_RE = /\[\[([^\]]+)\]\]/g
const wikiMark = Decoration.mark({ class: 'cm-wiki-link' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { doc, selection } = view.state
  const cursor = selection.main.head
  const text = doc.toString()
  const re = new RegExp(WIKI_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (cursor > from && cursor < to) continue
    builder.add(from, to, wikiMark)
  }
  return builder.finish()
}

export function wikiLinksExtension() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }
      update(update: { docChanged: boolean; selectionSet: boolean; view: EditorView }) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations }
  )
}
```

Delete old file: `rm apps/writing-app/frontend/src/plugins/wikiLinks.js`

- [ ] **Step 11: Create src/components/ContextMenu.tsx**

```typescript
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
      className="fixed z-50 bg-white border border-[#e8e5e0] rounded-lg shadow-lg py-1 min-w-[148px]"
      style={{ top: y, left: x }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose() }}
          className="block w-full text-left px-3 py-1.5 text-[12.5px] text-[#44403c] hover:bg-[#f7f6f3] transition-colors duration-150"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export type { ContextMenuItem }
```

Delete old file: `rm apps/writing-app/frontend/src/components/ContextMenu.jsx`

- [ ] **Step 12: Create src/components/FrontmatterBar.tsx**

Also remove the hardcoded `fontFamily: 'Inter'` style — Geist Variable applies via body.

```typescript
import { useState } from 'react'
import type { Frontmatter } from '../lib/api'

interface FrontmatterBarProps {
  frontmatter: Frontmatter | null
  onChange: (fm: Frontmatter) => void
}

export default function FrontmatterBar({ frontmatter, onChange }: FrontmatterBarProps) {
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')

  if (!frontmatter) return null

  const { title = '', tags = [], status = 'in-progress', date = '' } = frontmatter

  function update(patch: Partial<Frontmatter>) {
    onChange({ ...frontmatter, ...patch })
  }

  function removeTag(tag: string) {
    update({ tags: (tags as string[]).filter(t => t !== tag) })
  }

  function addTag() {
    const val = tagInput.trim()
    if (val && !(tags as string[]).includes(val)) update({ tags: [...(tags as string[]), val] })
    setTagInput('')
    setAddingTag(false)
  }

  return (
    <div className="border-b border-[#e8e5e0] px-8 py-4 flex gap-4 items-center flex-wrap bg-white">
      <input
        value={title as string}
        onChange={e => update({ title: e.target.value })}
        className="bg-transparent border-none text-[#1a1916] text-[17px] font-semibold outline-none flex-1 min-w-[160px] placeholder-[#c4bfb9] tracking-tight"
        placeholder="Untitled"
      />
      <div className="flex gap-1.5 items-center flex-wrap">
        {(tags as string[]).map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 text-[11px] text-[#736d65] bg-[#f0ede8] px-2 py-0.5 rounded-full">
            {tag}
            <button onClick={() => removeTag(tag)} className="text-[#c4bfb9] hover:text-[#736d65] leading-none transition-colors">×</button>
          </span>
        ))}
        {addingTag ? (
          <input
            autoFocus
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAddingTag(false) }}
            onBlur={addTag}
            placeholder="tag"
            className="text-[11px] bg-white border border-[#e8e5e0] rounded-full px-2.5 py-0.5 text-[#1a1916] outline-none w-20 focus:border-[#a8a29e]"
          />
        ) : (
          <button onClick={() => setAddingTag(true)} className="text-[11px] text-[#c4bfb9] hover:text-[#78716c] px-1 transition-colors">
            + tag
          </button>
        )}
      </div>
      <select
        value={status as string}
        onChange={e => update({ status: e.target.value })}
        className="bg-[#f0ede8] border-none text-[#736d65] text-[11px] rounded-full px-3 py-1 outline-none cursor-pointer appearance-none"
      >
        <option value="in-progress">in progress</option>
        <option value="published">published</option>
      </select>
      {date && <span className="text-[11px] text-[#c4bfb9]">{date as string}</span>}
    </div>
  )
}
```

Delete old file: `rm apps/writing-app/frontend/src/components/FrontmatterBar.jsx`

- [ ] **Step 13: Create src/components/Sidebar.tsx**

```typescript
import { useState, useCallback } from 'react'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import type { Essay } from '../lib/api'

interface SidebarProps {
  folders: string[]
  essays: Essay[]
  activeFolder: string | null
  activeSlug: string | null
  onSelectEssay: (folder: string, slug: string) => void
  onCreateEssay: (folder: string, title: string) => void
  onDeleteEssay: (folder: string, slug: string) => void
  onMoveEssay: (folder: string, slug: string, targetFolder: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (oldName: string, newName: string) => void
  onDeleteFolder: (name: string) => void
  onPull: () => void
  commitMessage: string
  onCommitMessageChange: (msg: string) => void
  onPush: () => void
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface InlineNew {
  folder: string
}

interface Renaming {
  folder: string
}

export default function Sidebar({
  folders, essays, activeFolder, activeSlug,
  onSelectEssay, onCreateEssay, onDeleteEssay, onMoveEssay,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  onPull, commitMessage, onCommitMessageChange, onPush,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [inlineNew, setInlineNew] = useState<InlineNew | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const openCtx = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  function essaysInFolder(folder: string) {
    return essays.filter(e => e.folder === folder)
  }

  function handleFolderCtx(e: React.MouseEvent, folder: string) {
    openCtx(e, [
      { label: 'New essay', action: () => { setInlineNew({ folder }); setNewTitle('') } },
      { label: 'Rename', action: () => { setRenaming({ folder }); setRenameValue(folder) } },
      {
        label: 'Delete', action: () => {
          if (essaysInFolder(folder).length > 0) return alert('Remove all essays first')
          if (confirm(`Delete folder "${folder}"?`)) onDeleteFolder(folder)
        }
      },
    ])
  }

  function handleEssayCtx(e: React.MouseEvent, essay: Essay) {
    openCtx(e, [
      {
        label: 'Move to…', action: () => {
          const target = prompt('Move to folder:', essay.folder)
          if (target && target !== essay.folder) onMoveEssay(essay.folder, essay.slug, target)
        }
      },
      {
        label: 'Delete', action: () => {
          if (confirm(`Delete "${essay.title || essay.slug}"?`)) onDeleteEssay(essay.folder, essay.slug)
        }
      },
    ])
  }

  function submitNewEssay(folder: string) {
    if (newTitle.trim()) onCreateEssay(folder, newTitle.trim())
    setInlineNew(null)
    setNewTitle('')
  }

  function submitRename(oldName: string) {
    if (renameValue.trim() && renameValue !== oldName) onRenameFolder(oldName, renameValue.trim())
    setRenaming(null)
  }

  function submitNewFolder() {
    if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
    setNewFolderMode(false)
    setNewFolderName('')
  }

  return (
    <div className="w-[220px] bg-[#f7f6f3] border-r border-[#e8e5e0] flex flex-col flex-shrink-0 select-none">
      <div className="px-4 py-3.5 border-b border-[#e8e5e0] flex items-center justify-between">
        <span className="text-[10px] tracking-[0.1em] text-[#a8a29e] font-semibold uppercase">Essays</span>
        <div className="flex gap-2.5 items-center">
          <button onClick={onPull} title="Pull from GitHub" className="text-[#c4bfb9] hover:text-[#78716c] text-sm leading-none transition-colors">↓</button>
          <button onClick={() => { setNewFolderMode(true); setNewFolderName('') }} title="New folder" className="text-[#c4bfb9] hover:text-[#78716c] text-base leading-none transition-colors">+</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {newFolderMode && (
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            onBlur={() => setNewFolderMode(false)}
            placeholder="folder name"
            className="mx-3 mb-1 w-[calc(100%-24px)] bg-white border border-[#e8e5e0] rounded-md px-2.5 py-1.5 text-xs text-[#1a1916] outline-none focus:border-[#a8a29e]"
          />
        )}
        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysInFolder(folder)
          return (
            <div key={folder}>
              <div
                className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                onClick={() => setCollapsed(c => ({ ...c, [folder]: !c[folder] }))}
                onContextMenu={e => handleFolderCtx(e, folder)}
              >
                <span className="text-[9px] text-[#c4bfb9] w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                {renaming?.folder === folder ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(folder); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={() => submitRename(folder)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-white border border-[#e8e5e0] rounded px-1.5 py-0.5 text-xs text-[#1a1916] outline-none"
                  />
                ) : (
                  <span className="text-xs text-[#736d65] group-hover:text-[#1a1916] flex-1 font-medium transition-colors">{folder}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setInlineNew({ folder }); setNewTitle('') }}
                  className="text-[#c4bfb9] hover:text-[#78716c] text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >+</button>
              </div>
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      className={`pl-7 pr-3 py-1.5 text-[12.5px] cursor-pointer transition-colors ${
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'text-[#1a1916] bg-white border-l-2 border-[#a8a29e] font-medium'
                          : 'text-[#9c9590] hover:text-[#1a1916] hover:bg-[#f0ede8]'
                      }`}
                      onClick={() => onSelectEssay(essay.folder, essay.slug)}
                      onContextMenu={e => handleEssayCtx(e, essay)}
                    >
                      {essay.title || essay.slug}
                    </div>
                  ))}
                  {inlineNew?.folder === folder && (
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitNewEssay(folder); if (e.key === 'Escape') setInlineNew(null) }}
                      onBlur={() => setInlineNew(null)}
                      placeholder="Essay title…"
                      className="ml-7 mr-3 my-0.5 w-[calc(100%-52px)] bg-white border border-[#e8e5e0] rounded px-2 py-1 text-xs text-[#1a1916] outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#e8e5e0] p-3">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="commit message…"
          className="w-full bg-white border border-[#e8e5e0] rounded-md px-2.5 py-1.5 text-[11.5px] text-[#736d65] font-mono outline-none focus:border-[#a8a29e] mb-2 transition-colors placeholder-[#c4bfb9]"
        />
        <button
          onClick={onPush}
          className="w-full bg-[#1a1916] hover:bg-[#292524] text-white rounded-md px-2 py-1.5 text-[11.5px] font-medium tracking-wide cursor-pointer transition-colors"
        >
          ↑ Push to GitHub
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
```

Delete old file: `rm apps/writing-app/frontend/src/components/Sidebar.jsx`

- [ ] **Step 14: Create src/components/Editor.tsx**

```typescript
import { useEffect, useRef, useState } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import { api, type Essay, type Frontmatter } from '../lib/api'
import { wikiLinksExtension } from '../plugins/wikiLinks'

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
type ViewMode = 'edit' | 'split' | 'preview'

function renderMarkdown(text: string): string {
  let html = marked.parse(text || '') as string
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span data-wiki="$1" class="prose-wiki-link">[[$1]]</span>')
  return html
}

function ModeToggle({ mode, onMode, narrow }: { mode: ViewMode; onMode: (m: ViewMode) => void; narrow: boolean }) {
  const modes: ViewMode[] = narrow ? ['edit', 'preview'] : ['edit', 'split', 'preview']
  const effective = narrow && mode === 'split' ? 'edit' : mode
  return (
    <div className="flex gap-0.5 rounded-md border border-[#e8e5e0] p-0.5 bg-[#f7f6f3]">
      {modes.map(m => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-colors duration-150 ${
            effective === m ? 'bg-white text-[#1a1916] shadow-sm' : 'text-[#9c9590] hover:text-[#1a1916]'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function EditorSaveStatus({ status, lastSaved }: { status: SaveStatus; lastSaved: number | null }) {
  const text: Record<SaveStatus, string> = {
    idle: '',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }
  return <span className="text-[11px] text-[#c4bfb9]">{text[status]}</span>
}

interface EditorProps {
  folder: string
  slug: string
  initialBody: string
  frontmatterRef: React.RefObject<Frontmatter>
  bodyRef: React.MutableRefObject<string>
  essays: Essay[]
  onSelectEssay: (folder: string, slug: string) => void
  onCreateEssay: (folder: string, title: string) => void
}

export default function Editor({ folder, slug, initialBody, frontmatterRef, bodyRef, essays, onSelectEssay, onCreateEssay }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [mode, setMode] = useState<ViewMode>('edit')
  const [previewHtml, setPreviewHtml] = useState(() => renderMarkdown(initialBody))
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setSaveStatus('idle')
    setLastSaved(null)
    setPreviewHtml(renderMarkdown(initialBody))
  }, [folder, slug])

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      doc: initialBody,
      extensions: [
        minimalSetup,
        markdown(),
        EditorView.lineWrapping,
        wikiLinksExtension(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const value = update.state.doc.toString()
          bodyRef.current = value
          setPreviewHtml(renderMarkdown(value))
          setSaveStatus('unsaved')
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(async () => {
            setSaveStatus('saving')
            try {
              await api.essays.write(folder, slug, frontmatterRef.current!, value)
              setSaveStatus('saved')
              setLastSaved(Date.now())
            } catch {
              setSaveStatus('error')
            }
          }, 1000)
        }),
      ],
      parent: containerRef.current,
    })
    return () => {
      view.destroy()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [folder, slug])

  function handleWikiClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-wiki-link, [data-wiki]')
    if (!el) return
    const title = el.dataset.wiki ?? el.textContent?.slice(2, -2) ?? ''
    const match = essays.find(es => String(es.title ?? es.slug).toLowerCase() === title.toLowerCase())
    if (match) onSelectEssay(match.folder, match.slug)
    else onCreateEssay(folder, title)
  }

  const effectiveMode = narrow && mode === 'split' ? 'edit' : mode
  const showEditor = effectiveMode !== 'preview'
  const showPreview = effectiveMode !== 'edit'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2 border-b border-[#e8e5e0] flex-shrink-0">
        <EditorSaveStatus status={saveStatus} lastSaved={lastSaved} />
        <ModeToggle mode={mode} onMode={setMode} narrow={narrow} />
      </div>
      <div className="flex-1 overflow-hidden flex">
        <div
          ref={containerRef}
          onClick={handleWikiClick}
          style={{ display: showEditor ? undefined : 'none' }}
          className={showEditor && showPreview ? 'w-1/2 border-r border-[#e8e5e0] overflow-y-auto' : 'w-full overflow-y-auto'}
        />
        {showPreview && (
          <div
            onClick={handleWikiClick}
            className={`overflow-y-auto prose-editor ${showEditor ? 'w-1/2' : 'w-full'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  )
}
```

Delete old file: `rm apps/writing-app/frontend/src/components/Editor.jsx`

- [ ] **Step 15: Create src/App.tsx**

```typescript
import { useState, useEffect, useRef } from 'react'
import { api, type Essay, type EssayData, type Frontmatter } from './lib/api'
import Sidebar from './components/Sidebar'
import FrontmatterBar from './components/FrontmatterBar'
import Editor from './components/Editor'

export default function App() {
  const [folders, setFolders] = useState<string[]>([])
  const [essays, setEssays] = useState<Essay[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [essay, setEssay] = useState<EssayData | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const frontmatterRef = useRef<Frontmatter>(null)
  const bodyRef = useRef<string>('')

  async function loadList() {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    setFolders(f)
    setEssays(e)
  }

  useEffect(() => { loadList() }, [])

  async function selectEssay(folder: string, slug: string) {
    const data = await api.essays.read(folder, slug)
    setActiveFolder(folder)
    setActiveSlug(slug)
    setEssay(data)
    frontmatterRef.current = data.frontmatter
    bodyRef.current = data.body
  }

  function handleFrontmatterChange(fm: Frontmatter) {
    setEssay(e => e ? { ...e, frontmatter: fm } : null)
    frontmatterRef.current = fm
    if (activeFolder && activeSlug) {
      api.essays.write(activeFolder, activeSlug, fm, bodyRef.current)
    }
  }

  async function handleCreateEssay(folder: string, title: string) {
    const created = await api.essays.create(folder, title)
    await loadList()
    await selectEssay(created.folder, created.slug)
  }

  async function handleDeleteEssay(folder: string, slug: string) {
    try {
      await api.essays.delete(folder, slug)
      if (activeFolder === folder && activeSlug === slug) {
        setActiveFolder(null); setActiveSlug(null); setEssay(null)
      }
      await loadList()
    } catch (e) { alert(`Delete failed: ${(e as Error).message}`) }
  }

  async function handleMoveEssay(folder: string, slug: string, targetFolder: string) {
    try {
      await api.essays.move(folder, slug, targetFolder)
      await loadList()
      if (activeFolder === folder && activeSlug === slug) setActiveFolder(targetFolder)
    } catch (e) { alert(`Move failed: ${(e as Error).message}`) }
  }

  async function handleCreateFolder(name: string) {
    try { await api.folders.create(name); await loadList() }
    catch (e) { alert(`Create folder failed: ${(e as Error).message}`) }
  }

  async function handleRenameFolder(oldName: string, newName: string) {
    try {
      await api.folders.rename(oldName, newName)
      if (activeFolder === oldName) setActiveFolder(newName)
      await loadList()
    } catch (e) { alert(`Rename failed: ${(e as Error).message}`) }
  }

  async function handleDeleteFolder(name: string) {
    try { await api.folders.delete(name); await loadList() }
    catch (e) { alert(`Delete folder failed: ${(e as Error).message}`) }
  }

  async function handlePull() {
    try { const out = await api.git.pull(); alert(out || 'Pulled.'); await loadList() }
    catch (e) { alert(`Pull failed: ${(e as Error).message}`) }
  }

  async function handlePush() {
    if (!commitMessage.trim()) return alert('Enter a commit message first.')
    try {
      const out = await api.git.push(commitMessage)
      alert(out || 'Pushed.')
      setCommitMessage('')
    } catch (e) { alert(`Push failed: ${(e as Error).message}`) }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        folders={folders} essays={essays}
        activeFolder={activeFolder} activeSlug={activeSlug}
        onSelectEssay={selectEssay} onCreateEssay={handleCreateEssay}
        onDeleteEssay={handleDeleteEssay} onMoveEssay={handleMoveEssay}
        onCreateFolder={handleCreateFolder} onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder} onPull={handlePull}
        commitMessage={commitMessage} onCommitMessageChange={setCommitMessage}
        onPush={handlePush}
      />
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {essay ? (
          <>
            <FrontmatterBar frontmatter={essay.frontmatter} onChange={handleFrontmatterChange} />
            <Editor
              folder={activeFolder!} slug={activeSlug!}
              initialBody={essay.body}
              frontmatterRef={frontmatterRef} bodyRef={bodyRef}
              essays={essays}
              onSelectEssay={selectEssay} onCreateEssay={handleCreateEssay}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#c4bfb9] text-sm">
            Select an essay or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
```

Delete old file: `rm apps/writing-app/frontend/src/App.jsx`

- [ ] **Step 16: Run tsc type-check and fix any remaining errors**

```bash
cd apps/writing-app/frontend && npx tsc -b --noEmit
```

Fix any errors that appear (expect: possible `marked.parse` return type, any `unknown` refinements). The compiler output is the guide.

- [ ] **Step 17: Run build to verify**

```bash
cd apps/writing-app/frontend && npm run build
```

Expected: `../public/` directory populated, no errors.

- [ ] **Step 18: Commit**

```bash
git add apps/writing-app/frontend/
git commit -m "feat(writing-app): migrate frontend to TypeScript + wire @ui alias"
```

---

## Task 4: daily-log — TypeScript migration + @ui wiring

**Files:** all listed under daily-log in the File Map above.

- [ ] **Step 1: Update package.json — add TypeScript devDeps**

Replace `apps/daily-log/frontend/package.json`:

```json
{
  "name": "daily-log-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
    "@fontsource-variable/geist": "^5.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.0",
    "vite": "^5.0.12"
  }
}
```

- [ ] **Step 2: Install new devDeps**

```bash
cd apps/daily-log/frontend && npm install
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@ui/*": ["../../packages/ui/src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create vite.config.ts** (delete vite.config.js first)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4113',
    },
  },
})
```

```bash
rm apps/daily-log/frontend/vite.config.js
```

- [ ] **Step 7: Update tailwind.config.js content globs**

```javascript
import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
})
```

- [ ] **Step 8: Create src/main.tsx** (delete src/main.jsx)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

```bash
rm apps/daily-log/frontend/src/main.jsx
```

- [ ] **Step 9: Create src/lib/api.ts** (delete api.js)

Define shared types, then typed `request`:

```typescript
export interface Habit {
  id: number
  name: string
  kind: 'boolean' | 'number'
  active: boolean
}

export interface DayEntry {
  did_today: string
  doing_tomorrow: string
}

export interface HabitLog {
  habit_type_id: number
  value: boolean | number
}

export type HabitValues = Record<number, boolean | number>

export interface CalendarDay {
  date: string
  habits: Record<string, boolean | number>
}

export interface ArchiveDay {
  date: string
  did_today: string
  habits: Record<string, boolean | number>
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(path, opts)
  const data = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export const api = {
  day: {
    get: (date: string) =>
      request<{ entry: DayEntry | null; habits: HabitLog[] }>('GET', `/api/day/${date}`),
    save: (date: string, body: { did_today: string | null; doing_tomorrow: string | null; habits: HabitValues }) =>
      request('PUT', `/api/day/${date}`, body),
  },
  calendar: {
    get: (year: number, month: number) =>
      request<{ days: CalendarDay[] }>('GET', `/api/calendar/${year}/${month}`),
  },
  archive: {
    get: () => request<{ days: ArchiveDay[] }>('GET', '/api/archive'),
  },
  habits: {
    list: () => request<{ habits: Habit[] }>('GET', '/api/habits'),
    create: (name: string, kind: 'boolean' | 'number') =>
      request('POST', '/api/habits', { name, kind }),
    update: (id: number, data: Partial<Pick<Habit, 'active' | 'name'>>) =>
      request('PATCH', `/api/habits/${id}`, data),
  },
}
```

```bash
rm apps/daily-log/frontend/src/lib/api.js
```

- [ ] **Step 10: Create src/components/SaveStatus.tsx**

```typescript
type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'error'

export default function SaveStatus({ status }: { status: SaveStatusKind }) {
  const label: Record<SaveStatusKind, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }
  if (!label[status]) return null
  return (
    <div className="text-[11px] text-muted-foreground pointer-events-none select-none">
      {label[status]}
    </div>
  )
}

export type { SaveStatusKind }
```

```bash
rm apps/daily-log/frontend/src/components/SaveStatus.jsx
```

- [ ] **Step 11: Create src/components/Calendar.tsx**

```typescript
import { useState, useEffect } from 'react'
import { api, type Habit, type CalendarDay } from '../lib/api'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

interface CalendarProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  habits: Habit[]
}

export default function Calendar({ selectedDate, onSelectDate, habits }: CalendarProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [calData, setCalData] = useState<CalendarDay[]>([])

  useEffect(() => {
    api.calendar.get(year, month).then(d => setCalData(d.days)).catch(() => {})
  }, [year, month])

  const dayMap = new Map(calData.map(d => [d.date, d]))
  const activeHabits = habits.filter(h => h.active)

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const totalDays = daysInMonth(year, month)
  const startDay = firstWeekday(year, month)
  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  })

  const weekStats = activeHabits.map(h => ({
    id: h.id,
    name: h.name,
    count: weekDates.filter(date => {
      const d = dayMap.get(date)
      if (!d) return false
      const v = d.habits[String(h.id)]
      return v === true || (typeof v === 'number' && v > 0)
    }).length,
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">‹</button>
        <span className="text-sm font-medium">{MONTHS[month-1]} {year}</span>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">›</button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DAYS.map(d => <div key={d} className="text-[11px] text-muted-foreground py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const data = dayMap.get(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center py-1 rounded text-[12px] transition-colors duration-150',
                isSelected ? 'bg-foreground text-primary-foreground' : 'hover:bg-muted',
                isToday && !isSelected ? 'font-semibold' : '',
                !data ? 'text-muted-foreground' : '',
              ].join(' ')}
            >
              <span>{day}</span>
              {data && activeHabits.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {activeHabits.map(h => {
                    const v = data.habits[String(h.id)]
                    const done = v === true || (typeof v === 'number' && v > 0)
                    return (
                      <div
                        key={h.id}
                        className={[
                          'w-1 h-1 rounded-full',
                          isSelected ? (done ? 'bg-white' : 'bg-white/40') : (done ? 'bg-foreground' : 'border border-border'),
                        ].join(' ')}
                      />
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}
      </div>
      {weekStats.length > 0 && year === today.getFullYear() && month === today.getMonth() + 1 && (
        <div className="border-t border-border pt-3 mt-1">
          <div className="text-[11px] text-muted-foreground mb-2">This week</div>
          <div className="flex flex-col gap-1">
            {weekStats.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-medium">{s.count}/7</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

```bash
rm apps/daily-log/frontend/src/components/Calendar.jsx
```

- [ ] **Step 12: Create src/components/Archive.tsx**

```typescript
import { useState } from 'react'
import type { Habit, ArchiveDay } from '../lib/api'

interface ArchiveProps {
  days: ArchiveDay[]
  habits: Habit[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

type GroupedDays = Record<string, Record<string, Record<string, ArchiveDay>>>

function groupByYearMonth(days: ArchiveDay[]): GroupedDays {
  const grouped: GroupedDays = {}
  for (const day of days) {
    const [year, month, d] = day.date.split('-')
    if (!grouped[year]) grouped[year] = {}
    if (!grouped[year][month]) grouped[year][month] = {}
    grouped[year][month][d] = day
  }
  return grouped
}

export default function Archive({ days, habits, selectedDate, onSelectDate }: ArchiveProps) {
  const grouped = groupByYearMonth(days)
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
  const activeHabits = habits.filter(h => h.active)
  if (days.length === 0) {
    return <p className="text-[12px] text-muted-foreground py-4 text-center">No entries yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {years.map(year => (
        <YearGroup key={year} year={year} months={grouped[year]} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      ))}
    </div>
  )
}

function YearGroup({ year, months, activeHabits, selectedDate, onSelectDate }: {
  year: string; months: Record<string, Record<string, ArchiveDay>>; activeHabits: Habit[]; selectedDate: string; onSelectDate: (d: string) => void
}) {
  const [open, setOpen] = useState(true)
  const monthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a))
  const totalDays = Object.values(months).reduce((s, m) => s + Object.keys(m).length, 0)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1.5 text-[12px] font-medium text-foreground hover:text-foreground">
        <span className="text-muted-foreground w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {year}
        <span className="text-[11px] text-muted-foreground font-normal ml-1">{totalDays}</span>
      </button>
      {open && (
        <div className="ml-3">
          {monthKeys.map(month => (
            <MonthGroup key={month} month={month} year={year} days={months[month]} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} />
          ))}
        </div>
      )}
    </div>
  )
}

function MonthGroup({ month, year, days, activeHabits, selectedDate, onSelectDate }: {
  month: string; year: string; days: Record<string, ArchiveDay>; activeHabits: Habit[]; selectedDate: string; onSelectDate: (d: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dayKeys = Object.keys(days).sort((a, b) => b.localeCompare(a))
  const monthName = MONTH_NAMES[parseInt(month) - 1]
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground">
        <span className="w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {monthName}
        <span className="text-[11px] ml-auto">{dayKeys.length}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border">
          {dayKeys.map(day => (
            <DayRow key={day} day={days[day]} activeHabits={activeHabits} isSelected={days[day].date === selectedDate} onSelect={() => onSelectDate(days[day].date)} />
          ))}
        </div>
      )}
    </div>
  )
}

function DayRow({ day, activeHabits, isSelected, onSelect }: { day: ArchiveDay; activeHabits: Habit[]; isSelected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const [y, m, d] = day.date.split('-')
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div className={`pl-3 mb-px ${isSelected ? 'bg-muted rounded' : ''}`}>
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(o => !o)} className="text-[10px] text-muted-foreground w-3 py-1 flex-shrink-0">
          {open ? '▾' : '▸'}
        </button>
        <button onClick={onSelect} className="flex-1 text-left flex items-center gap-2 py-1 text-[12px] text-foreground hover:text-foreground">
          <span>{label}</span>
          {activeHabits.length > 0 && (
            <span className="ml-auto flex gap-0.5 flex-shrink-0">
              {activeHabits.map(h => {
                const v = day.habits[String(h.id)]
                const done = v === true || (typeof v === 'number' && v > 0)
                return <span key={h.id} className={`w-1.5 h-1.5 rounded-full inline-block ${done ? 'bg-foreground' : 'border border-border'}`} />
              })}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className="py-2 pl-4 space-y-2">
          {day.did_today ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Today</p>
              <p className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">{day.did_today}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No entry.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

```bash
rm apps/daily-log/frontend/src/components/Archive.jsx
```

- [ ] **Step 13: Create src/components/DayEditor.tsx**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type Habit, type HabitValues } from '../lib/api'
import SaveStatus, { type SaveStatusKind } from './SaveStatus'

function formatDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

interface DayEditorProps {
  date: string
  habits: Habit[]
}

interface EntryState {
  did_today: string
  doing_tomorrow: string
}

export default function DayEditor({ date, habits }: DayEditorProps) {
  const [entry, setEntry] = useState<EntryState | null>(null)
  const [habitValues, setHabitValues] = useState<HabitValues>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatusKind>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHabits = habits.filter(h => h.active)

  useEffect(() => {
    if (!date) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setEntry(null)
    setHabitValues({})
    setSaveStatus('idle')
    api.day.get(date).then(data => {
      setEntry(data.entry ?? { did_today: '', doing_tomorrow: '' })
      const vals: HabitValues = {}
      for (const log of data.habits) vals[log.habit_type_id] = log.value
      setHabitValues(vals)
    }).catch(() => setSaveStatus('error'))
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [date])

  const scheduleSave = useCallback((updatedEntry: EntryState, updatedHabits: HabitValues, delay: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        await api.day.save(date, {
          did_today: updatedEntry.did_today || null,
          doing_tomorrow: updatedEntry.doing_tomorrow || null,
          habits: updatedHabits,
        })
        setSaveStatus('saved')
      } catch { setSaveStatus('error') }
    }, delay)
  }, [date])

  function handleHabitChange(id: number, kind: 'boolean' | 'number', rawValue: boolean | string) {
    const value = kind === 'boolean' ? rawValue as boolean : Number(rawValue)
    const updated = { ...habitValues, [id]: value }
    setHabitValues(updated)
    scheduleSave(entry!, updated, 400)
  }

  function handleJournalChange(field: keyof EntryState, value: string) {
    const updated = { ...entry!, [field]: value }
    setEntry(updated)
    scheduleSave(updated, habitValues, 800)
  }

  function handleJournalBlur(field: keyof EntryState, value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const updated = { ...entry!, [field]: value }
    setEntry(updated)
    setSaveStatus('saving')
    api.day.save(date, {
      did_today: updated.did_today || null,
      doing_tomorrow: updated.doing_tomorrow || null,
      habits: habitValues,
    }).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
  }

  if (!date) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a day</div>
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto relative max-w-2xl">
      <h2 className="text-base font-semibold mb-5">{formatDateHeading(date)}</h2>
      {activeHabits.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Habits</div>
          <div className="flex flex-col gap-2">
            {activeHabits.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1">
                <label htmlFor={`habit-${h.id}`} className="text-sm cursor-pointer">{h.name}</label>
                {h.kind === 'boolean' ? (
                  <input
                    id={`habit-${h.id}`}
                    type="checkbox"
                    checked={habitValues[h.id] === true}
                    onChange={e => handleHabitChange(h.id, 'boolean', e.target.checked)}
                    className="w-4 h-4 rounded border-border cursor-pointer"
                  />
                ) : (
                  <input
                    id={`habit-${h.id}`}
                    type="number"
                    value={(habitValues[h.id] as number) ?? ''}
                    onChange={e => handleHabitChange(h.id, 'number', e.target.value)}
                    className="w-16 text-right border border-border rounded px-2 py-0.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {(['did_today', 'doing_tomorrow'] as const).map(field => (
          <div key={field}>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {field === 'did_today' ? 'Today' : 'Tomorrow'}
            </label>
            <textarea
              value={entry?.[field] ?? ''}
              onChange={e => handleJournalChange(field, e.target.value)}
              onBlur={e => handleJournalBlur(field, e.target.value)}
              placeholder={field === 'did_today' ? 'What did you do today?' : 'What are you doing tomorrow?'}
              rows={5}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-6">
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  )
}
```

```bash
rm apps/daily-log/frontend/src/components/DayEditor.jsx
```

- [ ] **Step 14: Create src/components/HabitManager.tsx**

```typescript
import { useState } from 'react'
import { api, type Habit } from '../lib/api'

interface HabitManagerProps {
  habits: Habit[]
  onHabitsChange: (habits: Habit[]) => void
  onClose: () => void
}

export default function HabitManager({ habits, onHabitsChange, onClose }: HabitManagerProps) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'boolean' | 'number'>('boolean')
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.habits.create(newName.trim(), newKind)
      setNewName('')
      setError('')
      const data = await api.habits.list()
      onHabitsChange(data.habits)
    } catch (err) { setError((err as Error).message) }
  }

  async function handleToggle(habit: Habit) {
    try {
      await api.habits.update(habit.id, { active: !habit.active })
      const data = await api.habits.list()
      onHabitsChange(data.habits)
    } catch (err) { setError((err as Error).message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Habits</h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-lg">×</button>
        </div>
        <div className="flex flex-col gap-2 mb-5">
          {habits.map(h => (
            <div key={h.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">{h.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{h.kind}</span>
              </div>
              <button
                onClick={() => handleToggle(h)}
                className={`relative w-8 h-4 rounded-full transition-colors duration-150 ${h.active ? 'bg-foreground' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150 ${h.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
          {habits.length === 0 && <p className="text-sm text-muted-foreground">No habits yet.</p>}
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">New habit</div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Habit name"
            className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background"
          />
          <div className="flex gap-2">
            <select
              value={newKind}
              onChange={e => setNewKind(e.target.value as 'boolean' | 'number')}
              className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background flex-1"
            >
              <option value="boolean">Yes/No</option>
              <option value="number">Number</option>
            </select>
            <button type="submit" className="px-3 py-1.5 bg-foreground text-primary-foreground rounded text-sm font-medium hover:opacity-90 transition-opacity">
              Add
            </button>
          </div>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  )
}
```

```bash
rm apps/daily-log/frontend/src/components/HabitManager.jsx
```

- [ ] **Step 15: Create src/App.tsx** (delete App.jsx)

```typescript
import { useState, useEffect } from 'react'
import { api, type Habit, type ArchiveDay } from './lib/api'
import Calendar from './components/Calendar'
import DayEditor from './components/DayEditor'
import HabitManager from './components/HabitManager'
import Archive from './components/Archive'

type LeftView = 'calendar' | 'log'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showHabitManager, setShowHabitManager] = useState(false)
  const [leftView, setLeftView] = useState<LeftView>('calendar')
  const [archiveDays, setArchiveDays] = useState<ArchiveDay[]>([])

  useEffect(() => {
    api.habits.list().then(d => setHabits(d.habits)).catch(() => {})
  }, [])

  useEffect(() => {
    if (leftView === 'log') {
      api.archive.get().then(d => setArchiveDays(d.days)).catch(() => {})
    }
  }, [leftView])

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    if (leftView === 'log') setLeftView('calendar')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-[360px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">Daily Log</span>
            <div className="flex text-[12px]">
              <button
                onClick={() => setLeftView('calendar')}
                className={`px-2 py-0.5 rounded-l border border-border ${leftView === 'calendar' ? 'bg-foreground text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >Calendar</button>
              <button
                onClick={() => setLeftView('log')}
                className={`px-2 py-0.5 rounded-r border border-l-0 border-border ${leftView === 'log' ? 'bg-foreground text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >Log</button>
            </div>
          </div>
          <button onClick={() => setShowHabitManager(true)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-lg" title="Manage habits">⚙</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {leftView === 'calendar' ? (
            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} habits={habits} />
          ) : (
            <Archive days={archiveDays} habits={habits} selectedDate={selectedDate} onSelectDate={handleSelectDate} />
          )}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <DayEditor date={selectedDate} habits={habits} />
      </div>
      {showHabitManager && (
        <HabitManager habits={habits} onHabitsChange={setHabits} onClose={() => setShowHabitManager(false)} />
      )}
    </div>
  )
}
```

```bash
rm apps/daily-log/frontend/src/App.jsx
```

- [ ] **Step 16: Run tsc type-check**

```bash
cd apps/daily-log/frontend && npx tsc -b --noEmit
```

Fix any errors the compiler surfaces.

- [ ] **Step 17: Run build to verify**

```bash
cd apps/daily-log/frontend && npm run build
```

Expected: `dist/` directory populated, no errors.

- [ ] **Step 18: Commit**

```bash
git add apps/daily-log/frontend/
git commit -m "feat(daily-log): migrate frontend to TypeScript + wire @ui alias"
```
