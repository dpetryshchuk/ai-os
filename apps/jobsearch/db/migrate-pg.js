/**
 * Migrate contacts + their companies from SQLite → Postgres.
 * Run once from the jobsearch-vps directory:
 *   node db/migrate-pg.js
 */

const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { Pool } = require('pg')
require('dotenv').config()

const sqlite = new DatabaseSync(path.join(__dirname, '../../jobsearch/db/jobsearch.sqlite'))
const pg = new Pool({ connectionString: process.env.DATABASE_URL })

const SOURCE_MAP = {
  'YC Jobs': 'YC',
  'Other':   'Referral',
}

function mapSource(s) {
  if (!s) return 'LinkedIn'
  return SOURCE_MAP[s] || s
}

async function run() {
  // Load all contacts and the companies they belong to
  const contacts  = sqlite.prepare('SELECT * FROM contacts').all()
  const companyIds = [...new Set(contacts.map(c => c.company_id).filter(Boolean))]

  const placeholders = companyIds.map((_, i) => `?`).join(',')
  const companies = sqlite.prepare(
    `SELECT * FROM companies WHERE id IN (${placeholders})`
  ).all(...companyIds)

  console.log(`Migrating ${companies.length} companies and ${contacts.length} contacts...`)

  const client = await pg.connect()
  try {
    await client.query('BEGIN')

    // Insert companies
    for (const co of companies) {
      await client.query(
        `INSERT INTO companies (id, name, website)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [co.id, co.name, co.website || null]
      )
    }
    console.log(`Companies done.`)

    // Insert contacts
    let skipped = 0
    for (const c of contacts) {
      if (!c.company_id) { skipped++; continue }
      await client.query(
        `INSERT INTO contacts (id, name, company_id, role, source, stage, outreach_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          c.id,
          c.name,
          c.company_id,
          c.role || null,
          mapSource(c.source),
          c.stage || 'Outreached',
          c.outreach_date || null,
          c.notes || null,
        ]
      )
    }
    console.log(`Contacts done. Skipped ${skipped} with no company.`)

    await client.query('COMMIT')
    console.log('Migration complete.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed, rolled back.', err.message)
  } finally {
    client.release()
    await pg.end()
    sqlite.close()
  }
}

run()
