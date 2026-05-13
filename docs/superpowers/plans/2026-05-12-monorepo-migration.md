# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three separate git repos into one `vps-apps` monorepo with npm workspaces and a shared `packages/ui` design system (jobsearch HSL tokens, light mode only), while keeping the live VPS unaffected until a separate cutover plan.

**Architecture:** npm workspaces at the root. Apps move into `apps/`. Shared design tokens and Tailwind config live in `packages/ui`. Each app's frontend references the shared package via relative path — no npm linking needed for CSS. GitHub Actions move to root `.github/workflows/` with per-app path filtering. Old GitHub repos remain active; the VPS keeps deploying from them until a separate cutover plan is executed.

**Tech Stack:** npm workspaces, Tailwind CSS 3, HSL CSS custom properties, Vite, React, TypeScript, `appleboy/ssh-action`

---

## File Map

**Create:**
- `package.json` — workspace root config
- `packages/ui/package.json` — workspace package identity
- `packages/ui/tailwind.config.base.mjs` — `createConfig()` factory used by all three app frontends
- `packages/ui/src/tokens.css` — canonical HSL design tokens (light mode only)
- `.github/workflows/deploy-jobsearch.yml` — path-filtered deploy for jobsearch
- `.github/workflows/deploy-writing-app.yml` — path-filtered deploy for writing-app
- `.github/workflows/deploy-daily-log.yml` — path-filtered deploy for daily-log

**Move:**
- `jobsearch-vps/` → `apps/jobsearch-vps/` (remove nested `.git`)
- `writing-app/` → `apps/writing-app/` (remove nested `.git`)
- `daily-log-vps/` → `apps/daily-log-vps/` (remove nested `.git`)

**Modify:**
- `apps/jobsearch-vps/frontend/tailwind.config.js` — replace with `createConfig()`; remove now-redundant darkMode and color mapping
- `apps/jobsearch-vps/frontend/src/index.css` — import shared tokens, remove duplicate `:root` block and `.dark` block
- `apps/daily-log-vps/frontend/tailwind.config.js` — replace with `createConfig()`
- `apps/daily-log-vps/frontend/src/index.css` — import shared tokens, remove hex `:root` block
- `apps/daily-log-vps/frontend/src/components/*.jsx` — replace `var(--*)` arbitrary Tailwind values with semantic utilities
- `apps/writing-app/frontend/tailwind.config.js` — replace with `createConfig()`
- `apps/writing-app/frontend/src/index.css` — import shared tokens, switch Inter → Geist Variable, keep CodeMirror/prose styles
- `CLAUDE.md` — update app paths from root to `apps/*`

---

## Task 1: Root workspace scaffold

**Files:**
- Create: `package.json`
- Create: `packages/ui/package.json`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "vps-apps",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

- [ ] **Step 2: Create `packages/ui/package.json`**

```json
{
  "name": "@vps/ui",
  "version": "0.1.0",
  "private": true
}
```

- [ ] **Step 3: Verify the directory structure looks right**

```
vps-apps/
  package.json          ← new
  packages/
    ui/
      package.json      ← new
  apps/                 ← doesn't exist yet (next task)
  docs/
  CLAUDE.md
```

---

## Task 2: Move apps into `apps/`

**Files:**
- Move: `jobsearch-vps/` → `apps/jobsearch-vps/`
- Move: `writing-app/` → `apps/writing-app/`
- Move: `daily-log-vps/` → `apps/daily-log-vps/`

Each app has its own `.git` directory that must be removed — they're becoming part of the root repo. The old GitHub repos keep their history.

- [ ] **Step 1: Create `apps/` and move the three app directories**

```powershell
New-Item -ItemType Directory "apps"
Move-Item "jobsearch-vps" "apps/jobsearch-vps"
Move-Item "writing-app" "apps/writing-app"
Move-Item "daily-log-vps" "apps/daily-log-vps"
```

- [ ] **Step 2: Remove nested `.git` directories**

```powershell
Remove-Item "apps/jobsearch-vps/.git" -Recurse -Force
Remove-Item "apps/writing-app/.git" -Recurse -Force
Remove-Item "apps/daily-log-vps/.git" -Recurse -Force
```

