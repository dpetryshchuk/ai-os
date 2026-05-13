const BASE = '/api'

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  essays: {
    list: () => request('GET', '/essays').then(d => d.essays),
    read: (folder, slug) => request('GET', `/essays/${folder}/${slug}`).then(d => d.essay),
    write: (folder, slug, frontmatter, body) =>
      request('PUT', `/essays/${folder}/${slug}`, { frontmatter, body }),
    create: (folder, title) => request('POST', '/essays', { folder, title }).then(d => d.essay),
    delete: (folder, slug) => request('DELETE', `/essays/${folder}/${slug}`),
    move: (folder, slug, targetFolder) =>
      request('PATCH', `/essays/${folder}/${slug}/move`, { folder: targetFolder }),
  },
  folders: {
    list: () => request('GET', '/folders').then(d => d.folders),
    create: (name) => request('POST', '/folders', { name }),
    rename: (folder, name) => request('PATCH', `/folders/${folder}`, { name }),
    delete: (folder) => request('DELETE', `/folders/${folder}`),
  },
  git: {
    pull: () => request('POST', '/git/pull').then(d => d.output),
    push: (message) => request('POST', '/git/push', { message }).then(d => d.output),
  },
}
