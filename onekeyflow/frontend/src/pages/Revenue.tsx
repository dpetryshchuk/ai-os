import { useEffect, useState } from 'react'
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Month {
  id: number
  month: string
  gross_revenue: number
  service_fees: number
  fixed_overhead: number
  variable_overhead: number
  tax_rate: number
  notes: string
  // derived
  net_revenue: number
  total_overhead: number
  operating_profit: number
  net_profit: number
  net_margin: number
}

const EMPTY_FORM = {
  month: '',
  gross_revenue: '',
  service_fees: '',
  fixed_overhead: '',
  variable_overhead: '',
  tax_rate: '0.28',
  notes: '',
}

type FormState = typeof EMPTY_FORM

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

function marginColor(margin: number) {
  if (margin >= 0.40) return 'text-green-600'
  if (margin >= 0.15) return 'text-yellow-600'
  return 'text-red-500'
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function TrendBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, value / max) : 0
  return (
    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-foreground/60 rounded-full transition-all"
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}

function FormRow({
  label, name, value, onChange, placeholder = '',
}: {
  label: string
  name: keyof FormState
  value: string
  onChange: (k: keyof FormState, v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <Input
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function MonthForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: FormState
  onSave: (f: FormState) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormRow label="Month" name="month" value={form.month} onChange={set} placeholder="e.g. Jun 2026" />
        <FormRow label="Gross Revenue" name="gross_revenue" value={form.gross_revenue} onChange={set} placeholder="0" />
        <FormRow label="Service Fees" name="service_fees" value={form.service_fees} onChange={set} placeholder="0" />
        <FormRow label="Fixed Overhead" name="fixed_overhead" value={form.fixed_overhead} onChange={set} placeholder="0" />
        <FormRow label="Variable Overhead" name="variable_overhead" value={form.variable_overhead} onChange={set} placeholder="0" />
        <FormRow label="Tax Rate" name="tax_rate" value={form.tax_rate} onChange={set} placeholder="0.28" />
      </div>
      <FormRow label="Notes" name="notes" value={form.notes} onChange={set} placeholder="Client notes, context…" />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          <X className="size-3.5" /> Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !form.month}>
          <Check className="size-3.5" /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export default function Revenue() {
  const [months, setMonths] = useState<Month[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/revenue')
      .then(r => r.json())
      .then(d => setMonths(d.months ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const formToBody = (f: FormState) => ({
    month: f.month,
    gross_revenue: parseFloat(f.gross_revenue) || 0,
    service_fees: parseFloat(f.service_fees) || 0,
    fixed_overhead: parseFloat(f.fixed_overhead) || 0,
    variable_overhead: parseFloat(f.variable_overhead) || 0,
    tax_rate: parseFloat(f.tax_rate) || 0.28,
    notes: f.notes,
  })

  const handleAdd = async (f: FormState) => {
    await fetch('/api/revenue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToBody(f)),
    })
    setAdding(false)
    load()
  }

  const handleEdit = async (id: number, f: FormState) => {
    await fetch(`/api/revenue/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToBody(f)),
    })
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/revenue/${id}`, { method: 'DELETE' })
    load()
  }

  const ytdGross  = months.reduce((s, m) => s + m.gross_revenue, 0)
  const ytdProfit = months.reduce((s, m) => s + m.net_profit, 0)
  const latest    = months[months.length - 1]
  const maxProfit = Math.max(...months.map(m => m.net_profit), 1)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">OneKeyFlow P&amp;L · cash basis</p>
      </div>

      {/* Summary cards */}
      {!loading && months.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="YTD Gross" value={fmt(ytdGross)} sub={`${months.length} months`} />
          <StatCard label="YTD Net Profit" value={fmt(ytdProfit)} />
          <StatCard
            label="Latest Margin"
            value={latest ? pct(latest.net_margin) : '—'}
            sub={latest?.month}
          />
          <StatCard
            label="Best Month"
            value={fmt(Math.max(...months.map(m => m.net_profit)))}
            sub={months.find(m => m.net_profit === Math.max(...months.map(x => x.net_profit)))?.month}
          />
        </div>
      )}

      {/* Table header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Monthly P&amp;L</p>
        {!adding && (
          <Button variant="outline" onClick={() => { setAdding(true); setEditingId(null) }}>
            <Plus className="size-3.5" /> Add month
          </Button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-3">
          <MonthForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : months.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No months yet. Add one above.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-6 px-4 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Month</span>
            <span className="text-right">Gross</span>
            <span className="text-right">Overhead</span>
            <span className="text-right font-semibold">Net Profit</span>
            <span className="text-right">Margin</span>
            <span className="w-24">Trend</span>
            <span />
          </div>

          {months.map(m => (
            <div key={m.id} className="flex flex-col gap-2">
              {editingId === m.id ? (
                <MonthForm
                  initial={{
                    month: m.month,
                    gross_revenue: String(m.gross_revenue),
                    service_fees: String(m.service_fees),
                    fixed_overhead: String(m.fixed_overhead),
                    variable_overhead: String(m.variable_overhead),
                    tax_rate: String(m.tax_rate),
                    notes: m.notes,
                  }}
                  onSave={f => handleEdit(m.id, f)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-6 items-center px-4 py-3 rounded-lg border border-border bg-card text-sm',
                  )}
                >
                  <div>
                    <p className="font-medium">{m.month}</p>
                    {m.notes && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{m.notes}</p>}
                  </div>
                  <span className="text-right tabular-nums">{fmt(m.gross_revenue)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{fmt(m.total_overhead)}</span>
                  <span className={cn('text-right tabular-nums font-semibold', m.net_profit < 0 ? 'text-red-500' : '')}>
                    {fmt(m.net_profit)}
                  </span>
                  <span className={cn('text-right tabular-nums text-xs', marginColor(m.net_margin))}>
                    {pct(m.net_margin)}
                  </span>
                  <TrendBar value={m.net_profit} max={maxProfit} />
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => { setEditingId(m.id); setAdding(false) }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