- [ ] **Step 3: Remove the per-app `.github/` directories** (they don't work inside subdirs in a monorepo — GitHub only reads `.github/` at the repo root)

```powershell
Remove-Item "apps/jobsearch-vps/.github" -Recurse -Force
Remove-Item "apps/writing-app/.github" -Recurse -Force
Remove-Item "apps/daily-log-vps/.github" -Recurse -Force
```

- [ ] **Step 4: Verify app directories are in place**

```powershell
Get-ChildItem "apps" | Select-Object Name
```

Expected:
```
daily-log-vps
jobsearch-vps
writing-app
```

- [ ] **Step 5: Update `CLAUDE.md` at workspace root — fix app paths**

In `CLAUDE.md`, change the workspace overview table from:

```markdown
| Job search CRM | `jobsearch-vps/` | ...
| Writing app    | `writing-app/`   | ...
| Daily log      | `daily-log-vps/` | ...
```

To:

```markdown
| Job search CRM | `apps/jobsearch-vps/` | ...
| Writing app    | `apps/writing-app/`   | ...
| Daily log      | `apps/daily-log-vps/` | ...
```

Also update the VPS infrastructure note: `See each app's own CLAUDE.md for app-specific commands and architecture.`

---

## Task 3: Create `packages/ui` design tokens and Tailwind base

**Files:**
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/tailwind.config.base.mjs`

These are the canonical source of truth for the design system. All three app frontends will point here.

- [ ] **Step 1: Create `packages/ui/src/tokens.css`**

Light mode only. Jobsearch HSL token format. The `@apply` directives handle body background/foreground so each app doesn't need to repeat it.

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
    --sidebar: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
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

- [ ] **Step 2: Create `packages/ui/tailwind.config.base.mjs`**

A `createConfig()` factory each app calls with its own content glob. The `extend` param lets apps add app-specific theme entries on top.

```js
/** @type {(opts: { content: string[], extend?: object }) => import('tailwindcss').Config} */
export function createConfig({ content, extend = {} }) {
  return {
    content,
    theme: {
      extend: {
        fontFamily: {
          sans: ['Geist Variable', 'Geist', 'system-ui', 'sans-serif'],
          mono: ['Geist Mono Variable', 'Geist Mono', 'ui-monospace', 'monospace'],
        },
        colors: {
          background: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          card: {
            DEFAULT: 'hsl(var(--card))',
            foreground: 'hsl(var(--card-foreground))',
          },
          popover: {
            DEFAULT: 'hsl(var(--popover))',
            foreground: 'hsl(var(--popover-foreground))',
          },
          primary: {
            DEFAULT: 'hsl(var(--primary))',
            foreground: 'hsl(var(--primary-foreground))',
          },
          secondary: {
            DEFAULT: 'hsl(var(--secondary))',
            foreground: 'hsl(var(--secondary-foreground))',
          },
          muted: {
            DEFAULT: 'hsl(var(--muted))',
            foreground: 'hsl(var(--muted-foreground))',
          },
          accent: {
            DEFAULT: 'hsl(var(--accent))',
            foreground: 'hsl(var(--accent-foreground))',
          },
          destructive: {
            DEFAULT: 'hsl(var(--destructive))',
            foreground: 'hsl(var(--destructive-foreground))',
          },
          border: 'hsl(var(--border))',
          input: 'hsl(var(--input))',
          ring: 'hsl(var(--ring))',
          sidebar: {
            DEFAULT: 'hsl(var(--sidebar))',
            foreground: 'hsl(var(--sidebar-foreground))',
            primary: 'hsl(var(--sidebar-primary))',
            'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
            accent: 'hsl(var(--sidebar-accent))',
            'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
            border: 'hsl(var(--sidebar-border))',
            ring: 'hsl(var(--sidebar-ring))',
          },
        },
        borderRadius: {
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)',
        },
        ...extend,
      },
    },
    plugins: [],
  }
}
```

---

## Task 4: Wire `packages/ui` into jobsearch

Jobsearch already uses HSL tokens — this is mostly removing the duplicate definitions and stripping dark mode.

**Files:**
- Modify: `apps/jobsearch-vps/frontend/tailwind.config.js`
- Modify: `apps/jobsearch-vps/frontend/src/index.css`

- [ ] **Step 1: Replace `apps/jobsearch-vps/frontend/tailwind.config.js`**

```js
import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{ts,tsx}'],
})
```

- [ ] **Step 2: Replace `apps/jobsearch-vps/frontend/src/index.css`**

Keep `tw-animate-css` and the font import. Remove the entire `@layer base { :root { ... } .dark { ... } }` block — it now comes from the shared tokens file.

```css
@import "tw-animate-css";
@import "@fontsource-variable/geist";
@import "../../../../packages/ui/src/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

