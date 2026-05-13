#!/usr/bin/env tsx
import 'dotenv/config';
import { syncJobsToDB, isDefense, type ScrapedJob } from './scraper-utils';
import { matchesRole, EXACT_ROLE_PHRASES } from './filters';

const DRY_RUN = process.argv.includes('--dry');

const ROLE_QUERIES = [
  'forward deployed engineer', 'AI automation engineer', 'solutions engineer AI',
  'sales engineer', 'implementation engineer AI', 'AI agent engineer',
  'customer engineer', 'founder associate',
];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ').trim();
}

interface AlgoliaHit {
  objectID: string;
  comment_text?: string;
}

function parseHNComment(hit: AlgoliaHit): ScrapedJob | null {
  const raw = stripHtml(hit.comment_text ?? '');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const firstLine = lines[0];
  const firstSeg = firstLine.split('|')[0];
  let companyName = firstSeg
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\([^)]*\)?/g, '')
    .replace(/[-–]\s*$/, '')
    .replace(/\s+/g, ' ').trim();

  if (!companyName || companyName.length > 70) return null;

  const headerLower = firstLine.toLowerCase();
  const hasCA = /\b(california|san francisco|\bsf\b|bay area|los angeles|\bla\b|san jose|palo alto|menlo park|mountain view|santa clara|redwood city|sunnyvale|oakland|berkeley|san diego|santa monica|cupertino|los gatos|emeryville|south bay)\b/.test(headerLower);
  const hasRemote = /\bremote\b/i.test(firstLine);
  const hasNonUS = /\b(india|uk|eu|europe|canada|australia|brazil|mexico|worldwide|global|anywhere in the world)\b/i.test(raw);
  const hasRemoteUS = hasRemote && !hasNonUS;

  if (!hasCA && !hasRemoteUS) return null;
  const location = hasCA ? (hasRemoteUS ? 'California / Remote' : 'California') : 'Remote (US)';

  if (isDefense(companyName) || isDefense(raw)) return null;

  let role = '';
  for (const line of lines.slice(0, 8)) {
    for (const seg of line.split(/[|,/]/).map(s => s.trim())) {
      if (seg.length > 5 && seg.length < 70 && matchesRole(seg)) {
        role = seg.replace(/^[^a-zA-Z]+/, '').replace(/[*•-]+$/, '').trim();
        break;
      }
    }
    if (role) break;
  }
  if (!role) {
    const snippet = raw.substring(0, 300).toLowerCase();
    for (const phrase of EXACT_ROLE_PHRASES) {
      if (snippet.includes(phrase)) {
        role = phrase.replace(/\b\w/g, c => c.toUpperCase());
        break;
      }
    }
  }
  if (!role) return null;

  const descLines = lines.slice(1).filter(l =>
    !l.startsWith('http') && l.length > 30 &&
    !/^(apply|email|contact|reach out|dm|send)/i.test(l)
  );
  const description = descLines.slice(0, 8).join(' ').substring(0, 1500);

  const urlMatches = [...raw.matchAll(/https?:\/\/[^\s\n|)<>]+/g)].map(m => m[0].replace(/[.,)]+$/, ''));
  const careersUrl = urlMatches.find(u => /jobs|careers|apply|hire|work|join|ashby|greenhouse|lever|workable/i.test(u));
  const jobLink = careersUrl ?? urlMatches[0] ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;

  return { companyName: companyName.trim(), jobTitle: role.trim(), location, description, jobLink, isYC: false, source: 'HN' };
}

async function getLatestHiringThreadId(): Promise<number> {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/user/whoishiring.json');
  if (!res.ok) throw new Error(`Firebase API ${res.status}`);
  const data = await res.json() as { submitted: number[] };
  const topId = data.submitted[0];
  const item = await fetch(`https://hacker-news.firebaseio.com/v0/item/${topId}.json`).then(r => r.json()) as { title?: string; descendants?: number };
  if (!item.title?.toLowerCase().includes('who is hiring')) {
    throw new Error(`Top submission "${item.title}" is not a Who is Hiring thread`);
  }
  console.log(`HN thread: "${item.title}" (${item.descendants} comments)`);
  return topId;
}

async function searchAlgolia(threadId: number, query: string): Promise<AlgoliaHit[]> {
  const url = `https://hn.algolia.com/api/v1/search?tags=comment,story_${threadId}&query=${encodeURIComponent(query)}&hitsPerPage=50`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Algolia API ${res.status}`);
  const data = await res.json() as { hits?: AlgoliaHit[] };
  return data.hits ?? [];
}

async function main(): Promise<void> {
  let threadId: number;
  try {
    threadId = await getLatestHiringThreadId();
  } catch (err) {
    console.error(`Could not fetch HN thread: ${(err as Error).message}`);
    process.exit(1);
  }

  const seenIds = new Set<string>();
  const seenCompanies = new Set<string>();
  const allJobs: ScrapedJob[] = [];

  for (const query of ROLE_QUERIES) {
    console.log(`Searching HN: "${query}"...`);
    try {
      const hits = await searchAlgolia(threadId, query);
      let matched = 0;
      for (const hit of hits) {
        if (seenIds.has(hit.objectID)) continue;
        seenIds.add(hit.objectID);
        const job = parseHNComment(hit);
        if (!job) continue;
        if (seenCompanies.has(job.companyName.toLowerCase())) continue;
        seenCompanies.add(job.companyName.toLowerCase());
        allJobs.push(job);
        matched++;
      }
      console.log(`  ${matched} new matches`);
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal unique HN matches: ${allJobs.length}`);
  if (allJobs.length === 0) { console.log('Nothing found.'); return; }

  if (DRY_RUN) {
    for (const job of allJobs) {
      console.log(`  ${job.companyName} — ${job.jobTitle}`);
      console.log(`    📍 ${job.location}`);
      if (job.description) console.log(`    "${job.description.substring(0, 100)}..."`);
      console.log(`    ${job.jobLink}`);
    }
    return;
  }

  const { created, updated, skipped } = await syncJobsToDB(allJobs);
  console.log(`\nDone. +${created} new | ~${updated} updated | ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
