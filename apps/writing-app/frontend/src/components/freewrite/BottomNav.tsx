import { useState } from 'react'
import Timer from './Timer'
import ChatPopover from './ChatPopover'

const FONTS = ['Lato, sans-serif', 'Arial, sans-serif', 'system-ui, sans-serif', 'Georgia, serif']
const FONT_SIZES = [16, 18, 20, 22, 24, 26]

interface Props {
  timerDisplay: string
  timerRunning: boolean
  onTimerToggle: () => void
  onTimerReset: () => void
  onTimerAdjust: (delta: number) => void
  backspaceEnabled: boolean
  onToggleBackspace: () => void
  fontFamily: string
  fontSize: number
  onFontFamilyChange: (f: string) => void
  onFontSizeChange: (s: number) => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  text: string
  visible: boolean
}

export default function BottomNav({
  timerDisplay, timerRunning, onTimerToggle, onTimerReset, onTimerAdjust,
  backspaceEnabled, onToggleBackspace,
  fontFamily, fontSize, onFontFamilyChange, onFontSizeChange,
  theme, onThemeToggle, text, visible,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false)

  function cycleFont() {
    const idx = Math.max(0, FONTS.indexOf(fontFamily))
    onFontFamilyChange(FONTS[(idx + 1) % FONTS.length])
  }

  function cycleSize() {
    const idx = Math.max(0, FONT_SIZES.indexOf(fontSize))
    onFontSizeChange(FONT_SIZES[(idx + 1) % FONT_SIZES.length])
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 px-8 py-4 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      <Timer
        display={timerDisplay}
        running={timerRunning}
        onToggle={onTimerToggle}
        onReset={onTimerReset}
        onAdjustMinutes={onTimerAdjust}
      />

      <button
        onClick={onToggleBackspace}
        className="text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        {backspaceEnabled ? 'Backspace On' : 'Backspace Off'}
      </button>

      <button onClick={cycleFont} className="text-xs opacity-60 hover:opacity-100 transition-opacity">
        Aa
      </button>

      <button onClick={cycleSize} className="text-xs opacity-60 hover:opacity-100 transition-opacity">
        {fontSize}px
      </button>

      <div className="relative">
        <button
          onClick={() => setChatOpen(o => !o)}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
        >
          Chat
        </button>
        {chatOpen && <ChatPopover text={text} onClose={() => setChatOpen(false)} />}
      </div>

      <button onClick={onThemeToggle} className="text-xs opacity-60 hover:opacity-100 transition-opacity">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  )
}
