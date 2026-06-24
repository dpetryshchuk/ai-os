import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const PERSONAL_ROUTES = ['/', '/events', '/ideas', '/jobsearch/chat', '/writing', '/daily-log', '/look']
const BUSINESS_ROUTES = ['/proposals', '/revenue', '/outreach', '/okf-events']

// Use e.code (physical key position) so Option+1 on Mac fires even when e.key = '¡'
function digitFromCode(code: string): number | null {
  const m = code.match(/^Digit(\d)$/)
  return m ? parseInt(m[1]) : null
}

function letterFromCode(code: string): string | null {
  const m = code.match(/^Key([A-Z])$/)
  return m ? m[1].toLowerCase() : null
}

export function useKeyboardShortcuts(opts: {
  onToggleSidebar: () => void
  onToggleVoice?: () => void
  onShowShortcuts?: () => void
  isOkf: boolean
}) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // ? (no modifiers) — show shortcut helper
      if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        opts.onShowShortcuts?.()
        return
      }

      // Option/Alt + digit (1-9): navigate to nth section
      // e.code is reliable on Mac where Option+1 produces '¡' as e.key
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const n = digitFromCode(e.code)
        if (n !== null && n >= 1) {
          const routes = opts.isOkf ? BUSINESS_ROUTES : PERSONAL_ROUTES
          const route = routes[n - 1]
          if (route) { e.preventDefault(); navigate(route); return }
        }

        const letter = letterFromCode(e.code)

        // Option/Alt+C: go to chat
        if (letter === 'c') {
          e.preventDefault()
          navigate(opts.isOkf ? '/proposals' : '/jobsearch/chat')
          return
        }

        // Option/Alt+M: toggle voice input
        if (letter === 'm' && opts.onToggleVoice) {
          e.preventDefault()
          opts.onToggleVoice()
          return
        }
      }

      // ] — toggle sidebar (no modifiers)
      if (e.code === 'BracketRight' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        opts.onToggleSidebar()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, opts.isOkf, opts.onToggleSidebar, opts.onToggleVoice, opts.onShowShortcuts])
}
