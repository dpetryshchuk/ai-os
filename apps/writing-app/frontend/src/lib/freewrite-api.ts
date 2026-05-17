export interface Entry {
  id: string
  created_at: string
  is_video: boolean
  preview: string
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/freewrite' + path, {
    method,
    headers: body != null && !(body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {},
    body: body instanceof FormData
      ? body
      : body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export const freewroteApi = {
  entries: {
    list: () => req<{ entries: Entry[] }>('GET', '/entries').then(d => d.entries),
    create: () => req<{ id: string }>('POST', '/entries').then(d => d.id),
    get: (id: string) => req<{ text: string }>('GET', `/entries/${id}`).then(d => d.text),
    save: (id: string, text: string) => req('PUT', `/entries/${id}`, { text }),
    delete: (id: string) => req('DELETE', `/entries/${id}`),
  },
}
