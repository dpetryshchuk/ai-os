import { Pool } from 'pg'

let _pool: Pool | null = null

export function getPool(url?: string): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: url ?? process.env.DATABASE_URL })
  }
  return _pool
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}

export const pool = getPool()