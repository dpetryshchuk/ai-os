import { useState, useEffect, useRef, useCallback } from 'react'

const DEFAULT_SECONDS = 900 // 15 minutes

export function useTimer() {
  const [total, setTotal] = useState(DEFAULT_SECONDS)
  const [remaining, setRemaining] = useState(DEFAULT_SECONDS)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          setRunning(false)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const toggle = useCallback(() => setRunning(r => !r), [])

  const reset = useCallback(() => {
    setRunning(false)
    setRemaining(total)
  }, [total])

  const adjustMinutes = useCallback((delta: number) => {
    setTotal(t => {
      const next = Math.max(0, Math.min(2700, t + delta * 60))
      setRemaining(next)
      return next
    })
    setRunning(false)
  }, [])

  const display = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`

  return { display, running, remaining, toggle, reset, adjustMinutes }
}
