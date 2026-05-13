-- Job Search Tracker - Postgres Schema

CREATE TABLE IF NOT EXISTS companies (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  website TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name ON companies (lower(name));

CREATE TABLE IF NOT EXISTS events (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  date  DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS content_posts (
  id          TEXT PRIMARY KEY,
  posted_date DATE,
  content     TEXT NOT NULL,
  impressions INT DEFAULT 0,
  engagements INT DEFAULT 0,
  comments    INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contacts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  company_id      TEXT NOT NULL REFERENCES companies(id),
  role            TEXT,
  source          TEXT NOT NULL CHECK (source IN ('LinkedIn','YC','Cold Email','Referral','Event')),
  stage           TEXT NOT NULL DEFAULT 'Outreached' CHECK (stage IN ('Outreached','Responded','Ongoing','Dead')),
  outreach_date   DATE,
  notes           TEXT,
  event_id        TEXT REFERENCES events(id),
  content_post_id TEXT REFERENCES content_posts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_name ON contacts (lower(name), company_id);

CREATE TABLE IF NOT EXISTS job_postings (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id),
  title        TEXT NOT NULL,
  link         TEXT,
  source       TEXT NOT NULL CHECK (source IN ('YC','HN','RemoteOK','SimplifyJobs','LinkedIn','CompanySite')),
  scraped_date DATE,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','applied','dropped')),
  description  TEXT,
  resume_path  TEXT
);

CREATE TABLE IF NOT EXISTS interactions (
  id         TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  date       DATE,
  direction  TEXT NOT NULL CHECK (direction IN ('in','out')),
  notes      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_company     ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stage       ON contacts(stage);
CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status  ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date    ON interactions(date);
CREATE INDEX IF NOT EXISTS idx_content_posts_date   ON content_posts(posted_date);
