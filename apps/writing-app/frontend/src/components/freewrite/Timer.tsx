import { useRef, useEffect } from 'react'

interface Props {
  display: string
  running: boolean
  onToggle: () => void
  onReset: () => void
  onAdjustMinutes: (delta: number) => void
}

export default function Timer({ display, running, onToggle, onReset, onAdjustMinutes }: Props) {
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current) }
  }, [])

  function handleClick() {
    clickCountRef.current += 1
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) onToggle()
      else onReset()
      clickCountRef.current = 0
    }, 220)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    onAdjustMinutes(e.deltaY < 0 ? 1 : -1)
  }

  return (
    <button
      onClick={handleClick}
      onWheel={handleWheel}
      className={`font-mono text-sm tabular-nums transition-opacity select-none cursor-pointer ${running ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
    >
      {display}
    </button>
  )
}
