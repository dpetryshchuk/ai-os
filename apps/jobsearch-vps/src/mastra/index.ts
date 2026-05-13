import { Mastra } from '@mastra/core'
import { LangfuseExporter } from '@mastra/langfuse'
import { Observability } from '@mastra/observability'
import { PostgresStore } from '@mastra/pg'
import { randomBytes } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { jobsearchAgent } from './agents/jobsearch'
import { pool } from './pool'
import {
  createNote,
  deleteNote,
  getApplications,
  getContentPosts,
  getLeads,
  getNotes,
  getPipeline,
  getRetro,
  searchNotes,
  updateNote,
} from './queries'

const UPLOADS_DIR = '/home/dima/jobsearch/uploads'
const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com'

const storage = new PostgresStore({
  id: 'pg-storage',
  connectionString: process.env.DATABASE_URL!,
})

const observability = new Observability({
  configs: {
    langfuse: {
      serviceName: 'jobsearch-crm',
      exporters: [
        new LangfuseExporter({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: LANGFUSE_HOST,
          realtime: true,
        }),
      ],
    },
  },
})

// GET handler: just JSON-return whatever the loader resolves to.
function jsonGet<T>(load: () => Promise<T>) {
  return {
    method: 'GET' as const,
    handler: async (c: any) => c.json(await load()),
  }
}

async function fetchUsage(): Promise<{ traces: unknown[]; daily: unknown[] }> {
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`,
  ).toString('base64')
  const headers = { Authorization: `Basic ${auth}` }
  const [tracesRes, dailyRes] = await Promise.all([
    fetch(`${LANGFUSE_HOST}/api/public/traces?limit=50&orderBy=timestamp&order=DESC`, { headers }),
    fetch(`${LANGFUSE_HOST}/api/public/metrics/daily?limit=30`, { headers }),
  ])
  const [traces, daily] = await Promise.all([tracesRes.json(), dailyRes.json()])
  return { traces: traces.data ?? [], daily: daily.data ?? [] }
}

export const mastra = new Mastra({
  agents: { jobsearchAgent },
  storage,
  observability,
  server: {
    apiRoutes: [
      { path: '/data/usage', ...jsonGet(fetchUsage) },
      { path: '/data/pipeline', ...jsonGet(getPipeline) },
      { path: '/data/retro', ...jsonGet(getRetro) },
      { path: '/data/content', ...jsonGet(getContentPosts) },
      { path: '/data/leads', ...jsonGet(getLeads) },
      { path: '/data/applications', ...jsonGet(getApplications) },
      {
        path: '/data/notes',
        method: 'GET' as const,
        handler: async (c: any) => {
          const q = c.req.query('q')
          return c.json(q ? await searchNotes(q) : await getNotes())
        },
      },
      {
        path: '/data/resumes',
        method: 'POST' as const,
        handler: async (c: any) => {
          const formData = await c.req.formData()
          const file = formData.get('file') as File | null
          const applicationId = formData.get('applicationId') as string | null
          if (!file || !applicationId) return c.json({ error: 'Missing file or applicationId' }, 400)

          mkdirSync(UPLOADS_DIR, { recursive: true })
          const ext = extname(file.name) || '.pdf'
          const fileName = `${applicationId}${ext}`
          writeFileSync(join(UPLOADS_DIR, fileName), Buffer.from(await file.arrayBuffer()))

          await pool.query('UPDATE job_postings SET resume_path = $1 WHERE id = $2', [fileName, applicationId])
          return c.json({ path: fileName })
        },
      },
      {
        path: '/data/notes',
        method: 'POST' as const,
        handler: async (c: any) => {
          const body = await c.req.json()
          const note = await createNote({
            id: randomBytes(8).toString('hex'),
            category: body.category ?? 'note',
            title: body.title ?? null,
            url: body.url ?? null,
            content: body.content ?? null,
          })
          return c.json(note, 201)
        },
      },
      {
        path: '/data/notes/:id',
        method: 'PATCH' as const,
        handler: async (c: any) => {
          const id = c.req.param('id')
          const body = await c.req.json()
          const note = await updateNote(id, {
            category: body.category ?? 'note',
            title: body.title ?? null,
            url: body.url ?? null,
            content: body.content ?? null,
          })
          if (!note) return c.json({ error: 'Not found' }, 404)
          return c.json(note)
        },
      },
      {
        path: '/data/notes/:id',
        method: 'DELETE' as const,
        handler: async (c: any) => {
          const id = c.req.param('id')
          await deleteNote(id)
          return c.json({ ok: true })
        },
      },
    ],
  },
})
