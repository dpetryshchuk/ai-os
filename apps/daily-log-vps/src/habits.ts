import { Pool } from 'pg'
import { getPool } from './db'
import type { HabitType, HabitLog } from './types'

export async function listHabitTypes(pool?: Pool): Promise<HabitType[]> {
  const db = pool ?? getPool()
  const { rows } = await db.query<HabitType>(
    'SELECT id, name, kind, active, created_at::text FROM habit_types ORDER BY id'
  )
  return rows
}

export async function createHabitType(
  name: string,
  kind: 'boolean' | 'number',
  pool?: Pool
): Promise<HabitType> {
  const db = pool ?? getPool()
  const { rows } = await db.query<HabitType>(
    `INSERT INTO habit_types (name, kind)
     VALUES ($1, $2)
     RETURNING id, name, kind, active, created_at::text`,
    [name, kind]
  )
  return rows[0]
}

export async function updateHabitType(
  id: number,
  data: { name?: string; active?: boolean },
  pool?: Pool
): Promise<HabitType> {
  const db = pool ?? getPool()
  const { rows } = await db.query<HabitType>(
    `UPDATE habit_types SET
       name = COALESCE($2, name),
       active = COALESCE($3, active)
     WHERE id = $1
     RETURNING id, name, kind, active, created_at::text`,
    [id, data.name !== undefined ? data.name : null, data.active !== undefined ? data.active : null]
  )
  if (!rows[0]) throw new Error(`Habit type ${id} not found`)
  return rows[0]
}

export async function getHabitLogs(date: string, pool?: Pool): Promise<HabitLog[]> {
  const db = pool ?? getPool()
  const { rows } = await db.query<{ habit_type_id: number; date: string; value: string }>(
    'SELECT habit_type_id, date::text, value FROM habit_logs WHERE date = $1',
    [date]
  )
  return rows.map(r => ({ ...r, value: r.value as unknown as boolean | number }))
}

export async function upsertHabitLog(
  habitTypeId: number,
  date: string,
  value: boolean | number,
  pool?: Pool
): Promise<void> {
  const db = pool ?? getPool()
  await db.query(
    `INSERT INTO habit_logs (habit_type_id, date, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (habit_type_id, date) DO UPDATE SET value = $3`,
    [habitTypeId, date, JSON.stringify(value)]
  )
}