/* Safe area padding utilities */
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
.mb-safe { margin-bottom: env(safe-area-inset-bottom); }
```

- [ ] **Step 3: Verify the frontend still builds**

```powershell
cd apps/jobsearch-vps/frontend
npm install
npm run build
cd ../../..
```

Expected: build completes with no errors. If Vite can't resolve the `../../../../packages/ui/` import, add to `apps/jobsearch-vps/frontend/vite.config.ts`:

```ts
import path from 'path'
// inside defineConfig:
resolve: {
  alias: { '@vps/ui': path.resolve(__dirname, '../../../packages/ui') }
}
```

Then update the import to `@vps/ui/src/tokens.css`.

---

## Task 5: Wire `packages/ui` into daily-log

Daily-log uses hex CSS vars. Migrating to HSL means replacing every `bg-[var(--muted)]`-style Tailwind arbitrary value with the semantic utility (`bg-muted`). The Tailwind color mapping in `createConfig()` makes these work.

**Files:**
- Modify: `apps/daily-log-vps/frontend/tailwind.config.js`
- Modify: `apps/daily-log-vps/frontend/src/index.css`
- Modify: `apps/daily-log-vps/frontend/src/components/Calendar.jsx`
- Modify: `apps/daily-log-vps/frontend/src/components/DayEditor.jsx`
- Modify: `apps/daily-log-vps/frontend/src/components/HabitManager.jsx`

- [ ] **Step 1: Replace `apps/daily-log-vps/frontend/tailwind.config.js`**

```js
import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{js,jsx}'],
})
```

- [ ] **Step 2: Replace `apps/daily-log-vps/frontend/src/index.css`**

Remove the hex `:root` block and the `html, body` rules — those now come from shared. Keep any daily-log-specific overrides.

```css
@import "@fontsource-variable/geist";
@import "../../../../packages/ui/src/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Replace arbitrary `var()` references with semantic Tailwind utilities across all three component files**

Run this to find every instance:

```powershell
Select-String -Path "apps/daily-log-vps/frontend/src/components/*.jsx" -Pattern "var\(--" | Select-Object Filename, LineNumber, Line
```

Apply this mapping everywhere you find a match:

| Old (arbitrary value) | New (semantic utility) |
|---|---|
| `bg-[var(--background)]` | `bg-background` |
| `bg-[var(--foreground)]` | `bg-foreground` |
| `bg-[var(--muted)]` | `bg-muted` |
| `bg-[var(--card)]` | `bg-card` |
| `text-[var(--foreground)]` | `text-foreground` |
| `text-[var(--muted-foreground)]` | `text-muted-foreground` |
| `text-[var(--primary-foreground)]` | `text-primary-foreground` |
| `border-[var(--border)]` | `border-border` |
| `border-[var(--card-border)]` | `border-border` |
| `hover:bg-[var(--muted)]` | `hover:bg-muted` |
| `focus:ring-[var(--ring)]` | `focus:ring-ring` |
| `ring-[var(--ring)]` | `ring-ring` |

Anything not in this table using `var(--*)` in a CSS value (not a Tailwind class): leave as-is or convert to `hsl(var(--token))`.

- [ ] **Step 4: Verify the frontend builds**

```powershell
cd apps/daily-log-vps/frontend
npm install
npm run build
cd ../../..
```

Expected: build completes. Spot-check in `npm run dev` that the calendar and day editor look correct.

---

## Task 6: Wire `packages/ui` into writing-app

Writing-app has the most divergence: Inter font, hard-coded hex colors, no CSS vars. The CodeMirror and prose styles are intentionally warm-toned and stay as-is. Only the shell (body, base resets) migrates to shared tokens.

