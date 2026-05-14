export interface Entry {
  date: string          // YYYY-MM-DD
  did_today: string | null
  doing_tomorrow: string | null
  updated_at: string
}

export interface HabitType {
  id: number
  name: string
  kind: 'boolean' | 'number'
  active: boolean
  created_at: string
}

export interface HabitLog {
  habit_type_id: number
  date: string
  value: boolean | number
}

export interface DayData {
  date: string
  entry: Entry | null
  habits: HabitLog[]
}

export interface CalendarDay {
  date: string
  entry: boolean
  habits: Record<string, boolean | number>
}

export interface UpsertDayBody {
  did_today?: string
  doing_tomorrow?: string
  habits?: Record<string, boolean | number>
}
