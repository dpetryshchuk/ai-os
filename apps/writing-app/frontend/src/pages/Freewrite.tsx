import '@fontsource/lato'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { freewriteApi } from '../lib/freewrite-api'
import { useEntries } from '../hooks/freewrite/useEntries'
import { useAutoSave } from '../hooks/freewrite/useAutoSave'
import { useTimer } from '../hooks/freewrite/useTimer'
import Editor from '../components/freewrite/Editor'
import BottomNav from '../components/freewrite/BottomNav'
import Sidebar from '../components/freewrite/Sidebar'

export default function Freewrite() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('freewrite_theme') as 'light' | 'dark') ?? 'light'
  )
  const [fontFamily, setFontFamily] = useState('Lato, sans-serif')
  const [fontSize, setFontSize] = useState(20)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [backspaceEnabled, setBackspaceEnabled] = useState(true)
  const [navVisible, setNavVisible] = useState(true)

  const { entries, createEntry, deleteEntry, refresh } = useEntries()
  const timer = useTimer()
  useAutoSave(activeId, text)

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('freewrite_theme', theme)
  }, [theme])

  // Hide nav when timer runs; re-show when it stops
  useEffect(() => {
    setNavVisible(!timer.running)
  }, [timer.running])

  // Backspace/Delete disable
  useEffect(() => {
    if (backspaceEnabled) return
    function block(e: KeyboardEvent) {
      if (e.key === 'Backspace' || e.key === 'Delete') e.preventDefault()
    }
    document.addEventListener('keydown', block)
    return () => document.removeEventListener('keydown', block)
  }, [backspaceEnabled])

  const hasAutoSelected = useRef(false)

  // Auto-select first entry on first load only
  useEffect(() => {
    if (hasAutoSelected.current || entries.length === 0) return
    hasAutoSelected.current = true
    selectEntry(entries[0].id)
  }, [entries])

  async function selectEntry(id: string) {
    const t = await freewriteApi.entries.get(id)
    setActiveId(id)
    setText(t)
  }

  async function handleNewEntry() {
    const id = await createEntry()
    setActiveId(id)
    setText('\n\n')
  }

  async function handleDelete(id: string) {
    await deleteEntry(id)
    if (activeId === id) {
      setActiveId(null)
      setText('')
    }
  }

  return (
    <div className={`flex h-screen bg-background text-foreground overflow-hidden relative`}>
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="flex flex-col border-r border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <button
              onClick={handleNewEntry}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              + New
            </button>
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              essays →
            </Link>
          </div>
          <Sidebar
            entries={entries}
            activeId={activeId}
            onSelect={selectEntry}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col relative">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute top-4 left-4 text-xs text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          {sidebarOpen ? '←' : '☰'}
        </button>

        <Editor
          text={text}
          onChange={setText}
          fontFamily={fontFamily}
          fontSize={fontSize}
        />

        {/* Bottom nav with hover-to-reveal when timer running */}
        <div
          onMouseEnter={() => setNavVisible(true)}
          onMouseLeave={() => setNavVisible(!timer.running)}
        >
          <BottomNav
            timerDisplay={timer.display}
            timerRunning={timer.running}
            onTimerToggle={timer.toggle}
            onTimerReset={timer.reset}
            onTimerAdjust={timer.adjustMinutes}
            backspaceEnabled={backspaceEnabled}
            onToggleBackspace={() => setBackspaceEnabled(b => !b)}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onFontFamilyChange={setFontFamily}
            onFontSizeChange={setFontSize}
            theme={theme}
            onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            text={text}
            visible={navVisible}
          />
        </div>
      </div>
    </div>
  )
}
