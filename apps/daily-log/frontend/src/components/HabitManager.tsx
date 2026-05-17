import { useState } from 'react'
import { api, type Habit } from '../lib/api'

interface HabitManagerProps {
  habits: Habit[]
  onHabitsChange: (habits: Habit[]) => void
  onClose: () => void
}

export default function HabitManager({ habits, onHabitsChange, onClose }: HabitManagerProps) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'boolean' | 'number'>('boolean')
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.habits.create(newName.trim(), newKind)
      setNewName('')
      setError('')
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
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Habit name"
            className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background"
          />
          <div className="flex gap-2">
            <select
              value={newKind}
              onChange={e => setNewKind(e.target.value as 'boolean' | 'number')}
              className="border border-border rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring bg-background flex-1"
            >
              <option value="boolean">Yes/No</option>
              <option value="number">Number</option>
            </select>
            <button type="submit" className="px-3 py-1.5 bg-foreground text-primary-foreground rounded text-sm font-medium hover:opacity-90 transition-opacity">
              Add
            </button>
          </div>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  )
}
