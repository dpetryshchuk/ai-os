import { useState, useEffect } from 'react'
import { api } from './lib/api'
import Calendar from './components/Calendar'
import DayEditor from './components/DayEditor'
import HabitManager from './components/HabitManager'
import Archive from './components/Archive'

function todayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

export default function App() {
  const [habits, setHabits] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showHabitManager, setShowHabitManager] = useState(false)
  const [leftView, setLeftView] = useState('calendar') // 'calendar' | 'log'
  const [archiveDays, setArchiveDays] = useState([])

  useEffect(() => {
    api.habits.list().then(d => setHabits(d.habits)).catch(() => {})
  }, [])

  useEffect(() => {
    if (leftView === 'log') {
      api.archive.get().then(d => setArchiveDays(d.days)).catch(() => {})
    }
  }, [leftView])

  function handleSelectDate(date) {
    setSelectedDate(date)
    if (leftView === 'log') setLeftView('calendar')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="w-[360px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">Daily Log</span>
            <div className="flex text-[12px]">
              <button
                onClick={() => setLeftView('calendar')}
                className={`px-2 py-0.5 rounded-l border border-border ${
                  leftView === 'calendar'
                    ? 'bg-foreground text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setLeftView('log')}
                className={`px-2 py-0.5 rounded-r border border-l-0 border-border ${
                  leftView === 'log'
                    ? 'bg-foreground text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Log
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowHabitManager(true)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground text-lg"
            title="Manage habits"
          >
            âš™
          </button>
        </div>

        {/* View */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {leftView === 'calendar' ? (
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              habits={habits}
            />
          ) : (
            <Archive
              days={archiveDays}
              habits={habits}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          )}
        </div>
      </div>

      {/* Right panel â€” day editor */}
      <div className="flex-1 flex overflow-hidden">
        <DayEditor
          date={selectedDate}
          habits={habits}
        />
      </div>

      {/* Habit manager modal */}
      {showHabitManager && (
        <HabitManager
          habits={habits}
          onHabitsChange={setHabits}
          onClose={() => setShowHabitManager(false)}
        />
      )}
    </div>
  )
}
