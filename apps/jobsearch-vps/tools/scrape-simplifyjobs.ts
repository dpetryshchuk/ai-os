#!/usr/bin/env tsx
import 'dotenv/config';
import { load } from 'cheerio';
import { syncJobsToDB, isDefense, isNonCARemote, type ScrapedJob } from './scraper-utils';
import { matchesRole } from './filters';

const DRY_RUN = process.argv.includes('--dry');
const MAX_AGE_DAYS = 2;
const README_URL = 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md';

function parseAge(ageText: string): number {
  const match = ageText.trim().match(/^(\d+)d$/);
  return match ? parseInt(match[1], 10) : Infinity;
}

function anyLocationMatches(locationText: string): boolean {
  const locations = locationText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  if (locations.length === 0) return true;
  return locations.some(loc => !isNonCARemote(loc));
}

async function main(): Promise<void> {
  console.log('Fetching SimplifyJobs New Grad Positions...');

  const res = await fetch(README_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const content = await res.text();

  const $ = load(content);
  const jobs: ScrapedJob[] = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    const age = parseAge($(cells[4]).text());
    if (age > MAX_AGE_DAYS) return;

    const roleRaw = $(cells[1]).text().trim();
    if (roleRaw.includes('🔒')) return;

    const applyLink = $(cells[3]).find('a').first().attr('href');
    if (!applyLink) return;

    const company = $(cells[0]).find('a').first().text().trim();
    const role = roleRaw.replace(/[🔥🇺🇸🛂🎓]/g, '').trim();

    const locationHtml = $(cells[2]).html() ?? '';
    const locationText = locationHtml
      .replace(/<\/?(br|BR)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!company || !role) return;
    if (isDefense(company) || isDefense(role)) return;
    if (!matchesRole(role)) return;
    if (!anyLocationMatches(locationText)) return;

    jobs.push({
      companyName: company,
      jobTitle: role,
      jobLink: applyLink,
      location: locationText.split('\n')[0].trim(),
      isYC: false,
      source: 'SimplifyJobs',
    });
  });

  console.log(`Found ${jobs.length} matching jobs (last ${MAX_AGE_DAYS} days)`);
  if (jobs.length === 0) { console.log('Nothing to write.'); return; }

  if (DRY_RUN) {
    for (const j of jobs) {
      console.log(`  ${j.companyName} — ${j.jobTitle} (${j.location})`);
      console.log(`    ${j.jobLink}`);
    }
    return;
  }

  const { created, updated, skipped } = await syncJobsToDB(jobs);
  console.log(`Done. +${created} new | ~${updated} updated | ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
