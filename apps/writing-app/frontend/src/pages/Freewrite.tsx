import '@fontsource/lato'
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { freewriteApi } from '../lib/freewrite-api'
import { useEntries } from '../hooks/freewrite/useEntries'
import { useAutoSave } from '../hooks/freewrite/useAutoSave'
import { useTimer } from '../hooks/freewrite/useTimer'
import Editor from '../components/freewrite/Editor'
import BottomNav from '../components/freewrite/BottomNav'
import Sidebar from '../components/freewrite/Sidebar'

type FreewriteState = {
  theme: 'light' | 'dark'
  fontFamily: string
  fontSize: number
  sidebarOpen: boolean
  activeId: string | null
  text: string
  backspaceEnabled: boolean
  navVisible: boolean
}

type FreewriteAction =
  | { type: 'set_theme'; theme: 'light' | 'dark' }
  | { type: 'set_font_family'; fontFamily: string }
  | { type: 'set_font_size'; fontSize: number }
  | { type: 'toggle_sidebar' }
  | { type: 'set_entry'; id: string; text: string }
  | { type: 'clear_entry' }
  | { type: 'set_text'; text: string }
  | { type: 'toggle_backspace' }
  | { type: 'set_nav_visible'; visible: boolean }

function freewriteReducer(state: FreewriteState, action: FreewriteAction): FreewriteState {
  switch (action.type) {
    case 'set_theme': return { ...state, theme: action.theme }
    case 'set_font_family': return { ...state, fontFamily: action.fontFamily }
    case 'set_font_size': return { ...state, fontSize: action.fontSize }
    case 'toggle_sidebar': return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'set_entry': return { ...state, activeId: action.id, text: action.text }
    case 'clear_entry': return { ...state, activeId: null, text: '' }
    case 'set_text': return { ...state, text: action.text }
    case 'toggle_backspace': return { ...state, backspaceEnabled: !state.backspaceEnabled }
    case 'set_nav_visible': return { ...state, navVisible: action.visible }
  }
}

export default function Freewrite() {
  const [state, dispatch] = useReducer(freewriteReducer, undefined, () => ({
    theme: (localStorage.getItem('freewrite_theme') as 'light' | 'dark') ?? 'light',
    fontFamily: 'Lato, sans-serif',
    fontSize: 20,
    sidebarOpen: true,
    activeId: null,
    text: '',
    backspaceEnabled: true,
    navVisible: true,
  }))
  const { theme, fontFamily, fontSize, sidebarOpen, activeId, text, backspaceEnabled, navVisible } = state

  const { entries, createEntry, deleteEntry } = useEntries()
  const timer = useTimer()
  useAutoSave(activeId, text)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('freewrite_theme', theme)
  }, [theme])

  useEffect(() => {
    dispatch({ type: 'set_nav_visible', visible: !timer.running })
  }, [timer.running])

  useEffect(() => {
    if (backspaceEnabled) return
    function block(e: KeyboardEvent) {
      if (e.key === 'Backspace' || e.key === 'Delete') e.preventDefault()
    }
    document.addEventListener('keydown', block)
    return () => document.removeEventListener('keydown', block)
  }, [backspaceEnabled])

  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (hasAutoSelected.current || entries.length === 0) return
    hasAutoSelected.current = true
    selectEntry(entries[0].id)
  }, [entries])

  const selectEntry = useCallback(async (id: string) => {
    const t = await freewriteApi.entries.get(id)
    dispatch({ type: 'set_entry', id, text: t })
  }, [])

  async function handleNewEntry() {
    const id = await createEntry()
    dispatch({ type: 'set_entry', id, text: '\n\n' })
  }

  async function handleDelete(id: string) {
    await deleteEntry(id)
    if (activeId === id) {
      dispatch({ type: 'clear_entry' })
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
          onClick={() => dispatch({ type: 'toggle_sidebar' })}
          className="absolute top-4 left-4 text-xs text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          {sidebarOpen ? '←' : '☰'}
        </button>

        <Editor
          text={text}
          onChange={t => dispatch({ type: 'set_text', text: t })}
          fontFamily={fontFamily}
          fontSize={fontSize}
        />

        {/* Bottom nav with hover-to-reveal when timer running */}
        <div
          onMouseEnter={() => dispatch({ type: 'set_nav_visible', visible: true })}
          onMouseLeave={() => dispatch({ type: 'set_nav_visible', visible: !timer.running })}
        >
          <BottomNav
            timerDisplay={timer.display}
            timerRunning={timer.running}
            onTimerToggle={timer.toggle}
            onTimerReset={timer.reset}
            onTimerAdjust={timer.adjustMinutes}
            backspaceEnabled={backspaceEnabled}
            onToggleBackspace={() => dispatch({ type: 'toggle_backspace' })}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onFontFamilyChange={ff => dispatch({ type: 'set_font_family', fontFamily: ff })}
            onFontSizeChange={fs => dispatch({ type: 'set_font_size', fontSize: fs })}
            theme={theme}
            onThemeToggle={() => dispatch({ type: 'set_theme', theme: theme === 'dark' ? 'light' : 'dark' })}
            text={text}
            visible={navVisible}
          />
        </div>
      </div>
    </div>
  )
}
