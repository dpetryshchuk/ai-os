# Writing App — Design Spec

**Goal:** A self-hosted Bear-style markdown writing app at `write.dmytropetryshchuk.com` that reads/writes essays from the personal site repo and pushes to GitHub on demand.

---

## Architecture

Standalone repo (`writing-app`) deployed on the same Hetzner VPS. Express server on port 4112 serves both the REST API and the built Vite/React frontend as static files. Caddy gets a second vhost for `write.dmytropetryshchuk.com` → `localhost:4112` with basic auth (same bcrypt pattern as jobsearch).

The personal site repo (`https://github.com/dpetryshchuk/dmytropetryshchuk.com`) is cloned separately to `/home/dima/writing/` on the VPS. The app reads/writes `.md` files directly there. On server startup, the app runs `git pull` to sync. No database — files are the source of truth.

---

## Content Structure

Essays live at `/home/dima/writing/content/essays/:folder/:slug.md`.

Frontmatter schema (parsed with `gray-matter`):
```yaml
title: "Essay Title"
date: "YYYY-MM-DD"       # set on creation, not editable in UI
tags: ["tag1", "tag2"]
description: "..."
status: "in-progress" | "published"
abstract: "..."          # optional
```

Slug is auto-generated from title on creation: `"Analytic Idealism"` → `analytic-idealism.md`.

---

## API

All routes under `/api/`. No auth at the API layer — Caddy basic auth covers the whole domain.

| Method | Path | What |
|---|---|---|
| `GET` | `/api/essays` | List all essays (frontmatter only, no body) |
| `GET` | `/api/essays/:folder/:slug` | Read full essay (frontmatter + body) |
| `PUT` | `/api/essays/:folder/:slug` | Write essay (autosave body + frontmatter) |
| `POST` | `/api/essays` | Create new `{folder, title}` → generates slug, writes file |
| `DELETE` | `/api/essays/:folder/:slug` | Delete file |
| `POST` | `/api/folders` | Create folder `{name}` (mkdir) |
| `PATCH` | `/api/folders/:folder` | Rename folder `{name}` (mv) |
| `DELETE` | `/api/folders/:folder` | Delete folder (only if empty) |
| `PATCH` | `/api/essays/:folder/:slug/move` | Move to different folder `{folder}` |
| `POST` | `/api/git/push` | `git add -A && git commit -m $message && git push` |
| `POST` | `/api/git/pull` | `git pull` |

---

## Save Behaviour

- **Autosave to disk**: debounced 1s after last keystroke. Writes file immediately, no git involvement.
- **Push to GitHub**: manual. User types a commit message in the sidebar input and clicks "Push to GitHub". Server runs `git add -A && git commit -m "<message>" && git push`. Vercel detects the push and deploys.
- **Pull**: small button in sidebar header. Runs `git pull`. Used to sync changes made directly in the repo.

---

## Frontend

Stack: Vite + React + Milkdown + Tailwind. Builds to `public/` inside the writing-app repo, served by Express as static files.

### Sidebar (left panel, 210px)

- Header: "ESSAYS" label + pull icon (top right)
- Folder tree: collapsible folders, essays listed under them
- Right-click folder: Rename, Delete (only if empty), New essay
- Right-click essay: Move to folder, Delete (confirmation dialog)
- "+" icon next to each folder → inline title input → Enter creates the essay
- Footer: commit message input + "↑ Push to GitHub" button

### FrontmatterBar (above editor)

- Title: large inline input, saves on blur
- Tags: chips with × to remove, "+ tag" to add new
- Status: dropdown (in-progress / published)
- Date: displayed read-only (set at creation)

### Editor (right panel)

- Milkdown instance, full height
- Autosaves body on change (debounced 1s)
- Status indicator bottom-right: "Auto-saved · Xs ago" or "Unsaved changes"

---

## Folder Management

- **Create**: "+ New folder" in sidebar or right-click blank area
- **Rename**: right-click folder → Rename → inline edit → Enter
- **Delete**: right-click → Delete (only allowed if folder has no essays)
- **Move essay**: right-click essay → Move to → folder picker

---

## Deployment

### VPS setup (one-time)
1. Clone writing-app to `/home/dima/writing-app/`
2. Clone personal site to `/home/dima/writing/`
3. Add SSH deploy key to `dpetryshchuk/dmytropetryshchuk.com` on GitHub (so VPS can push)
4. `cd /home/dima/writing-app && npm install && npm run build`
5. Create systemd service `writing.service` → `node server.js` on port 4112
6. Add Caddy vhost:

```
write.dmytropetryshchuk.com {
  basicauth {
    dima <bcrypt-hash>
  }
  reverse_proxy localhost:4112
}
```

### Deploy (ongoing)
Push to `writing-app` repo → SSH in → `git pull && npm install && npm run build && sudo systemctl restart writing`

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express |
| Frontend | Vite + React + Tailwind |
| Editor | Milkdown (Bear-style live preview) |
| Frontmatter parsing | gray-matter |
| Git operations | child_process shell commands |
| Auth | Caddy basic auth |
| Hosting | Hetzner VPS, port 4112 |
