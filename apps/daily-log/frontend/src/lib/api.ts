export interface Habit {
  id: number
  name: string
  kind: 'boolean' | 'number'
  active: boolean
}

export interface DayEntry {
  did_today: string
  doing_tomorrow: string
}

export interface HabitLog {
  habit_type_id: number
  value: boolean | number
}

export type HabitValues = Record<number, boolean | number>

export interface CalendarDay {
  date: string
  habits: Record<string, boolean | number>
}

export interface ArchiveDay {
  date: string
  did_today: string
  habits: Record<string, boolean | number>
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(path, opts)
  const data = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

export const api = {
  day: {
    get: (date: string) =>
      request<{ entry: DayEntry | null; habits: HabitLog[] }>('GET', `/api/day/${date}`),
    save: (date: string, body: { did_today: string | null; doing_tomorrow: string | null; habits: HabitValues }) =>
      request('PUT', `/api/day/${date}`, body),
  },
  calendar: {
    get: (year: number, month: number) =>
      request<{ days: CalendarDay[] }>('GET', `/api/calendar/${year}/${month}`),
  },
  archive: {
    get: () => request<{ days: ArchiveDay[] }>('GET', '/api/archive'),
  },
  habits: {
    list: () => request<{ habits: Habit[] }>('GET', '/api/habits'),
    create: (name: string, kind: 'boolean' | 'number') =>
      request('POST', '/api/habits', { name, kind }),
    update: (id: number, data: Partial<Pick<Habit, 'active' | 'name'>>) =>
      request('PATCH', `/api/habits/${id}`, data),
  },
}
