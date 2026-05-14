import { Pool } from 'pg'
import { getPool } from './db'
import type { CalendarDay } from './types'

export async function getCalendarMonth(
  year: number,
  month: number,
  pool?: Pool
): Promise<CalendarDay[]> {
  const db = pool ?? getPool()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const { rows: entryRows } = await db.query<{ date: string }>(
    `SELECT date::text FROM entries WHERE date >= $1 AND date < $2`,
    [startDate, endDate]
  )
  const { rows: logRows } = await db.query<{ date: string; habit_type_id: number; value: unknown }>(
    `SELECT date::text, habit_type_id, value FROM habit_logs WHERE date >= $1 AND date < $2`,
    [startDate, endDate]
  )

  const dayMap = new Map<string, CalendarDay>()

  for (const { date } of entryRows) {
    if (!dayMap.has(date)) dayMap.set(date, { date, entry: false, habits: {} })
    dayMap.get(date)!.entry = true
  }

  for (const { date, habit_type_id, value } of logRows) {
    if (!dayMap.has(date)) dayMap.set(date, { date, entry: false, habits: {} })
    dayMap.get(date)!.habits[String(habit_type_id)] = value as boolean | number
  }

  return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))
}
