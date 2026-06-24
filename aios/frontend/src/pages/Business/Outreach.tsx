import { useEffect, useState, useCallback } from 'react'
import { Plus, Clock, X, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Contact {
  id: string
  name: string
  company: string
  linkedin_url: string
  message_sent: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

interface Stats {
  sent: number
  connected: number
  replied: number
  converted: number
  ignored: number
  today: number
  hours_today: number
}

interface RetroWeek {
  week: string
  total_sent: number
  connected: number
  replied: number
  converted: number
}

const STATUSES = ['sent', 'connected', 'replied', 'converted', 'ignored'] as const
type Status = typeof STATUSES[number]

function statusBadge(status: string) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium'
  switch (status) {
    case 'sent':      return cn(base, 'bg-muted text-muted-foreground')
    case 'connected': return cn(base, 'bg-blue-500/20 text-blue-400')
    case 'replied':   return cn(base, 'bg-amber-500/20 text-amber-400')
    case 'converted': return cn(base, 'bg-green-500/20 text-green-400')
    case 'ignored':   return cn(base, 'bg-red-500/20 text-red-400')
    default:          return cn(base, 'bg-muted text-muted-foreground')
  }
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

const EMPTY_CONTACT = {
  name: '', company: '', linkedin_url: '', message_sent: '', status: 'sent', notes: '',
}

export default function Outreach() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [retro, setRetro] = useState<RetroWeek[]>([])
  const [loading, setLoading] = useState(true)

  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT)
  const [savingContact, setSavingContact] = useState(false)

  const [showHoursForm, setShowHoursForm] = useState(false)
  const [hoursForm, setHoursForm] = useState({ date: new Date().toISOString().slice(0, 10), hours: '', notes: '' })
  const [savingHours, setSavingHours] = useState(false)

  // inline status update per contact
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/outreach/stats').then(r => r.json()),
      fetch('/api/outreach/contacts').then(r => r.json()),
      fetch('/api/outreach/retro?weeks=6').then(r => r.json()),
    ]).then(([s, c, rv]) => {
      setStats(s.stats ?? null)
      setContacts(c.contacts ?? [])
      setRetro(rv.weeks ?? [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingContact(true)
    try {
      await fetch('/api/outreach/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      })
      setContactForm(EMPTY_CONTACT)
      setShowContactForm(false)
      load()
    } finally {
      setSavingContact(false)
    }
  }

  const handleLogHours = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingHours(true)
    try {
      await fetch('/api/outreach/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: hoursForm.date, hours: parseFloat(hoursForm.hours) || 0, notes: hoursForm.notes }),
      })
      setHoursForm({ date: new Date().toISOString().slice(0, 10), hours: '', notes: '' })
      setShowHoursForm(false)
      load()
    } finally {
      setSavingHours(false)
    }
  }

  const handleStatusChange = async (contact: Contact, newStatus: string) => {
    setUpdatingId(contact.id)
    try {
      await fetch(`/api/outreach/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.name,
          company: contact.company,
          linkedin_url: contact.linkedin_url,
          message_sent: contact.message_sent,
          status: newStatus,
          notes: contact.notes,
        }),
      })
      load()
    } finally {
      setUpdatingId(null)
    }
  }

  const setC = (k: keyof typeof EMPTY_CONTACT, v: string) =>
    setContactForm(f => ({ ...f, [k]: v }))

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Outreach</h1>
          <p className="text-sm text-muted-foreground mt-1">LinkedIn CRM · sent → connected → replied → converted</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setShowHoursForm(h => !h); setShowContactForm(false) }}>
            <Clock className="size-3.5" /> Log hours
          </Button>
          <Button onClick={() => { setShowContactForm(c => !c); setShowHoursForm(false) }}>
            <Plus className="size-3.5" /> Log contact
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Today" value={stats.today} sub="contacts sent" />
          <StatCard label="Converted" value={stats.converted} sub={`${stats.replied} replied`} />
          <StatCard label="Hours today" value={stats.hours_today} sub="logged" />
          <StatCard
            label="Pipeline"
            value={stats.sent + stats.connected + stats.replied}
            sub={`${stats.connected} connected`}
          />
        </div>
      )}

      {/* Log Contact Form */}
      {showContactForm && (
        <div className="rounded-xl border border-border bg-muted/30 p-5 mb-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Contact</p>
          <form onSubmit={handleAddContact} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                <Input value={contactForm.name} onChange={e => setC('name', e.target.value)} placeholder="Jane Smith" required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</label>
                <Input value={contactForm.company} onChange={e => setC('company', e.target.value)} placeholder="Acme Corp" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LinkedIn URL</label>
              <Input value={contactForm.linkedin_url} onChange={e => setC('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message sent</label>
              <textarea
                value={contactForm.message_sent}
                onChange={e => setC('message_sent', e.target.value)}
                placeholder="Paste the message you sent…"
                rows={3}
                className="w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-none transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                <select
                  value={contactForm.status}
                  onChange={e => setC('status', e.target.value)}
                  className="rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring transition-colors"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                <Input value={contactForm.notes} onChange={e => setC('notes', e.target.value)} placeholder="Any context…" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowContactForm(false)}>
                <X className="size-3.5" /> Cancel
              </Button>
              <Button type="submit" disabled={savingContact || !contactForm.name}>
                <Check className="size-3.5" /> {savingContact ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Log Hours Form */}
      {showHoursForm && (
        <div className="rounded-xl border border-border bg-muted/30 p-5 mb-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Log Session Hours</p>
          <form onSubmit={handleLogHours} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
                <Input type="date" value={hoursForm.date} onChange={e => setHoursForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hours</label>
                <Input type="number" step="0.25" min="0" value={hoursForm.hours} onChange={e => setHoursForm(f => ({ ...f, hours: e.target.value }))} placeholder="1.5" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <Input value={hoursForm.notes} onChange={e => setHoursForm(f => ({ ...f, notes: e.target.value }))} placeholder="What you worked on…" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowHoursForm(false)}>
                <X className="size-3.5" /> Cancel
              </Button>
              <Button type="submit" disabled={savingHours || !hoursForm.hours}>
                <Check className="size-3.5" /> {savingHours ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Contacts Table */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Contacts</p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No contacts yet. Log your first one above.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 px-4 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Name</span>
              <span>Company</span>
              <span>Status</span>
              <span />
            </div>
            {contacts.map(c => (
              <div
                key={c.id}
                className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 items-center px-4 py-3 rounded-lg border border-border bg-card text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  {c.notes && <p className="text-xs text-muted-foreground truncate">{c.notes}</p>}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-muted-foreground">{c.company || '—'}</p>
                  {c.message_sent && (
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={c.message_sent}>
                      {c.message_sent.slice(0, 60)}{c.message_sent.length > 60 ? '…' : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusBadge(c.status)}>{c.status}</span>
                  <select
                    value={c.status}
                    disabled={updatingId === c.id}
                    onChange={e => handleStatusChange(c, e.target.value)}
                    className="text-xs rounded border border-border bg-transparent px-1.5 py-0.5 outline-none focus-visible:border-ring transition-colors text-muted-foreground disabled:opacity-50"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  {c.linkedin_url && (
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Open LinkedIn"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Retro */}
      {retro.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Weekly Retro</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-5 bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Week</span>
              <span className="text-right">Sent</span>
              <span className="text-right">Connected</span>
              <span className="text-right">Replied</span>
              <span className="text-right">Converted</span>
            </div>
            {retro.map((w, i) => (
              <div
                key={w.week}
                className={cn(
                  'grid grid-cols-5 px-4 py-3 text-sm',
                  i > 0 ? 'border-t border-border' : '',
                )}
              >
                <span className="font-medium tabular-nums">{w.week}</span>
                <span className="text-right tabular-nums text-muted-foreground">{w.total_sent}</span>
                <span className="text-right tabular-nums text-blue-400">{w.connected}</span>
                <span className="text-right tabular-nums text-amber-400">{w.replied}</span>
                <span className="text-right tabular-nums text-green-400">{w.converted}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
