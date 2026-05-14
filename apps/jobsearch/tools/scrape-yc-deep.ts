#!/usr/bin/env tsx
import 'dotenv/config';
import { syncJobsToDB, isDefense, isNonCARemote, type ScrapedJob } from './scraper-utils';
import { matchesRole } from './filters';

const DRY_RUN = process.argv.includes('--dry');
const YC_API = 'https://api.ycombinator.com/v0.1';
const WAAS = 'https://www.workatastartup.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BATCHES = ['W26', 'F25', 'S25', 'W25', 'S24', 'W24'];
const FETCH_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface YCCompany {
  name: string;
  slug: string;
  oneLiner?: string;
  longDescription?: string;
}

interface YCJob {
  id?: number;
  title: string;
  location?: string;
}

async function fetchBatchCompanies(batch: string): Promise<YCCompany[]> {
  const companies: YCCompany[] = [];
  let page = 1, totalPages = 1;
  do {
    const params = new URLSearchParams({ batch, page: String(page), isHiring: 'true' });
    const r = await fetch(`${YC_API}/companies?${params}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`YC API ${batch} p${page}: HTTP ${r.status}`);
    const data = await r.json() as { companies?: YCCompany[]; totalPages?: number };
    companies.push(...(data.companies ?? []));
    totalPages = data.totalPages ?? 1;
    page++;
  } while (page <= totalPages);
  return companies;
}

async function fetchCompanyJobs(slug: string): Promise<YCJob[]> {
  const r = await fetch(`${WAAS}/companies/${slug}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!r.ok) return [];
  const html = await r.text();
  const dpMatch = html.match(/data-page="([^"]+)"/);
  if (!dpMatch) return [];
  const data = JSON.parse(dpMatch[1].replace(/&quot;/g, '"')) as { props?: { company?: { jobs?: YCJob[] } } };
  return data?.props?.company?.jobs ?? [];
}

async function main(): Promise<void> {
  const allJobs: (ScrapedJob & { batch: string })[] = [];
  const seen = new Set<string>();

  for (const batch of BATCHES) {
    process.stdout.write(`Batch ${batch}: `);
    let companies: YCCompany[];
    try {
      companies = await fetchBatchCompanies(batch);
      process.stdout.write(`${companies.length} companies hiring... `);
    } catch (err) {
      console.log(`API error: ${(err as Error).message}`);
      continue;
    }

    let matchCount = 0;
    for (const company of companies) {
      if (isDefense(company.oneLiner) || isDefense(company.name)) continue;
      try {
        const jobs = await fetchCompanyJobs(company.slug);
        for (const job of jobs) {
          if (!matchesRole(job.title)) continue;
          if (isDefense(job.title)) continue;
          if (job.location && isNonCARemote(job.location)) continue;
          const key = `${company.name.toLowerCase()}|${job.title.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allJobs.push({
            companyName: company.name,
            description: company.oneLiner ?? company.longDescription?.slice(0, 200) ?? '',
            website: `${WAAS}/companies/${company.slug}`,
            jobTitle: job.title,
            jobLink: job.id ? `${WAAS}/jobs/${job.id}` : `${WAAS}/companies/${company.slug}`,
            location: job.location ?? '',
            batch,
            isYC: true,
          });
          matchCount++;
        }
        await sleep(FETCH_DELAY_MS);
      } catch {
        // skip companies with fetch errors
      }
    }
    console.log(`${matchCount} role matches`);
  }

  console.log(`\nTotal unique matches: ${allJobs.length}`);
  if (allJobs.length === 0) { console.log('Nothing found.'); return; }

  if (DRY_RUN) {
    for (const job of allJobs) {
      const loc = job.location ? ` 📍 ${job.location}` : '';
      console.log(`  [${job.batch}] ${job.companyName} — ${job.jobTitle}${loc}`);
      if (job.description) console.log(`    ${job.description.slice(0, 100)}`);
      if (job.jobLink) console.log(`    ${job.jobLink}`);
    }
    return;
  }

  const { created, updated, skipped } = await syncJobsToDB(allJobs);
  console.log(`\nDone. +${created} new | ~${updated} updated | ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
