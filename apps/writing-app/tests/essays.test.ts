import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-test-'))
  process.env.CONTENT_DIR = tmpDir
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CONTENT_DIR
})

import { listEssays, readEssay, writeEssay, createEssay, deleteEssay, moveEssay } from '../src/essays'

// ---------------------------------------------------------------------------
// listEssays
// ---------------------------------------------------------------------------
describe('listEssays', () => {
  it('returns empty array when CONTENT_DIR does not exist', () => {
    // Point to a nonexistent subdirectory
    process.env.CONTENT_DIR = path.join(tmpDir, 'nonexistent')
    const result = listEssays()
    expect(result).toEqual([])
  })

  it('returns empty array when CONTENT_DIR exists but has no folders', () => {
    const result = listEssays()
    expect(result).toEqual([])
  })

  it('returns essay meta with folder and slug', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'my-essay.md'), '---\ntitle: My Essay\ndate: 2024-01-01\ntags: []\ndescription: \"\"\nstatus: in-progress\n---\n\nBody here.')
    const result = listEssays()
    expect(result).toHaveLength(1)
    expect(result[0].folder).toBe('drafts')
    expect(result[0].slug).toBe('my-essay')
  })

  it('spreads frontmatter fields onto each essay meta entry', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'post.md'), '---\ntitle: Post Title\ndate: "2024-06-01"\ntags: [tag1]\ndescription: "A desc"\nstatus: published\n---\n')
    const result = listEssays()
    expect(result[0].title).toBe('Post Title')
    expect(result[0].date).toBe('2024-06-01')
    expect(result[0].status).toBe('published')
    expect(result[0].description).toBe('A desc')
  })

  it('skips non-.md files', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'readme.txt'), 'just text')
    fs.writeFileSync(path.join(folder, 'note.json'), '{}')
    const result = listEssays()
    expect(result).toHaveLength(0)
  })

  it('returns essays from multiple folders', () => {
    const f1 = path.join(tmpDir, 'drafts')
    const f2 = path.join(tmpDir, 'published')
    fs.mkdirSync(f1)
    fs.mkdirSync(f2)
    fs.writeFileSync(path.join(f1, 'draft-one.md'), '---\ntitle: Draft One\n---\n')
    fs.writeFileSync(path.join(f2, 'pub-one.md'), '---\ntitle: Pub One\n---\n')
    const result = listEssays()
    expect(result).toHaveLength(2)
    const folders = result.map(e => e.folder)
    expect(folders).toContain('drafts')
    expect(folders).toContain('published')
  })

  it('returns essays sorted alphabetically by title', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'zebra.md'), '---\ntitle: Zebra\n---\n')
    fs.writeFileSync(path.join(folder, 'apple.md'), '---\ntitle: Apple\n---\n')
    fs.writeFileSync(path.join(folder, 'mango.md'), '---\ntitle: Mango\n---\n')
    const result = listEssays()
    const titles = result.map(e => (e as any).title)
    expect(titles).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('falls back to slug when title is absent for sorting', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'zebra.md'), '---\n---\n')
    fs.writeFileSync(path.join(folder, 'alpha.md'), '---\n---\n')
    const result = listEssays()
    expect(result[0].slug).toBe('alpha')
    expect(result[1].slug).toBe('zebra')
  })
})

// ---------------------------------------------------------------------------
// readEssay
// ---------------------------------------------------------------------------
describe('readEssay', () => {
  it('returns null when file does not exist', () => {
    const result = readEssay('drafts', 'nonexistent')
    expect(result).toBeNull()
  })

  it('returns essay object with folder, slug, frontmatter, body', () => {
    const folder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folder)
    fs.writeFileSync(
      path.join(folder, 'hello.md'),
      '---\ntitle: Hello\ndate: 2024-01-01\ntags: []\ndescription: \"\"\nstatus: in-progress\n---\n\nHello world.'
    )
    const result = readEssay('drafts', 'hello')
    expect(result).not.toBeNull()
    expect(result!.folder).toBe('drafts')
    expect(result!.slug).toBe('hello')
    expect(result!.frontmatter.title).toBe('Hello')
    expect(result!.body).toBe('Hello world.')
  })

  it('returns trimmed body', () => {
    const folder = path.join(tmpDir, 'essays')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'trimmed.md'), '---\ntitle: T\n---\n\n  \n  Body with whitespace.  \n\n')
    const result = readEssay('essays', 'trimmed')
    expect(result!.body).toBe('Body with whitespace.')
  })
})

