import { beforeEach, afterAll, describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { getCalendarMonth } from '../src/calendar'
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

describe('getCalendarMonth', () => {
  it('returns empty array for a month with no data', async () => {
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result).toEqual([])
  })

  it('includes dates that have journal entries', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-10', 'something')")
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-05-10')
    expect(result[0].entry).toBe(true)
  })

  it('includes dates that have habit logs only', async () => {
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM habit_types LIMIT 1')
    await pool.query(
      'INSERT INTO habit_logs (habit_type_id, date, value) VALUES ($1, $2, $3)',
      [rows[0].id, '2026-05-11', JSON.stringify(true)]
    )
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result).toHaveLength(1)
    expect(result[0].entry).toBe(false)
    expect(result[0].habits[String(rows[0].id)]).toBe(true)
  })

  it('aggregates both entry and habits on the same date', async () => {
    const { rows } = await pool.query<{ id: number }>('SELECT id FROM habit_types LIMIT 1')
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-12', 'stuff')")
    await pool.query(
      'INSERT INTO habit_logs (habit_type_id, date, value) VALUES ($1, $2, $3)',
      [rows[0].id, '2026-05-12', JSON.stringify(false)]
    )
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result).toHaveLength(1)
    expect(result[0].entry).toBe(true)
    expect(result[0].habits[String(rows[0].id)]).toBe(false)
  })

  it('only returns dates within the requested month', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-04-30', 'april')")
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-01', 'may')")
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-06-01', 'june')")
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-05-01')
  })

  it('returns days sorted by date ascending', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-20', 'later')")
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-03', 'earlier')")
    const result = await getCalendarMonth(2026, 5, pool)
    expect(result[0].date).toBe('2026-05-03')
    expect(result[1].date).toBe('2026-05-20')
  })

  it('handles December correctly (month boundary wraps to next year)', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-12-31', 'new years eve')")
    const result = await getCalendarMonth(2026, 12, pool)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-12-31')
  })
})
