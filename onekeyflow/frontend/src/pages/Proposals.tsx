import { useState } from 'react'
import { ArrowLeft, Copy, Check, Loader2, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Milestone {
  name: string
  duration: string
}

interface ProposalData {
  title: string
  problemTitle: string
  problemPitch: string
  solutionTitle: string
  solutionPitch: string
  platformList: string
  scopeDescription: string
  milestones: Milestone[]
}

interface ClientData {
  firstName: string
  lastName: string
  company: string
  email: string
  price: string
}

interface FormValues {
  firstName: string
  lastName: string
  company: string
  email: string
  businessDescription: string
  problem: string
  solution: string
  platforms: string
  timeline: string
  price: string
}

const EMPTY: FormValues = {
  firstName: '', lastName: '', company: '', email: '',
  businessDescription: '', problem: '', solution: '',
  platforms: '', timeline: '', price: '',
}

function Field({
  label, name, value, onChange, multiline = false, placeholder = '',
}: {
  label: string
  name: keyof FormValues
  value: string
  onChange: (name: keyof FormValues, value: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(name, e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-none"
        />
      ) : (
        <Input value={value} onChange={e => onChange(name, e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

function PitchText({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
      {text}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ProposalPreview({ client, proposal, pandadoc, onBack }: {
  client: ClientData
  proposal: ProposalData
  pandadoc: { id: string; url: string } | null
  onBack: () => void
}) {
  const price = parseFloat(client.price.replace(/[^0-9.]/g, '')) || 0
  const deposit = price / 2

  const fullText = [
    proposal.title,
    '',
    `Prepared for: ${client.firstName} ${client.lastName}, ${client.company}`,
    '',
    `Problem: ${proposal.problemTitle}`,
    '',
    `Hi ${client.firstName},`,
    `I spent some time trying to boil down our conversation into a list of areas that I think you need help with. Here are what I believe to be the core problems:`,
    '',
    proposal.problemPitch,
    '',
    proposal.solutionTitle,
    '',
    `My proposed solution to the problems above is as follows.`,
    '',
    proposal.solutionPitch,
    '',
    `Scope of Work`,
    proposal.scopeDescription,
    '',
    `Timeline`,
    ...proposal.milestones.map(m => `• ${m.name}: ${m.duration}`),
    '',
    `Your Investment`,
    `Total: $${price.toLocaleString()}`,
    `50% up-front: $${deposit.toLocaleString()}`,
    `Due at signing: $${deposit.toLocaleString()}`,
    '',
    `Platforms: ${proposal.platformList}`,
  ].join('\n')

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
          Back to form
        </button>
        <div className="flex items-center gap-4">
          {pandadoc && (
            <a
              href={pandadoc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-foreground/70 transition-colors"
            >
              <ExternalLink size={12} />
              Open in PandaDoc
            </a>
          )}
          <CopyButton text={fullText} />
        </div>
      </div>

      {/* Cover */}
      <div className="rounded-xl border border-border bg-foreground text-background p-10 mb-6">
        <h1 className="text-3xl font-bold leading-tight mb-8">{proposal.title}</h1>
        <div className="flex justify-between text-sm">
          <div>
            <p className="font-semibold mb-1">Prepared by</p>
            <p>Dmytro Petryshchuk</p>
            <p>OneKeyFlow</p>
          </div>
          <div className="text-right">
            <p className="font-semibold mb-1">Prepared for</p>
            <p>{client.firstName} {client.lastName}</p>
            <p>{client.company}</p>
          </div>
        </div>
      </div>

      {/* Problem */}
      <div className="rounded-xl border border-border bg-card p-8 mb-4">
        <h2 className="text-xl font-bold text-foreground mb-4">Problem: {proposal.problemTitle}</h2>
        <p className="text-sm text-foreground/70 mb-4">Hi {client.firstName},</p>
        <p className="text-sm text-foreground/70 mb-4">
          I spent some time trying to boil down our conversation into a list of areas that I think you need help with. Here are what I believe to be the core problems:
        </p>
        <PitchText text={proposal.problemPitch} />
        <p className="text-sm text-foreground/70 mt-4">
          The following pages include additional details that cover the full scope of the project we discussed earlier, including investment costs.
        </p>
      </div>

      {/* Solution */}
      <div className="rounded-xl border border-border bg-card p-8 mb-4">
        <h2 className="text-xl font-bold text-foreground mb-4">{proposal.solutionTitle}</h2>
        <p className="text-sm text-foreground/70 mb-4">My proposed solution to the problems above is as follows.</p>
        <PitchText text={proposal.solutionPitch} />
        <p className="text-sm text-foreground/70 mt-4">
          I consider this reasonably straightforward and am confident I can do an outstanding job here for you. If I wasn't, I wouldn't have put together this proposal.
        </p>
      </div>

      {/* Scope & Timeline */}
      <div className="rounded-xl border border-border bg-card p-8 mb-4">
        <h2 className="text-xl font-bold text-foreground mb-2">Scope of Work</h2>
        <p className="text-sm text-foreground/70 mb-6">{proposal.scopeDescription}</p>
        <h3 className="text-lg font-bold text-foreground mb-3">Timeline</h3>
        <p className="text-sm text-foreground/70 mb-4">
          My proposed timeline is pragmatic and takes into account past experience designing and building similar systems.
        </p>
        <ul className="space-y-2">
          {proposal.milestones.map((m, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0 mt-1.5" />
              <span className="font-medium">{m.name}</span>
              <span className="text-muted-foreground">— {m.duration}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-foreground/70 mt-4">
          I always endeavor to deliver projects ahead of schedule.
        </p>
      </div>

      {/* Investment */}
      {client.price && (
        <div className="rounded-xl border border-border bg-card p-8 mb-4">
          <h2 className="text-xl font-bold text-foreground mb-2">Your Investment</h2>
          <p className="text-sm text-foreground/70 mb-6">
            This is a two-step package with a 50% deposit and the remaining balance due on delivery.
          </p>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Service</span>
              <span className="text-right">Price</span>
              <span className="text-right">Subtotal</span>
            </div>
            <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border">
              <span>{proposal.title}</span>
              <span className="text-right">${price.toLocaleString()}</span>
              <span className="text-right">${price.toLocaleString()}</span>
            </div>
            <div className="border-t border-border px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Investment</span>
                <span className="font-semibold">${price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">50% up-front</span>
                <span>${deposit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Due at signing</span>
                <span>${deposit.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platforms */}
      <div className="rounded-xl border border-border bg-card p-6 mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Platforms</p>
        <p className="text-sm">{proposal.platformList}</p>
      </div>

      {/* Terms */}
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-foreground/70 leading-relaxed">
        <h2 className="text-xl font-bold text-foreground mb-4">Terms and Conditions</h2>
        <p className="mb-3">
          OneKeyFlow will build an automated system for <strong>{client.company}</strong> according to the description laid out in this proposal and pursuant to the attached Services Agreement.
        </p>
        <p className="mb-3">
          Additional features, extensions, or other integrations separate from the listed requirements may affect the timeline &amp; costs laid out above.
        </p>
        <div className="flex justify-between mt-8 pt-6 border-t border-border font-medium text-foreground">
          <span>{client.company}</span>
          <span>OneKeyFlow</span>
        </div>
      </div>
    </div>
  )
}

export default function Proposals() {
  const [form, setForm] = useState<FormValues>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ client: ClientData; proposal: ProposalData; pandadoc: { id: string; url: string } | null } | null>(null)

  const set = (name: keyof FormValues, value: string) =>
    setForm(f => ({ ...f, [name]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const enqueueRes = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const enqueueData = await enqueueRes.json()
      if (!enqueueData.ok) throw new Error(enqueueData.error ?? 'Failed to start generation')

      const jobId = enqueueData.job_id
      for (;;) {
        await new Promise<void>((r) => setTimeout(r, 2000))
        const statusRes = await fetch(`/api/proposals/status/${jobId}`)
        const status = await statusRes.json()
        if (status.status === 'done') {
          setResult({ client: status.client, proposal: status.proposal, pandadoc: status.pandadoc ?? null })
          break
        }
        if (status.status === 'failed') {
          throw new Error(status.error ?? 'Generation failed')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <ProposalPreview
        client={result.client}
        proposal={result.proposal}
        pandadoc={result.pandadoc}
        onBack={() => setResult(null)}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">New Proposal</h1>
        <p className="text-sm text-muted-foreground mt-1">Fill in the discovery call details to generate a proposal.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* Client info */}
        <div className="rounded-xl border border-border p-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Client</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" name="firstName" value={form.firstName} onChange={set} />
            <Field label="Last name" name="lastName" value={form.lastName} onChange={set} />
          </div>
          <Field label="Company" name="company" value={form.company} onChange={set} />
          <Field label="Email" name="email" value={form.email} onChange={set} />
        </div>

        {/* Scope */}
        <div className="rounded-xl border border-border p-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Scope</p>
          <Field
            label="Business description"
            name="businessDescription"
            value={form.businessDescription}
            onChange={set}
            placeholder="One sentence describing their business."
          />
          <Field
            label="Their problem"
            name="problem"
            value={form.problem}
            onChange={set}
            multiline
            placeholder="What's the core problem you're solving?"
          />
          <Field
            label="Your solution"
            name="solution"
            value={form.solution}
            onChange={set}
            multiline
            placeholder="How are you solving it?"
          />
          <Field
            label="Platforms / tools"
            name="platforms"
            value={form.platforms}
            onChange={set}
            placeholder="e.g. Monday.com, Make.com, Typeform"
          />
        </div>

        {/* Commercial */}
        <div className="rounded-xl border border-border p-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Commercial</p>
          <Field label="Timeline" name="timeline" value={form.timeline} onChange={set} placeholder="e.g. 3–4 weeks" />
          <Field label="Price" name="price" value={form.price} onChange={set} placeholder="e.g. 2500" />
        </div>

        {error && (
          <p className="text-sm text-destructive px-1">{error}</p>
        )}

        <Button type="submit" disabled={loading} className="self-end">
          {loading ? (
            <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Generating…</span>
          ) : (
            'Generate proposal →'
          )}
        </Button>
      </form>
    </div>
  )
}
