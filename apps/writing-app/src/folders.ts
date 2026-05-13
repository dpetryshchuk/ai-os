import fs from 'fs'
import path from 'path'

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

export function listFolders(): string[] {
  const dir = contentDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

export function createFolder(name: string): void {
  assertSafe(name)
  const fp = path.join(contentDir(), name)
  if (fs.existsSync(fp)) throw new Error('Folder already exists')
  fs.mkdirSync(fp, { recursive: true })
}

export function renameFolder(oldName: string, newName: string): void {
  assertSafe(oldName, newName)
  const src = path.join(contentDir(), oldName)
  const dest = path.join(contentDir(), newName)
  if (!fs.existsSync(src)) throw new Error('Not found')
  if (fs.existsSync(dest)) throw new Error('Target already exists')
  fs.renameSync(src, dest)
}

export function deleteFolder(name: string): void {
  assertSafe(name)
  const fp = path.join(contentDir(), name)
  if (!fs.existsSync(fp)) throw new Error('Not found')
  const files = fs.readdirSync(fp)
  if (files.length > 0) throw new Error('Folder is not empty')
  fs.rmdirSync(fp)
}
