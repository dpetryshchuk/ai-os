import { beforeEach, afterAll, describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { getEntry, upsertEntry } from '../src/entries'
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

describe('getEntry', () => {
  it('returns null for a date with no entry', async () => {
    const result = await getEntry('2026-05-01', pool)
    expect(result).toBeNull()
  })

  it('returns the entry when it exists', async () => {
    await pool.query(
      "INSERT INTO entries (date, did_today) VALUES ('2026-05-01', 'wrote tests')"
    )
    const result = await getEntry('2026-05-01', pool)
    expect(result).not.toBeNull()
    expect(result!.did_today).toBe('wrote tests')
    expect(result!.doing_tomorrow).toBeNull()
  })
})

describe('upsertEntry', () => {
  it('creates a new entry', async () => {
    await upsertEntry('2026-05-02', { did_today: 'did stuff', doing_tomorrow: 'do more' }, pool)
    const result = await getEntry('2026-05-02', pool)
    expect(result!.did_today).toBe('did stuff')
    expect(result!.doing_tomorrow).toBe('do more')
  })

  it('updates an existing entry', async () => {
    await pool.query("INSERT INTO entries (date, did_today) VALUES ('2026-05-03', 'original')")
    await upsertEntry('2026-05-03', { did_today: 'updated' }, pool)
    const result = await getEntry('2026-05-03', pool)
    expect(result!.did_today).toBe('updated')
  })

  it('preserves existing fields when only some are provided', async () => {
    await pool.query(
      "INSERT INTO entries (date, did_today, doing_tomorrow) VALUES ('2026-05-04', 'did', 'will do')"
    )
    await upsertEntry('2026-05-04', { did_today: 'revised' }, pool)
    const result = await getEntry('2026-05-04', pool)
    expect(result!.did_today).toBe('revised')
    expect(result!.doing_tomorrow).toBe('will do')
  })
})
