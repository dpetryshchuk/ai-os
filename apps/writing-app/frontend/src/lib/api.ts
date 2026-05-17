export interface Essay {
  folder: string
  slug: string
  title: string
}

export interface EssayData {
  frontmatter: Frontmatter
  body: string
}

export interface Frontmatter {
  title?: string
  tags?: string[]
  status?: string
  date?: string
  description?: string
  toc?: boolean
  [key: string]: unknown
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export const api = {
  essays: {
    list: () => request<{ essays: Essay[] }>('GET', '/essays').then(d => d.essays),
    read: (folder: string, slug: string) =>
      request<{ essay: EssayData }>('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder: string, slug: string, frontmatter: Frontmatter, body: string) =>
      request('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder: string, title: string) =>
      request<{ essay: Essay }>('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder: string, slug: string) =>
      request('DELETE', `/essays/${folder}/${slug}`),
    move: (folder: string, slug: string, targetFolder: string) =>
      request('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => request<{ folders: string[] }>('GET', '/folders').then(d => d.folders),
    create: (name: string) => request('POST', '/folders', { name }),
    rename: (folder: string, name: string) => request('PATCH', `/folders/${folder}`, { name }),
    delete: (folder: string) => request('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => request<{ output: string }>('POST', '/git/pull').then(d => d.output),
    push: (message: string) =>
      request<{ output: string }>('POST', '/git/push', { message }).then(d => d.output),
  },
}
