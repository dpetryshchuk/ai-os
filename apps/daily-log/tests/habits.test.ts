import { beforeEach, afterAll, describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import {
  listHabitTypes,
  createHabitType,
  updateHabitType,
  getHabitLogs,
  upsertHabitLog
} from '../src/habits'
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

describe('listHabitTypes', () => {
  it('returns the seeded habit', async () => {
    const result = await listHabitTypes(pool)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('creatine')
    expect(result[0].kind).toBe('boolean')
    expect(result[0].active).toBe(true)
  })

  it('returns both active and inactive habits', async () => {
    await pool.query("INSERT INTO habit_types (name, kind, active) VALUES ('sleep', 'number', false)")
    const result = await listHabitTypes(pool)
    expect(result).toHaveLength(2)
  })
})

describe('createHabitType', () => {
  it('creates a new boolean habit', async () => {
    const habit = await createHabitType('pushups', 'boolean', pool)
    expect(habit.name).toBe('pushups')
    expect(habit.kind).toBe('boolean')
    expect(habit.active).toBe(true)
    expect(habit.id).toBeTypeOf('number')
  })

  it('creates a new number habit', async () => {
    const habit = await createHabitType('sleep hours', 'number', pool)
    expect(habit.kind).toBe('number')
  })

  it('rejects duplicate names', async () => {
    await expect(createHabitType('creatine', 'boolean', pool)).rejects.toThrow()
  })
})

describe('updateHabitType', () => {
  it('renames a habit', async () => {
    const habits = await listHabitTypes(pool)
    const updated = await updateHabitType(habits[0].id, { name: 'creatine monohydrate' }, pool)
    expect(updated.name).toBe('creatine monohydrate')
  })

  it('deactivates a habit', async () => {
    const habits = await listHabitTypes(pool)
    const updated = await updateHabitType(habits[0].id, { active: false }, pool)
    expect(updated.active).toBe(false)
  })

  it('reactivates a habit', async () => {
    const habits = await listHabitTypes(pool)
    await updateHabitType(habits[0].id, { active: false }, pool)
    const updated = await updateHabitType(habits[0].id, { active: true }, pool)
    expect(updated.active).toBe(true)
  })

  it('throws when habit not found', async () => {
    await expect(updateHabitType(9999, { name: 'ghost' }, pool)).rejects.toThrow()
  })
})

describe('getHabitLogs', () => {
  it('returns empty array when no logs exist', async () => {
    const result = await getHabitLogs('2026-05-01', pool)
    expect(result).toEqual([])
  })

  it('returns logs for a date', async () => {
    const habits = await listHabitTypes(pool)
    await pool.query(
      'INSERT INTO habit_logs (habit_type_id, date, value) VALUES ($1, $2, $3)',
      [habits[0].id, '2026-05-01', JSON.stringify(true)]
    )
    const result = await getHabitLogs('2026-05-01', pool)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(true)
    expect(result[0].habit_type_id).toBe(habits[0].id)
  })
})

describe('upsertHabitLog', () => {
  it('creates a habit log', async () => {
    const habits = await listHabitTypes(pool)
    await upsertHabitLog(habits[0].id, '2026-05-02', true, pool)
    const logs = await getHabitLogs('2026-05-02', pool)
    expect(logs[0].value).toBe(true)
  })

  it('updates an existing log', async () => {
    const habits = await listHabitTypes(pool)
    await upsertHabitLog(habits[0].id, '2026-05-03', true, pool)
    await upsertHabitLog(habits[0].id, '2026-05-03', false, pool)
    const logs = await getHabitLogs('2026-05-03', pool)
    expect(logs[0].value).toBe(false)
  })

  it('stores number values', async () => {
    await pool.query("INSERT INTO habit_types (name, kind) VALUES ('sleep', 'number')")
    const habits = await listHabitTypes(pool)
    const sleepHabit = habits.find(h => h.name === 'sleep')!
    await upsertHabitLog(sleepHabit.id, '2026-05-04', 7.5, pool)
    const logs = await getHabitLogs('2026-05-04', pool)
    const sleepLog = logs.find(l => l.habit_type_id === sleepHabit.id)!
    expect(sleepLog.value).toBe(7.5)
  })
})
