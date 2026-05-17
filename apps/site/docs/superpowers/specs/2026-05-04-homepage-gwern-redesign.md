# Homepage Redesign: Gwern-Style Essay Index

**Date:** 2026-05-04
**Status:** Approved for implementation

## Goal

Replace the current homepage (left sidebar accordion with Bio/Projects/Library/Watercolors/Writing sections) with a gwern.net-style layout: minimal header followed immediately by a two-column categorized essay index. Writing becomes the primary identity of the site.

## What Changes

### Homepage (`src/app/page.tsx`)

**Remove:**
- Left sticky sidebar with collapsible TOC
- Accordion sections for Bio, Projects, Library, Watercolors, Writing
- TocLinks component from homepage

**Add:**
- Minimal header: name, one-line tagline, simple nav links (About, Projects, Library)
- Two-column categorized essay index, grouped by topic folder
- Each topic block: uppercase label + plain list of essay links (title only)
- Draft essays shown in a muted/italic style, still linked
- No dates on the index — essays are reference material, not a feed

**Layout:**
- Full-width single column, max-width ~860px, centered
- Header separated from essay grid by a thin rule
- Two columns side-by-side on desktop, single column on mobile
- Georgia serif throughout, matching existing essay page typography

### What moves off the homepage

- **Bio** → About page (`/about`) — the full bio paragraph text
- **Projects** → Projects page (`/projects`) — already exists as data in `src/data/projects.ts`
- **Library** → Library page (`/library`) — already exists as data in `src/data/library.ts`
- **Watercolors** → Watercolors page (`/watercolors`) or stays but off homepage

### Essay page (`src/app/essays/[folder]/[slug]/page.tsx`)

No changes in this phase. The existing layout (right sidebar with essay list, backlinks at bottom) stays as-is.

### Routing

- `/` — new Gwern-style homepage
- `/about` — new page with the existing bio content
- `/essays` — existing essays index (may become redundant, but keep for now)
- `/projects`, `/library` — new simple pages pulling from existing data files

## Out of Scope (future)

- Hover previews for internal links (Floating UI)
- Sidenotes / Littlefoot.js footnote popups
- Search
- RSS for essays

## Data

Essays are already loaded via `src/lib/essays.ts`. The homepage will call `getAllEssays()` and group by `folder` to build the topic sections. No new data layer needed.

## Success Criteria

1. Homepage opens to name + tagline + nav, then immediately two-column essay list
2. Clicking any essay title navigates to the essay
3. No sidebar, no accordion on homepage
4. Bio, Projects, Library accessible via nav links
5. Mobile collapses to single column
6. Existing essay pages unchanged
