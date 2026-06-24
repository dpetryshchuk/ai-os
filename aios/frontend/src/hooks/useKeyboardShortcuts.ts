import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Nav routes for Alt+1 through Alt+7 (personal) and Alt+1-4 (business)
const PERSONAL_ROUTES = ['/', '/events', '/ideas', '/jobsearch/chat', '/writing', '/daily-log', '/look']
const BUSINESS_ROUTES = ['/proposals', '/revenue', '/outreach', '/okf-events']

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

      // Alt+1-7: navigate to nth route
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const n = parseInt(e.key)
        if (!isNaN(n) && n >= 1) {
          const routes = opts.isOkf ? BUSINESS_ROUTES : PERSONAL_ROUTES
          const route = routes[n - 1]
          if (route) { e.preventDefault(); navigate(route) }
        }
        // Alt+C: go to chat
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault()
          navigate(opts.isOkf ? '/proposals' : '/jobsearch/chat')
        }
        // Alt+M: toggle voice input
        if ((e.key === 'm' || e.key === 'M') && opts.onToggleVoice) {
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
