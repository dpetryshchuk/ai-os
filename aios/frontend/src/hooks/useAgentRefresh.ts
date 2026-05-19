import { useEffect } from 'react'

export function useAgentRefresh(callback: () => void) {
  useEffect(() => {
    window.addEventListener('agent:mutation', callback)
    return () => window.removeEventListener('agent:mutation', callback)
  }, [callback])
}
