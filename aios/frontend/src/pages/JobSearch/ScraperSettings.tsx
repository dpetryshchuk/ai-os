import { useCallback, useEffect, useState } from 'react'
import { X, Plus, RotateCcw } from 'lucide-react'

interface ScraperConfig {
  search_terms: string[]
  locations: string[]
  area_keywords: string[]
  skip_titles: string[]
  results_wanted: number
  hours_old: number
}

interface SettingsResponse {
  config: ScraperConfig
  is_default: boolean
  updated_at?: string | null
}

const SOURCE = 'jobspy_sd'

interface ScraperSettingsProps {
  open: boolean
  onClose: () => void
}

export default function ScraperSettings({ open, onClose }: ScraperSettingsProps) {
  const [config, setConfig] = useState<ScraperConfig | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/jobsearch/scraper-settings/${SOURCE}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<SettingsResponse & { ok: boolean }> })
      .then(d => { setConfig(d.config); setIsDefault(d.is_default) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const save = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/jobsearch/scraper-settings/${SOURCE}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json() as SettingsResponse
      setConfig(d.config)
      setIsDefault(false)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!confirm('Reset scraper settings to defaults?')) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/jobsearch/scraper-settings/${SOURCE}/reset`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json() as SettingsResponse
      setConfig(d.config)
      setIsDefault(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:w-[440px] h-full bg-background border-l border-border shadow-xl flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Scrape settings</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              jobspy / Indeed + LinkedIn
              {isDefault && <span className="ml-2 text-muted-foreground/60">(defaults)</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">{error}</p>}

          {!loading && config && (
            <>
              <TagField
                label="Search terms"
                hint="Roles passed to Indeed/LinkedIn (e.g. 'AI engineer')."
                values={config.search_terms}
                onChange={v => setConfig({ ...config, search_terms: v })}
              />
              <TagField
                label="Locations"
                hint="Cities to search from."
                values={config.locations}
                onChange={v => setConfig({ ...config, locations: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Results / query"
                  value={config.results_wanted}
                  onChange={v => setConfig({ ...config, results_wanted: v })}
                  min={1}
                  max={200}
                />
                <NumberField
                  label="Hours old"
                  value={config.hours_old}
                  onChange={v => setConfig({ ...config, hours_old: v })}
                  min={1}
                  max={720}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced(s => !s)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showAdvanced ? '− Hide advanced' : '+ Show advanced filters'}
              </button>

              {showAdvanced && (
                <div className="space-y-5 pt-1">
                  <TagField
                    label="Skip titles"
                    hint="Any of these substrings (case-insensitive) in the title → drop the result."
                    values={config.skip_titles}
                    onChange={v => setConfig({ ...config, skip_titles: v })}
                  />
                  <TagField
                    label="Area keywords"
                    hint="Locations must contain one of these to count as SD-area (include 'remote' to accept remote)."
                    values={config.area_keywords}
                    onChange={v => setConfig({ ...config, area_keywords: v })}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={reset}
            disabled={saving || isDefault}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw size={12} />
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !config}
              className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TagFieldProps {
  label: string
  hint?: string
  values: string[]
  onChange: (next: string[]) => void
}

function TagField({ label, hint, values, onChange }: TagFieldProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }

  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i))

  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground/80 mb-1.5">{hint}</p>}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-muted text-xs">
            <span className="break-all">{v}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${v}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-[11px] text-muted-foreground/60">No entries.</span>}
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
            else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              remove(values.length - 1)
            }
          }}
          placeholder="Add and press Enter"
          className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background"
        />
        <button
          type="button"
          onClick={add}
          className="px-2 rounded border border-border hover:bg-muted text-muted-foreground"
          aria-label="Add"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
}

function NumberField({ label, value, onChange, min, max }: NumberFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          if (!Number.isNaN(n)) onChange(n)
        }}
        className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
      />
    </div>
  )
}
