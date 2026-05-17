import { useEffect, useRef } from 'react'
import { freewriteApi } from '../../lib/freewrite-api'

export function useAutoSave(entryId: string | null, text: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!entryId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      freewriteApi.entries.save(entryId, text).catch(console.error)
    }, 500)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        freewriteApi.entries.save(entryId, text).catch(console.error)
      }
    }
  }, [entryId, text])
}
