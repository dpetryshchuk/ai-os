# Writing App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Bear-style markdown writing app at `write.dmytropetryshchuk.com` that reads/writes essay `.md` files from a cloned personal site repo and pushes to GitHub on demand.

**Architecture:** Express server on port 4112 serves a Vite/React frontend. Backend reads/writes `.md` files directly from `/home/dima/writing/` (cloned personal site repo). Caddy handles HTTPS + basic auth and reverse-proxies to Express.

**Tech Stack:** Node.js + Express, Vite + React + Tailwind, Milkdown (live-preview markdown editor), gray-matter (frontmatter), child_process (git ops)

---

## File Structure

```
writing-app/
├── .env.example
├── .gitignore
├── package.json
├── server.js
├── src/
│   ├── essays.js
│   ├── folders.js
│   └── git.js
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── index.css
│       ├── App.jsx
│       ├── lib/
│       │   └── api.js
│       └── components/
│           ├── Sidebar.jsx
│           ├── ContextMenu.jsx
│           ├── FrontmatterBar.jsx
│           └── Editor.jsx
├── public/            (gitignored, Vite build output)
└── writing.service
```

---

### Task 1: Backend — essays.js, folders.js, git.js

**Files:**
- Create: `src/essays.js`
- Create: `src/folders.js`
- Create: `src/git.js`
- Create: `.env.example`
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "writing-app",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "gray-matter": "^4.0.3"
  }
}
```

Run: `cd writing-app && npm install`

- [ ] **Step 2: Create .env.example**

```
PORT=4112
CONTENT_DIR=/home/dima/writing/content/essays
REPO_DIR=/home/dima/writing
```

Create `.env` from this with your local paths for development.

- [ ] **Step 3: Create .gitignore**

```
node_modules/
public/
.env
```

- [ ] **Step 4: Create src/essays.js**

```js
const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const contentDir = () => process.env.CONTENT_DIR

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function essayPath(folder, slug) {
  return path.join(contentDir(), folder, `${slug}.md`)
}

function listEssays() {
  const dir = contentDir()
  if (!fs.existsSync(dir)) return []
  const folders = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  const essays = []
  for (const folder of folders) {
    const folderPath = path.join(dir, folder)
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const slug = file.replace(/\.md$/, '')
      const raw = fs.readFileSync(path.join(folderPath, file), 'utf8')
      const { data } = matter(raw)
      essays.push({ folder, slug, ...data })
    }
  }
  return essays
}

function readEssay(folder, slug) {
  const fp = essayPath(folder, slug)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf8')
  const { data, content } = matter(raw)
  return { folder, slug, frontmatter: data, body: content.trim() }
}

function writeEssay(folder, slug, frontmatter, body) {
  const fp = essayPath(folder, slug)
  const raw = matter.stringify(body, frontmatter)
  fs.writeFileSync(fp, raw, 'utf8')
}

function createEssay(folder, title) {
  const slug = slugify(title)
  const dir = path.join(contentDir(), folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, `${slug}.md`)
  if (fs.existsSync(fp)) throw new Error(`Essay already exists: ${folder}/${slug}`)
  const frontmatter = {
    title,
    date: new Date().toISOString().slice(0, 10),
    tags: [],
    description: '',
    status: 'in-progress',
  }
  fs.writeFileSync(fp, matter.stringify('', frontmatter), 'utf8')
  return { folder, slug, frontmatter }
}

function deleteEssay(folder, slug) {
  const fp = essayPath(folder, slug)
  if (!fs.existsSync(fp)) throw new Error('Not found')
  fs.unlinkSync(fp)
}

function moveEssay(folder, slug, targetFolder) {
  const src = essayPath(folder, slug)
  if (!fs.existsSync(src)) throw new Error('Not found')
  const targetDir = path.join(contentDir(), targetFolder)
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
  const dest = path.join(targetDir, `${slug}.md`)
  fs.renameSync(src, dest)
}

module.exports = { listEssays, readEssay, writeEssay, createEssay, deleteEssay, moveEssay }
```

- [ ] **Step 5: Create src/folders.js**

```js
const fs = require('fs')
const path = require('path')

const contentDir = () => process.env.CONTENT_DIR

