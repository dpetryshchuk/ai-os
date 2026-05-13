import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

let tmpRepo: string

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-git-test-'))
  process.env.REPO_DIR = tmpRepo
})

afterEach(() => {
  fs.rmSync(tmpRepo, { recursive: true, force: true })
  delete process.env.REPO_DIR
})

import { gitPull, gitPush } from '../src/git'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExec(responses: Record<string, string> = {}) {
  const calls: Array<{ cmd: string; opts: unknown }> = []
  const exec = (cmd: string, opts: unknown) => {
    calls.push({ cmd, opts })
    const key = Object.keys(responses).find(k => cmd.includes(k))
    if (responses[key ?? ''] !== undefined) return responses[key ?? '']
    return ''
  }
  return { exec, calls }
}

// ---------------------------------------------------------------------------
// gitPull
// ---------------------------------------------------------------------------

describe('gitPull', () => {
  it('calls exec with "git pull" and { cwd: REPO_DIR, encoding: "utf8" }', () => {
    const { exec, calls } = makeExec({ 'git pull': 'Already up to date.' })
    gitPull(exec)
    expect(calls).toHaveLength(1)
    expect(calls[0].cmd).toBe('git pull')
    expect(calls[0].opts).toEqual({ cwd: tmpRepo, encoding: 'utf8' })
  })

  it('returns trimmed output from exec', () => {
    const { exec } = makeExec({ 'git pull': '  Already up to date.\n' })
    const result = gitPull(exec)
    expect(result).toBe('Already up to date.')
  })

  it('throws if REPO_DIR is not set', () => {
    delete process.env.REPO_DIR
    const { exec } = makeExec()
    expect(() => gitPull(exec)).toThrow('REPO_DIR env var is not set')
  })
})

// ---------------------------------------------------------------------------
// gitPush
// ---------------------------------------------------------------------------

describe('gitPush', () => {
  it('throws if message is empty string', () => {
    const { exec } = makeExec()
    expect(() => gitPush('', exec)).toThrow('Commit message is required')
  })

  it('throws if message is whitespace only', () => {
    const { exec } = makeExec()
    expect(() => gitPush('   ', exec)).toThrow('Commit message is required')
  })

  it('calls exec three times in order: git add -A, git commit -m, git push', () => {
    const { exec, calls } = makeExec()
    gitPush('my commit', exec)
    expect(calls).toHaveLength(3)
    expect(calls[0].cmd).toBe('git add -A')
    expect(calls[1].cmd).toContain('git commit -m')
    expect(calls[2].cmd).toBe('git push')
  })

  it('passes cwd: REPO_DIR to all three exec calls', () => {
    const { exec, calls } = makeExec()
    gitPush('my commit', exec)
    for (const call of calls) {
      expect((call.opts as { cwd: string }).cwd).toBe(tmpRepo)
    }
  })

  it('includes the commit message in the git commit call', () => {
    const { exec, calls } = makeExec()
    gitPush('Deploy update', exec)
    expect(calls[1].cmd).toContain('"Deploy update"')
  })

  it('returns trimmed output from the push command', () => {
    const { exec } = makeExec({ 'git push': '  Everything up-to-date\n' })
    const result = gitPush('my commit', exec)
    expect(result).toBe('Everything up-to-date')
  })

  it('returns "Nothing to commit" if commit throws with stdout containing "nothing to commit"', () => {
    const { exec } = makeExec()
    let callCount = 0
    const throwingExec = (cmd: string, opts: unknown) => {
      callCount++
      if (cmd.includes('git commit')) {
        const err = new Error('nothing to commit') as Error & { stdout: string; stderr: string }
        err.stdout = 'nothing to commit, working tree clean'
        err.stderr = ''
        throw err
      }
      return ''
    }
    const result = gitPush('my commit', throwingExec)
    expect(result).toBe('Nothing to commit')
  })

  it('re-throws commit error if stdout does not contain "nothing to commit"', () => {
    const throwingExec = (cmd: string, _opts: unknown) => {
      if (cmd.includes('git commit')) {
        const err = new Error('fatal: repository not found') as Error & { stdout: string; stderr: string }
        err.stdout = ''
        err.stderr = 'fatal: repository not found'
        throw err
      }
      return ''
    }
    expect(() => gitPush('my commit', throwingExec)).toThrow('fatal: repository not found')
  })

  it('throws if REPO_DIR is not set', () => {
    delete process.env.REPO_DIR
    const { exec } = makeExec()
    expect(() => gitPush('my commit', exec)).toThrow('REPO_DIR env var is not set')
  })
})
