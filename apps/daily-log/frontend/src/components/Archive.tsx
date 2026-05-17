import { useState } from 'react'
import type { Habit, ArchiveDay } from '../lib/api'

interface ArchiveProps {
  days: ArchiveDay[]
  habits: Habit[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

type GroupedDays = Record<string, Record<string, Record<string, ArchiveDay>>>

function groupByYearMonth(days: ArchiveDay[]): GroupedDays {
  const grouped: GroupedDays = {}
  for (const day of days) {
    const [year, month, d] = day.date.split('-')
    if (!grouped[year]) grouped[year] = {}
    if (!grouped[year][month]) grouped[year][month] = {}
    grouped[year][month][d] = day
  }
  return grouped
}

export default function Archive({ days, habits, selectedDate, onSelectDate }: ArchiveProps) {
  const grouped = groupByYearMonth(days)
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
  const activeHabits = habits.filter(h => h.active)
  if (days.length === 0) {
    return <p className="text-[12px] text-muted-foreground py-4 text-center">No entries yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {years.map(year => (
        <YearGroup key={year} year={year} months={grouped[year]} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      ))}
    </div>
  )
}

function YearGroup({ year, months, activeHabits, selectedDate, onSelectDate }: {
  year: string; months: Record<string, Record<string, ArchiveDay>>; activeHabits: Habit[]; selectedDate: string; onSelectDate: (d: string) => void
}) {
  const [open, setOpen] = useState(true)
  const monthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a))
  const totalDays = Object.values(months).reduce((s, m) => s + Object.keys(m).length, 0)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1.5 text-[12px] font-medium text-foreground hover:text-foreground">
        <span className="text-muted-foreground w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {year}
        <span className="text-[11px] text-muted-foreground font-normal ml-1">{totalDays}</span>
      </button>
      {open && (
        <div className="ml-3">
          {monthKeys.map(month => (
            <MonthGroup key={month} month={month} year={year} days={months[month]} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} />
          ))}
        </div>
      )}
    </div>
  )
}

function MonthGroup({ month, year, days, activeHabits, selectedDate, onSelectDate }: {
  month: string; year: string; days: Record<string, ArchiveDay>; activeHabits: Habit[]; selectedDate: string; onSelectDate: (d: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dayKeys = Object.keys(days).sort((a, b) => b.localeCompare(a))
  const monthName = MONTH_NAMES[parseInt(month) - 1]
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground">
        <span className="w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {monthName}
        <span className="text-[11px] ml-auto">{dayKeys.length}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border">
          {dayKeys.map(day => (
            <DayRow key={day} day={days[day]} activeHabits={activeHabits} isSelected={days[day].date === selectedDate} onSelect={() => onSelectDate(days[day].date)} />
          ))}
        </div>
      )}
    </div>
  )
}

function DayRow({ day, activeHabits, isSelected, onSelect }: { day: ArchiveDay; activeHabits: Habit[]; isSelected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const [y, m, d] = day.date.split('-')
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div className={`pl-3 mb-px ${isSelected ? 'bg-muted rounded' : ''}`}>
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(o => !o)} className="text-[10px] text-muted-foreground w-3 py-1 flex-shrink-0">
          {open ? '▾' : '▸'}
        </button>
        <button onClick={onSelect} className="flex-1 text-left flex items-center gap-2 py-1 text-[12px] text-foreground hover:text-foreground">
          <span>{label}</span>
          {activeHabits.length > 0 && (
            <span className="ml-auto flex gap-0.5 flex-shrink-0">
              {activeHabits.map(h => {
                const v = day.habits[String(h.id)]
                const done = v === true || (typeof v === 'number' && v > 0)
                return <span key={h.id} className={`w-1.5 h-1.5 rounded-full inline-block ${done ? 'bg-foreground' : 'border border-border'}`} />
              })}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className="py-2 pl-4 space-y-2">
          {day.did_today ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Today</p>
              <p className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">{day.did_today}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No entry.</p>
          )}
        </div>
      )}
    </div>
  )
}