**Files:**
- Modify: `apps/writing-app/frontend/tailwind.config.js`
- Modify: `apps/writing-app/frontend/src/index.css`

- [ ] **Step 1: Replace `apps/writing-app/frontend/tailwind.config.js`**

```js
import { createConfig } from '../../../packages/ui/tailwind.config.base.mjs'

export default createConfig({
  content: ['./index.html', './src/**/*.{js,jsx}'],
})
```

- [ ] **Step 2: Replace the base styles in `apps/writing-app/frontend/src/index.css`**

Remove the existing `html, body, #root` block (font-family, background, color, height, margin). That's now handled by `tokens.css`. Keep everything from `.cm-editor` onward — those are editor-specific.

```css
@import "@fontsource-variable/geist";
@import "../../../../packages/ui/src/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── CodeMirror editor ── */
.cm-editor {
  height: 100%;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  line-height: 1.85;
  color: #292524;
}
.cm-editor.cm-focused { outline: none; }
.cm-scroller { overflow: auto !important; }
.cm-content {
  padding: 48px 56px;
  max-width: 720px;
  caret-color: #1a1916;
}
.cm-line { padding: 0; }
.cm-cursor { border-left-color: #1a1916; }

/* ── Wiki links in editor ── */
.cm-wiki-link {
  color: #7c6f64;
  background: #f0ede8;
  border-radius: 3px;
  padding: 1px 4px;
  cursor: pointer;
  font-style: italic;
}
.cm-wiki-link:hover { background: #e8e5e0; color: #44403c; }

/* ── Preview pane prose ── */
.prose-editor {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  line-height: 1.85;
  color: #292524;
  padding: 48px 56px;
  max-width: 720px;
}
.prose-editor h1 {
  font-family: 'Geist Variable', sans-serif;
  font-size: 21px;
  font-weight: 600;
  color: #1a1916;
  margin: 1.8em 0 0.5em;
  letter-spacing: -0.01em;
}
.prose-editor h2 {
  font-family: 'Geist Variable', sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #1a1916;
  margin: 1.5em 0 0.4em;
}
.prose-editor h3 {
  font-family: 'Geist Variable', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #44403c;
  margin: 1.3em 0 0.3em;
}
.prose-editor p { margin: 0 0 1em; }
.prose-editor a { color: #2563eb; text-decoration: underline; }
.prose-editor strong { color: #1a1916; font-weight: 600; }
.prose-editor em { color: #44403c; }
.prose-editor code {
  background: #f0ede8;
  color: #6d28d9;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}
.prose-editor pre {
  background: #f7f6f3;
  border: 1px solid #e8e5e0;
  border-radius: 6px;
  padding: 16px 20px;
  margin-bottom: 1em;
}
.prose-editor pre code { background: transparent; color: #374151; padding: 0; }
.prose-editor blockquote {
  border-left: 2px solid #d6d3d1;
  margin-left: 0;
  padding-left: 20px;
  color: #78716c;
  font-style: italic;
}
.prose-editor ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
.prose-editor ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1em; }
.prose-editor li { margin-bottom: 0.25em; }
.prose-editor hr { border: none; border-top: 1px solid #e8e5e0; margin: 2em 0; }

/* ── Wiki links in preview ── */
.prose-wiki-link {
  color: #7c6f64;
  background: #f0ede8;
  border-radius: 3px;
  padding: 1px 4px;
  cursor: pointer;
  font-style: italic;
}
.prose-wiki-link:hover { background: #e8e5e0; color: #44403c; }
```

Note: prose headings now use `'Geist Variable'` instead of `'Inter'` — this is intentional, aligns with the shared font.

- [ ] **Step 3: Verify the frontend builds**

```powershell
cd apps/writing-app/frontend
npm install
npm run build
cd ../../..
```

Expected: build completes. Open `npm run dev` and verify the editor and prose preview look correct.

---

## Task 7: Initialize git and push to new GitHub repo

The workspace root is not yet a git repo. We initialize one, commit everything, and push to a new `dpetryshchuk/vps-apps` repo. The old repos remain untouched — the live site keeps deploying from them.

- [ ] **Step 1: Initialize git at workspace root**

