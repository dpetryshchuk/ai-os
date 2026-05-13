import express from 'express'
import path from 'path'
import { getEntry, upsertEntry, listAllEntries } from './src/entries'
import {
  listHabitTypes, createHabitType, updateHabitType,
  getHabitLogs, upsertHabitLog
} from './src/habits'
import { getCalendarMonth } from './src/calendar'

export const app = express()
app.use(express.json())

// GET /api/day/:date
app.get('/api/day/:date', async (req, res) => {
  try {
    const { date } = req.params
    const [entry, habits] = await Promise.all([
      getEntry(date),
      getHabitLogs(date)
    ])
    res.json({ ok: true, entry, habits })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// PUT /api/day/:date
app.put('/api/day/:date', async (req, res) => {
  try {
    const { date } = req.params
    const { did_today, doing_tomorrow, habits } = req.body as {
      did_today?: string
      doing_tomorrow?: string
      habits?: Record<string, boolean | number>
    }

    if (did_today !== undefined || doing_tomorrow !== undefined) {
      await upsertEntry(date, { did_today, doing_tomorrow })
    }

    if (habits) {
      await Promise.all(
        Object.entries(habits).map(([id, value]) =>
          upsertHabitLog(Number(id), date, value)
        )
      )
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/calendar/:year/:month
app.get('/api/calendar/:year/:month', async (req, res) => {
  try {
    const year = Number(req.params.year)
    const month = Number(req.params.month)
    const days = await getCalendarMonth(year, month)
    res.json({ ok: true, days })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/archive
app.get('/api/archive', async (_req, res) => {
  try {
    const days = await listAllEntries()
    res.json({ ok: true, days })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/habits
app.get('/api/habits', async (_req, res) => {
  try {
    const habits = await listHabitTypes()
    res.json({ ok: true, habits })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/habits
app.post('/api/habits', async (req, res) => {
  try {
    const { name, kind } = req.body as { name?: string; kind?: string }
    if (!name || !kind) {
      return res.status(400).json({ ok: false, error: 'name and kind are required' })
    }
    if (kind !== 'boolean' && kind !== 'number') {
      return res.status(400).json({ ok: false, error: 'kind must be boolean or number' })
    }
    const habit = await createHabitType(name, kind)
    res.status(201).json({ ok: true, habit })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// PATCH /api/habits/:id
app.patch('/api/habits/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, active } = req.body as { name?: string; active?: boolean }
    const habit = await updateHabitType(id, { name, active })
    res.json({ ok: true, habit })
  } catch (e: any) {
    if (e.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: e.message })
    }
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Serve frontend in production
// __dirname is dist/ at runtime, public/ lives at project root
app.use(express.static(path.join(__dirname, '..', 'public')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

if (require.main === module) {
  const PORT = Number(process.env.PORT ?? 4113)
  app.listen(PORT, () => console.log(`daily-log listening on :${PORT}`))
}
