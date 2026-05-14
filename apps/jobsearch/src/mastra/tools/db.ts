import { createTool } from '@mastra/core/tools'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { pool } from '../pool'
import { searchNotes } from '../queries'

function newId(): string {
  return randomBytes(8).toString('hex')
}

export const upsertCompany = createTool({
  id: 'upsert_company',
  description: 'Create or update a company. Always runs before creating contacts or job postings.',
  inputSchema: z.object({
    name: z.string(),
    website: z.string().optional(),
  }),
  execute: async ({ name, website }) => {
    const existing = await pool.query(
      'SELECT id FROM companies WHERE lower(name) = lower($1)',
      [name]
    )
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id
      if (website) await pool.query('UPDATE companies SET website = $1 WHERE id = $2', [website, id])
      return { action: 'updated', id, name }
    }
    const id = newId()
    await pool.query('INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)', [id, name, website ?? null])
    return { action: 'created', id, name }
  },
})

export const upsertContact = createTool({
  id: 'upsert_contact',
  description: 'Create or update a contact. Use after upsert_company to get the company_id.',
  inputSchema: z.object({
    name: z.string(),
    company_id: z.string(),
    role: z.string().optional(),
    source: z.enum(['LinkedIn', 'YC', 'Cold Email', 'Referral', 'Event']),
    stage: z.enum(['Outreached', 'Responded', 'Ongoing', 'Dead']).default('Outreached'),
    notes: z.string().optional(),
    content_post_id: z.string().optional(),
  }),
  execute: async ({ name, company_id, role, source, stage, notes, content_post_id }) => {
    const existing = await pool.query(
      'SELECT id FROM contacts WHERE lower(name) = lower($1) AND company_id = $2',
      [name, company_id]
    )
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id
      await pool.query(
        'UPDATE contacts SET role = COALESCE($1, role), stage = $2, notes = COALESCE($3, notes), content_post_id = COALESCE($4, content_post_id) WHERE id = $5',
        [role ?? null, stage, notes ?? null, content_post_id ?? null, id]
      )
      return { action: 'updated', id, name }
    }
    const id = newId()
    await pool.query(
      `INSERT INTO contacts (id, name, company_id, role, source, stage, outreach_date, notes, content_post_id)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8)`,
      [id, name, company_id, role ?? null, source, stage, notes ?? null, content_post_id ?? null]
    )
    return { action: 'created', id, name }
  },
})

export const upsertJobPosting = createTool({
  id: 'upsert_job_posting',
  description: 'Create or update a job posting. Use after upsert_company to get the company_id.',
  inputSchema: z.object({
    company_id: z.string(),
    title: z.string(),
    link: z.string().optional(),
    source: z.enum(['YC', 'HN', 'RemoteOK', 'SimplifyJobs', 'LinkedIn', 'CompanySite']),
    status: z.enum(['new', 'applied', 'dropped']).default('new'),
    description: z.string().optional(),
    resume_path: z.string().optional(),
  }),
  execute: async ({ company_id, title, link, source, status, description, resume_path }) => {
    const existing = await pool.query(
      'SELECT id FROM job_postings WHERE company_id = $1 AND lower(title) = lower($2)',
      [company_id, title]
    )
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id
      await pool.query(
        'UPDATE job_postings SET status = $1, description = COALESCE($2, description), resume_path = COALESCE($3, resume_path) WHERE id = $4',
        [status, description ?? null, resume_path ?? null, id]
      )
      return { action: 'updated', id, title }
    }
    const id = newId()
    await pool.query(
      `INSERT INTO job_postings (id, company_id, title, link, source, scraped_date, status, description, resume_path)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8)`,
      [id, company_id, title, link ?? null, source, status, description ?? null, resume_path ?? null]
    )
    return { action: 'created', id, title }
  },
})

export const updateStage = createTool({
  id: 'update_stage',
  description: 'Move a contact to a new stage in the pipeline.',
  inputSchema: z.object({
    contact_id: z.string(),
    stage: z.enum(['Outreached', 'Responded', 'Ongoing', 'Dead']),
  }),
  execute: async ({ contact_id, stage }) => {
    await pool.query('UPDATE contacts SET stage = $1 WHERE id = $2', [stage, contact_id])
    return { action: 'updated', contact_id, stage }
  },
})

export const logInteraction = createTool({
  id: 'log_interaction',
  description: 'Record a message sent or received. direction: "out" = you sent, "in" = they replied.',
  inputSchema: z.object({
    contact_id: z.string(),
    direction: z.enum(['in', 'out']),
    notes: z.string(),
  }),
  execute: async ({ contact_id, direction, notes }) => {
    const id = newId()
    await pool.query(
      'INSERT INTO interactions (id, contact_id, date, direction, notes) VALUES ($1, $2, CURRENT_DATE, $3, $4)',
      [id, contact_id, direction, notes]
    )
    return { action: 'created', id }
  },
})

export const queryDb = createTool({
  id: 'query_db',
  description: 'Run a read-only SQL query. Use for retro stats, lookups, and anything not covered by other tools.',
  inputSchema: z.object({
    sql: z.string(),
  }),
  execute: async ({ sql }) => {
    const forbidden = /^\s*(insert|update|delete|drop|alter|truncate)/i
    if (forbidden.test(sql)) return { error: 'Read-only. Use the specific write tools.' }
    const result = await pool.query(sql)
    return { rows: result.rows, count: result.rowCount }
  },
})

export const searchNotesTool = createTool({
  id: 'search_notes',
  description: 'Search saved notes, articles, and reading list by keyword. Use when the user asks what they have saved, read, or noted about a topic.',
  inputSchema: z.object({
    query: z.string().describe('Keyword or phrase to search for in notes'),
  }),
  execute: async ({ query }) => searchNotes(query, 10),
})

export const logContentPost = createTool({
  id: 'log_content_post',
  description: 'Log a LinkedIn post for retro tracking. Call after publishing.',
  inputSchema: z.object({
    posted_date: z.string(),
    content: z.string(),
    impressions: z.number().optional(),
    engagements: z.number().optional(),
    comments: z.number().optional(),
  }),
  execute: async ({ posted_date, content, impressions, engagements, comments }) => {
    const id = newId()
    await pool.query(
      `INSERT INTO content_posts (id, posted_date, content, impressions, engagements, comments)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, posted_date, content, impressions ?? 0, engagements ?? 0, comments ?? 0]
    )
    return { action: 'created', id }
  },
})