```bash
git init
git add .
git commit -m "feat: monorepo with shared packages/ui design system"
```

- [ ] **Step 2: Create the new GitHub repo**

```bash
gh repo create dpetryshchuk/vps-apps --private --description "Personal VPS apps monorepo"
```

- [ ] **Step 3: Push to the new repo**

```bash
git remote add origin https://github.com/dpetryshchuk/vps-apps.git
git push -u origin master
```

- [ ] **Step 4: Verify the repo on GitHub**

Open `https://github.com/dpetryshchuk/vps-apps` and confirm `apps/`, `packages/`, `docs/` are all present.

---

## Task 8: Add path-filtered GitHub Actions

These deploy workflows go at the **root** `.github/workflows/` — GitHub ignores workflow files inside subdirectories. They reference NEW VPS paths (`/home/dima/vps-apps/apps/*`) that won't exist until the VPS cutover plan is executed. Adding them now wires everything up so cutover is just one SSH session away.

**Files:**
- Create: `.github/workflows/deploy-jobsearch.yml`
- Create: `.github/workflows/deploy-writing-app.yml`
- Create: `.github/workflows/deploy-daily-log.yml`

- [ ] **Step 1: Create `.github/workflows/deploy-jobsearch.yml`**

```yaml
name: Deploy jobsearch

on:
  push:
    branches: [master]
    paths:
      - 'apps/jobsearch-vps/**'
      - 'packages/ui/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            git fetch origin master
            git reset --hard origin/master
            npm install
            cd apps/jobsearch-vps/frontend && npm install && npm run build && cd ../../..
            cd apps/jobsearch-vps && npx mastra build && cd ../..
            sudo systemctl restart jobsearch
```

- [ ] **Step 2: Create `.github/workflows/deploy-writing-app.yml`**

```yaml
name: Deploy writing-app

on:
  push:
    branches: [master]
    paths:
      - 'apps/writing-app/**'
      - 'packages/ui/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            git fetch origin master
            git reset --hard origin/master
            npm install
            cd apps/writing-app && npm run build && cd ../..
            sudo systemctl restart writing
```

- [ ] **Step 3: Create `.github/workflows/deploy-daily-log.yml`**

```yaml
name: Deploy daily-log

on:
  push:
    branches: [master]
    paths:
      - 'apps/daily-log-vps/**'
      - 'packages/ui/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            git fetch origin master
            git reset --hard origin/master
            npm install
            cd apps/daily-log-vps/frontend && npm install && cd ../../..
            cd apps/daily-log-vps && npm run build && cd ../..
            sudo systemctl restart daily-log
```

- [ ] **Step 4: Add GitHub Actions secrets to the new repo**

The new repo needs the same secrets as the old repos. If you have `gh` CLI:

```bash
gh secret set VPS_HOST --repo dpetryshchuk/vps-apps --body "46.225.78.10"
gh secret set VPS_USER --repo dpetryshchuk/vps-apps --body "dima"
gh secret set VPS_SSH_KEY --repo dpetryshchuk/vps-apps < ~/.ssh/<any-existing-deploy-key>
```

Or copy them manually: GitHub → `dpetryshchuk/vps-apps` → Settings → Secrets → Actions.

- [ ] **Step 5: Commit and push the workflow files**

```bash
git add .github/
git commit -m "feat: path-filtered GitHub Actions deploy per app"
git push
```

**Note:** These workflows will fail until the VPS cutover plan is complete (`/home/dima/vps-apps` doesn't exist on the VPS yet). That's intentional. The old repos' Actions continue keeping the live site up.

---

## Self-Review

**Spec coverage:**
- ✅ Single GitHub repo with npm workspaces
- ✅ `packages/ui` with HSL tokens (light mode only, jobsearch palette) + Tailwind config factory
- ✅ All three frontends wired to shared package via relative path
- ✅ `apps/` directory structure
- ✅ GitHub Actions at repo root with path filtering — push to one app only deploys that app; pushing `packages/ui` deploys all three
- ✅ Old repos untouched, live site unaffected throughout

**Not covered here (separate plan):**
- VPS cutover: cloning monorepo at `/home/dima/vps-apps`, updating systemd service paths, cutting over from old repos
