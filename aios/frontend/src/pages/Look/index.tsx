import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, X, Mic, Image, Video, Trash2, ChevronDown } from 'lucide-react'

const CATEGORIES = ['copy', 'packaging', 'typography', 'color', 'layout', 'product', 'shape', 'other']

const CAT_COLORS: Record<string, string> = {
  copy:       'bg-blue-500/10 text-blue-500 border-blue-500/20',
  packaging:  'bg-purple-500/10 text-purple-500 border-purple-500/20',
  typography: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  color:      'bg-pink-500/10 text-pink-500 border-pink-500/20',
  layout:     'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  product:    'bg-orange-500/10 text-orange-500 border-orange-500/20',
  shape:      'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  other:      'bg-muted text-muted-foreground border-border',
}

interface LookItem {
  id: string
  category: string
  media_type: string
  file_path: string
  mime_type: string | null
  note: string | null
  source: string | null
  created_at: string | null
}

function MediaThumb({ item, onClick }: { item: LookItem; onClick: () => void }) {
  const src = `/api/look/items/${item.id}/file`

  return (
    <div
      className="relative group cursor-pointer rounded-lg overflow-hidden bg-muted border border-border"
      onClick={onClick}
    >
      {item.media_type === 'image' ? (
        <img
          src={src}
          alt={item.note ?? item.category}
          className="w-full object-cover"
          loading="lazy"
        />
      ) : item.media_type === 'video' ? (
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <video src={src} className="w-full h-full object-cover" preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Video className="size-8 text-white/80" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 bg-muted/50">
          <Mic className="size-8 text-muted-foreground" />
          <audio src={src} controls className="w-full max-w-[200px]" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <span className={cn('text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border', CAT_COLORS[item.category] ?? CAT_COLORS.other)}>
          {item.category}
        </span>
        {item.source && <p className="text-[10px] text-white/80 mt-1 truncate">{item.source}</p>}
      </div>
    </div>
  )
}

function ItemDetail({ item, onClose, onDelete }: { item: LookItem; onClose: () => void; onDelete: () => void }) {
  const src = `/api/look/items/${item.id}/file`
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/look/items/${item.id}`, { method: 'DELETE' })
    onDelete()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
        <span className={cn('text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border', CAT_COLORS[item.category] ?? CAT_COLORS.other)}>
          {item.category}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 hover:text-red-300 p-1 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 transition-colors">
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        {item.media_type === 'image' ? (
          <img src={src} alt="" className="max-w-full max-h-[70vh] rounded-lg object-contain" />
        ) : item.media_type === 'video' ? (
          <video src={src} controls autoPlay className="max-w-full max-h-[70vh] rounded-lg" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Mic className="size-16 text-white/40" />
            <audio src={src} controls autoPlay />
          </div>
        )}
      </div>

      {(item.note || item.source) && (
        <div className="px-4 pb-6 text-center" onClick={e => e.stopPropagation()}>
          {item.source && <p className="text-sm text-white/60 font-mono">{item.source}</p>}
          {item.note && <p className="text-sm text-white/80 mt-1">{item.note}</p>}
        </div>
      )}
    </div>
  )
}

function UploadSheet({ onClose, onUploaded }: { onClose: () => void; onUploaded: (item: LookItem) => void }) {
  const [category, setCategory] = useState('copy')
  const [note, setNote] = useState('')
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f)
    if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  async function handleSubmit() {
    if (!file) { setError('Pick a file first'); return }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', category)
      fd.append('note', note)
      fd.append('source', source)
      const res = await fetch('/api/look/items', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      onUploaded(data.item)
    } catch (e: any) {
      setError(e.message)
      setUploading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl flex flex-col max-h-[90vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-sm font-semibold">Add item</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6 flex flex-col gap-5">
          {/* File picker */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,audio/*"
              capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {file ? (
              <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
                {preview && file.type.startsWith('image/') && (
                  <img src={preview} alt="" className="w-full max-h-52 object-contain" />
                )}
                {preview && file.type.startsWith('video/') && (
                  <video src={preview} className="w-full max-h-52 object-contain" />
                )}
                {file.type.startsWith('audio/') && (
                  <div className="flex items-center gap-3 p-4">
                    <Mic className="size-6 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground truncate">{file.name}</span>
                  </div>
                )}
                <button
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80"
                  onClick={() => { setFile(null); setPreview(null) }}
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <div className="flex gap-3">
                  <Image className="size-6" />
                  <Video className="size-6" />
                  <Mic className="size-6" />
                </div>
                <span className="text-sm">Tap to pick photo, video, or voice note</span>
              </button>
            )}
          </div>

          {/* Category */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    category === c
                      ? CAT_COLORS[c] ?? CAT_COLORS.other
                      : 'bg-muted text-muted-foreground border-transparent hover:border-border'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Where? <span className="normal-case tracking-normal">(optional)</span></p>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="e.g. Target, Trader Joe's, Instagram"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-foreground/40 placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Note */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Note <span className="normal-case tracking-normal">(optional)</span></p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What caught your eye?"
              rows={2}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-foreground/40 placeholder:text-muted-foreground/50 resize-none"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="w-full bg-foreground text-background py-3 rounded-lg text-sm font-semibold disabled:opacity-40 active:scale-[.98] transition-transform"
          >
            {uploading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function Look() {
  const [items, setItems] = useState<LookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [selected, setSelected] = useState<LookItem | null>(null)

  useEffect(() => {
    const url = filter === 'all' ? '/api/look/items' : `/api/look/items?category=${filter}`
    fetch(url)
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .finally(() => setLoading(false))
  }, [filter])

  function handleUploaded(item: LookItem) {
    setItems(prev => [item, ...prev])
    setShowUpload(false)
  }

  function handleDeleted() {
    if (!selected) return
    setItems(prev => prev.filter(i => i.id !== selected.id))
    setSelected(null)
  }

  // Build columns for masonry: split items into 2 cols on mobile, 3 on md+
  const cols2 = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)]
  const cols3 = [items.filter((_, i) => i % 3 === 0), items.filter((_, i) => i % 3 === 1), items.filter((_, i) => i % 3 === 2)]

  const usedCategories = Array.from(new Set(items.map(i => i.category)))

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 px-4 py-3 border-b border-border overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filter === 'all' ? 'bg-foreground text-background border-foreground' : 'bg-muted text-muted-foreground border-transparent hover:border-border'
            )}
          >
            All {items.length > 0 && `(${items.length})`}
          </button>
          {CATEGORIES.filter(c => usedCategories.includes(c)).map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                filter === c ? CAT_COLORS[c] ?? CAT_COLORS.other : 'bg-muted text-muted-foreground border-transparent hover:border-border'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            <p className="text-xs text-muted-foreground/60">Tap + to capture something inspiring.</p>
          </div>
        ) : (
          <>
            {/* 2-col on mobile */}
            <div className="grid grid-cols-2 gap-2 md:hidden">
              {cols2.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-2">
                  {col.map(item => (
                    <MediaThumb key={item.id} item={item} onClick={() => setSelected(item)} />
                  ))}
                </div>
              ))}
            </div>
            {/* 3-col on md+ */}
            <div className="hidden md:grid md:grid-cols-3 gap-3">
              {cols3.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-3">
                  {col.map(item => (
                    <MediaThumb key={item.id} item={item} onClick={() => setSelected(item)} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowUpload(true)}
        className="fixed bottom-6 right-6 z-30 size-14 bg-foreground text-background rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus className="size-6" />
      </button>

      {/* Upload sheet */}
      {showUpload && (
        <UploadSheet onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}

      {/* Item detail */}
      {selected && (
        <ItemDetail item={selected} onClose={() => setSelected(null)} onDelete={handleDeleted} />
      )}
    </div>
  )
}
