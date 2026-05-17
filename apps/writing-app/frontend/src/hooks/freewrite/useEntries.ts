import { useState, useEffect, useCallback } from 'react'
import { freewroteApi, type Entry } from '../../lib/freewrite-api'

export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setEntries(await freewroteApi.entries.list())
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const createEntry = useCallback(async (): Promise<string> => {
    const id = await freewroteApi.entries.create()
    await refresh()
    return id
  }, [refresh])

  const deleteEntry = useCallback(async (id: string) => {
    await freewroteApi.entries.delete(id)
    await refresh()
  }, [refresh])

  return { entries, loading, refresh, createEntry, deleteEntry }
}
