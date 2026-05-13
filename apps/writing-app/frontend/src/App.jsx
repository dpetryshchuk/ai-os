import { useState, useEffect, useRef } from 'react'
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
  const bodyRef = useRef('')

  async function loadList() {
    const [f, e] = await Promise.all([api.folders.list(), api.essays.list()])
    setFolders(f)
    setEssays(e)
  }

  useEffect(() => { loadList() }, [])

  async function selectEssay(folder, slug) {
    const data = await api.essays.read(folder, slug)
    setActiveFolder(folder)
    setActiveSlug(slug)
    setEssay({ frontmatter: data.frontmatter, body: data.body })
    frontmatterRef.current = data.frontmatter
    bodyRef.current = data.body
  }

  function handleFrontmatterChange(fm) {
    setEssay(e => ({ ...e, frontmatter: fm }))
    frontmatterRef.current = fm
    // autosave frontmatter immediately on blur-triggered change
    if (activeFolder && activeSlug) {
      api.essays.write(activeFolder, activeSlug, fm, bodyRef.current)
    }
  }

  async function handleCreateEssay(folder, title) {
    const created = await api.essays.create(folder, title)
    await loadList()
    await selectEssay(created.folder, created.slug)
  }

  async function handleDeleteEssay(folder, slug) {
    try {
      await api.essays.delete(folder, slug)
      if (activeFolder === folder && activeSlug === slug) {
        setActiveFolder(null); setActiveSlug(null); setEssay(null)
      }
      await loadList()
    } catch (e) { alert(`Delete failed: ${e.message}`) }
  }

  async function handleMoveEssay(folder, slug, targetFolder) {
    try {
      await api.essays.move(folder, slug, targetFolder)
      await loadList()
      if (activeFolder === folder && activeSlug === slug) {
        setActiveFolder(targetFolder)
      }
    } catch (e) { alert(`Move failed: ${e.message}`) }
  }

  async function handleCreateFolder(name) {
    try {
      await api.folders.create(name)
      await loadList()
    } catch (e) { alert(`Create folder failed: ${e.message}`) }
  }

  async function handleRenameFolder(oldName, newName) {
    try {
      await api.folders.rename(oldName, newName)
      if (activeFolder === oldName) setActiveFolder(newName)
      await loadList()
    } catch (e) { alert(`Rename failed: ${e.message}`) }
  }

  async function handleDeleteFolder(name) {
    try {
      await api.folders.delete(name)
      await loadList()
    } catch (e) { alert(`Delete folder failed: ${e.message}`) }
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
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
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
              bodyRef={bodyRef}
              essays={essays}
              onSelectEssay={selectEssay}
              onCreateEssay={handleCreateEssay}
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
