import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-folders-test-'))
  process.env.CONTENT_DIR = tmpDir
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CONTENT_DIR
})

import { listFolders, createFolder, renameFolder, deleteFolder } from '../src/folders'

// ---------------------------------------------------------------------------
// listFolders
// ---------------------------------------------------------------------------
describe('listFolders', () => {
  it('returns empty array when CONTENT_DIR does not exist', () => {
    process.env.CONTENT_DIR = path.join(tmpDir, 'nonexistent')
    const result = listFolders()
    expect(result).toEqual([])
  })

  it('returns only directory names (not files)', () => {
    fs.mkdirSync(path.join(tmpDir, 'drafts'))
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a folder')
    const result = listFolders()
    expect(result).toContain('drafts')
    expect(result).not.toContain('readme.txt')
  })

  it('returns all folders', () => {
    fs.mkdirSync(path.join(tmpDir, 'drafts'))
    fs.mkdirSync(path.join(tmpDir, 'published'))
    fs.mkdirSync(path.join(tmpDir, 'archive'))
    const result = listFolders()
    expect(result).toHaveLength(3)
    expect(result).toContain('drafts')
    expect(result).toContain('published')
    expect(result).toContain('archive')
  })
})

// ---------------------------------------------------------------------------
// createFolder
// ---------------------------------------------------------------------------
describe('createFolder', () => {
  it('creates directory successfully', () => {
    createFolder('new-folder')
    expect(fs.existsSync(path.join(tmpDir, 'new-folder'))).toBe(true)
    expect(fs.statSync(path.join(tmpDir, 'new-folder')).isDirectory()).toBe(true)
  })

  it('throws "Folder already exists" if folder already exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'existing'))
    expect(() => createFolder('existing')).toThrow('Folder already exists')
  })
})

// ---------------------------------------------------------------------------
// renameFolder
// ---------------------------------------------------------------------------
describe('renameFolder', () => {
  it('renames directory correctly (old gone, new exists)', () => {
    fs.mkdirSync(path.join(tmpDir, 'old-name'))
    renameFolder('old-name', 'new-name')
    expect(fs.existsSync(path.join(tmpDir, 'old-name'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'new-name'))).toBe(true)
  })

  it('throws "Not found" if source does not exist', () => {
    expect(() => renameFolder('ghost', 'new-name')).toThrow('Not found')
  })

  it('throws "Target already exists" if destination already exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'source'))
    fs.mkdirSync(path.join(tmpDir, 'target'))
    expect(() => renameFolder('source', 'target')).toThrow('Target already exists')
  })
})

// ---------------------------------------------------------------------------
// deleteFolder
// ---------------------------------------------------------------------------
describe('deleteFolder', () => {
  it('deletes empty folder', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty-folder'))
    deleteFolder('empty-folder')
    expect(fs.existsSync(path.join(tmpDir, 'empty-folder'))).toBe(false)
  })

  it('throws "Not found" if folder does not exist', () => {
    expect(() => deleteFolder('ghost')).toThrow('Not found')
  })

  it('throws "Folder is not empty" if folder has files', () => {
    fs.mkdirSync(path.join(tmpDir, 'nonempty'))
    fs.writeFileSync(path.join(tmpDir, 'nonempty', 'file.md'), 'content')
    expect(() => deleteFolder('nonempty')).toThrow('Folder is not empty')
  })
})

// ---------------------------------------------------------------------------
// assertSafe (tested via the exported functions with bad inputs)
// ---------------------------------------------------------------------------
describe('assertSafe path validation', () => {
  it('throws on name with ".."', () => {
    expect(() => createFolder('../escape')).toThrow('Invalid path component')
  })

  it('throws on name with "/"', () => {
    expect(() => createFolder('a/b')).toThrow('Invalid path component')
  })

  it('throws on absolute path', () => {
    expect(() => createFolder('/etc/passwd')).toThrow('Invalid path component')
  })

  it('throws on oldName with ".." in renameFolder', () => {
    expect(() => renameFolder('../escape', 'target')).toThrow('Invalid path component')
  })

  it('throws on newName with "/" in renameFolder', () => {
    expect(() => renameFolder('source', 'a/b')).toThrow('Invalid path component')
  })

  it('throws on name with ".." in deleteFolder', () => {
    expect(() => deleteFolder('../escape')).toThrow('Invalid path component')
  })
})
