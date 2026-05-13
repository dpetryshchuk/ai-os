import 'dotenv/config';
import { randomBytes } from 'crypto';
import { pool } from '../src/mastra/pool';

export interface ScrapedJob {
  companyName: string;
  jobTitle: string;
  jobLink?: string;
  description?: string;
  website?: string;
  location?: string;
  isYC?: boolean;
  source?: string;
  epoch?: number;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
}

// ── Content filters ───────────────────────────────────────────────────────────

const DEFENSE_KEYWORDS = [
  'defense', 'defence', 'military', 'weapon', 'dod', 'national security', 'aerospace defense',
];

export function isDefense(text: string | null | undefined): boolean {
  if (!text) return false;
  return DEFENSE_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
}

export function isHighTravel(description: string | null | undefined): boolean {
  if (!description) return false;
  const text = description.toLowerCase();
  if (/\b(5[0-9]|[6-9]\d|100)\s*[-–]?\s*\d*\s*%\s*travel/.test(text)) return true;
  if (/\btravel\b.{0,20}\b(5[0-9]|[6-9]\d|100)\s*%/.test(text)) return true;
  if (/\b(frequent|extensive|heavy|significant)\s+travel\b/.test(text)) return true;
  if (
    /\btravel(ing)?\s+(to|for)\s+(customer|client)\s+(offices?|sites?|locations?)\b/.test(text) &&
    !/\b(occasional|minimal|rare|limited|some)\s+travel\b/.test(text)
  ) return true;
  return false;
}

export function isNonCARemote(location: string | null | undefined): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  if (loc.includes('remote')) return false;
  if (/\b(san diego|los angeles|l\.?a\.|san francisco|s\.?f\.|bay area|california|, ca\b)/.test(loc)) return false;
  if (loc === 'us' || loc === 'usa' || loc === 'united states' || loc.includes('nationwide')) return false;
  const FOREIGN = [
    'london', 'uk', 'u.k.', 'stockholm', 'berlin', 'paris', 'amsterdam',
    'toronto', 'canada', 'india', 'australia', 'singapore', 'ireland', 'dublin',
    'germany', 'france', 'spain', 'netherlands', 'israel', 'brazil', 'latam',
  ];
  if (FOREIGN.some(s => loc.includes(s))) return true;
  const NON_CA = [
    ', ny', ', tx', ', wa', ', il', ', ma', ', co', ', ga', ', fl',
    ', nc', ', az', ', or', ', nv', ', ut', ', va', ', oh', ', mn', ', pa',
    'new york', 'chicago', 'seattle', 'boston', 'denver', 'atlanta',
    'austin', 'dallas', 'houston', 'miami', 'portland', 'phoenix', 'salt lake',
  ];
  if (NON_CA.some(s => loc.includes(s))) return true;
  return false;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function newId(): string {
  return randomBytes(8).toString('hex');
}

interface ExistingData {
  companyMap: Map<string, string>;
  postingMap: Map<string, { id: string; link: string | null; status: string }>;
}

async function getExistingData(): Promise<ExistingData> {
  const [companies, postings] = await Promise.all([
    pool.query('SELECT id, name FROM companies'),
    pool.query('SELECT id, company_id, title, link, status FROM job_postings'),
  ]);

  const companyMap = new Map<string, string>();
  for (const c of companies.rows) companyMap.set(c.name.toLowerCase(), c.id);

  const postingMap = new Map<string, { id: string; link: string | null; status: string }>();
  for (const p of postings.rows) {
    const key = `${p.company_id}::${(p.title || '').toLowerCase()}`;
    postingMap.set(key, { id: p.id, link: p.link, status: p.status });
  }

  return { companyMap, postingMap };
}

async function upsertCompany(name: string, website?: string): Promise<string> {
  const existing = await pool.query(
    'SELECT id FROM companies WHERE lower(name) = lower($1)',
    [name]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = newId();
  await pool.query(
    'INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)',
    [id, name, website ?? null]
  );
  return id;
}

async function insertPosting(companyId: string, job: ScrapedJob, source: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(`
    INSERT INTO job_postings (id, company_id, title, link, source, scraped_date, status, description)
    VALUES ($1, $2, $3, $4, $5, $6, 'new', $7)
  `, [newId(), companyId, job.jobTitle, job.jobLink ?? null, source, today, job.description ?? null]);
}

async function updatePosting(postingId: string, job: ScrapedJob): Promise<void> {
  await pool.query(
    'UPDATE job_postings SET link = COALESCE($1, link), description = COALESCE($2, description) WHERE id = $3',
    [job.jobLink ?? null, job.description ?? null, postingId]
  );
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export async function syncJobsToDB(jobs: ScrapedJob[]): Promise<SyncResult> {
  const { companyMap, postingMap } = await getExistingData();
  let created = 0, updated = 0, skipped = 0;

  for (const job of jobs) {
    const text = `${job.description ?? ''} ${job.jobTitle}`;
    if (isDefense(text) || isDefense(job.companyName)) { skipped++; continue; }
    if (isHighTravel(job.description)) {
      console.log(`  ✗ SKIP ${job.companyName} — high travel`);
      skipped++; continue;
    }
    if (isNonCARemote(job.location)) {
      console.log(`  ✗ SKIP ${job.companyName} — location: ${job.location}`);
      skipped++; continue;
    }

    const source = job.isYC ? 'YC' : (job.source ?? 'Unknown');

    let companyId = companyMap.get(job.companyName.toLowerCase());
    if (!companyId) {
      companyId = await upsertCompany(job.companyName, job.website);
      companyMap.set(job.companyName.toLowerCase(), companyId);
    }

    const postingKey = `${companyId}::${job.jobTitle.toLowerCase()}`;
    const existing = postingMap.get(postingKey);

    if (!existing) {
      await insertPosting(companyId, job, source);
      postingMap.set(postingKey, { id: '', link: job.jobLink ?? null, status: 'new' });
      console.log(`  ✓ NEW  ${job.companyName} — ${job.jobTitle}`);
      created++;
    } else if (existing.status !== 'new') {
      skipped++;
    } else if (job.jobLink && existing.link !== job.jobLink) {
      await updatePosting(existing.id, job);
      console.log(`  ↑ UPD  ${job.companyName} — ${job.jobTitle}`);
      updated++;
    } else {
      skipped++;
    }
  }

  return { created, updated, skipped };
}
