import { useEffect, useRef } from 'react'

export function useAgentRefresh(callback: () => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const handler = () => callbackRef.current()
    window.addEventListener('agent:mutation', handler)
    return () => window.removeEventListener('agent:mutation', handler)
  }, [])
}
