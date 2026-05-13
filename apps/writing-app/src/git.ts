import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process'

type ExecFn = (cmd: string, opts: ExecSyncOptionsWithStringEncoding) => string

function repoDir(): string {
  const d = process.env.REPO_DIR
  if (!d) throw new Error('REPO_DIR env var is not set')
  return d
}

export function gitPull(exec: ExecFn = execSync): string {
  const out = exec('git pull', { cwd: repoDir(), encoding: 'utf8' })
  return out.trim()
}

export function gitPush(message: string, exec: ExecFn = execSync): string {
  if (!message || !message.trim()) throw new Error('Commit message is required')
  const cwd = repoDir()
  exec('git add -A', { cwd, encoding: 'utf8' })
  try {
    exec(`git commit -m ${JSON.stringify(message)}`, { cwd, encoding: 'utf8' })
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string }
    const out = (err.stdout ?? '') + (err.stderr ?? '')
    if (out.includes('nothing to commit')) return 'Nothing to commit'
    throw e
  }
  const out = exec('git push', { cwd, encoding: 'utf8' })
  return out.trim()
}
