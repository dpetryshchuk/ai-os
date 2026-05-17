import { useState } from 'react'
import type { Frontmatter } from '../lib/api'

interface FrontmatterBarProps {
  frontmatter: Frontmatter | null
  onChange: (fm: Frontmatter) => void
}

export default function FrontmatterBar({ frontmatter, onChange }: FrontmatterBarProps) {
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')

  if (!frontmatter) return null

  const { title = '', tags = [], status = 'in-progress', date = '', description = '', toc = false } = frontmatter

  function update(patch: Partial<Frontmatter>) {
    onChange({ ...frontmatter, ...patch })
  }

  function removeTag(tag: string) {
    update({ tags: tags.filter(t => t !== tag) })
  }

  function addTag() {
    const val = tagInput.trim()
    if (val && !tags.includes(val)) update({ tags: [...tags, val] })
    setTagInput('')
    setAddingTag(false)
  }

  return (
    <div className="border-b border-border bg-white">
      {/* Top row: title, tags, toc, status, date */}
      <div className="px-8 py-4 flex gap-4 items-center flex-wrap">
        <input
          value={title}
          onChange={e => update({ title: e.target.value })}
          className="bg-transparent border-none text-foreground text-[17px] font-semibold outline-none flex-1 min-w-[160px] placeholder:text-muted-foreground tracking-tight"
          placeholder="Untitled"
        />
        <div className="flex gap-1.5 items-center flex-wrap">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-[11px] text-[#736d65] bg-muted px-2 py-0.5 rounded-full">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-[#736d65] leading-none transition-colors">×</button>
            </span>
          ))}
          {addingTag ? (
            <input
              autoFocus
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAddingTag(false) }}
              onBlur={addTag}
              placeholder="tag"
              className="text-[11px] bg-white border border-border rounded-full px-2.5 py-0.5 text-foreground outline-none w-20 focus:border-[#a8a29e]"
            />
          ) : (
            <button onClick={() => setAddingTag(true)} className="text-[11px] text-muted-foreground hover:text-[#78716c] px-1 transition-colors">
              + tag
            </button>
          )}
        </div>
        <button
          onClick={() => update({ toc: !toc })}
          title="Toggle table of contents"
          className={`text-[11px] rounded-full px-3 py-1 transition-colors ${toc ? 'bg-[#736d65] text-white' : 'bg-muted text-[#736d65] hover:bg-[#e8e3df]'}`}
        >
          TOC
        </button>
        <select
          value={status}
          onChange={e => update({ status: e.target.value })}
          className="bg-muted border-none text-[#736d65] text-[11px] rounded-full px-3 py-1 outline-none cursor-pointer appearance-none"
        >
          <option value="in-progress">in progress</option>
          <option value="published">published</option>
        </select>
        {date && <span className="text-[11px] text-muted-foreground">{date}</span>}
      </div>
      {/* Description row */}
      <div className="px-8 pb-3">
        <textarea
          value={description}
          onChange={e => update({ description: e.target.value })}
          placeholder="Abstract…"
          rows={2}
          className="w-full bg-transparent border-none text-[13px] text-[#78716c] placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
        />
      </div>
    </div>
  )
}
