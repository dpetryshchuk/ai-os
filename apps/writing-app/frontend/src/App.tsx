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
  const frontmatterRef = useRef<Frontmatter | null>(null)
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
