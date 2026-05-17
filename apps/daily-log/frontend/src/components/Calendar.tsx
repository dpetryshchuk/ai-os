import { useState, useEffect } from 'react'
import { api, type Habit, type CalendarDay } from '../lib/api'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

interface CalendarProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  habits: Habit[]
}

export default function Calendar({ selectedDate, onSelectDate, habits }: CalendarProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [calData, setCalData] = useState<CalendarDay[]>([])

  useEffect(() => {
    api.calendar.get(year, month).then(d => setCalData(d.days)).catch(() => {})
  }, [year, month])

  const dayMap = new Map(calData.map(d => [d.date, d]))
  const activeHabits = habits.filter(h => h.active)

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const totalDays = daysInMonth(year, month)
  const startDay = firstWeekday(year, month)
  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  })

  const weekStats = activeHabits.map(h => ({
    id: h.id,
    name: h.name,
    count: weekDates.filter(date => {
      const d = dayMap.get(date)
      if (!d) return false
      const v = d.habits[String(h.id)]
      return v === true || (typeof v === 'number' && v > 0)
    }).length,
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">‹</button>
        <span className="text-sm font-medium">{MONTHS[month-1]} {year}</span>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">›</button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DAYS.map(d => <div key={d} className="text-[11px] text-muted-foreground py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const data = dayMap.get(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center py-1 rounded text-[12px] transition-colors duration-150',
                isSelected ? 'bg-foreground text-primary-foreground' : 'hover:bg-muted',
                isToday && !isSelected ? 'font-semibold' : '',
                !data ? 'text-muted-foreground' : '',
              ].join(' ')}
            >
              <span>{day}</span>
              {data && activeHabits.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {activeHabits.map(h => {
                    const v = data.habits[String(h.id)]
                    const done = v === true || (typeof v === 'number' && v > 0)
                    return (
                      <div
                        key={h.id}
                        className={[
                          'w-1 h-1 rounded-full',
                          isSelected ? (done ? 'bg-white' : 'bg-white/40') : (done ? 'bg-foreground' : 'border border-border'),
                        ].join(' ')}
                      />
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}
      </div>
      {weekStats.length > 0 && year === today.getFullYear() && month === today.getMonth() + 1 && (
        <div className="border-t border-border pt-3 mt-1">
          <div className="text-[11px] text-muted-foreground mb-2">This week</div>
          <div className="flex flex-col gap-1">
            {weekStats.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-medium">{s.count}/7</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
