import { useEffect, useRef, useCallback, useReducer } from 'react'

const DEFAULT_SECONDS = 900 // 15 minutes

type TimerState = {
  total: number
  remaining: number
  running: boolean
}

type TimerAction =
  | { type: 'toggle' }
  | { type: 'tick' }
  | { type: 'reset' }
  | { type: 'adjust_minutes'; delta: number }

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'toggle':
      return { ...state, running: !state.running }
    case 'tick': {
      const next = state.remaining - 1
      if (next <= 0) return { ...state, remaining: 0, running: false }
      return { ...state, remaining: next }
    }
    case 'reset':
      return { ...state, remaining: state.total, running: false }
    case 'adjust_minutes': {
      const next = Math.max(0, Math.min(2700, state.total + action.delta * 60))
      return { total: next, remaining: next, running: false }
    }
  }
}

export function useTimer() {
  const [state, dispatch] = useReducer(timerReducer, {
    total: DEFAULT_SECONDS,
    remaining: DEFAULT_SECONDS,
    running: false,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!state.running) return
    intervalRef.current = setInterval(() => {
      dispatch({ type: 'tick' })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [state.running])

  const toggle = useCallback(() => dispatch({ type: 'toggle' }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const adjustMinutes = useCallback((delta: number) => dispatch({ type: 'adjust_minutes', delta }), [])

  const display = `${String(Math.floor(state.remaining / 60)).padStart(2, '0')}:${String(state.remaining % 60).padStart(2, '0')}`

  return { display, running: state.running, remaining: state.remaining, toggle, reset, adjustMinutes }
}
