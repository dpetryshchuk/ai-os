#!/usr/bin/env node
/**
 * Migration: old schema → new schema
 *
 * Old: companies (conflated company+posting), contacts, followups,
 *      job_applications, application_contacts, content_posts
 *
 * New: companies, job_postings, contacts, interactions, content_posts
 *
 * Run once: node db/migrate.js
 * Creates db/backups/<date>-pre-migration.sqlite before touching anything.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'jobsearch.sqlite');
const BACKUP_DIR = path.join(__dirname, 'backups');

// ── Backup ────────────────────────────────────────────────────────────────────

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-pre-migration.sqlite`);
fs.copyFileSync(DB_PATH, backupPath);
console.log(`Backed up to ${backupPath}`);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys=OFF;');

// ── Read old data ─────────────────────────────────────────────────────────────

const oldCompanies   = db.prepare('SELECT * FROM companies').all();
const oldContacts    = db.prepare('SELECT * FROM contacts').all();
const oldFollowups   = db.prepare('SELECT * FROM followups').all();
const oldApps        = db.prepare('SELECT * FROM job_applications').all();
const oldContentPosts = db.prepare('SELECT * FROM content_posts').all();

console.log(`Old data: ${oldCompanies.length} companies, ${oldContacts.length} contacts, ${oldFollowups.length} followups, ${oldApps.length} applications, ${oldContentPosts.length} content_posts`);

// ── Drop old tables ───────────────────────────────────────────────────────────

db.exec(`
  DROP TABLE IF EXISTS application_contacts;
  DROP TABLE IF EXISTS followups;
  DROP TABLE IF EXISTS job_applications;
  DROP TABLE IF EXISTS contacts;
  DROP TABLE IF EXISTS companies;
  DROP TABLE IF EXISTS content_posts;
`);

// ── Create new tables ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE companies (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    website TEXT
  );

  CREATE TABLE job_postings (
    id           TEXT PRIMARY KEY,
    company_id   TEXT REFERENCES companies(id),
    title        TEXT NOT NULL,
    link         TEXT,
    source       TEXT,
    scraped_date TEXT,
    status       TEXT NOT NULL DEFAULT 'new',
    description  TEXT
  );

  CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    company_id    TEXT REFERENCES companies(id),
    role          TEXT,
    source        TEXT,
    stage         TEXT NOT NULL DEFAULT 'Outreached',
    outreach_date TEXT,
    notes         TEXT
  );

  CREATE TABLE interactions (
    id         TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    date       TEXT NOT NULL,
    direction  TEXT NOT NULL,
    notes      TEXT
  );

  CREATE TABLE content_posts (
    id          TEXT PRIMARY KEY,
    posted_date TEXT,
    title       TEXT,
    impressions INTEGER,
    reactions   INTEGER,
    comments    INTEGER,
    reposts     INTEGER
  );

  CREATE INDEX idx_job_postings_company ON job_postings(company_id);
  CREATE INDEX idx_job_postings_status  ON job_postings(status);
  CREATE INDEX idx_job_postings_source  ON job_postings(source);
  CREATE INDEX idx_contacts_stage       ON contacts(stage);
  CREATE INDEX idx_contacts_company     ON contacts(company_id);
  CREATE INDEX idx_interactions_contact ON interactions(contact_id);
  CREATE INDEX idx_interactions_date    ON interactions(date);
`);

// ── Helper ────────────────────────────────────────────────────────────────────

function randomId() {
  const bytes = require('crypto').randomBytes(8);
  return bytes.toString('hex').toLowerCase();
}

const today = new Date().toISOString().slice(0, 10);

// ── Migrate companies → companies + job_postings ──────────────────────────────

const insCompany = db.prepare('INSERT INTO companies (id, name, website) VALUES (?, ?, ?)');
const insPosting = db.prepare(`
  INSERT INTO job_postings (id, company_id, title, link, source, scraped_date, status, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Build set of applied company IDs from old job_applications
const appliedCompanyIds = new Set(oldApps.map(a => a.company_id).filter(Boolean));

let companiesCreated = 0, postingsCreated = 0;

for (const co of oldCompanies) {
  insCompany.run(co.id, co.company, co.website || null);
  companiesCreated++;

  // Only create a posting if there was a job title or link
  if (co.job_title || co.job_link) {
    const source = co.yc_company ? 'YC' : 'Unknown';
    // If this company had an application, mark as applied; if blacklisted, mark dropped
    const status = co.blacklisted ? 'dropped' : appliedCompanyIds.has(co.id) ? 'applied' : 'new';
    insPosting.run(
      randomId(),
      co.id,
      co.job_title || 'Unknown Role',
      co.job_link || null,
      source,
      today,
      status,
      co.what_it_does || null
    );
    postingsCreated++;
  }
}

console.log(`Companies: ${companiesCreated} | Job postings: ${postingsCreated}`);

// ── Migrate contacts ──────────────────────────────────────────────────────────

const stageMap = {
  'Not Contacted':       'Outreached',
  'Connection Requested': 'Outreached',
  'Connected':           'Responded',
  'Initial Conversation': 'Responded',
  'Ongoing Conversation': 'Ongoing',
  'No Response':         'Dead',
  'Not Interested':      'Dead',
};

// Get primary source per contact from followups
const contactSourceMap = new Map();
for (const f of oldFollowups) {
  if (!f.contact_id || !f.source) continue;
  if (!contactSourceMap.has(f.contact_id)) {
    contactSourceMap.set(f.contact_id, f.source);
  }
}

const insContact = db.prepare(`
  INSERT INTO contacts (id, name, company_id, role, source, stage, outreach_date, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let contactsCreated = 0;
for (const c of oldContacts) {
  const stage = stageMap[c.networking_stage] || 'Outreached';
  const source = contactSourceMap.get(c.id) || null;
  insContact.run(
    c.id,
    c.full_name,
    c.company_id || null,
    c.role_at_company || null,
    source,
    stage,
    c.last_contacted_date || null,
    c.notes || null
  );
  contactsCreated++;
}

console.log(`Contacts: ${contactsCreated}`);

// ── Migrate followups → interactions ─────────────────────────────────────────

const insInteraction = db.prepare(`
  INSERT INTO interactions (id, contact_id, date, direction, notes)
  VALUES (?, ?, ?, ?, ?)
`);

// Build set of valid contact IDs
const validContactIds = new Set(oldContacts.map(c => c.id));

let interactionsCreated = 0;
for (const f of oldFollowups) {
  if (!f.contact_id || !validContactIds.has(f.contact_id)) continue;
  if (!f.followup_date) continue;

  // Positive outcome = inbound response, otherwise outbound
  const direction = f.followup_outcome === 'Positive' ? 'in' : 'out';
  insInteraction.run(
    randomId(),
    f.contact_id,
    f.followup_date,
    direction,
    f.notes || f.name || null
  );
  interactionsCreated++;
}

console.log(`Interactions: ${interactionsCreated}`);

// ── Migrate content_posts ─────────────────────────────────────────────────────

const insPost = db.prepare(`
  INSERT INTO content_posts (id, posted_date, title, impressions, reactions, comments, reposts)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const p of oldContentPosts) {
  insPost.run(p.id, p.posted_date || null, p.title || null, p.impressions || null, p.reactions || null, p.comments || null, p.reposts || null);
}

console.log(`Content posts: ${oldContentPosts.length}`);

// ── Done ──────────────────────────────────────────────────────────────────────

db.exec('PRAGMA foreign_keys=ON;');
db.close();

console.log('\nMigration complete.');
