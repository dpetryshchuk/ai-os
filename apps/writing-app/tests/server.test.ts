import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-server-test-'))
  process.env.CONTENT_DIR = tmpDir
  process.env.REPO_DIR = tmpDir
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CONTENT_DIR
  delete process.env.REPO_DIR
})

import { app } from '../server'

// ---------------------------------------------------------------------------
// GET /api/essays
// ---------------------------------------------------------------------------
describe('GET /api/essays', () => {
  it('returns 200 with empty essays array on empty dir', async () => {
    const res = await request(app).get('/api/essays')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.essays).toEqual([])
  })

  it('returns essays after creating one', async () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    fs.writeFileSync(
      path.join(folderPath, 'hello.md'),
      '---\ntitle: Hello\ndate: 2024-01-01\ntags: []\ndescription: ""\nstatus: in-progress\n---\n\nBody.'
    )
    const res = await request(app).get('/api/essays')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.essays).toHaveLength(1)
    expect(res.body.essays[0].slug).toBe('hello')
    expect(res.body.essays[0].folder).toBe('drafts')
  })
})

// ---------------------------------------------------------------------------
// GET /api/essays/:folder/:slug
// ---------------------------------------------------------------------------
describe('GET /api/essays/:folder/:slug', () => {
  it('returns 404 for missing essay', async () => {
    const res = await request(app).get('/api/essays/drafts/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })

  it('returns essay for existing one', async () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    fs.writeFileSync(
      path.join(folderPath, 'my-post.md'),
      '---\ntitle: My Post\ndate: 2024-01-01\ntags: []\ndescription: ""\nstatus: in-progress\n---\n\nHello world.'
    )
    const res = await request(app).get('/api/essays/drafts/my-post')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.essay.slug).toBe('my-post')
    expect(res.body.essay.folder).toBe('drafts')
    expect(res.body.essay.frontmatter.title).toBe('My Post')
    expect(res.body.essay.body).toBe('Hello world.')
  })
})

// ---------------------------------------------------------------------------
// PUT /api/essays/:folder/:slug
// ---------------------------------------------------------------------------
describe('PUT /api/essays/:folder/:slug', () => {
  it('writes essay and returns { ok: true }', async () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    const res = await request(app)
      .put('/api/essays/drafts/new-essay')
      .send({ frontmatter: { title: 'New Essay', date: '2024-01-01', tags: [], description: '', status: 'in-progress' }, body: 'Some content.' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const fp = path.join(tmpDir, 'drafts', 'new-essay.md')
    expect(fs.existsSync(fp)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// POST /api/essays
// ---------------------------------------------------------------------------
describe('POST /api/essays', () => {
  it('creates essay with folder + title and returns { ok: true, essay: { folder, slug } }', async () => {
    const res = await request(app)
      .post('/api/essays')
      .send({ folder: 'drafts', title: 'My First Essay' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.essay.folder).toBe('drafts')
    expect(res.body.essay.slug).toBe('my-first-essay')
    const fp = path.join(tmpDir, 'drafts', 'my-first-essay.md')
    expect(fs.existsSync(fp)).toBe(true)
  })

  it('returns 400 if folder is missing', async () => {
    const res = await request(app)
      .post('/api/essays')
      .send({ title: 'No Folder' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })

  it('returns 400 if title is missing', async () => {
    const res = await request(app)
      .post('/api/essays')
      .send({ folder: 'drafts' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/essays/:folder/:slug
// ---------------------------------------------------------------------------
describe('DELETE /api/essays/:folder/:slug', () => {
  it('deletes essay and returns { ok: true }', async () => {
    const folderPath = path.join(tmpDir, 'drafts')
    fs.mkdirSync(folderPath)
    fs.writeFileSync(
      path.join(folderPath, 'to-delete.md'),
      '---\ntitle: To Delete\n---\n'
    )
    const res = await request(app).delete('/api/essays/drafts/to-delete')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.existsSync(path.join(folderPath, 'to-delete.md'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GET /api/folders
// ---------------------------------------------------------------------------
describe('GET /api/folders', () => {
  it('returns folders list', async () => {
    fs.mkdirSync(path.join(tmpDir, 'alpha'))
    fs.mkdirSync(path.join(tmpDir, 'beta'))
    const res = await request(app).get('/api/folders')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.folders).toContain('alpha')
    expect(res.body.folders).toContain('beta')
  })
})

// ---------------------------------------------------------------------------
// POST /api/folders
// ---------------------------------------------------------------------------
describe('POST /api/folders', () => {
  it('creates folder', async () => {
    const res = await request(app)
      .post('/api/folders')
      .send({ name: 'newdir' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'newdir'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/folders/:folder
// ---------------------------------------------------------------------------
describe('PATCH /api/folders/:folder', () => {
  it('renames folder', async () => {
    fs.mkdirSync(path.join(tmpDir, 'old-name'))
    const res = await request(app)
      .patch('/api/folders/old-name')
      .send({ name: 'new-name' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'old-name'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'new-name'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/folders/:folder
// ---------------------------------------------------------------------------
describe('DELETE /api/folders/:folder', () => {
  it('deletes empty folder', async () => {
    fs.mkdirSync(path.join(tmpDir, 'empty-dir'))
    const res = await request(app).delete('/api/folders/empty-dir')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'empty-dir'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/essays/:folder/:slug/move
// ---------------------------------------------------------------------------
describe('PATCH /api/essays/:folder/:slug/move', () => {
  it('moves essay to target folder', async () => {
    const srcFolder = path.join(tmpDir, 'drafts')
    fs.mkdirSync(srcFolder)
    fs.writeFileSync(
      path.join(srcFolder, 'movable.md'),
      '---\ntitle: Movable\n---\n'
    )
    const res = await request(app)
      .patch('/api/essays/drafts/movable/move')
      .send({ folder: 'published' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(fs.existsSync(path.join(srcFolder, 'movable.md'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'published', 'movable.md'))).toBe(true)
  })
})