function listFolders() {
  const dir = contentDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

function createFolder(name) {
  const fp = path.join(contentDir(), name)
  if (fs.existsSync(fp)) throw new Error('Folder already exists')
  fs.mkdirSync(fp, { recursive: true })
}

function renameFolder(oldName, newName) {
  const src = path.join(contentDir(), oldName)
  const dest = path.join(contentDir(), newName)
  if (!fs.existsSync(src)) throw new Error('Not found')
  if (fs.existsSync(dest)) throw new Error('Target already exists')
  fs.renameSync(src, dest)
}

function deleteFolder(name) {
  const fp = path.join(contentDir(), name)
  if (!fs.existsSync(fp)) throw new Error('Not found')
  const files = fs.readdirSync(fp)
  if (files.length > 0) throw new Error('Folder is not empty')
  fs.rmdirSync(fp)
}

module.exports = { listFolders, createFolder, renameFolder, deleteFolder }
```

- [ ] **Step 6: Create src/git.js**

```js
const { execSync } = require('child_process')

const repoDir = () => process.env.REPO_DIR

function gitPull() {
  const out = execSync('git pull', { cwd: repoDir(), encoding: 'utf8' })
  return out.trim()
}

function gitPush(message) {
  if (!message || !message.trim()) throw new Error('Commit message is required')
  execSync('git add -A', { cwd: repoDir() })
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: repoDir() })
  const out = execSync('git push', { cwd: repoDir(), encoding: 'utf8' })
  return out.trim()
}

module.exports = { gitPull, gitPush }
```

- [ ] **Step 7: Commit**

```bash
git add package.json .env.example .gitignore src/essays.js src/folders.js src/git.js
git commit -m "feat: backend modules — essays, folders, git"
```

---

### Task 2: Express Server

**Files:**
- Create: `server.js`

- [ ] **Step 1: Create server.js**

```js
require('dotenv').config()
const express = require('express')
const path = require('path')
const { listEssays, readEssay, writeEssay, createEssay, deleteEssay, moveEssay } = require('./src/essays')
const { listFolders, createFolder, renameFolder, deleteFolder } = require('./src/folders')
const { gitPull, gitPush } = require('./src/git')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

function ok(res, data) { res.json({ ok: true, ...data }) }
function err(res, e, status = 400) { res.status(status).json({ ok: false, error: e.message }) }

// Essays
app.get('/api/essays', (req, res) => {
  try { ok(res, { essays: listEssays() }) } catch (e) { err(res, e) }
})
app.get('/api/essays/:folder/:slug', (req, res) => {
  try {
    const essay = readEssay(req.params.folder, req.params.slug)
    if (!essay) return res.status(404).json({ ok: false, error: 'Not found' })
    ok(res, { essay })
  } catch (e) { err(res, e) }
})
app.put('/api/essays/:folder/:slug', (req, res) => {
  try {
    const { frontmatter, body } = req.body
    writeEssay(req.params.folder, req.params.slug, frontmatter, body)
    ok(res, {})
  } catch (e) { err(res, e) }
})
app.post('/api/essays', (req, res) => {
  try {
    const { folder, title } = req.body
    if (!folder || !title) return err(res, new Error('folder and title required'))
    const essay = createEssay(folder, title)
    ok(res, { essay })
  } catch (e) { err(res, e) }
})
app.delete('/api/essays/:folder/:slug', (req, res) => {
  try { deleteEssay(req.params.folder, req.params.slug); ok(res, {}) } catch (e) { err(res, e) }
})
app.patch('/api/essays/:folder/:slug/move', (req, res) => {
  try {
    const { folder: targetFolder } = req.body
    moveEssay(req.params.folder, req.params.slug, targetFolder)
    ok(res, {})
  } catch (e) { err(res, e) }
})

// Folders
app.get('/api/folders', (req, res) => {
  try { ok(res, { folders: listFolders() }) } catch (e) { err(res, e) }
})
app.post('/api/folders', (req, res) => {
  try { createFolder(req.body.name); ok(res, {}) } catch (e) { err(res, e) }
})
app.patch('/api/folders/:folder', (req, res) => {
  try { renameFolder(req.params.folder, req.body.name); ok(res, {}) } catch (e) { err(res, e) }
})
app.delete('/api/folders/:folder', (req, res) => {
  try { deleteFolder(req.params.folder); ok(res, {}) } catch (e) { err(res, e) }
})

