import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Nav routes for Alt/Option+1 through Alt/Option+7 (personal) and Alt+1-4 (business)
const PERSONAL_ROUTES = ['/', '/events', '/ideas', '/jobsearch/chat', '/writing', '/daily-log', '/look']
const BUSINESS_ROUTES = ['/proposals', '/revenue', '/outreach', '/okf-events']

// Maps e.code 'Digit1'-'Digit9' to 1-9
function digitFromCode(code: string): number | null {
  const m = code.match(/^Digit(\d)$/)
  return m ? parseInt(m[1]) : null
}

// Maps e.code 'KeyC', 'KeyM', etc. to the letter
function letterFromCode(code: string): string | null {
  const m = code.match(/^Key([A-Z])$/)
  return m ? m[1].toLowerCase() : null
}

export function useKeyboardShortcuts(opts: {
  onToggleSidebar: () => void
  onToggleVoice?: () => void
  isOkf: boolean
}) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when typing in input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Alt/Option+1-7: navigate to nth route
      // Use e.code (physical key) so Option+1 on Mac works even if e.key = '¡'
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const n = digitFromCode(e.code)
        if (n !== null && n >= 1) {
          const routes = opts.isOkf ? BUSINESS_ROUTES : PERSONAL_ROUTES
          const route = routes[n - 1]
          if (route) { e.preventDefault(); navigate(route) }
        }
        // Alt/Option+C: go to chat
        if (letterFromCode(e.code) === 'c') {
          e.preventDefault()
          navigate(opts.isOkf ? '/proposals' : '/jobsearch/chat')
        }
        // Alt/Option+M: toggle voice input
        if (letterFromCode(e.code) === 'm' && opts.onToggleVoice) {
          e.preventDefault()
          opts.onToggleVoice()
        }
      }

      // ] to toggle sidebar (no modifiers)
      if (e.key === ']' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        opts.onToggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, opts])
}
