import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked } from 'marked'

const ESSAYS_DIR = path.join(process.cwd(), 'content/essays')
const PAGES_DIR = path.join(process.cwd(), 'content/pages')

export interface TocEntry {
  level: number   // 1 = h2, 2 = h3, 3 = h4
  text: string
  id: string
  number: string  // e.g. "1", "1.1", "2.3"
}

export interface Essay {
  slug: string
  folder: string
  title: string
  date: string
  tags: string[]
  description: string
  abstract?: string
  status: 'draft' | 'in-progress' | 'finished'
  content: string
  toc: TocEntry[]
}

interface RawEssay {
  slug: string
  folder: string
  title: string
  date: string
  tags: string[]
  description: string
  abstract?: string
  status: 'draft' | 'in-progress' | 'finished'
  rawContent: string
}

export function getEssayParams(): { folder: string; slug: string }[] {
  if (!fs.existsSync(ESSAYS_DIR)) return []
  const params: { folder: string; slug: string }[] = []
  for (const entry of fs.readdirSync(ESSAYS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const dir = path.join(ESSAYS_DIR, entry.name)
      for (const file of fs.readdirSync(dir)) {
        if (file.endsWith('.md')) {
          params.push({ folder: entry.name, slug: file.replace(/\.md$/, '') })
        }
      }
    }
  }
  return params
}

function readRaw(folder: string, slug: string): RawEssay | undefined {
  const filePath = path.join(ESSAYS_DIR, folder, `${slug}.md`)
  if (!fs.existsSync(filePath)) return undefined
  const { data, content } = matter(fs.readFileSync(filePath, 'utf-8'))
  return {
    slug,
    folder,
    title: data.title ?? slug,
    date: data.date ? String(data.date) : '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    description: data.description ?? '',
    abstract: data.abstract ?? undefined,
    status: data.status ?? 'draft',
    rawContent: content,
  }
}

function getAllRaw(): RawEssay[] {
  return getEssayParams()
    .map(p => readRaw(p.folder, p.slug))
    .filter(Boolean) as RawEssay[]
}

function buildIndex(raws: RawEssay[]): Map<string, { folder: string; slug: string }> {
  const index = new Map<string, { folder: string; slug: string }>()
  for (const e of raws) {
    index.set(e.title.toLowerCase(), { folder: e.folder, slug: e.slug })
    index.set(e.slug, { folder: e.folder, slug: e.slug })
    index.set(`${e.folder}/${e.slug}`, { folder: e.folder, slug: e.slug })
  }
  return index
}

function resolveWikilinks(content: string, raws: RawEssay[], index: Map<string, { folder: string; slug: string }>): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, ref) => {
    const trimmed = ref.trim()
    const target = index.get(trimmed.toLowerCase()) ?? index.get(trimmed)
    if (target) {
      const essay = raws.find(e => e.folder === target.folder && e.slug === target.slug)
      return `[${essay?.title ?? trimmed}](/essays/${target.folder}/${target.slug})`
    }
    return `<span class="wikilink-broken" title="No essay found: ${trimmed}">${trimmed}</span>`
  })
}

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// Extracts h2/h3/h4 headings as TOC entries and injects id attributes into the HTML.
// h2 → level 1, h3 → level 2, h4 → level 3
function extractToc(html: string): { html: string; toc: TocEntry[] } {
  const raw: { level: number; text: string; id: string }[] = []

  const withIds = html.replace(/<h([2-4])>(.*?)<\/h\1>/gi, (_, levelStr, inner) => {
    const level = parseInt(levelStr) - 1
    const text = inner.replace(/<[^>]+>/g, '')
    const id = headingId(text)
    raw.push({ level, text, id })
    return `<h${levelStr} id="${id}">${inner}</h${levelStr}>`
  })

  const counters = [0, 0, 0]
  const toc: TocEntry[] = raw.map(entry => {
    const idx = entry.level - 1
    counters[idx]++
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0
    return { ...entry, number: counters.slice(0, entry.level).join('.') }
  })

  return { html: withIds, toc }
}

function renderEssay(raw: RawEssay, raws: RawEssay[], index: Map<string, { folder: string; slug: string }>): Essay {
  const resolved = resolveWikilinks(raw.rawContent, raws, index)
  const rawHtml = marked(resolved) as string
  const { html, toc } = extractToc(rawHtml)

  return {
    slug: raw.slug,
    folder: raw.folder,
    title: raw.title,
    date: raw.date,
    tags: raw.tags,
    description: raw.description,
    abstract: raw.abstract,
    status: raw.status,
    content: html,
    toc,
  }
}

export function getEssay(folder: string, slug: string): Essay | undefined {
  const raws = getAllRaw()
  const raw = raws.find(e => e.folder === folder && e.slug === slug)
  if (!raw) return undefined
  return renderEssay(raw, raws, buildIndex(raws))
}

export function getEssays(): Essay[] {
  const raws = getAllRaw()
  const index = buildIndex(raws)
  return raws.map(raw => renderEssay(raw, raws, index))
}

export function getBacklinks(targetFolder: string, targetSlug: string): Pick<Essay, 'slug' | 'folder' | 'title'>[] {
  const raws = getAllRaw()
  const index = buildIndex(raws)
  const backlinks: Pick<Essay, 'slug' | 'folder' | 'title'>[] = []

  for (const raw of raws) {
    if (raw.folder === targetFolder && raw.slug === targetSlug) continue
    const wikiPattern = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = wikiPattern.exec(raw.rawContent)) !== null) {
      const trimmed = match[1].trim()
      const target = index.get(trimmed.toLowerCase()) ?? index.get(trimmed)
      if (target && target.folder === targetFolder && target.slug === targetSlug) {
        backlinks.push({ slug: raw.slug, folder: raw.folder, title: raw.title })
        break
      }
    }
  }

  return backlinks
}

export function getPage(slug: string): Essay | undefined {
  const filePath = path.join(PAGES_DIR, `${slug}.md`)
  if (!fs.existsSync(filePath)) return undefined
  const { data, content } = matter(fs.readFileSync(filePath, 'utf-8'))
  const raw: RawEssay = {
    slug,
    folder: 'pages',
    title: data.title ?? slug,
    date: data.date ? String(data.date) : '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    description: data.description ?? '',
    abstract: data.abstract ?? undefined,
    status: data.status ?? 'finished',
    rawContent: content,
  }
  const raws = getAllRaw()
  const index = buildIndex(raws)
  const resolved = resolveWikilinks(raw.rawContent, raws, index)
  const rawHtml = marked(resolved) as string
  const { html, toc } = extractToc(rawHtml)
  return {
    slug: raw.slug,
    folder: raw.folder,
    title: raw.title,
    date: raw.date,
    tags: raw.tags,
    description: raw.description,
    abstract: raw.abstract,
    status: raw.status,
    content: html,
    toc,
  }
}

export function formatEssayDate(date: string): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
