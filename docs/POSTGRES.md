# Postgres

One shared Postgres 16 container. Each app gets its own user and database — same isolation boundary as separate instances, zero extra cost.

## Databases

| Database | Owner user | App |
|---|---|---|
| `jobsearch` | `jobsearch` | Job search CRM |
| `daily_log` | `daily_log` | Daily log |

Connection string pattern: `postgresql://<user>:<password>@postgres:5432/<database>`  
Inside Docker Compose, apps refer to the container by service name (`postgres`), not `localhost`.

Local access requires an SSH tunnel:
```bash
ssh -L 5432:localhost:5432 dima@46.225.78.10
# then connect to localhost:5432
```

## Schemas

### jobsearch

```
companies       id (hex16), name (unique lower), website
contacts        id, name, company_id → companies, role, source, stage, outreach_date, notes
                stage: Outreached → Responded → Ongoing → Dead
                source: LinkedIn | YC | Cold Email | Referral | Event
interactions    id, contact_id → contacts (cascade), date, direction (in|out), notes
job_postings    id, company_id → companies, title, link, source, scraped_date, status, description, resume_path
                status: new | applied | dropped
content_posts   id, posted_date, content, impressions, engagements, comments
events          id, name, date, notes
notes           id, category, title, url, content, created_at
```

IDs: `randomBytes(8).toString('hex')` — 16-char hex strings.

### daily_log

```
entries         date (PK), did_today, doing_tomorrow, updated_at
habit_types     id (serial), name (unique), kind (boolean|number), active
habit_logs      (habit_type_id, date) composite PK, value jsonb
```

## Migrations

No migration runner. Schema files are the reference:

- `apps/jobsearch/db/schema.sql`
- `apps/daily-log/schema.sql`

On a fresh VPS, apply manually after `docker compose up -d postgres`:
```bash
# wait a few seconds for postgres to init, then:
docker compose exec -T postgres psql -U jobsearch jobsearch < apps/jobsearch/db/schema.sql
docker compose exec -T postgres psql -U daily_log daily_log < apps/daily-log/schema.sql
```

Mastra auto-creates its own tables (workflow state, traces) on startup — those are fine to let it handle.

> **When to add a migration runner:** once you have a second person touching the schema, or once the schema has evolved past v1 on a live server. Until then, the manual step + schema.sql is the right tool.

## Backups

**Recommended setup: Hetzner Backups + pg_dump cron**

### Hetzner Backups (whole-VPS, ~€0.80/mo)

Enable in Hetzner console → server → Backups. Gives 7 rolling daily snapshots of the entire VPS. Covers catastrophic failure (deleted VPS, corrupted volume). Zero config.

### pg_dump cron (DB-only, granular)

Add this script to the VPS at `/home/dima/backup-db.sh`:

```bash
#!/bin/bash
set -e
DATE=$(date +%Y%m%d)
DIR=/home/dima/backups
mkdir -p $DIR
cd /home/dima/ai-os
docker compose exec -T postgres pg_dump -U jobsearch jobsearch > $DIR/jobsearch_$DATE.sql
docker compose exec -T postgres pg_dump -U daily_log daily_log > $DIR/daily_log_$DATE.sql
find $DIR -name "*.sql" -mtime +7 -delete
echo "backup done: $DATE"
```

```bash
chmod +x /home/dima/backup-db.sh
crontab -e
# add:
0 3 * * * /home/dima/backup-db.sh >> /home/dima/backups/backup.log 2>&1
```

To restore a backup:
```bash
docker compose exec -T postgres psql -U jobsearch jobsearch < /home/dima/backups/jobsearch_20260514.sql
```

## Pool pattern

Each app uses a lazy singleton pool — initialized on first query, closed cleanly on shutdown.

**daily-log:** `src/db.ts` exports `getPool(url?)` and `closePool()`  
**jobsearch:** `src/mastra/pool.ts` exports `getPool(url?)`, `closePool()`, and a pre-initialized `pool` for tool use

`getPool(url?)` accepts an optional URL for test injection — pass a test DB URL in tests so you're hitting a real Postgres, not a mock.

## Adding a new app's database

1. Add to `postgres/init.sh`:
   ```sql
   CREATE USER <app> WITH PASSWORD '$<APP>_DB_PASSWORD';
   CREATE DATABASE <app> OWNER <app>;
   ```
2. Add `<APP>_DB_PASSWORD` to `.env` on VPS and `.env.example` in repo
3. Add `DATABASE_URL: postgresql://<app>:${<APP>_DB_PASSWORD}@postgres:5432/<app>` to the service in `docker-compose.yml`
4. Write the app's `schema.sql` and apply it manually after first deploy
