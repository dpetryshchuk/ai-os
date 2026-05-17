import { useEffect, useRef } from 'react'
import { freewroteApi } from '../../lib/freewrite-api'

export function useAutoSave(entryId: string | null, text: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!entryId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      freewroteApi.entries.save(entryId, text).catch(console.error)
    }, 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [entryId, text])
}
