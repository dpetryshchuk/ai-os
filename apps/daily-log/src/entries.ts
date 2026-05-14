import { Pool } from 'pg'
import { getPool } from './db'
import type { Entry } from './types'

export async function getEntry(date: string, pool?: Pool): Promise<Entry | null> {
  const db = pool ?? getPool()
  const { rows } = await db.query<Entry>(
    'SELECT date::text, did_today, doing_tomorrow, updated_at::text FROM entries WHERE date = $1',
    [date]
  )
  return rows[0] ?? null
}

export async function listAllEntries(pool?: Pool): Promise<{
  date: string
  did_today: string | null
  doing_tomorrow: string | null
  habits: Record<string, boolean | number>
}[]> {
  const db = pool ?? getPool()
  const { rows } = await db.query(`
    SELECT
      d.date::text,
      e.did_today,
      e.doing_tomorrow,
      COALESCE(
        json_object_agg(hl.habit_type_id::text, hl.value)
          FILTER (WHERE hl.habit_type_id IS NOT NULL),
        '{}'::json
      ) AS habits
    FROM (
      SELECT date FROM entries
      UNION
      SELECT date FROM habit_logs
    ) d
    LEFT JOIN entries e ON e.date = d.date
    LEFT JOIN habit_logs hl ON hl.date = d.date
    GROUP BY d.date, e.did_today, e.doing_tomorrow
    ORDER BY d.date DESC
  `)
  return rows.map(r => ({
    date: r.date,
    did_today: r.did_today ?? null,
    doing_tomorrow: r.doing_tomorrow ?? null,
    habits: r.habits ?? {},
  }))
}

export async function upsertEntry(
  date: string,
  data: { did_today?: string; doing_tomorrow?: string },
  pool?: Pool
): Promise<Entry> {
  const db = pool ?? getPool()
  const { rows } = await db.query<Entry>(
    `INSERT INTO entries (date, did_today, doing_tomorrow)
     VALUES ($1, $2, $3)
     ON CONFLICT (date) DO UPDATE SET
       did_today = COALESCE($2, entries.did_today),
       doing_tomorrow = COALESCE($3, entries.doing_tomorrow),
       updated_at = now()
     RETURNING date::text, did_today, doing_tomorrow, updated_at::text`,
    [date, data.did_today ?? null, data.doing_tomorrow ?? null]
  )
  return rows[0]
}
