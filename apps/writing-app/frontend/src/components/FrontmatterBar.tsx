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

  const { title = '', tags = [], status = 'in-progress', date = '' } = frontmatter

  function update(patch: Partial<Frontmatter>) {
    onChange({ ...frontmatter, ...patch })
  }

  function removeTag(tag: string) {
    update({ tags: (tags as string[]).filter(t => t !== tag) })
  }

  function addTag() {
    const val = tagInput.trim()
    if (val && !(tags as string[]).includes(val)) update({ tags: [...(tags as string[]), val] })
    setTagInput('')
    setAddingTag(false)
  }

  return (
    <div className="border-b border-[#e8e5e0] px-8 py-4 flex gap-4 items-center flex-wrap bg-white">
      <input
        value={title as string}
        onChange={e => update({ title: e.target.value })}
        className="bg-transparent border-none text-[#1a1916] text-[17px] font-semibold outline-none flex-1 min-w-[160px] placeholder-[#c4bfb9] tracking-tight"
        placeholder="Untitled"
      />
      <div className="flex gap-1.5 items-center flex-wrap">
        {(tags as string[]).map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 text-[11px] text-[#736d65] bg-[#f0ede8] px-2 py-0.5 rounded-full">
            {tag}
            <button onClick={() => removeTag(tag)} className="text-[#c4bfb9] hover:text-[#736d65] leading-none transition-colors">×</button>
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
            className="text-[11px] bg-white border border-[#e8e5e0] rounded-full px-2.5 py-0.5 text-[#1a1916] outline-none w-20 focus:border-[#a8a29e]"
          />
        ) : (
          <button onClick={() => setAddingTag(true)} className="text-[11px] text-[#c4bfb9] hover:text-[#78716c] px-1 transition-colors">
            + tag
          </button>
        )}
      </div>
      <select
        value={status as string}
        onChange={e => update({ status: e.target.value })}
        className="bg-[#f0ede8] border-none text-[#736d65] text-[11px] rounded-full px-3 py-1 outline-none cursor-pointer appearance-none"
      >
        <option value="in-progress">in progress</option>
        <option value="published">published</option>
      </select>
      {date && <span className="text-[11px] text-[#c4bfb9]">{date as string}</span>}
    </div>
  )
}
