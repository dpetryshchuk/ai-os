import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Dashboard data ───────────────────────────────────────────────────────────
// `DATA` starts as a baked-in snapshot (so the page is never blank) and is
// replaced at runtime by GET /api/finances/data (the live data.js). It's a
// module-level `let` so every card re-reads the live values on the next render
// after the fetch resolves — no per-card wiring.

let DATA = {
  overview: { period: 'Sample period', contractsClosed: 0, received: 0, pending: 0, revenue: 0, netRevenue: 0, expenses: 0, ebitda: 0, margin: 0 },
  accounts: [
    { name: 'Checking', val: 0 },
    { name: 'Savings', val: 0 },
    { name: 'Brokerage', val: 0, locked: true, note: 'Sample note' },
  ],
  debt: [
    { name: 'Card', val: 0, note: 'Sample', dim: false },
    { name: 'Loan', val: 0, note: 'Sample', dim: true },
  ],
  ccLimit: 0,
  ccDebt: 0,
  june: { collected: 0, target: 0 },
  burn: { personal: 0, tools: 0 },
  pl: [
    { month: 'Feb', net: 0, current: false },
    { month: 'Mar', net: 0, current: false },
    { month: 'Apr', net: 0, current: false },
    { month: 'May', net: 0, current: false },
    { month: 'Jun', net: 0, current: true },
  ],
  taxLiability: {
    note: 'Sample tax note.',
    months: [
      { month: 'Feb', net: 0 },
      { month: 'Mar', net: 0 },
      { month: 'Apr', net: 0 },
      { month: 'May', net: 0 },
    ],
  },
  tools: [
    { name: 'Sample Tool', cost: 0 },
  ],
  networking: [
    { event: 'Sample event', date: '2026-01-01', miles: null as null | number, extras: [{ name: 'Sample', amount: 0 }] },
  ],
  dataAsOf: { checking: '2026-01-01', savings: '2026-01-01', cc: '2026-01-01', ally: '2026-01-01' },
  pipeline: [
    { client: 'Client A', project: 'Sample Project', month: 'Jun 2026', payments: [{ label: '50% upfront', amount: 0, received: true, date: 'Jun 1', net: 0 }, { label: '50% final', amount: 0, received: false, date: 'Pending', net: undefined }] },
  ],
  groceriesByMonth: {
    Jun: [{ name: 'Sample Store', val: 0 }],
  } as Record<string, { name: string; val: number }[]>,
  diningByMonth: {
    Jun: [{ name: 'Sample Cafe', val: 0 }],
  } as Record<string, { name: string; val: number }[]>,
  subsByMonth: {
    Jun: [{ name: 'Sample Sub', val: 0, cancelled: false }],
  } as Record<string, { name: string; val: number; cancelled?: boolean }[]>,
}

const MPG = 30
const GAS_PRICE = 5.50
const gasCost = (miles: number) => (miles / MPG) * GAS_PRICE

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('en-US')
const fmtD = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Ledger types + helpers ─────────────────────────────────────────────────────

interface LedgerRow {
  id: string; date: string; account: string; category: string; subcategory: string
  description: string; amount: number; direction: 'in' | 'out'; source: string
  uncertain: boolean; annotation: string
}

function monthCashFlow(rows: LedgerRow[], ym: string) {
  let income = 0, spent = 0
  for (const r of rows) {
    if (r.date.slice(0, 7) !== ym) continue
    if (/reimbursed/i.test(r.subcategory)) continue
    if (r.direction === 'in') income += r.amount
    else spent += r.amount
  }
  return { income: Math.round(income), spent: Math.round(spent), net: Math.round(income - spent) }
}

function monthSpendByCategory(rows: LedgerRow[], ym: string) {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (r.direction !== 'out' || r.date.slice(0, 7) !== ym) continue
    if (/reimbursed/i.test(r.subcategory)) continue
    out[r.category] = (out[r.category] || 0) + r.amount
  }
  return out
}

function elapsedFraction(date: Date) {
  const day = date.getDate()
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return day / daysInMonth
}

function budgetStatus(spent: number, target: number, fraction: number) {
  const remaining = target - spent
  const pct = target > 0 ? spent / target : 0
  const projected = fraction > 0 ? spent / fraction : spent
  let state: 'under' | 'watch' | 'over' = 'under'
  if (spent >= target) state = 'over'
  else if (fraction >= 0.2 && projected > target) state = 'watch'
  return { spent, target, remaining, pct, projected, state }
}

function groupByMonth(rows: LedgerRow[]) {
  const map = new Map<string, { ym: string; label: string; rows: LedgerRow[]; outTotal: number; inTotal: number }>()
  for (const r of rows) {
    const ym = r.date.slice(0, 7)
    let g = map.get(ym)
    if (!g) {
      const label = new Date(ym + '-02T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      g = { ym, label, rows: [], outTotal: 0, inTotal: 0 }
      map.set(ym, g)
    }
    g.rows.push(r)
    if (r.direction === 'out') g.outTotal += r.amount
    else g.inTotal += r.amount
  }
  const groups = [...map.values()].sort((a, b) => b.ym.localeCompare(a.ym))
  for (const g of groups) g.rows.sort((a, b) => b.date.localeCompare(a.date))
  return groups
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('rounded-xl border border-border bg-card p-4', className)}>{children}</div>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{children}</p>
)