// Git
app.post('/api/git/pull', async (req, res) => {
  try { const out = gitPull(); ok(res, { output: out }) } catch (e) { err(res, e) }
})
app.post('/api/git/push', async (req, res) => {
  try { const out = gitPush(req.body.message); ok(res, { output: out }) } catch (e) { err(res, e) }
})

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const PORT = process.env.PORT || 4112
app.listen(PORT, () => console.log(`writing-app on ${PORT}`))
```

- [ ] **Step 2: Test server starts**

```bash
cp .env.example .env
# Edit .env to set CONTENT_DIR and REPO_DIR to local paths where your essays are
node server.js
# Expected: "writing-app on 4112"
```

- [ ] **Step 3: Smoke-test essays API**

```bash
curl http://localhost:4112/api/essays
# Expected: { "ok": true, "essays": [...] }

curl http://localhost:4112/api/folders
# Expected: { "ok": true, "folders": ["philosophy", "meta", ...] }
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: express server with all API routes"
```

---

### Task 3: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Create frontend/package.json**

```json
{
  "name": "writing-app-frontend",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@milkdown/core": "^7.5.0",
    "@milkdown/ctx": "^7.5.0",
    "@milkdown/kit": "^7.5.0",
    "@milkdown/react": "^7.5.0",
    "@milkdown/preset-commonmark": "^7.5.0",
    "@milkdown/plugin-listener": "^7.5.0",
    "@milkdown/theme-nord": "^7.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.7",
    "vite": "^5.3.4"
  }
}
```

Run: `cd frontend && npm install`

- [ ] **Step 2: Create frontend/vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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

- [ ] **Step 3: Create frontend/tailwind.config.js**

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 4: Create frontend/postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create frontend/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Writing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Dark background */
html, body, #root {
  background: #0f0f0f;
  color: #ccc;
  height: 100%;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Milkdown dark overrides */
.milkdown {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}
.milkdown .editor {
  font-family: Georgia, serif;
  font-size: 15px;
  line-height: 1.8;
  color: #ccc;
  background: transparent;
  padding: 28px 40px;
  min-height: 100%;
  outline: none;
}
.milkdown .editor h1,
.milkdown .editor h2,
.milkdown .editor h3 {
  color: #fff;
}
.milkdown .editor a { color: #7ea; }
.milkdown .editor code { background: #1e1e1e; padding: 2px 5px; border-radius: 3px; font-size: 13px; }
.milkdown .editor pre { background: #1a1a1a; border-radius: 6px; padding: 14px 18px; }
.milkdown .editor blockquote {
  border-left: 3px solid #333;
  margin-left: 0;
  padding-left: 16px;
  color: #777;
}
```

- [ ] **Step 7: Create frontend/src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

- [ ] **Step 8: Create placeholder App.jsx to verify build works**

```jsx
export default function App() {
  return <div className="p-8 text-white">Writing App — loading...</div>
}
```

- [ ] **Step 9: Test Vite dev server starts**

