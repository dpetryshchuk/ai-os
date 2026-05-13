import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import SaveStatus from './SaveStatus'

function formatDateHeading(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function DayEditor({ date, habits }) {
  const [entry, setEntry] = useState(null)
  const [habitValues, setHabitValues] = useState({})
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveTimer = useRef(null)
  const activeHabits = habits.filter(h => h.active)

  useEffect(() => {
    if (!date) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setEntry(null)
    setHabitValues({})
    setSaveStatus('idle')
    api.day.get(date).then(data => {
      setEntry(data.entry ?? { did_today: '', doing_tomorrow: '' })
      const vals = {}
      for (const log of data.habits) {
        vals[log.habit_type_id] = log.value
      }
      setHabitValues(vals)
    }).catch(() => setSaveStatus('error'))
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [date])

  const scheduleSave = useCallback((updatedEntry, updatedHabits, delay) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        await api.day.save(date, {
          did_today: updatedEntry.did_today || null,
          doing_tomorrow: updatedEntry.doing_tomorrow || null,
          habits: updatedHabits
        })
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, delay)
  }, [date])

  function handleHabitChange(id, kind, rawValue) {
    const value = kind === 'boolean' ? rawValue : Number(rawValue)
    const updated = { ...habitValues, [id]: value }
    setHabitValues(updated)
    scheduleSave(entry, updated, 400)
  }

  function handleJournalChange(field, value) {
    const updated = { ...entry, [field]: value }
    setEntry(updated)
    scheduleSave(updated, habitValues, 800)
  }

  function handleJournalBlur(field, value) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const updated = { ...entry, [field]: value }
    setEntry(updated)
    setSaveStatus('saving')
    api.day.save(date, {
      did_today: updated.did_today || null,
      doing_tomorrow: updated.doing_tomorrow || null,
      habits: habitValues
    }).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
  }

  if (!date) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a day
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto relative max-w-2xl">
      <h2 className="text-base font-semibold mb-5">{formatDateHeading(date)}</h2>

      {/* Habits */}
      {activeHabits.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Habits
          </div>
          <div className="flex flex-col gap-2">
            {activeHabits.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1">
                <label htmlFor={`habit-${h.id}`} className="text-sm cursor-pointer">
                  {h.name}
                </label>
                {h.kind === 'boolean' ? (
                  <input
                    id={`habit-${h.id}`}
                    type="checkbox"
                    checked={habitValues[h.id] === true}
                    onChange={e => handleHabitChange(h.id, 'boolean', e.target.checked)}
                    className="w-4 h-4 rounded border-border cursor-pointer"
                  />
                ) : (
                  <input
                    id={`habit-${h.id}`}
                    type="number"
                    value={habitValues[h.id] ?? ''}
                    onChange={e => handleHabitChange(h.id, 'number', e.target.value)}
                    className="w-16 text-right border border-border rounded px-2 py-0.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Journal */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Today
          </label>
          <textarea
            value={entry?.did_today ?? ''}
            onChange={e => handleJournalChange('did_today', e.target.value)}
            onBlur={e => handleJournalBlur('did_today', e.target.value)}
            placeholder="What did you do today?"
            rows={5}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Tomorrow
          </label>
          <textarea
            value={entry?.doing_tomorrow ?? ''}
            onChange={e => handleJournalChange('doing_tomorrow', e.target.value)}
            onBlur={e => handleJournalBlur('doing_tomorrow', e.target.value)}
            placeholder="What are you doing tomorrow?"
            rows={5}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Save status */}
      <div className="absolute bottom-4 right-6">
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  )
}