// ---------------------------------------------------------------------------
// writeEssay
// ---------------------------------------------------------------------------
describe('writeEssay', () => {
  it('creates file with frontmatter and body', () => {
    const fm = { title: 'Test', date: '2024-01-01', tags: [], description: '', status: 'in-progress' as const }
    writeEssay('drafts', 'test-essay', fm, 'Some body content.')
    const fp = path.join(tmpDir, 'drafts', 'test-essay.md')
    expect(fs.existsSync(fp)).toBe(true)
    const raw = fs.readFileSync(fp, 'utf8')
    expect(raw).toContain('title: Test')
    expect(raw).toContain('Some body content.')
  })

  it('creates the folder if it does not exist', () => {
    const fm = { title: 'New', date: '2024-01-01', tags: [], description: '', status: 'in-progress' as const }
    writeEssay('new-folder', 'my-slug', fm, '')
    const folderPath = path.join(tmpDir, 'new-folder')
    expect(fs.existsSync(folderPath)).toBe(true)
    expect(fs.existsSync(path.join(folderPath, 'my-slug.md'))).toBe(true)
  })

  it('overwrites existing file', () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    const fp = path.join(folderPath, 'overwrite.md')
    fs.writeFileSync(fp, 'old content')
    const fm = { title: 'Updated', date: '2024-01-01', tags: [], description: '', status: 'in-progress' as const }
    writeEssay('drafts', 'overwrite', fm, 'New body.')
    const raw = fs.readFileSync(fp, 'utf8')
    expect(raw).toContain('Updated')
    expect(raw).toContain('New body.')
  })
})

// ---------------------------------------------------------------------------
// createEssay
// ---------------------------------------------------------------------------
describe('createEssay', () => {
  it('creates a file with a slugified title as filename', () => {
    const result = createEssay('drafts', 'My New Essay')
    expect(result.slug).toBe('my-new-essay')
    const fp = path.join(tmpDir, 'drafts', 'my-new-essay.md')
    expect(fs.existsSync(fp)).toBe(true)
  })

  it('sets correct frontmatter fields', () => {
    const result = createEssay('drafts', 'Hello World')
    expect(result.frontmatter.title).toBe('Hello World')
    expect(result.frontmatter.tags).toEqual([])
    expect(result.frontmatter.description).toBe('')
    expect(result.frontmatter.status).toBe('in-progress')
    // date is today in YYYY-MM-DD format
    expect(result.frontmatter.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns folder and slug in result', () => {
    const result = createEssay('essays', 'Another Post')
    expect(result.folder).toBe('essays')
    expect(result.slug).toBe('another-post')
  })

  it('creates folder if it does not exist', () => {
    createEssay('brand-new-folder', 'Test')
    expect(fs.existsSync(path.join(tmpDir, 'brand-new-folder'))).toBe(true)
  })

  it('throws if essay already exists', () => {
    createEssay('drafts', 'Duplicate')
    expect(() => createEssay('drafts', 'Duplicate')).toThrow('already exists')
  })

  it('slugifies special characters in title', () => {
    const result = createEssay('drafts', "It's Great! (Really)")
    expect(result.slug).toBe('its-great-really')
  })
})

// ---------------------------------------------------------------------------
// deleteEssay
// ---------------------------------------------------------------------------
describe('deleteEssay', () => {
  it('removes the file', () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    fs.writeFileSync(path.join(folderPath, 'to-delete.md'), '---\ntitle: Del\n---\n')
    deleteEssay('drafts', 'to-delete')
    expect(fs.existsSync(path.join(folderPath, 'to-delete.md'))).toBe(false)
  })

  it('throws if file not found', () => {
    expect(() => deleteEssay('drafts', 'ghost')).toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// moveEssay
// ---------------------------------------------------------------------------
describe('moveEssay', () => {
  it('moves file to target folder', () => {
    const src = path.join(tmpDir, 'drafts')
    fs.mkdirSync(src)
    fs.writeFileSync(path.join(src, 'mover.md'), '---\ntitle: Mover\n---\n')
    moveEssay('drafts', 'mover', 'published')
    expect(fs.existsSync(path.join(src, 'mover.md'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'published', 'mover.md'))).toBe(true)
  })

  it('creates target folder if missing', () => {
    const src = path.join(tmpDir, 'drafts')
    fs.mkdirSync(src)
    fs.writeFileSync(path.join(src, 'item.md'), '---\ntitle: Item\n---\n')
    moveEssay('drafts', 'item', 'archive')
    expect(fs.existsSync(path.join(tmpDir, 'archive'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'archive', 'item.md'))).toBe(true)
  })

  it('throws if source not found', () => {
    expect(() => moveEssay('drafts', 'missing', 'published')).toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// assertSafe (tested via createEssay / readEssay with bad inputs)
// ---------------------------------------------------------------------------
describe('assertSafe path validation', () => {
  it('throws on folder with ".."', () => {
    expect(() => readEssay('../escape', 'slug')).toThrow('Invalid path component')
  })

  it('throws on folder with "/"', () => {
    expect(() => readEssay('a/b', 'slug')).toThrow('Invalid path component')
  })

  it('throws on folder with "\\"', () => {
    expect(() => readEssay('a\\b', 'slug')).toThrow('Invalid path component')
  })

  it('throws on absolute path as folder', () => {
    expect(() => readEssay('/etc/passwd', 'slug')).toThrow('Invalid path component')
  })

  it('throws on slug with ".."', () => {
    expect(() => readEssay('drafts', '../secret')).toThrow('Invalid path component')
  })

  it('throws on slug with "/"', () => {
    expect(() => readEssay('drafts', 'a/b')).toThrow('Invalid path component')
  })
})
