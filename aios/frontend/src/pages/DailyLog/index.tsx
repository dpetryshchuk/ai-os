import { useState, useEffect, useRef, useCallback } from 'react'

// ──── Types ────────────────────────────────────────────────────────────────

interface Habit { id: number; name: string; kind: 'boolean' | 'number'; active: boolean }
interface DayEntry { did_today: string; doing_tomorrow: string }
type HabitValues = Record<number, boolean | number>
interface HabitLog { habit_type_id: number; value: boolean | number }
interface CalendarDay { date: string; habits: Record<string, boolean | number> }
interface ArchiveDay { date: string; did_today: string; habits: Record<string, boolean | number> }

// ──── API ──────────────────────────────────────────────────────────────────

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch('/api/daily-log' + path, opts)
  const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>
  if (!data.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

const api = {
  day: {
    get: (date: string) => req<{ entry: DayEntry | null; habits: HabitLog[] }>('GET', `/day/${date}`),
    save: (date: string, body: { did_today: string | null; doing_tomorrow: string | null; habits: HabitValues }) =>
      req('PUT', `/day/${date}`, body),
  },
  calendar: { get: (year: number, month: number) => req<{ days: CalendarDay[] }>('GET', `/calendar/${year}/${month}`) },
  archive: { get: () => req<{ days: ArchiveDay[] }>('GET', '/archive') },
  habits: {
    list: () => req<{ habits: Habit[] }>('GET', '/habits'),
    create: (name: string, kind: 'boolean' | 'number') => req('POST', '/habits', { name, kind }),
    update: (id: number, data: Partial<Pick<Habit, 'active' | 'name'>>) => req('PATCH', `/habits/${id}`, data),
  },
}

// ──── Helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string { return String(n).padStart(2, '0') }

// ──── Calendar ─────────────────────────────────────────────────────────────

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function Calendar({ selectedDate, onSelectDate, habits }: { selectedDate: string; onSelectDate: (d: string) => void; habits: Habit[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [calData, setCalData] = useState<CalendarDay[]>([])

  useEffect(() => { api.calendar.get(year, month).then(d => setCalData(d.days)).catch(() => {}) }, [year, month])

  const dayMap = new Map(calData.map(d => [d.date, d]))
  const activeHabits = habits.filter(h => h.active)
  const totalDays = new Date(year, month, 0).getDate()
  const startDay = new Date(year, month - 1, 1).getDay()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  const weekStats = activeHabits.map(h => ({
    id: h.id, name: h.name,
    count: weekDates.filter(date => {
      const d = dayMap.get(date); if (!d) return false
      const v = d.habits[String(h.id)]
      return v === true || (typeof v === 'number' && v > 0)
    }).length,
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <button onClick={() => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">‹</button>
        <span className="text-sm font-medium">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">›</button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DAYS.map(d => <div key={d} className="text-[11px] text-muted-foreground py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const data = dayMap.get(dateStr)
          const isToday = dateStr === todayISO
          const isSelected = dateStr === selectedDate
          return (
            <button key={dateStr} onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center py-1 rounded text-[12px] transition-colors',
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
                    return <div key={h.id} className={`w-1 h-1 rounded-full ${isSelected ? (done ? 'bg-white' : 'bg-white/40') : (done ? 'bg-foreground' : 'border border-border')}`} />
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

// ──── Archive ──────────────────────────────────────────────────────────────

function Archive({ days, habits, selectedDate, onSelectDate }: { days: ArchiveDay[]; habits: Habit[]; selectedDate: string; onSelectDate: (d: string) => void }) {
  const activeHabits = habits.filter(h => h.active)
  if (days.length === 0) return <p className="text-[12px] text-muted-foreground py-4 text-center">No entries yet.</p>
  const grouped: Record<string, Record<string, Record<string, ArchiveDay>>> = {}
  for (const day of days) {
    const [y, m] = day.date.split('-')
    if (!grouped[y]) grouped[y] = {}
    if (!grouped[y][m]) grouped[y][m] = {}
    grouped[y][m][day.date.slice(8)] = day
  }
  return (
    <div className="space-y-0.5">
      {Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(year => {
        const [open, setOpen] = [true, useState(true)[1]]
        const months = grouped[year]
        const total = Object.values(months).reduce((s, m) => s + Object.keys(m).length, 0)
        return (
          <YearSection key={year} year={year} months={months} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} total={total} />
        )
      })}
    </div>
  )
}

function YearSection({ year, months, activeHabits, selectedDate, onSelectDate, total }: {
  year: string; months: Record<string, Record<string, ArchiveDay>>; activeHabits: Habit[]
  selectedDate: string; onSelectDate: (d: string) => void; total: number
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1.5 text-[12px] font-medium hover:text-foreground">
        <span className="text-muted-foreground w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {year} <span className="text-[11px] text-muted-foreground font-normal ml-1">{total}</span>
      </button>
      {open && (
        <div className="ml-3">
          {Object.keys(months).sort((a, b) => b.localeCompare(a)).map(month => (
            <MonthSection key={month} month={month} year={year} days={months[month]} activeHabits={activeHabits} selectedDate={selectedDate} onSelectDate={onSelectDate} />
          ))}
        </div>
      )}
    </div>
  )
}

function MonthSection({ month, year, days, activeHabits, selectedDate, onSelectDate }: {
  month: string; year: string; days: Record<string, ArchiveDay>; activeHabits: Habit[]
  selectedDate: string; onSelectDate: (d: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dayKeys = Object.keys(days).sort((a, b) => b.localeCompare(a))
  const monthName = MONTHS[parseInt(month) - 1]
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground">
        <span className="w-3 text-[10px]">{open ? '▾' : '▸'}</span>
        {monthName} <span className="text-[11px] ml-auto">{dayKeys.length}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border">
          {dayKeys.map(day => {
            const entry = days[day]
            const dt = new Date(Number(year), Number(month) - 1, Number(day))
            const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            const isSelected = entry.date === selectedDate
            return (
              <div key={day} className={`pl-3 mb-px ${isSelected ? 'bg-muted rounded' : ''}`}>
                <button onClick={() => onSelectDate(entry.date)} className="flex-1 w-full text-left flex items-center gap-2 py-1 text-[12px] hover:text-foreground">
                  <span>{label}</span>
                  {activeHabits.length > 0 && (
                    <span className="ml-auto flex gap-0.5 shrink-0">
                      {activeHabits.map(h => {
                        const v = entry.habits[String(h.id)]
                        const done = v === true || (typeof v === 'number' && v > 0)
                        return <span key={h.id} className={`w-1.5 h-1.5 rounded-full inline-block ${done ? 'bg-foreground' : 'border border-border'}`} />
                      })}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──── DayEditor ────────────────────────────────────────────────────────────

function DayEditor({ date, habits }: { date: string; habits: Habit[] }) {
  const [entry, setEntry] = useState<DayEntry | null>(null)
  const [habitValues, setHabitValues] = useState<HabitValues>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHabits = habits.filter(h => h.active)

  useEffect(() => {
    if (!date) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setEntry(null); setHabitValues({}); setSaveStatus('idle')
    api.day.get(date).then(data => {
      setEntry(data.entry ?? { did_today: '', doing_tomorrow: '' })
      const vals: HabitValues = {}
      for (const log of data.habits) vals[log.habit_type_id] = log.value
      setHabitValues(vals)
    }).catch(() => setSaveStatus('error'))
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [date])

  const scheduleSave = useCallback((updatedEntry: DayEntry, updatedHabits: HabitValues, delay: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        await api.day.save(date, {
          did_today: updatedEntry.did_today || null,
          doing_tomorrow: updatedEntry.doing_tomorrow || null,
          habits: updatedHabits,
        })
        setSaveStatus('saved')
      } catch { setSaveStatus('error') }
    }, delay)
  }, [date])

  function handleHabitChange(id: number, kind: 'boolean' | 'number', rawValue: boolean | string) {
    const value = kind === 'boolean' ? rawValue as boolean : Number(rawValue)
    const updated = { ...habitValues, [id]: value }
    setHabitValues(updated)
    if (entry) scheduleSave(entry, updated, 400)
  }

  function handleJournalChange(field: keyof DayEntry, value: string) {
    const updated = { ...(entry ?? { did_today: '', doing_tomorrow: '' }), [field]: value }
    setEntry(updated)
    scheduleSave(updated, habitValues, 800)
  }

  function handleJournalBlur(field: keyof DayEntry, value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const updated = { ...(entry ?? { did_today: '', doing_tomorrow: '' }), [field]: value }
    setEntry(updated)
    setSaveStatus('saving')
    api.day.save(date, {
      did_today: updated.did_today || null,
      doing_tomorrow: updated.doing_tomorrow || null,
      habits: habitValues,
    }).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
  }

  const [y, m, d] = date.split('-').map(Number)
  const heading = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto relative max-w-2xl">
      <h2 className="text-base font-semibold mb-5">{heading}</h2>
      {activeHabits.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Habits</div>
          <div className="flex flex-col gap-2">
            {activeHabits.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1">
                <label htmlFor={`habit-${h.id}`} className="text-sm cursor-pointer">{h.name}</label>
                {h.kind === 'boolean' ? (
                  <input
                    id={`habit-${h.id}`} type="checkbox"
                    checked={habitValues[h.id] === true}
                    onChange={e => handleHabitChange(h.id, 'boolean', e.target.checked)}
                    className="w-4 h-4 rounded border-border cursor-pointer"
                  />
                ) : (
                  <input
                    id={`habit-${h.id}`} type="number"
                    value={(habitValues[h.id] as number) ?? ''}
                    onChange={e => handleHabitChange(h.id, 'number', e.target.value)}
                    className="w-16 text-right border border-border rounded px-2 py-0.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {(['did_today', 'doing_tomorrow'] as const).map(field => (
          <div key={field}>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {field === 'did_today' ? 'Today' : 'Tomorrow'}
            </label>
            <textarea
              value={entry?.[field] ?? ''}
              onChange={e => handleJournalChange(field, e.target.value)}
              onBlur={e => handleJournalBlur(field, e.target.value)}
              placeholder={field === 'did_today' ? 'What did you do today?' : 'What are you doing tomorrow?'}
              rows={5}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-6">
        <span className="text-[11px] text-muted-foreground">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : ''}
        </span>
      </div>
    </div>
  )
}

// ──── HabitManager ─────────────────────────────────────────────────────────

function HabitManager({ habits, onHabitsChange, onClose }: { habits: Habit[]; onHabitsChange: (h: Habit[]) => void; onClose: () => void }) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'boolean' | 'number'>('boolean')
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.habits.create(newName.trim(), newKind)
      setNewName(''); setError('')
      const data = await api.habits.list()
      onHabitsChange(data.habits)
    } catch (err) { setError((err as Error).message) }
  }

  async function handleToggle(habit: Habit) {
    try {
      await api.habits.update(habit.id, { active: !habit.active })
      const data = await api.habits.list()
      onHabitsChange(data.habits)
    } catch (err) { setError((err as Error).message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20">
      <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Habits</h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-lg">×</button>
        </div>
        <div className="flex flex-col gap-2 mb-5">
          {habits.map(h => (
            <div key={h.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">{h.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{h.kind}</span>
              </div>
              <button
                onClick={() => handleToggle(h)}
                className={`relative w-8 h-4 rounded-full transition-colors duration-150 ${h.active ? 'bg-foreground' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150 ${h.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
          {habits.length === 0 && <p className="text-sm text-muted-foreground">No habits yet.</p>}
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">New habit</div>
          <input
            type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Habit name"
            className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background"
          />
          <div className="flex gap-2">
            <select
              value={newKind} onChange={e => setNewKind(e.target.value as 'boolean' | 'number')}
              className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background flex-1"
            >
              <option value="boolean">Yes/No</option>
              <option value="number">Number</option>
            </select>
            <button type="submit" className="px-3 py-1.5 bg-foreground text-primary-foreground rounded text-sm font-medium hover:opacity-90 transition-opacity">
              Add
            </button>
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </form>
      </div>
    </div>
  )
}

// ──── Page ─────────────────────────────────────────────────────────────────

type LeftView = 'calendar' | 'log'

export default function DailyLog() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showHabitManager, setShowHabitManager] = useState(false)
  const [leftView, setLeftView] = useState<LeftView>('calendar')
  const [archiveDays, setArchiveDays] = useState<ArchiveDay[]>([])

  useEffect(() => { api.habits.list().then(d => setHabits(d.habits)).catch(() => {}) }, [])

  useEffect(() => {
    if (leftView === 'log') api.archive.get().then(d => setArchiveDays(d.days)).catch(() => {})
  }, [leftView])

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    if (leftView === 'log') setLeftView('calendar')
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[360px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">Daily Log</span>
            <div className="flex text-[12px]">
              <button
                onClick={() => setLeftView('calendar')}
                className={`px-2 py-0.5 rounded-l border border-border ${leftView === 'calendar' ? 'bg-foreground text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >Calendar</button>
              <button
                onClick={() => setLeftView('log')}
                className={`px-2 py-0.5 rounded-r border border-l-0 border-border ${leftView === 'log' ? 'bg-foreground text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >Log</button>
            </div>
          </div>
          <button
            onClick={() => setShowHabitManager(true)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-lg"
            title="Manage habits"
          >⚙</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {leftView === 'calendar' ? (
            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} habits={habits} />
          ) : (
            <Archive days={archiveDays} habits={habits} selectedDate={selectedDate} onSelectDate={handleSelectDate} />
          )}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <DayEditor date={selectedDate} habits={habits} />
      </div>
      {showHabitManager && (
        <HabitManager habits={habits} onHabitsChange={setHabits} onClose={() => setShowHabitManager(false)} />
      )}
    </div>
  )
}
