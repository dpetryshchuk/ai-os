import { useReducer, useEffect, useRef, useCallback } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// ──── Types ────────────────────────────────────────────────────────────────

interface Essay { folder: string; slug: string; title: string }
interface Frontmatter {
  title?: string; tags?: string[]; status?: string; date?: string
  description?: string; toc?: boolean; [key: string]: unknown
}
interface EssayData { frontmatter: Frontmatter; body: string }

// ──── API ──────────────────────────────────────────────────────────────────

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/writing' + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

const api = {
  essays: {
    list: () => req<{ essays: Essay[] }>('GET', '/essays').then(d => d.essays),
    read: (folder: string, slug: string) =>
      req<{ essay: EssayData }>('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder: string, slug: string, frontmatter: Frontmatter, body: string) =>
      req('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder: string, title: string) =>
      req<{ essay: Essay }>('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder: string, slug: string) =>
      req('DELETE', `/essays/${folder}/${slug}`),
    move: (folder: string, slug: string, targetFolder: string) =>
      req('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => req<{ folders: string[] }>('GET', '/folders').then(d => d.folders),
    create: (name: string) => req('POST', '/folders', { name }),
    rename: (folder: string, name: string) => req('PATCH', `/folders/${folder}`, { name }),
    delete: (folder: string) => req('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => req<{ output: string }>('POST', '/git/pull').then(d => d.output),
    push: (message: string) =>
      req<{ output: string }>('POST', '/git/push', { message }).then(d => d.output),
  },
}

// ──── FrontmatterBar ───────────────────────────────────────────────────────

function FrontmatterBar({ frontmatter, onChange }: { frontmatter: Frontmatter | null; onChange: (fm: Frontmatter) => void }) {
  const [addingTag, setAddingTag] = [false, () => {}]
  if (!frontmatter) return null
  const { title = '', tags = [], status = 'in-progress', date = '' } = frontmatter
  const update = (patch: Partial<Frontmatter>) => onChange({ ...frontmatter, ...patch })
  return (
    <div className="border-b border-border bg-background shrink-0">
      <div className="px-6 py-3 flex gap-4 items-center flex-wrap">
        <input
          value={title}
          onChange={e => update({ title: e.target.value })}
          className="bg-transparent text-base font-semibold outline-none flex-1 min-w-[160px] placeholder:text-muted-foreground"
          placeholder="Untitled"
        />
        <div className="flex gap-1.5 items-center flex-wrap">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {tag}
              <button onClick={() => update({ tags: tags.filter(t => t !== tag) })} className="leading-none hover:text-foreground">×</button>
            </span>
          ))}
        </div>
        <select
          value={status}
          onChange={e => update({ status: e.target.value })}
          className="bg-muted text-muted-foreground text-[11px] rounded-full px-3 py-1 outline-none cursor-pointer"
        >
          <option value="in-progress">in progress</option>
          <option value="published">published</option>
        </select>
        {date && <span className="text-[11px] text-muted-foreground">{date}</span>}
      </div>
    </div>
  )
}

// ──── Sidebar ──────────────────────────────────────────────────────────────

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

function Sidebar({
  folders, essays, activeFolder, activeSlug,
  onSelectEssay, onCreateEssay, onDeleteEssay, onMoveEssay,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  onPull, commitMessage, onCommitMessageChange, onPush,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useReducer(
    (s: Record<string, boolean>, folder: string) => ({ ...s, [folder]: !s[folder] }),
    {}
  )
  const [inlineNewFolder, setInlineNewFolder] = useReducer(
    (_: string | null, f: string | null) => f, null
  )
  const [newTitle, setNewTitle] = useReducer((_: string, t: string) => t, '')
  const [renamingFolder, setRenamingFolder] = useReducer((_: string | null, f: string | null) => f, null)
  const [renameValue, setRenameValue] = useReducer((_: string, v: string) => v, '')
  const [newFolderMode, setNewFolderMode] = useReducer((_: boolean, v: boolean) => v, false)
  const [newFolderName, setNewFolderName] = useReducer((_: string, v: string) => v, '')

  const essaysIn = (folder: string) => essays.filter(e => e.folder === folder)

  return (
    <div className="w-[220px] bg-background border-r border-border flex flex-col shrink-0 select-none overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] tracking-[0.1em] text-muted-foreground font-semibold uppercase">Essays</span>
        <div className="flex gap-2.5 items-center">
          <button onClick={onPull} title="Pull" className="text-muted-foreground hover:text-foreground text-sm transition-colors">↓</button>
          <button onClick={() => setNewFolderMode(true)} title="New folder" className="text-muted-foreground hover:text-foreground text-base transition-colors">+</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {newFolderMode && (
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { if (newFolderName.trim()) onCreateFolder(newFolderName.trim()); setNewFolderMode(false) }
              if (e.key === 'Escape') setNewFolderMode(false)
            }}
            onBlur={() => setNewFolderMode(false)}
            placeholder="folder name"
            className="mx-3 mb-1 w-[calc(100%-24px)] bg-background border border-border rounded-md px-2.5 py-1.5 text-xs outline-none"
          />
        )}
        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysIn(folder)
          return (
            <div key={folder}>
              <div
                role="button" tabIndex={0}
                className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                onClick={() => setCollapsed(folder)}
                onKeyDown={e => { if (e.key === 'Enter') setCollapsed(folder) }}
                onContextMenu={e => {
                  e.preventDefault()
                  const action = window.prompt(`${folder}: rename/delete/new?`)?.toLowerCase()
                  if (!action) return
                  if (action === 'delete') { if (folderEssays.length === 0 && confirm(`Delete "${folder}"?`)) onDeleteFolder(folder) }
                  else if (action === 'rename') { const n = prompt('New name:', folder); if (n && n !== folder) onRenameFolder(folder, n) }
                  else if (action === 'new') setInlineNewFolder(folder)
                }}
              >
                <span className="text-[9px] text-muted-foreground w-3 shrink-0">{isOpen ? '▾' : '▸'}</span>
                {renamingFolder === folder ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { if (renameValue.trim() && renameValue !== folder) onRenameFolder(folder, renameValue.trim()); setRenamingFolder(null) }
                      if (e.key === 'Escape') setRenamingFolder(null)
                    }}
                    onBlur={() => setRenamingFolder(null)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-xs outline-none"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground group-hover:text-foreground flex-1 font-medium transition-colors">{folder}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setInlineNewFolder(folder); setNewTitle('') }}
                  className="text-muted-foreground hover:text-foreground text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >+</button>
              </div>
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      role="button" tabIndex={0}
                      className={`pl-7 pr-3 py-1.5 text-[12.5px] cursor-pointer transition-colors ${
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'text-foreground bg-muted/60 border-l-2 border-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }`}
                      onClick={() => onSelectEssay(essay.folder, essay.slug)}
                      onKeyDown={e => { if (e.key === 'Enter') onSelectEssay(essay.folder, essay.slug) }}
                      onContextMenu={e => {
                        e.preventDefault()
                        const action = window.prompt(`"${essay.title || essay.slug}": move/delete?`)?.toLowerCase()
                        if (!action) return
                        if (action === 'delete') { if (confirm(`Delete?`)) onDeleteEssay(essay.folder, essay.slug) }
                        else if (action === 'move') { const t = prompt('Move to folder:'); if (t && t !== essay.folder) onMoveEssay(essay.folder, essay.slug, t) }
                      }}
                    >
                      {essay.title || essay.slug}
                    </div>
                  ))}
                  {inlineNewFolder === folder && (
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { if (newTitle.trim()) onCreateEssay(folder, newTitle.trim()); setInlineNewFolder(null) }
                        if (e.key === 'Escape') setInlineNewFolder(null)
                      }}
                      onBlur={() => setInlineNewFolder(null)}
                      placeholder="Essay title…"
                      className="ml-7 mr-3 my-0.5 w-[calc(100%-52px)] bg-background border border-border rounded px-2 py-1 text-xs outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t border-border p-3 shrink-0">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="commit message…"
          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[11.5px] font-mono text-muted-foreground outline-none mb-2 placeholder:text-muted-foreground"
        />
        <button
          onClick={onPush}
          className="w-full bg-foreground text-background rounded-md px-2 py-1.5 text-[11.5px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
        >
          ↑ Push to GitHub
        </button>
      </div>
    </div>
  )
}

