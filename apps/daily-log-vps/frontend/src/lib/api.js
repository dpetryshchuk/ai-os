async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(path, opts)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export const api = {
  day: {
    get: (date) => request('GET', `/api/day/${date}`),
    save: (date, body) => request('PUT', `/api/day/${date}`, body)
  },
  calendar: {
    get: (year, month) => request('GET', `/api/calendar/${year}/${month}`)
  },
  archive: {
    get: () => request('GET', '/api/archive')
  },
  habits: {
    list: () => request('GET', '/api/habits'),
    create: (name, kind) => request('POST', '/api/habits', { name, kind }),
    update: (id, data) => request('PATCH', `/api/habits/${id}`, data)
  }
}
