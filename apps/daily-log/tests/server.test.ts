import { beforeEach, afterAll, describe, it, expect } from 'vitest'
import request from 'supertest'
import { Pool } from 'pg'
import { app } from '../server'
import { closePool } from '../src/db'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeEach(async () => {
  await pool.query('DELETE FROM habit_logs')
  await pool.query('DELETE FROM entries')
  await pool.query('DELETE FROM habit_types')
  await pool.query("INSERT INTO habit_types (name, kind) VALUES ('creatine', 'boolean')")
})

afterAll(async () => {
  await pool.end()
  await closePool()
})

describe('GET /api/day/:date', () => {
  it('returns null entry and empty habits for a new date', async () => {
    const res = await request(app).get('/api/day/2026-05-11')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.entry).toBeNull()
    expect(res.body.habits).toEqual([])
  })

  it('returns existing entry and habits', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-11', 'wrote code')")
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM habit_types LIMIT 1')
    await pool.query(
      'INSERT INTO habit_logs (habit_type_id, date, value) VALUES ($1, $2, $3)',
      [rows[0].id, '2026-05-11', JSON.stringify(true)]
    )
    const res = await request(app).get('/api/day/2026-05-11')
    expect(res.status).toBe(200)
    expect(res.body.entry.did_today).toBe('wrote code')
    expect(res.body.habits).toHaveLength(1)
    expect(res.body.habits[0].value).toBe(true)
  })
})

describe('PUT /api/day/:date', () => {
  it('saves journal fields', async () => {
    const res = await request(app)
      .put('/api/day/2026-05-12')
      .send({ did_today: 'shipped it', doing_tomorrow: 'rest' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const check = await request(app).get('/api/day/2026-05-12')
    expect(check.body.entry.did_today).toBe('shipped it')
  })

  it('saves habit logs', async () => {
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM habit_types LIMIT 1')
    const res = await request(app)
      .put('/api/day/2026-05-12')
      .send({ habits: { [rows[0].id]: true } })
    expect(res.status).toBe(200)
    const check = await request(app).get('/api/day/2026-05-12')
    expect(check.body.habits[0].value).toBe(true)
  })
})

describe('GET /api/calendar/:year/:month', () => {
  it('returns empty days for empty month', async () => {
    const res = await request(app).get('/api/calendar/2026/5')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.days).toEqual([])
  })

  it('returns days with data', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-11', 'logged')")
    const res = await request(app).get('/api/calendar/2026/5')
    expect(res.body.days).toHaveLength(1)
    expect(res.body.days[0].date).toBe('2026-05-11')
    expect(res.body.days[0].entry).toBe(true)
  })
})

describe('GET /api/habits', () => {
  it('returns all habit types', async () => {
    const res = await request(app).get('/api/habits')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.habits).toHaveLength(1)
    expect(res.body.habits[0].name).toBe('creatine')
  })
})

describe('POST /api/habits', () => {
  it('creates a new habit', async () => {
    const res = await request(app)
      .post('/api/habits')
      .send({ name: 'pushups', kind: 'boolean' })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.habit.name).toBe('pushups')
    expect(res.body.habit.id).toBeTypeOf('number')
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/habits').send({ kind: 'boolean' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })
})

describe('PATCH /api/habits/:id', () => {
  it('toggles a habit inactive', async () => {
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM habit_types LIMIT 1')
    const res = await request(app)
      .patch(`/api/habits/${rows[0].id}`)
      .send({ active: false })
    expect(res.status).toBe(200)
    expect(res.body.habit.active).toBe(false)
  })

  it('returns 404 for unknown habit id', async () => {
    const res = await request(app).patch('/api/habits/9999').send({ active: false })
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })
})
