import { useReducer, useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { api, type Essay, type EssayData, type Frontmatter } from './lib/api'
import Sidebar from './components/Sidebar'
import FrontmatterBar from './components/FrontmatterBar'
import Editor from './components/Editor'
import FreewritePage from './pages/Freewrite'

type AppState = {
  folders: string[]
  essays: Essay[]
  activeFolder: string | null
  activeSlug: string | null
  essay: EssayData | null
  commitMessage: string
}

type AppAction =
  | { type: 'set_list'; folders: string[]; essays: Essay[] }
  | { type: 'select_essay'; folder: string; slug: string; data: EssayData }
  | { type: 'deselect_essay' }
  | { type: 'set_essay'; essay: EssayData }
  | { type: 'move_essay'; folder: string }
  | { type: 'set_commit_message'; message: string }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set_list': return { ...state, folders: action.folders, essays: action.essays }
    case 'select_essay': return { ...state, activeFolder: action.folder, activeSlug: action.slug, essay: action.data }
    case 'deselect_essay': return { ...state, activeFolder: null, activeSlug: null, essay: null }
    case 'set_essay': return { ...state, essay: action.essay }
    case 'move_essay': return { ...state, activeFolder: action.folder }
    case 'set_commit_message': return { ...state, commitMessage: action.message }
  }
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, {
    folders: [],
    essays: [],
    activeFolder: null,
    activeSlug: null,
    essay: null,
    commitMessage: '',
  })
  const { folders, essays, activeFolder, activeSlug, essay, commitMessage } = state
  const frontmatterRef = useRef<Frontmatter | null>(null)
  const bodyRef = useRef<string>('')

  async function loadList() {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    dispatch({ type: 'set_list', folders: f, essays: e })
  }

  useEffect(() => { loadList() }, [])

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
    if (activeFolder && activeSlug) {
      api.essays.write(activeFolder, activeSlug, fm, bodyRef.current)
    }
  }

  async function handleCreateEssay(folder: string, title: string) {
    const created = await api.essays.create(folder, title)
    await Promise.all([loadList(), selectEssay(created.folder, created.slug)])
  }

  async function handleDeleteEssay(folder: string, slug: string) {
    try {
      await api.essays.delete(folder, slug)
      if (activeFolder === folder && activeSlug === slug) {
        dispatch({ type: 'deselect_essay' })
      }
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

  async function handleCreateFolder(name: string) {
    try { await api.folders.create(name); await loadList() }
    catch (e) { alert(`Create folder failed: ${(e as Error).message}`) }
  }

  async function handleRenameFolder(oldName: string, newName: string) {
    try {
      await api.folders.rename(oldName, newName)
      if (activeFolder === oldName) dispatch({ type: 'move_essay', folder: newName })
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
      dispatch({ type: 'set_commit_message', message: '' })
    } catch (e) { alert(`Push failed: ${(e as Error).message}`) }
  }

  return (
    <Routes>
      <Route path="/freewrite" element={<FreewritePage />} />
      <Route path="/*" element={
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            folders={folders} essays={essays}
            activeFolder={activeFolder} activeSlug={activeSlug}
            onSelectEssay={selectEssay} onCreateEssay={handleCreateEssay}
            onDeleteEssay={handleDeleteEssay} onMoveEssay={handleMoveEssay}
            onCreateFolder={handleCreateFolder} onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder} onPull={handlePull}
            commitMessage={commitMessage} onCommitMessageChange={msg => dispatch({ type: 'set_commit_message', message: msg })}
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
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Select an essay or create a new one
              </div>
            )}
          </div>
        </div>
      } />
    </Routes>
  )
}
