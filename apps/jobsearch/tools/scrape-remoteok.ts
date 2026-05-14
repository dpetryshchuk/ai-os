#!/usr/bin/env tsx
import 'dotenv/config';
import { syncJobsToDB, isDefense, type ScrapedJob } from './scraper-utils';
import { matchesRole } from './filters';

const DRY_RUN = process.argv.includes('--dry');
const MAX_AGE_DAYS = 2;

const TAG_QUERIES = ['engineer', 'engineer,ai', 'technical,ai', 'executive,ai'];

function isRecent(epochSeconds: number | null | undefined): boolean {
  if (!epochSeconds) return true;
  return Date.now() - epochSeconds * 1000 <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function stripHtml(html: string): string {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface RemoteOKJob {
  slug?: string;
  id?: string;
  company?: string;
  position?: string;
  apply_url?: string;
  url?: string;
  description?: string;
  location?: string;
  epoch?: number;
  date?: string;
}

async function fetchRemoteOK(tags: string): Promise<RemoteOKJob[]> {
  const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tags)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as RemoteOKJob[];
  return Array.isArray(data) ? data.slice(1) : [];
}

async function main(): Promise<void> {
  const seen = new Set<string>();
  const allJobs: ScrapedJob[] = [];

  for (let i = 0; i < TAG_QUERIES.length; i++) {
    const tags = TAG_QUERIES[i];
    if (i > 0) {
      process.stdout.write('  Waiting 10s (rate limit)...');
      await sleep(10000);
      process.stdout.write('\r                              \r');
    }

    console.log(`Fetching: tags="${tags}"...`);
    try {
      const rawJobs = await fetchRemoteOK(tags);
      let matched = 0;
      for (const job of rawJobs) {
        const id = job.slug ?? job.id ?? '';
        if (seen.has(id)) continue;
        seen.add(id);

        if (!isRecent(job.epoch)) continue;

        const description = stripHtml(job.description ?? '').slice(0, 1500);
        const companyName = job.company ?? '';
        const jobTitle = job.position ?? '';

        if (!matchesRole(jobTitle)) continue;
        if (isDefense(description) || isDefense(companyName)) continue;

        allJobs.push({
          companyName,
          jobTitle,
          jobLink: job.apply_url ?? job.url ?? `https://remoteok.com/l/${job.slug}`,
          description,
          location: job.location ?? 'Remote',
          isYC: false,
          epoch: job.epoch,
        });
        matched++;
      }
      console.log(`  ${matched} new matches (${rawJobs.length} total)`);
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal unique matches: ${allJobs.length}`);
  if (allJobs.length === 0) { console.log('Nothing found after filtering.'); return; }

  if (DRY_RUN) {
    for (const job of allJobs) {
      console.log(`  ${job.companyName} — ${job.jobTitle}`);
      console.log(`    ${job.jobLink}`);
    }
    return;
  }

  const { created, updated, skipped } = await syncJobsToDB(allJobs);
  console.log(`\nDone. +${created} new | ~${updated} updated | ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