const Row = ({ label, value, sub, dim, color }: { label: React.ReactNode; value: string; sub?: string; dim?: boolean; color?: string }) => (
  <div className="flex items-start justify-between py-1.5 border-b border-border/40 last:border-0 gap-2">
    <div>
      <span className="text-sm">{label}</span>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
    <span className={cn('text-sm font-medium shrink-0', dim ? 'text-muted-foreground' : color)}>{value}</span>
  </div>
)

const MONTHS = ['Feb', 'Mar', 'Apr', 'May', 'Jun'] as const
type Month = typeof MONTHS[number]

function MonthPicker({ value, onChange }: { value: Month; onChange: (m: Month) => void }) {
  return (
    <select
      className="text-xs bg-muted border border-border rounded px-2 py-1 text-foreground"
      value={value}
      onChange={e => onChange(e.target.value as Month)}
    >
      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}

// ── Overview ───────────────────────────────────────────────────────────────────

function Overview() {
  const { period, contractsClosed, received, pending, revenue, netRevenue, expenses, ebitda, margin } = DATA.overview
  return (
    <Card>
      <div className="flex flex-col md:flex-row md:items-stretch gap-4 mb-4">
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-4xl font-bold tracking-tight">{fmt(contractsClosed)}</p>
          <p className="text-sm text-muted-foreground mt-1">Total Contracts Closed</p>
        </div>
        <div className="flex gap-6 md:border-l md:border-border md:pl-6">
          <div>
            <p className="text-xl font-semibold text-green-500">{fmt(received)}</p>
            <p className="text-xs text-muted-foreground">Received</p>
          </div>
          <div className="w-px bg-border" />
          <div>
            <p className="text-xl font-semibold text-amber-500">{fmt(pending)}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{period} P&amp;L</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Gross Revenue', val: revenue, note: 'Invoiced Feb–May', color: 'text-blue-400' },
          { label: 'Net Revenue', val: netRevenue, note: 'After platform fees', color: 'text-blue-400' },
          { label: 'Expenses', val: expenses, note: 'Tools & overhead', color: 'text-red-500' },
          { label: 'EBITDA', val: ebitda, note: `${margin}% margin`, color: 'text-green-500' },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-border bg-muted/30 p-3">
            <p className={cn('text-lg font-semibold', t.color)}>{fmt(t.val)}</p>
            <p className="text-xs font-medium mt-0.5">{t.label}</p>
            <p className="text-[10px] text-muted-foreground">{t.note}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── CashFlow ───────────────────────────────────────────────────────────────────

function CashFlow({ ledger }: { ledger: LedgerRow[] }) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monLong = now.toLocaleString('en-US', { month: 'long' })
  const liquid = DATA.accounts.filter(a => !a.locked).reduce((s, a) => s + a.val, 0)
  const burn = DATA.burn.personal + DATA.burn.tools
  const runwayDays = Math.round(liquid / burn * 30)
  const state = runwayDays < 30 ? 'over' : runwayDays < 60 ? 'watch' : 'under'
  const cf = useMemo(() => monthCashFlow(ledger, ym), [ledger, ym])
  const stateColor = { under: 'text-green-500', watch: 'text-amber-500', over: 'text-red-500' }

  return (
    <Card>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <SectionLabel>Runway · if income stopped</SectionLabel>
          <p className={cn('text-4xl font-bold', stateColor[state])}>{runwayDays}<span className="text-lg font-normal text-muted-foreground"> days</span></p>
          <p className="text-xs text-muted-foreground mt-1">{fmt(liquid)} liquid ÷ {fmt(burn)}/mo burn</p>
        </div>
        <div>
          <SectionLabel>{monLong} cash flow</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Income</span><span className="text-green-500">+{fmt(cf.income)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Spent</span><span className="text-red-500">−{fmt(cf.spent)}</span></div>
            <div className="flex justify-between text-sm font-semibold border-t border-border pt-1.5">
              <span>Net</span>
              <span className={cf.net >= 0 ? 'text-green-500' : 'text-red-500'}>{cf.net >= 0 ? '+' : '−'}{fmt(Math.abs(cf.net))}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Net Worth ──────────────────────────────────────────────────────────────────

function NetWorthCard() {
  const liquid = DATA.accounts.filter(a => !a.locked).reduce((s, a) => s + a.val, 0)
  const assets = DATA.accounts.reduce((s, a) => s + a.val, 0)
  const totalDebt = DATA.debt.reduce((s, d) => s + d.val, 0)
  const burn = DATA.burn.personal + DATA.burn.tools
  const netWorth = assets - totalDebt
  const efTarget = burn * 3
  const efMonths = liquid / burn
  const efPct = Math.min(liquid / efTarget * 100, 100)
  const efState = efMonths < 1 ? 'over' : efMonths < 3 ? 'watch' : 'under'
  const barColor = { under: 'bg-green-500', watch: 'bg-amber-500', over: 'bg-red-500' }
  const textColor = { under: 'text-green-500', watch: 'text-amber-500', over: 'text-red-500' }

  return (
    <Card>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <SectionLabel>Emergency fund · 3-mo target</SectionLabel>
          <p className={cn('text-4xl font-bold', textColor[efState])}>{efMonths.toFixed(1)}<span className="text-lg font-normal text-muted-foreground"> mo</span></p>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-2 mb-1">
            <div className={cn('h-full rounded-full', barColor[efState])} style={{ width: `${efPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{fmt(liquid)} of {fmt(efTarget)} · {fmt(burn)}/mo × 3</p>
        </div>
        <div>
          <SectionLabel>Net worth</SectionLabel>
          <p className={cn('text-4xl font-bold', netWorth >= 0 ? 'text-green-500' : 'text-red-500')}>
            {netWorth < 0 ? '−' : ''}{fmt(Math.abs(netWorth))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">assets {fmt(assets)} · debt {fmt(totalDebt)}</p>
          <p className="text-xs text-muted-foreground">active: CC {fmt(DATA.ccDebt)} · rest deferred</p>
        </div>
      </div>
    </Card>
  )
}

// ── Budget ─────────────────────────────────────────────────────────────────────

function BudgetSection({ ledger, budgets }: { ledger: LedgerRow[]; budgets: Record<string, number> }) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const day = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const fraction = elapsedFraction(now)
  const monLong = now.toLocaleString('en-US', { month: 'long' })
  const spendByCat = useMemo(() => monthSpendByCategory(ledger, ym), [ledger, ym])
  const rows = Object.entries(budgets).map(([cat, target]) => ({ cat, ...budgetStatus(spendByCat[cat] || 0, target, fraction) }))
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
  const totalTarget = rows.reduce((s, r) => s + r.target, 0)
  const pacePct = Math.min(fraction * 100, 100)
  const barColor = { under: 'bg-green-500', watch: 'bg-amber-500', over: 'bg-red-500' }

  if (rows.length === 0) return null

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>This Month · Budget</SectionLabel>
        <span className="text-xs text-muted-foreground">{monLong} · day {day}/{daysInMonth} · {fmt(totalSpent)} / {fmt(totalTarget)}</span>
      </div>
      {rows.map(r => (
        <div key={r.cat} className="py-2 border-b border-border/40 last:border-0">
          <div className="flex justify-between mb-1.5">
            <span className="text-sm">{r.cat}</span>
            <span className="text-sm">
              <span className={cn('font-medium', r.state === 'over' ? 'text-red-500' : r.state === 'watch' ? 'text-amber-500' : '')}>{fmt(r.spent)}</span>
              <span className="text-muted-foreground"> / {fmt(r.target)}</span>
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
            <div className={cn('h-full rounded-full', barColor[r.state])} style={{ width: `${Math.min(r.pct * 100, 100)}%` }} />
            <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${pacePct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className={cn('text-xs', r.remaining >= 0 ? 'text-muted-foreground' : 'text-red-500')}>
              {r.remaining >= 0 ? `${fmt(r.remaining)} left` : `${fmt(Math.abs(r.remaining))} over`}
            </span>
            <span className="text-xs text-muted-foreground">proj {fmt(r.projected)}</span>
          </div>
        </div>
      ))}
    </Card>
  )
}

// ── Data As Of ─────────────────────────────────────────────────────────────────

function DataAsOf() {
  const { dataAsOf } = DATA
  const accounts = [
    { label: 'Checking', date: dataAsOf.checking },
    { label: 'Savings', date: dataAsOf.savings },
    { label: 'CC', date: dataAsOf.cc },
    { label: 'Ally', date: dataAsOf.ally },
  ]
  const oldest = accounts.reduce((a, b) => a.date < b.date ? a : b)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">Data as of</span>
      {accounts.map(a => (
        <span key={a.label} className={cn('px-2 py-0.5 rounded border', a.date === oldest.date ? 'border-amber-500/50 text-amber-500' : 'border-border')}>
          {a.label}: {a.date}
        </span>
      ))}
    </div>
  )
}

// ── Goal Bar ───────────────────────────────────────────────────────────────────

function GoalBar() {
  const { collected, target } = DATA.june
  const remaining = target - collected
  const pct = (collected / target * 100).toFixed(1)
  const burn = DATA.burn.personal + DATA.burn.tools
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <SectionLabel>June Revenue Goal</SectionLabel>
        <div className="flex gap-4 text-right">
          <div><p className="text-sm font-semibold text-green-500">{fmt(collected)}</p><p className="text-[10px] text-muted-foreground">Collected</p></div>
          <div><p className="text-sm font-semibold text-amber-500">{fmt(remaining)}</p><p className="text-[10px] text-muted-foreground">Still Hunting</p></div>
          <div><p className="text-sm font-semibold text-muted-foreground">{fmt(target)}</p><p className="text-[10px] text-muted-foreground">Target</p></div>
        </div>
      </div>
      <div className="h-6 rounded-full bg-muted overflow-hidden flex items-center">
        <div className="h-full bg-green-500 rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${pct}%` }}>
          <span className="text-[10px] font-medium text-white">{pct}%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">At goal: {(target / burn).toFixed(1)}× monthly burn covered</p>
    </Card>
  )
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

function PipelineCard() {
  const totalPending = DATA.pipeline.reduce((s, job) =>
    s + job.payments.filter(p => !p.received).reduce((a, p) => a + p.amount, 0), 0)
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>All Jobs</SectionLabel>
        {totalPending > 0 && <span className="text-xs text-amber-500 font-medium">{fmt(totalPending)} pending</span>}
      </div>
      <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
        {DATA.pipeline.map((job, ji) => {
          const total = job.payments.reduce((s, p) => s + p.amount, 0)
          const pending = job.payments.filter(p => !p.received).reduce((s, p) => s + p.amount, 0)
          return (
            <div key={ji} className="border border-border/60 rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-sm font-medium">{job.client}</span>
                  <span className="text-xs text-muted-foreground ml-2">{job.project}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{fmt(total)}</p>
                  <p className="text-[10px] text-muted-foreground">{job.month}</p>
                  {pending > 0 && <p className="text-[10px] text-amber-500">{fmt(pending)} pending</p>}
                </div>
              </div>
              {job.payments.map((p, i) => (
                <div key={i} className={cn('flex items-center gap-2 text-xs', p.received ? 'text-muted-foreground' : '')}>
                  <span className={p.received ? 'text-green-500' : 'text-muted-foreground/40'}>{'received' in p && p.received ? '✓' : '○'}</span>
                  <span className="flex-1">{p.label}</span>
                  <span className="text-muted-foreground">{p.date}</span>
                  <span className={p.received ? '' : 'text-amber-500 font-medium'}>{fmt(p.amount)}</span>
                  {p.received && p.net && <span className="text-muted-foreground">· {fmt(p.net)} net</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Key Tiles ──────────────────────────────────────────────────────────────────

function Tiles() {
  const liquid = DATA.accounts.filter(a => !a.locked).reduce((s, a) => s + a.val, 0)
  const avail = DATA.ccLimit - DATA.ccDebt
  const burn = DATA.burn.personal + DATA.burn.tools
  const tiles = [
    { label: 'Accessible Cash', val: fmt(liquid + avail), note: `Cash ${fmt(liquid)} + ${fmt(avail)} available CC`, color: 'text-green-500' },
    { label: 'Monthly Burn', val: fmt(burn), note: 'Personal + tools · no rent', color: 'text-red-500' },
    { label: 'CC Balance', val: fmt(DATA.ccDebt), note: 'Bank · 11.9% APR · $33/mo', color: 'text-amber-500' },
    { label: 'Break-Even', val: '$1,519', note: 'Minimum to cover everything', color: 'text-blue-400' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map(t => (
        <Card key={t.label} className="!p-3">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={cn('text-xl font-bold mt-1', t.color)}>{t.val}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{t.note}</p>
        </Card>
      ))}
    </div>
  )
}

// ── Spend Card ─────────────────────────────────────────────────────────────────

function SpendCard({ title, monthData }: { title: string; monthData: Record<string, { name: string; val: number }[]> }) {
  const [month, setMonth] = useState<Month>('Jun')
  const items = monthData[month] || []
  const total = items.reduce((s, i) => s + i.val, 0)
  const max = Math.max(...items.map(i => i.val), 1)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{title}</SectionLabel>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      {items.length === 0
        ? <p className="text-xs text-muted-foreground py-2">No data</p>
        : items.map(item => (
          <div key={item.name} className="py-1.5">
            <div className="flex justify-between text-sm mb-1">
              <span>{item.name}</span>
              <span className="text-muted-foreground">{fmtD(item.val)}</span>
            </div>
            <div className="h-1 bg-muted rounded-full">
              <div className="h-full bg-foreground/30 rounded-full" style={{ width: `${item.val / max * 100}%` }} />
            </div>
          </div>
        ))
      }
      <div className="flex justify-between text-sm font-medium border-t border-border pt-2 mt-1">
        <span>Total</span><span>{fmtD(total)}</span>
      </div>
    </Card>
  )
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

function SubsCard() {
  const [month, setMonth] = useState<Month>('Jun')
  const items = DATA.subsByMonth[month] || []
  const active = items.filter(s => !s.cancelled)
  const total = active.reduce((s, i) => s + i.val, 0)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Subscriptions</SectionLabel>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      {items.map(s => (
        <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
          <span className={cn('text-sm', s.cancelled && 'line-through text-muted-foreground')}>
            {s.name}
            {s.cancelled && <span className="ml-1.5 text-[10px] bg-muted px-1 py-0.5 rounded">cancelled</span>}
          </span>
          <span className={cn('text-sm', s.cancelled ? 'text-muted-foreground' : '')}>{fmtD(s.val)}/mo</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-medium pt-2">
        <span>Total (active)</span><span>{fmtD(total)}/mo</span>
      </div>
    </Card>
  )
}

// ── P&L Chart ──────────────────────────────────────────────────────────────────

function PLChart() {
  const [hovered, setHovered] = useState<string | null>(null)
  const maxAbs = Math.max(...DATA.pl.map(p => Math.abs(p.net)), 1)
  return (
    <Card>
      <SectionLabel>Net Profit — Monthly</SectionLabel>
      <div className="flex items-end gap-2 h-32">
        {DATA.pl.map(p => {
          const h = Math.round(Math.abs(p.net) / maxAbs * 100)
          const isNeg = p.net < 0
          const isCur = p.current
          const barColor = isCur ? 'bg-amber-500' : isNeg ? 'bg-red-500' : 'bg-green-500'
          const textColor = isCur ? 'text-amber-500' : isNeg ? 'text-red-500' : 'text-green-500'
          return (
            <div key={p.month} className="flex-1 flex flex-col items-center gap-1 cursor-default"
              onMouseEnter={() => setHovered(p.month)} onMouseLeave={() => setHovered(null)}>
              {hovered === p.month && (
                <span className={cn('text-[10px] font-medium whitespace-nowrap', textColor)}>
                  {isNeg ? '−' : '+'}{fmt(p.net)}
                </span>
              )}
              <div className="w-full flex flex-col justify-end" style={{ height: 96 }}>
                <div className={cn('rounded-t w-full', barColor, hovered && hovered !== p.month && 'opacity-40')}
                  style={{ height: `${h}%`, minHeight: 2 }} />
              </div>
              <span className="text-[9px] text-muted-foreground">{p.month}{isCur ? ' ↑' : ''}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Accounts + Debt ────────────────────────────────────────────────────────────

function AccountsDebt() {
  const liquid = DATA.accounts.filter(a => !a.locked).reduce((s, a) => s + a.val, 0)
  return (
    <Card>
      <SectionLabel>Accounts</SectionLabel>
      {DATA.accounts.map(a => (
        <Row key={a.name} label={<>{a.name}{a.locked && <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">locked</span>}</>}
          value={fmtD(a.val)} dim={a.locked} />
      ))}
      <div className="flex justify-between py-1.5 text-sm font-medium">
        <span className="text-muted-foreground">Liquid Total</span>
        <span className="text-green-500">{fmt(liquid)}</span>
      </div>
      <div className="h-px bg-border my-3" />
      <SectionLabel>Debt</SectionLabel>
      {DATA.debt.map(d => (
        <Row key={d.name} label={d.name} sub={d.note} value={fmt(d.val)} dim={d.dim} color="text-red-500" />
      ))}
    </Card>
  )
}

// ── Tool Stack ─────────────────────────────────────────────────────────────────

function ToolStack() {
  const total = DATA.tools.reduce((s, t) => s + t.cost, 0)
  return (
    <Card>
      <SectionLabel>Tool Stack</SectionLabel>
      {DATA.tools.map(t => (
        <div key={t.name} className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
          <span>{t.name}</span>
          <span className="text-muted-foreground">{fmtD(t.cost)}/mo</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-medium pt-2">
        <span>Total</span><span>{fmtD(total)}/mo</span>
      </div>
    </Card>
  )
}

// ── Networking ─────────────────────────────────────────────────────────────────

function NetworkingCard() {
  const tripCost = (t: typeof DATA.networking[0]) =>
    (t.miles ? gasCost(t.miles) : 0) + t.extras.reduce((s, e) => s + e.amount, 0)

  const byMonth = DATA.networking.reduce<Record<string, typeof DATA.networking>>((acc, t) => {
    const m = t.date.slice(0, 7)
    acc[m] = acc[m] || []
    acc[m].push(t)
    return acc
  }, {})
  const monthKeys = Object.keys(byMonth).sort().reverse()
  const [idx, setIdx] = useState(0)
  const key = monthKeys[idx]
  const events = byMonth[key] || []
  const total = events.reduce((s, t) => s + tripCost(t), 0)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Networking Spend</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{MPG}mpg · ${GAS_PRICE.toFixed(2)}/gal</span>
          <select className="text-xs bg-muted border border-border rounded px-2 py-1 text-foreground" value={idx} onChange={e => setIdx(Number(e.target.value))}>
            {monthKeys.map((k, i) => <option key={k} value={i}>{new Date(k + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</option>)}
          </select>
        </div>
      </div>
      {events.map((t, i) => {
        const tc = tripCost(t)
        return (
          <div key={i} className="py-2 border-b border-border/40 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate flex-1 mr-2">{t.event}</span>
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground mr-3">{t.date}</span>
                <span className="text-sm font-medium">${tc.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.miles ? `${t.miles} mi · gas $${gasCost(t.miles).toFixed(2)}` : 'no separate gas'}
              {t.extras.map((e, j) => <span key={j}> · {e.name} ${e.amount.toFixed(2)}</span>)}
            </p>
          </div>
        )
      })}
      <div className="flex justify-between text-sm font-medium pt-2">
        <span>Month total</span><span>${total.toFixed(2)}</span>
      </div>
    </Card>
  )
}

// ── Tax Card ───────────────────────────────────────────────────────────────────

function TaxCard() {
  const { months, note } = DATA.taxLiability
  const totalNet = months.reduce((s, m) => s + m.net, 0)
  const estimated = Math.round(totalNet * 0.141)
  return (
    <Card>
      <SectionLabel>Tax Liability — Due April 2027</SectionLabel>
      {months.map(m => (
        <div key={m.month} className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
          <span className="text-muted-foreground">{m.month} net profit</span>
          <span className="text-muted-foreground">{m.net > 0 ? '+' : ''}{fmt(m.net)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-medium pt-1.5 pb-3 border-b border-border">
        <span>Total net profit (Feb–May)</span><span>{fmt(totalNet)}</span>
      </div>
      <div className="flex justify-between items-baseline pt-3">
        <span className="text-sm text-muted-foreground">Estimated SE tax owed (14.1%)</span>
        <span className="text-lg font-bold text-red-500">{fmt(estimated)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{note}</p>
    </Card>
  )
}

// ── Receipts ─────────────────────────────────────────────────────────────────

interface ReceiptItem { name: string; price: number; note?: string; category?: string; discount?: number; regular?: number; final?: number }
interface Receipt {
  date: string; total: number; image: string; merchant: string
  subtotal?: number; tax?: number; account?: string; ledgerDate?: string; notes?: string
  items?: ReceiptItem[]
}

const receiptImg = (file: string) => `/api/finances/receipts/${file}`
const amt2 = (n: number) => Number(n).toFixed(2)
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)
const round2 = (n: number) => Math.round(n * 100) / 100

// A receipt ties to a transaction by amount (+ account), tolerating a posting-date
// shift of a couple days (the bank often posts an in-store purchase 1–2 days later).
function receiptMatches(receipt: Receipt, txn: LedgerRow, windowDays = 2) {
  if (amt2(receipt.total) !== amt2(txn.amount)) return false
  if (receipt.account && receipt.account !== txn.account) return false
  if (receipt.ledgerDate) return receipt.ledgerDate === txn.date
  return Math.abs(dayDiff(receipt.date, txn.date)) <= windowDays
}

// (txn) => receipt | null — powers the 📎 on ledger rows.
function buildReceiptMatcher(receipts: Receipt[], windowDays = 2) {
  const byAmount = new Map<string, Receipt[]>()
  for (const r of receipts) {
    const k = amt2(r.total)
    if (!byAmount.has(k)) byAmount.set(k, [])
    byAmount.get(k)!.push(r)
  }
  return (txn: LedgerRow): Receipt | null => {
    const cands = (byAmount.get(amt2(txn.amount)) || []).filter(r => receiptMatches(r, txn, windowDays))
    if (!cands.length) return null
    return cands.reduce((best, c) => Math.abs(dayDiff(c.date, txn.date)) < Math.abs(dayDiff(best.date, txn.date)) ? c : best)
  }
}

// (receipt) => ledger row | null — for the Receipts grid (focus link + default category).
function buildRowMatcher(ledger: LedgerRow[], windowDays = 2) {
  const byAmount = new Map<string, LedgerRow[]>()
  for (const row of ledger) {
    if (row.direction !== 'out') continue
    const k = amt2(row.amount)
    if (!byAmount.has(k)) byAmount.set(k, [])
    byAmount.get(k)!.push(row)
  }
  return (receipt: Receipt): LedgerRow | null => {
    const cands = (byAmount.get(amt2(receipt.total)) || []).filter(row => receiptMatches(receipt, row, windowDays))
    if (!cands.length) return null
    return cands.reduce((best, c) => Math.abs(dayDiff(c.date, receipt.date)) < Math.abs(dayDiff(best.date, receipt.date)) ? c : best)
  }
}

// Fold discount lines (negative price) into the item above, for regular → final display.
function mergeDiscounts(items: ReceiptItem[]): ReceiptItem[] {
  const out: ReceiptItem[] = []
  for (const it of items || []) {
    if (it.price < 0 && out.length) {
      const parent = out[out.length - 1]
      parent.discount = round2((parent.discount || 0) + it.price)
    } else out.push({ ...it })
  }
  for (const it of out) {
    if (it.discount) { it.regular = it.price; it.final = round2(it.price + it.discount) }
    else it.final = it.price
  }
  return out
}

const totalSavings = (items: ReceiptItem[] = []) => round2(-items.filter(it => it.price < 0).reduce((s, it) => s + it.price, 0))

// Split a receipt's total across categories from its tagged items, scaled so it sums exactly.
function receiptBreakdown(receipt: Receipt, defaultCategory: string): Record<string, number> | null {
  const items = receipt.items || []
  if (!items.length) return null
  const bySub: Record<string, number> = {}
  let priceSum = 0
  for (const it of items) {
    const cat = it.category || defaultCategory
    bySub[cat] = (bySub[cat] || 0) + it.price
    priceSum += it.price
  }
  const scale = priceSum !== 0 ? receipt.total / priceSum : 1
  const out: Record<string, number> = {}
  let acc = 0
  const cats = Object.keys(bySub)
  for (const cat of cats) { out[cat] = round2(bySub[cat] * scale); acc += out[cat] }
  const remainder = round2(receipt.total - acc)
  if (remainder !== 0) {
    const biggest = cats.reduce((a, b) => (out[b] > out[a] ? b : a))
    out[biggest] = round2(out[biggest] + remainder)
  }
  return out
}

function ReceiptViewer({ receipt, focusId, defaultCategory = 'Groceries', onClose, onGotoLedger }: {
  receipt: Receipt; focusId?: string; defaultCategory?: string; onClose: () => void; onGotoLedger?: (id: string) => void
}) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hasSplit = (receipt.items || []).some(it => it.category)
  const breakdown = hasSplit ? receiptBreakdown(receipt, defaultCategory) : null
  const items = mergeDiscounts(receipt.items || [])
  const saved = totalSavings(receipt.items)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
        <div className="md:w-1/2 bg-muted/40 flex items-center justify-center p-3 shrink-0">
          {imgError
            ? <div className="text-xs text-muted-foreground text-center">image pending<br /><span className="opacity-60">{receipt.image}</span></div>
            : <a href={receiptImg(receipt.image)} target="_blank" rel="noreferrer">
                <img src={receiptImg(receipt.image)} alt={`${receipt.merchant} receipt`} onError={() => setImgError(true)}
                  className="max-h-[40vh] md:max-h-[80vh] rounded-lg object-contain" />
              </a>}
        </div>
        <div className="md:w-1/2 p-5 overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{receipt.merchant}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {receipt.date} · {fmtD(receipt.total)}
                {focusId && onGotoLedger && (
                  <> · <button className="text-foreground underline" onClick={() => { onGotoLedger(focusId) }}>view in ledger →</button></>
                )}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>

          {items.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-sm border-b border-border/30 pb-1.5 last:border-0">
                  <span className="flex-1">{it.name}{it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded', it.category ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/60')}>{it.category || defaultCategory}</span>
                    {it.discount
                      ? <span className="text-right"><span className="line-through text-muted-foreground mr-1">{fmtD(it.regular!)}</span><b>{fmtD(it.final!)}</b></span>
                      : <span>{fmtD(it.final!)}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(receipt.subtotal != null || receipt.tax != null) && (
            <div className="mt-4 flex flex-col gap-1 text-sm">
              {receipt.subtotal != null && <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtD(receipt.subtotal)}</span></div>}
              {saved > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Instant savings</span><span className="text-green-500">−{fmtD(saved)}</span></div>}
              {receipt.tax != null && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmtD(receipt.tax)}</span></div>}
              <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1"><span>Total</span><span>{fmtD(receipt.total)}</span></div>
            </div>
          )}

          {breakdown && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-1.5">Counts toward</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([cat, a]) => (
                  <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-muted">{cat} <b>{fmtD(a)}</b></span>
                ))}
              </div>
            </div>
          )}
          {receipt.notes && <div className="mt-4 text-xs text-muted-foreground">{receipt.notes}</div>}
        </div>
      </div>
    </div>
  )
}

function ReceiptsView({ receipts, ledger, onOpen }: {
  receipts: Receipt[]; ledger: LedgerRow[]; onOpen: (r: Receipt, focusId?: string, cat?: string) => void
}) {
  const matchRow = useMemo(() => buildRowMatcher(ledger), [ledger])
  if (!receipts.length) return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No receipts yet.</div>
  const sorted = [...receipts].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {sorted.map((r, i) => {
        const row = matchRow(r)
        return (
          <button key={i} onClick={() => onOpen(r, row?.id, row?.category)}
            className="group rounded-xl border border-border bg-card overflow-hidden text-left hover:border-foreground/30 transition-colors">
            <div className="aspect-[3/4] bg-muted/40 overflow-hidden">
              <img src={receiptImg(r.image)} alt={r.merchant} loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            </div>
            <div className="p-2.5">
              <div className="text-sm font-medium truncate">{r.merchant}</div>
              <div className="text-xs text-muted-foreground flex justify-between mt-0.5"><span>{r.date}</span><span>{fmtD(r.total)}</span></div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Sub-navigation ───────────────────────────────────────────────────────────

type FinTab = 'dashboard' | 'ledger' | 'receipts'

function TabBar({ tab, setTab }: { tab: FinTab; setTab: (t: FinTab) => void }) {
  const tabs: { id: FinTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'receipts', label: 'Receipts' },
  ]
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Ledger View ────────────────────────────────────────────────────────────────

function LedgerView({ ledger, matchReceipt, onOpenReceipt, focusId }: {
  ledger: LedgerRow[]
  matchReceipt: (txn: LedgerRow) => Receipt | null
  onOpenReceipt: (r: Receipt, focusId?: string, cat?: string) => void
  focusId?: string
}) {
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [accounts, setAccounts] = useState<string[]>([])
  const [direction, setDirection] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const focusRef = useRef<HTMLDivElement | null>(null)

  const allCats = useMemo(() => [...new Set(ledger.map(r => r.category))].filter(Boolean).sort(), [ledger])
  const allAccts = useMemo(() => [...new Set(ledger.map(r => r.account))].filter(Boolean).sort(), [ledger])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const cats = new Set(categories)
    const accs = new Set(accounts)
    return ledger.filter(r => {
      if (direction !== 'all' && r.direction !== direction) return false
      if (cats.size && !cats.has(r.category)) return false
      if (accs.size && !accs.has(r.account)) return false
      if (q) {
        const hay = `${r.description} ${r.category} ${r.subcategory}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [ledger, search, categories, accounts, direction])
  const groups = useMemo(() => groupByMonth(filtered), [filtered])

  useEffect(() => {
    if (groups.length > 0) setExpanded(new Set(groups.slice(0, 2).map(g => g.ym)))
  }, [groups.length])

  // Deep link: when a focus id is set, expand its month and scroll to it.
  useEffect(() => {
    if (!focusId) return
    const g = groups.find(gr => gr.rows.some(r => r.id === focusId))
    if (g) setExpanded(prev => new Set(prev).add(g.ym))
  }, [focusId, groups])
  useEffect(() => {
    if (focusId && focusRef.current) focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, expanded])

  const toggle = (list: string[], set: (f: (p: string[]) => string[]) => void, v: string) =>
    set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, category…"
            className="flex-1 text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['all', 'out', 'in'] as const).map(d => (
              <button key={d} onClick={() => setDirection(d)}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors', direction === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allCats.map(c => (
            <button key={c} onClick={() => toggle(categories, setCategories, c)}
              className={cn('px-2 py-0.5 text-xs rounded-full border transition-colors', categories.includes(c) ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allAccts.map(a => (
            <button key={a} onClick={() => toggle(accounts, setAccounts, a)}
              className={cn('px-2 py-0.5 text-xs rounded-full border border-dashed transition-colors', accounts.includes(a) ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} transactions</p>
      {groups.map(g => (
        <div key={g.ym} className="rounded-xl border border-border bg-card overflow-hidden">
          <button onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(g.ym) ? n.delete(g.ym) : n.add(g.ym); return n })}
            className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{g.label}</span>
              <span className="text-xs text-muted-foreground">{g.rows.length} txns</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-red-500">−{fmt(g.outTotal)}</span>
              {g.inTotal > 0 && <span className="text-green-500">+{fmt(g.inTotal)}</span>}
              <svg width="12" height="12" viewBox="0 0 12 12" className={cn('text-muted-foreground transition-transform', expanded.has(g.ym) && 'rotate-180')}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
          {expanded.has(g.ym) && (
            <div className="border-t border-border">
              {g.rows.map(r => {
                const receipt = matchReceipt(r)
                const focused = r.id === focusId
                return (
                  <div key={r.id} ref={focused ? focusRef : null}
                    className={cn('flex items-center gap-2 px-4 py-2 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors',
                      focused && 'bg-yellow-500/10 ring-1 ring-inset ring-yellow-500/40')}>
                    <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">{r.date.slice(5)}</span>
                    <span className="flex-1 text-sm truncate">{r.subcategory && r.subcategory !== r.category ? r.subcategory : r.description}</span>
                    {receipt && (
                      <button title="View receipt" onClick={() => onOpenReceipt(receipt, r.id, r.category)}
                        className="text-xs shrink-0 hover:scale-110 transition-transform">📎</button>
                    )}
                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded shrink-0 hidden sm:inline">{r.account.replace('Bank ', '')}</span>
                    <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded shrink-0">{r.category}</span>
                    <span className={cn('text-sm font-medium shrink-0 w-20 text-right', r.direction === 'in' ? 'text-green-500' : '')}>
                      {r.direction === 'in' ? '+' : '−'}{fmtD(r.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Dashboard tab ────────────────────────────────────────────────────────────

function Dashboard({ ledger, budgets }: { ledger: LedgerRow[]; budgets: Record<string, number> }) {
  return (
    <>
      <Overview />
      <div className="grid md:grid-cols-2 gap-4">
        <CashFlow ledger={ledger} />
        <NetWorthCard />
      </div>
      <BudgetSection ledger={ledger} budgets={budgets} />
      <DataAsOf />
      <div className="grid md:grid-cols-2 gap-4">
        <GoalBar />
        <PipelineCard />
      </div>
      <Tiles />
      <div className="grid md:grid-cols-3 gap-4">
        <SpendCard title="Groceries" monthData={DATA.groceriesByMonth} />
        <SpendCard title="Dining" monthData={DATA.diningByMonth} />
        <SubsCard />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <PLChart />
        <AccountsDebt />
      </div>
      <ToolStack />
      <NetworkingCard />
      <TaxCard />
    </>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Finances() {
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [, setVersion] = useState(0)
  const [tab, setTab] = useState<FinTab>('dashboard')
  const [focusId, setFocusId] = useState<string | undefined>()
  const [openReceipt, setOpenReceipt] = useState<{ receipt: Receipt; focusId?: string; cat?: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/finances/ledger').then(r => r.json()),
      fetch('/api/finances/budgets').then(r => r.json()),
      fetch('/api/finances/data').then(r => r.json()),
      fetch('/api/finances/receipts').then(r => r.json()),
    ]).then(([l, b, d, rec]) => {
      setLedger(l.rows ?? [])
      setBudgets(b.budgets ?? {})
      if (d?.data && Object.keys(d.data).length) {
        DATA = { ...DATA, ...(d.data as Partial<typeof DATA>) }
        setVersion(v => v + 1)
      }
      setReceipts(rec.receipts ?? [])
    }).catch(() => null)
  }, [])

  const matchReceipt = useMemo(() => buildReceiptMatcher(receipts), [receipts])

  const openReceiptFor = (receipt: Receipt, fId?: string, cat?: string) => setOpenReceipt({ receipt, focusId: fId, cat })
  const gotoLedger = (id: string) => { setOpenReceipt(null); setFocusId(id); setTab('ledger') }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 flex flex-col gap-6">
      <TabBar tab={tab} setTab={t => { setTab(t); if (t !== 'ledger') setFocusId(undefined) }} />

      {tab === 'dashboard' && <Dashboard ledger={ledger} budgets={budgets} />}
      {tab === 'ledger' && <LedgerView ledger={ledger} matchReceipt={matchReceipt} onOpenReceipt={openReceiptFor} focusId={focusId} />}
      {tab === 'receipts' && <ReceiptsView receipts={receipts} ledger={ledger} onOpen={openReceiptFor} />}

      {openReceipt && (
        <ReceiptViewer receipt={openReceipt.receipt} focusId={openReceipt.focusId} defaultCategory={openReceipt.cat}
          onClose={() => setOpenReceipt(null)} onGotoLedger={gotoLedger} />
      )}
    </div>
  )
}