```bash
cd frontend && npm run dev
# Expected: Local: http://localhost:5173
# Open browser — should see "Writing App — loading..."
```

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffold — Vite, React, Tailwind, Milkdown deps"
```

---

### Task 4: API Client

**Files:**
- Create: `frontend/src/lib/api.js`

- [ ] **Step 1: Create frontend/src/lib/api.js**

```js
const BASE = '/api'

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  essays: {
    list: () => request('GET', '/essays').then(d => d.essays),
    read: (folder, slug) => request('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder, slug, frontmatter, body) =>
      request('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder, title) => request('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder, slug) => request('DELETE', `/essays/${folder}/${slug}`),
    move: (folder, slug, targetFolder) =>
      request('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => request('GET', '/folders').then(d => d.folders),
    create: (name) => request('POST', '/folders', { name }),
    rename: (folder, name) => request('PATCH', `/folders/${folder}`, { name }),
    delete: (folder) => request('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => request('POST', '/git/pull').then(d => d.output),
    push: (message) => request('POST', '/git/push', { message }).then(d => d.output),
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat: API client"
```

---

### Task 5: Sidebar + ContextMenu

**Files:**
- Create: `frontend/src/components/ContextMenu.jsx`
- Create: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Create frontend/src/components/ContextMenu.jsx**

```jsx
import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[#1e1e1e] border border-[#2a2a2a] rounded shadow-xl py-1 min-w-[140px]"
      style={{ top: y, left: x }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose() }}
          className="block w-full text-left px-3 py-1.5 text-xs text-[#ccc] hover:bg-[#2a2a2a] hover:text-white"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/components/Sidebar.jsx**

```jsx
import { useState, useCallback } from 'react'
import ContextMenu from './ContextMenu'

export default function Sidebar({
  folders,
  essays,
  activeFolder,
  activeSlug,
  onSelectEssay,
  onCreateEssay,
  onDeleteEssay,
  onMoveEssay,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onPull,
  commitMessage,
  onCommitMessageChange,
  onPush,
}) {
  const [collapsed, setCollapsed] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [inlineNew, setInlineNew] = useState(null) // { folder }
  const [newTitle, setNewTitle] = useState('')
  const [renaming, setRenaming] = useState(null) // { folder }
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const openCtx = useCallback((e, items) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  function essaysInFolder(folder) {
    return essays.filter(e => e.folder === folder)
  }

  function handleFolderCtx(e, folder) {
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

  function handleEssayCtx(e, essay) {
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

  function submitNewEssay(folder) {
    if (newTitle.trim()) onCreateEssay(folder, newTitle.trim())
    setInlineNew(null)
    setNewTitle('')
  }

  function submitRename(oldName) {
    if (renameValue.trim() && renameValue !== oldName) onRenameFolder(oldName, renameValue.trim())
    setRenaming(null)
  }

  function submitNewFolder() {
    if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
    setNewFolderMode(false)
    setNewFolderName('')
  }

  return (
    <div className="w-[210px] bg-[#141414] border-r border-[#222] flex flex-col flex-shrink-0 select-none">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
        <span className="text-[11px] tracking-widest text-[#555] font-semibold uppercase">Essays</span>
        <div className="flex gap-2 items-center">
          <button onClick={onPull} title="Pull from GitHub" className="text-[#444] hover:text-[#888] text-sm leading-none">↓</button>
          <button
            onClick={() => { setNewFolderMode(true); setNewFolderName('') }}
            title="New folder"
            className="text-[#444] hover:text-[#888] text-base leading-none"
          >+</button>
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {newFolderMode && (
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            onBlur={() => setNewFolderMode(false)}
            placeholder="folder name"
            className="mx-2 mb-1 w-[calc(100%-16px)] bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-white outline-none"
          />
        )}
        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysInFolder(folder)
          return (
            <div key={folder}>
              <div
                className="px-2.5 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                onClick={() => setCollapsed(c => ({ ...c, [folder]: !c[folder] }))}
                onContextMenu={e => handleFolderCtx(e, folder)}
              >
                <span className="text-[10px] text-[#555]">{isOpen ? '▾' : '▸'}</span>
                {renaming?.folder === folder ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(folder); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={() => submitRename(folder)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-1 py-0 text-xs text-white outline-none"
                  />
                ) : (
                  <span className="text-xs text-[#888] group-hover:text-[#aaa] flex-1">{folder}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setInlineNew({ folder }); setNewTitle('') }}
                  className="text-[#333] hover:text-[#666] text-[10px] leading-none"
                >+</button>
              </div>
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      className={`pl-[26px] pr-3 py-1.5 text-xs cursor-pointer ${
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'text-white bg-[#1e1e1e] border-l-2 border-[#666]'
                          : 'text-[#777] hover:text-[#aaa]'
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
                      className="ml-[26px] mr-2 my-0.5 w-[calc(100%-36px)] bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-white outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: git push */}
      <div className="border-t border-[#1e1e1e] p-3">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="commit message…"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[11px] text-[#777] font-mono outline-none focus:border-[#444] mb-2"
        />
        <button
          onClick={onPush}
          className="w-full bg-[#2a2a2a] hover:bg-[#333] border-none rounded px-2 py-1.5 text-[#aaa] text-[11px] tracking-wide cursor-pointer"
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

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/ContextMenu.jsx
git commit -m "feat: Sidebar with folder tree, context menus, inline inputs"
```

---

### Task 6: FrontmatterBar

**Files:**
- Create: `frontend/src/components/FrontmatterBar.jsx`

- [ ] **Step 1: Create frontend/src/components/FrontmatterBar.jsx**

```jsx
import { useState } from 'react'

export default function FrontmatterBar({ frontmatter, onChange }) {
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')

  if (!frontmatter) return null

  const { title = '', tags = [], status = 'in-progress', date = '' } = frontmatter

  function update(patch) {
    onChange({ ...frontmatter, ...patch })
  }

  function removeTag(tag) {
    update({ tags: tags.filter(t => t !== tag) })
  }

  function addTag() {
    const val = tagInput.trim()
    if (val && !tags.includes(val)) update({ tags: [...tags, val] })
    setTagInput('')
    setAddingTag(false)
  }

  return (
    <div className="border-b border-[#1e1e1e] px-6 py-3 flex gap-3 items-center flex-wrap bg-[#0f0f0f]">
      <input
        value={title}
        onChange={e => update({ title: e.target.value })}
        className="bg-transparent border-none text-white text-[15px] font-semibold outline-none flex-1 min-w-[120px]"
        placeholder="Untitled"
      />
      <div className="flex gap-2 items-center flex-wrap">
        {tags.map(tag => (
          <span key={tag} className="text-[10px] text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded cursor-pointer hover:text-[#888]">
            {tag}
            <span className="ml-1 text-[#333] hover:text-[#666]" onClick={() => removeTag(tag)}>×</span>
          </span>
        ))}
        {addingTag ? (
          <input
            autoFocus
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAddingTag(false) }}
            onBlur={addTag}
            placeholder="tag name"
            className="text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-2 py-0.5 text-white outline-none w-20"
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="text-[10px] text-[#333] hover:text-[#666] px-1"
          >+ tag</button>
        )}
      </div>
      <select
        value={status}
        onChange={e => update({ status: e.target.value })}
        className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] text-[10px] rounded px-2 py-1 outline-none"
      >
        <option value="in-progress">in-progress</option>
        <option value="published">published</option>
      </select>
      <span className="text-[10px] text-[#444]">{date}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FrontmatterBar.jsx
git commit -m "feat: FrontmatterBar — title, tags, status, date"
```

---

### Task 7: Editor (Milkdown + autosave)

**Files:**
- Create: `frontend/src/components/Editor.jsx`

- [ ] **Step 1: Create frontend/src/components/Editor.jsx**

```jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { Editor as MilkdownEditor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { commonmark } from '@milkdown/preset-commonmark'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { api } from '../lib/api'

// Inner component — lives inside MilkdownProvider
function InnerEditor({ folder, slug, initialBody, frontmatterRef, onSaveStatus }) {
  const saveTimer = useRef(null)
  const lastSaved = useRef(null)
  const [, forceUpdate] = useState(0)

  const { get } = useEditor((root) =>
    MilkdownEditor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialBody)
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
          onSaveStatus('unsaved')
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(async () => {
            try {
              onSaveStatus('saving')
              await api.essays.write(folder, slug, frontmatterRef.current, markdown)
              lastSaved.current = Date.now()
              onSaveStatus('saved')
            } catch (e) {
              onSaveStatus('error')
            }
          }, 1000)
        })
      })
      .use(commonmark)
      .use(listener)
  )

  return <Milkdown />
}

// Status text shown bottom-right
function SaveStatus({ status, lastSaved }) {
  const text = {
    idle: '',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }[status] || ''

  return (
    <div className="absolute bottom-4 right-6 text-[11px] text-[#444] pointer-events-none">
      {text}
    </div>
  )
}

export default function Editor({ folder, slug, initialBody, frontmatterRef }) {
  const [saveStatus, setSaveStatus] = useState('idle')
  const [lastSaved, setLastSaved] = useState(null)

  function handleSaveStatus(s) {
    setSaveStatus(s)
    if (s === 'saved') setLastSaved(Date.now())
  }

  return (
    <div className="flex-1 overflow-y-auto relative">
      <MilkdownProvider key={`${folder}/${slug}`}>
        <InnerEditor
          folder={folder}
          slug={slug}
          initialBody={initialBody}
          frontmatterRef={frontmatterRef}
          onSaveStatus={handleSaveStatus}
        />
      </MilkdownProvider>
      <SaveStatus status={saveStatus} lastSaved={lastSaved} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Editor.jsx
git commit -m "feat: Milkdown editor with 1s debounce autosave"
```

---

### Task 8: App.jsx — Full Wiring

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Rewrite frontend/src/App.jsx**

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from './lib/api'
import Sidebar from './components/Sidebar'
import FrontmatterBar from './components/FrontmatterBar'
import Editor from './components/Editor'

export default function App() {
  const [folders, setFolders] = useState([])
  const [essays, setEssays] = useState([])
  const [activeFolder, setActiveFolder] = useState(null)
  const [activeSlug, setActiveSlug] = useState(null)
  const [essay, setEssay] = useState(null) // { frontmatter, body }
  const [commitMessage, setCommitMessage] = useState('')
  const frontmatterRef = useRef(null)

  async function loadList() {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    setFolders(f)
    setEssays(e)
  }

  useEffect(() => { loadList() }, [])

  async function selectEssay(folder, slug) {
    setActiveFolder(folder)
    setActiveSlug(slug)
    const data = await api.essays.read(folder, slug)
    setEssay({ frontmatter: data.frontmatter, body: data.body })
    frontmatterRef.current = data.frontmatter
  }

  function handleFrontmatterChange(fm) {
    setEssay(e => ({ ...e, frontmatter: fm }))
    frontmatterRef.current = fm
    // autosave frontmatter immediately on blur-triggered change
    if (activeFolder && activeSlug) {
      api.essays.write(activeFolder, activeSlug, fm, essay?.body || '')
    }
  }

  async function handleCreateEssay(folder, title) {
    const created = await api.essays.create(folder, title)
    await loadList()
    selectEssay(created.folder, created.slug)
  }

  async function handleDeleteEssay(folder, slug) {
    await api.essays.delete(folder, slug)
    if (activeFolder === folder && activeSlug === slug) {
      setActiveFolder(null); setActiveSlug(null); setEssay(null)
    }
    await loadList()
  }

  async function handleMoveEssay(folder, slug, targetFolder) {
    await api.essays.move(folder, slug, targetFolder)
    await loadList()
    if (activeFolder === folder && activeSlug === slug) {
      setActiveFolder(targetFolder)
    }
  }

  async function handleCreateFolder(name) {
    await api.folders.create(name)
    await loadList()
  }

  async function handleRenameFolder(oldName, newName) {
    await api.folders.rename(oldName, newName)
    if (activeFolder === oldName) setActiveFolder(newName)
    await loadList()
  }

  async function handleDeleteFolder(name) {
    await api.folders.delete(name)
    await loadList()
  }

  async function handlePull() {
    try {
      const out = await api.git.pull()
      alert(out || 'Pulled.')
      await loadList()
    } catch (e) { alert(`Pull failed: ${e.message}`) }
  }

  async function handlePush() {
    if (!commitMessage.trim()) return alert('Enter a commit message first.')
    try {
      const out = await api.git.push(commitMessage)
      alert(out || 'Pushed.')
      setCommitMessage('')
    } catch (e) { alert(`Push failed: ${e.message}`) }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        folders={folders}
        essays={essays}
        activeFolder={activeFolder}
        activeSlug={activeSlug}
        onSelectEssay={selectEssay}
        onCreateEssay={handleCreateEssay}
        onDeleteEssay={handleDeleteEssay}
        onMoveEssay={handleMoveEssay}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onPull={handlePull}
        commitMessage={commitMessage}
        onCommitMessageChange={setCommitMessage}
        onPush={handlePush}
      />
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0f0f0f]">
        {essay ? (
          <>
            <FrontmatterBar
              frontmatter={essay.frontmatter}
              onChange={handleFrontmatterChange}
            />
            <Editor
              folder={activeFolder}
              slug={activeSlug}
              initialBody={essay.body}
              frontmatterRef={frontmatterRef}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#333] text-sm">
            Select an essay or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run Vite dev server and test full UI**

```bash
# Terminal 1: start backend
node server.js

# Terminal 2: start frontend dev server
cd frontend && npm run dev
```

Open `http://localhost:5173`. You should see the sidebar with your folders and essays. Click an essay — the editor should open with the essay body and frontmatter.

- [ ] **Step 3: Test autosave**

Type something in the editor. Wait 1 second. Check the status indicator shows "Saved Xs ago". Check the `.md` file on disk was updated.

- [ ] **Step 4: Test git push**

Type a commit message in the sidebar footer. Click "↑ Push to GitHub". Confirm the git push runs (you'll need a real repo + SSH key for this to fully work).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: App.jsx — full state wiring"
```

---

### Task 9: Build Integration + Deployment Files

**Files:**
- Create: `writing.service`
- Modify: `package.json` (add build script)
- Modify: `frontend/package.json` (build path already set)

- [ ] **Step 1: Add build script to root package.json**

```json
{
  "name": "writing-app",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "build": "cd frontend && npm install && npm run build"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "gray-matter": "^4.0.3"
  }
}
```

- [ ] **Step 2: Test production build**

```bash
npm run build
# Expected: frontend/dist → public/ created
# public/index.html, public/assets/... should exist

node server.js
# Open http://localhost:4112 — should serve the built frontend
```

- [ ] **Step 3: Create writing.service**

```ini
[Unit]
Description=Writing App
After=network.target

[Service]
Type=simple
User=dima
WorkingDirectory=/home/dima/writing-app
EnvironmentFile=/home/dima/writing-app/.env
ExecStart=/usr/bin/node /home/dima/writing-app/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: VPS setup commands (run via SSH)**

```bash
# On VPS:

# 1. Clone writing-app repo
git clone git@github.com:YOUR_USERNAME/writing-app.git /home/dima/writing-app

# 2. Clone personal site (if not already present)
git clone git@github.com:dpetryshchuk/dmytropetryshchuk.com.git /home/dima/writing

# 3. Set up .env
cp /home/dima/writing-app/.env.example /home/dima/writing-app/.env
# Edit .env — CONTENT_DIR and REPO_DIR are already correct for VPS

# 4. Build
cd /home/dima/writing-app && npm run build

# 5. Install systemd service
sudo cp /home/dima/writing-app/writing.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable writing
sudo systemctl start writing

# 6. Verify
sudo systemctl status writing
curl http://localhost:4112/api/essays
```

- [ ] **Step 5: Add Caddy vhost**

Edit `/etc/caddy/Caddyfile` on the VPS, add:

```
write.dmytropetryshchuk.com {
  basicauth {
    dima <bcrypt-hash>
  }
  reverse_proxy localhost:4112
}
```

Generate the hash: `caddy hash-password --plaintext yourpassword`

Then reload: `sudo systemctl reload caddy`

- [ ] **Step 6: Add SSH deploy key**

```bash
# On VPS:
ssh-keygen -t ed25519 -f ~/.ssh/writing_deploy -N ""
cat ~/.ssh/writing_deploy.pub
# Add this as a deploy key to dpetryshchuk/dmytropetryshchuk.com on GitHub
# (Settings → Deploy keys → Add deploy key → allow write access)

# Configure git to use this key for the writing repo
# In /home/dima/writing/.git/config add:
# [core]
#   sshCommand = ssh -i /home/dima/.ssh/writing_deploy
```

- [ ] **Step 7: Final commit**

```bash
git add writing.service package.json
git commit -m "feat: build script + systemd service"
```

---

### Deploy Script (ongoing)

After any change to the writing-app repo:

```bash
# SSH into VPS then:
cd /home/dima/writing-app && git pull && npm run build && sudo systemctl restart writing
```

---

## Self-Review

**Spec coverage:**
- ✅ All API routes from spec implemented in Task 2 + `GET /api/folders` added
- ✅ Folder tree sidebar with collapsible folders
- ✅ Right-click context menus for folders and essays
- ✅ Inline title input for new essays
- ✅ Footer: commit message input + push button
- ✅ FrontmatterBar: title, tags (add/remove), status dropdown, date read-only
- ✅ Milkdown live-preview editor
- ✅ Autosave: 1s debounce, saves body + frontmatter
- ✅ Save status indicator
- ✅ Pull button in sidebar header
- ✅ systemd service + Caddy vhost
- ✅ SSH deploy key setup
- ✅ gray-matter for frontmatter parsing

**Placeholder scan:** None found. All tasks contain actual code.

**Type consistency:** `api.essays.write(folder, slug, frontmatter, body)` called consistently. `frontmatterRef.current` pattern used in both App.jsx and Editor.jsx. `folder`/`slug` param names consistent throughout.
