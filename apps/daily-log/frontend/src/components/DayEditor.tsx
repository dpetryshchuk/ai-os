import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type Habit, type HabitValues } from '../lib/api'
import SaveStatus, { type SaveStatusKind } from './SaveStatus'

function formatDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

interface DayEditorProps {
  date: string
  habits: Habit[]
}

interface EntryState {
  did_today: string
  doing_tomorrow: string
}

export default function DayEditor({ date, habits }: DayEditorProps) {
  const [entry, setEntry] = useState<EntryState | null>(null)
  const [habitValues, setHabitValues] = useState<HabitValues>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatusKind>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHabits = habits.filter(h => h.active)

  useEffect(() => {
    if (!date) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setEntry(null)
    setHabitValues({})
    setSaveStatus('idle')
    api.day.get(date).then(data => {
      setEntry(data.entry ?? { did_today: '', doing_tomorrow: '' })
      const vals: HabitValues = {}
      for (const log of data.habits) vals[log.habit_type_id] = log.value
      setHabitValues(vals)
    }).catch(() => setSaveStatus('error'))
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [date])

  const scheduleSave = useCallback((updatedEntry: EntryState, updatedHabits: HabitValues, delay: number) => {
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

  function handleJournalChange(field: keyof EntryState, value: string) {
    const updated = { ...(entry ?? { did_today: '', doing_tomorrow: '' }), [field]: value }
    setEntry(updated)
    scheduleSave(updated, habitValues, 800)
  }

  function handleJournalBlur(field: keyof EntryState, value: string) {
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

  if (!date) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a day</div>
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto relative max-w-2xl">
      <h2 className="text-base font-semibold mb-5">{formatDateHeading(date)}</h2>
      {activeHabits.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Habits</div>
          <div className="flex flex-col gap-2">
            {activeHabits.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1">
                <label htmlFor={`habit-${h.id}`} className="text-sm cursor-pointer">{h.name}</label>
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
        <SaveStatus status={saveStatus} />
      </div>
    </div>
  )
}
