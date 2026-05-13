import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { Essay, EssayMeta, Frontmatter } from './types'

function contentDir(): string {
  const d = process.env.CONTENT_DIR
  if (!d) throw new Error('CONTENT_DIR env var is not set')
  return d
}

function assertSafe(...parts: string[]): void {
  for (const p of parts) {
    if (
      typeof p !== 'string' ||
      p.includes('..') ||
      p.includes('/') ||
      p.includes('\\') ||
      path.isAbsolute(p)
    ) {
      throw new Error(`Invalid path component: ${p}`)
    }
  }
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function essayPath(folder: string, slug: string): string {
  return path.join(contentDir(), folder, `${slug}.md`)
}

export function listEssays(): EssayMeta[] {
  const dir = contentDir()
  if (!fs.existsSync(dir)) return []
  const folders = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  const essays: EssayMeta[] = []
  for (const folder of folders) {
    const folderPath = path.join(dir, folder)
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'))
    for (const file of files) {
      try {
        const slug = file.replace(/\.md$/, '')
        const raw = fs.readFileSync(path.join(folderPath, file), 'utf8')
        const { data } = matter(raw)
        essays.push({ folder, slug, ...data } as EssayMeta)
      } catch {
        // skip corrupt files
      }
    }
  }
  return essays.sort((a, b) => {
    const ta = String((a as any).title ?? a.slug)
    const tb = String((b as any).title ?? b.slug)
    return ta.localeCompare(tb, undefined, { sensitivity: 'base' })
  })
}

export function readEssay(folder: string, slug: string): Essay | null {
  assertSafe(folder, slug)
  const fp = essayPath(folder, slug)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf8')
  const { data, content } = matter(raw)
  return { folder, slug, frontmatter: data as Frontmatter, body: content.trim() }
}

export function writeEssay(folder: string, slug: string, frontmatter: Frontmatter, body: string): void {
  assertSafe(folder, slug)
  const dir = path.join(contentDir(), folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const fp = essayPath(folder, slug)
  fs.writeFileSync(fp, matter.stringify(body, frontmatter), 'utf8')
}

export function createEssay(folder: string, title: string): { folder: string; slug: string; frontmatter: Frontmatter } {
  assertSafe(folder)
  const slug = slugify(title)
  const dir = path.join(contentDir(), folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, `${slug}.md`)
  if (fs.existsSync(fp)) throw new Error(`Essay already exists: ${folder}/${slug}`)
  const frontmatter: Frontmatter = {
    title,
    date: new Date().toISOString().slice(0, 10),
    tags: [],
    description: '',
    status: 'in-progress',
  }
  fs.writeFileSync(fp, matter.stringify('', frontmatter), 'utf8')
  return { folder, slug, frontmatter }
}

export function deleteEssay(folder: string, slug: string): void {
  assertSafe(folder, slug)
  const fp = essayPath(folder, slug)
  if (!fs.existsSync(fp)) throw new Error('Not found')
  fs.unlinkSync(fp)
}

export function moveEssay(folder: string, slug: string, targetFolder: string): void {
  assertSafe(folder, slug, targetFolder)
  const src = essayPath(folder, slug)
  if (!fs.existsSync(src)) throw new Error('Not found')
  const targetDir = path.join(contentDir(), targetFolder)
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
  const dest = path.join(targetDir, `${slug}.md`)
  fs.renameSync(src, dest)
}