// ──── Editor ───────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
type ViewMode = 'edit' | 'split' | 'preview'

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text || '') as string)
}

interface EditorPanelProps {
  folder: string; slug: string; initialBody: string
  frontmatterRef: React.RefObject<Frontmatter | null>
  bodyRef: React.MutableRefObject<string>
}

function EditorPanel({ folder, slug, initialBody, frontmatterRef, bodyRef }: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useReducer((_: SaveStatus, s: SaveStatus) => s, 'idle' as SaveStatus)
  const [lastSaved, setLastSaved] = useReducer((_: number | null, n: number | null) => n, null as number | null)
  const [mode, setMode] = useReducer((_: ViewMode, m: ViewMode) => m, 'edit' as ViewMode)
  const [previewHtml, setPreviewHtml] = useReducer((_: string, s: string) => s, renderMarkdown(initialBody))
  const [narrow, setNarrow] = useReducer((_: boolean, b: boolean) => b, window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setSaveStatus('idle'); setLastSaved(null); setPreviewHtml(renderMarkdown(initialBody))
  }, [folder, slug])

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      doc: initialBody,
      extensions: [
        minimalSetup, markdown(), EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return
          const value = update.state.doc.toString()
          bodyRef.current = value
          setSaveStatus('unsaved'); setPreviewHtml(renderMarkdown(value))
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(async () => {
            setSaveStatus('saving')
            try {
              if (frontmatterRef.current) await api.essays.write(folder, slug, frontmatterRef.current, value)
              setSaveStatus('saved'); setLastSaved(Date.now())
            } catch { setSaveStatus('error') }
          }, 1000)
        }),
      ],
      parent: containerRef.current,
    })
    return () => { view.destroy(); if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [folder, slug])

  const statusText: Record<SaveStatus, string> = {
    idle: '', unsaved: 'Unsaved', saving: 'Saving…',
    saved: lastSaved ? `Saved ${Math.round((Date.now() - lastSaved) / 1000)}s ago` : 'Saved',
    error: 'Save failed',
  }

  const effectiveMode = narrow && mode === 'split' ? 'edit' : mode
  const showEditor = effectiveMode !== 'preview'
  const showPreview = effectiveMode !== 'edit'
  const modes: ViewMode[] = narrow ? ['edit', 'preview'] : ['edit', 'split', 'preview']

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2 border-b border-border shrink-0">
        <span className="text-[11px] text-muted-foreground">{statusText[saveStatus]}</span>
        <div className="flex gap-0.5 rounded-md border border-border p-0.5">
          {modes.map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-colors ${
                effectiveMode === m ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex">
        <div
          ref={containerRef}
          style={{ display: showEditor ? undefined : 'none' }}
          className={`overflow-y-auto ${showEditor && showPreview ? 'w-1/2 border-r border-border' : 'w-full'}`}
        />
        {showPreview && (
          <div
            className={`overflow-y-auto px-8 py-6 prose prose-sm prose-neutral max-w-none ${showEditor ? 'w-1/2' : 'w-full'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  )
}

// ──── App state ────────────────────────────────────────────────────────────

type AppState = {
  folders: string[]; essays: Essay[]
  activeFolder: string | null; activeSlug: string | null
  essay: EssayData | null; commitMessage: string
}
type AppAction =
  | { type: 'set_list'; folders: string[]; essays: Essay[] }
  | { type: 'select_essay'; folder: string; slug: string; data: EssayData }
  | { type: 'deselect_essay' }
  | { type: 'set_essay'; essay: EssayData }
  | { type: 'move_essay'; folder: string }
  | { type: 'set_commit'; message: string }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set_list': return { ...state, folders: action.folders, essays: action.essays }
    case 'select_essay': return { ...state, activeFolder: action.folder, activeSlug: action.slug, essay: action.data }
    case 'deselect_essay': return { ...state, activeFolder: null, activeSlug: null, essay: null }
    case 'set_essay': return { ...state, essay: action.essay }
    case 'move_essay': return { ...state, activeFolder: action.folder }
    case 'set_commit': return { ...state, commitMessage: action.message }
  }
}

// ──── Page ─────────────────────────────────────────────────────────────────

export default function Essays() {
  const [state, dispatch] = useReducer(appReducer, {
    folders: [], essays: [], activeFolder: null, activeSlug: null, essay: null, commitMessage: '',
  })
  const { folders, essays, activeFolder, activeSlug, essay, commitMessage } = state
  const frontmatterRef = useRef<Frontmatter | null>(null)
  const bodyRef = useRef<string>('')

  const loadList = useCallback(async () => {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    dispatch({ type: 'set_list', folders: f, essays: e })
  }, [])

  useEffect(() => { loadList() }, [loadList])

  async function selectEssay(folder: string, slug: string) {
    const data = await api.essays.read(folder, slug)
    dispatch({ type: 'select_essay', folder, slug, data })
    frontmatterRef.current = data.frontmatter
    bodyRef.current = data.body
  }

  function handleFrontmatterChange(fm: Frontmatter) {
    if (!essay) return
    dispatch({ type: 'set_essay', essay: { ...essay, frontmatter: fm } })
    frontmatterRef.current = fm
    if (activeFolder && activeSlug) api.essays.write(activeFolder, activeSlug, fm, bodyRef.current)
  }

  async function handleCreateEssay(folder: string, title: string) {
    const created = await api.essays.create(folder, title)
    await loadList()
    await selectEssay(created.folder, created.slug)
  }

  async function handleDeleteEssay(folder: string, slug: string) {
    try {
      await api.essays.delete(folder, slug)
      if (activeFolder === folder && activeSlug === slug) dispatch({ type: 'deselect_essay' })
      await loadList()
    } catch (e) { alert(`Delete failed: ${(e as Error).message}`) }
  }

  async function handleMoveEssay(folder: string, slug: string, targetFolder: string) {
    try {
      await api.essays.move(folder, slug, targetFolder)
      await loadList()
      if (activeFolder === folder && activeSlug === slug) dispatch({ type: 'move_essay', folder: targetFolder })
    } catch (e) { alert(`Move failed: ${(e as Error).message}`) }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        folders={folders} essays={essays}
        activeFolder={activeFolder} activeSlug={activeSlug}
        onSelectEssay={selectEssay} onCreateEssay={handleCreateEssay}
        onDeleteEssay={handleDeleteEssay} onMoveEssay={handleMoveEssay}
        onCreateFolder={async (name) => { try { await api.folders.create(name); await loadList() } catch (e) { alert((e as Error).message) } }}
        onRenameFolder={async (old, n) => { try { await api.folders.rename(old, n); if (activeFolder === old) dispatch({ type: 'move_essay', folder: n }); await loadList() } catch (e) { alert((e as Error).message) } }}
        onDeleteFolder={async (name) => { try { await api.folders.delete(name); await loadList() } catch (e) { alert((e as Error).message) } }}
        onPull={async () => { try { const out = await api.git.pull(); alert(out || 'Pulled.'); await loadList() } catch (e) { alert((e as Error).message) } }}
        commitMessage={commitMessage}
        onCommitMessageChange={msg => dispatch({ type: 'set_commit', message: msg })}
        onPush={async () => {
          if (!commitMessage.trim()) return alert('Enter a commit message first.')
          try { const out = await api.git.push(commitMessage); alert(out || 'Pushed.'); dispatch({ type: 'set_commit', message: '' }) }
          catch (e) { alert((e as Error).message) }
        }}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {essay && activeFolder && activeSlug ? (
          <>
            <FrontmatterBar frontmatter={essay.frontmatter} onChange={handleFrontmatterChange} />
            <EditorPanel
              folder={activeFolder} slug={activeSlug}
              initialBody={essay.body}
              frontmatterRef={frontmatterRef} bodyRef={bodyRef}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select an essay or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
