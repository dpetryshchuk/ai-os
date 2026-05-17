import { useState, useEffect, useCallback } from 'react'
import { freewriteApi, type Entry } from '../../lib/freewrite-api'

export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setEntries(await freewriteApi.entries.list())
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const createEntry = useCallback(async (): Promise<string> => {
    const id = await freewriteApi.entries.create()
    await refresh()
    return id
  }, [refresh])

  const deleteEntry = useCallback(async (id: string) => {
    await freewriteApi.entries.delete(id)
    await refresh()
  }, [refresh])

  return { entries, loading, refresh, createEntry, deleteEntry }
}
