# VPS Guide — dmytropetryshchuk.com

Everything needed to operate and extend the server.

---

## Server

| | |
|---|---|
| **Provider** | Hetzner CX22 (~$5/mo) |
| **IP** | `46.225.78.10` |
| **OS** | Ubuntu 22.04 |
| **SSH user** | `dima` |
| **SSH** | `ssh dima@46.225.78.10` |
| **Domain registrar** | Porkbun |
| **Root domain** | `dmytropetryshchuk.com` |
| **Specs** | 2 vCPU, 4GB RAM |

---

## Installed software

- **Docker + Docker Compose** — all services run as containers
- **Caddy** — runs as a Docker container, reverse proxy + automatic HTTPS

Everything else (Python, Node.js, Redis, Postgres) runs inside containers. Nothing is installed directly on the host.

---

## Running services

| Service | Port (internal) | Domain |
|---|---|---|
| jobsearch | 4111 | `jobsearch.dmytropetryshchuk.com` |
| writing-app | 4112 | `write.dmytropetryshchuk.com` |
| daily-log | 4113 | `log.dmytropetryshchuk.com` |
| home | 4114 | `home.dmytropetryshchuk.com` |
| freewrite | 4115 | `freewrite.dmytropetryshchuk.com` |
| postgres | 5432 (internal only) | — |
| redis | 6379 (internal only) | — |
| celery-worker | — | — |
| celery-beat | — | — |

**Next available port:** 4116

All containers are on the `internal` bridge network. Only Caddy exposes ports 80/443 to the host.

---

## Common commands

```bash
# SSH in
ssh dima@46.225.78.10

# View running containers
docker compose ps

# Tail logs for a service
docker compose logs -f <service>

# Restart a service
docker compose restart <service>

# Pull latest image and restart
docker compose pull <service> && docker compose up -d <service>

# Bring everything up (after infra changes)
docker compose up -d --remove-orphans

# Reload Caddy after Caddyfile change
sudo systemctl reload-or-restart caddy
```

---

## Caddyfile

Location in repo: `caddy/Caddyfile`. On the VPS it's bind-mounted into the Caddy container.

Auth credentials are stored in `caddy/auth_credentials` on the VPS (not committed to git). Format: one `username <bcrypt-hash>` per line.

Generate a bcrypt hash:
```bash
caddy hash-password --plaintext yourpassword
```

The `(auth)` snippet is imported by every vhost:

```caddy
(auth) {
  basic_auth {
    import /home/dima/ai-os/caddy/auth_credentials
  }
}

home.dmytropetryshchuk.com {
  import auth
  reverse_proxy localhost:4114
}
# ... etc
```

---

## Postgres

Managed by Docker Compose. Init script: `postgres/init.sh` — creates users and databases on first boot.

Current databases: `daily_log`, `jobsearch`, `home`

Passwords set via environment variables in `.env` on the VPS:
- `POSTGRES_PASSWORD` — superuser password
- `DAILY_LOG_DB_PASSWORD`
- `JOBSEARCH_DB_PASSWORD`

To query locally, open an SSH tunnel:
```bash
ssh -L 5432:localhost:5432 dima@46.225.78.10
```

---

## Adding a new app — checklist

### 1. Create `apps/<name>/` in the monorepo

Follow the existing pattern:
- `main.py` — FastAPI backend
- `db.py` — asyncpg pool (if using Postgres)
- `requirements.txt` — Python dependencies
- `Dockerfile` — multistage: `node:22-alpine` (frontend build) + `python:3.12-slim` (runner)
- `frontend/` — React + Vite + Tailwind

Use `outDir: '../public'` in `vite.config.ts` so the frontend build lands at `apps/<name>/public/`, which the Dockerfile copies.

### 2. Add to `docker-compose.yml`

```yaml
  <name>:
    image: ghcr.io/dpetryshchuk/ai-os/<name>:latest
    ports:
      - "127.0.0.1:<port>:<port>"
    environment:
      PORT: "<port>"
      DATABASE_URL: postgresql://<name>:${<NAME>_DB_PASSWORD}@postgres:5432/<name>
    depends_on:
      - postgres
    networks:
      - internal
    restart: unless-stopped
```

### 3. Add to `caddy/Caddyfile`

```caddy
<subdomain>.dmytropetryshchuk.com {
  import auth
  reverse_proxy localhost:<port>
}
```

### 4. Add Postgres DB (if needed)

In `postgres/init.sh`:
```bash
CREATE USER <name> WITH PASSWORD '${<NAME>_DB_PASSWORD}';
CREATE DATABASE <name> OWNER <name>;
```

Add `<NAME>_DB_PASSWORD` to `.env` on the VPS and to the `postgres` service's `environment` block in `docker-compose.yml`.

### 5. Add to GitHub Actions deploy matrix

In `.github/workflows/deploy.yml`, add the app to:
- `detect` job's `paths-filter` (both push and workflow_dispatch branches)
- `set-matrix` job's `includes` array

### 6. Add DNS record on Porkbun

1. porkbun.com → DNS → `dmytropetryshchuk.com`
2. Add **A record**: Host = `<subdomain>`, Answer = `46.225.78.10`, TTL = 600
3. Wait ~2 minutes — Caddy fetches the TLS cert automatically once DNS resolves

### 7. Set up VPS env vars

SSH in and add to `/home/dima/ai-os/.env`:
```bash
<NAME>_DB_PASSWORD=<password>
```

Then:
```bash
docker compose up -d postgres   # re-run init if DB doesn't exist yet
docker compose up -d <name>
```

---

## Deploy flow (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `master` and on `workflow_dispatch` (manual trigger deploys all apps).

1. **detect** — `dorny/paths-filter@v3` determines which apps changed; `workflow_dispatch` always outputs `true` for all
2. **set-matrix** — builds the deploy matrix from detect outputs
3. **deploy-app** — for each changed app: `docker build + push` → SSH → `docker compose pull <app> && docker compose up -d <app>`
4. **deploy-infra** — when `docker-compose.yml` or `caddy/` changes: `docker compose up -d --remove-orphans` + `sudo systemctl reload-or-restart caddy`

All matrix jobs run with `fail-fast: false` — one app failing doesn't cancel the others.

---

## Port allocation log

| Port | App |
|---|---|
| 4111 | jobsearch |
| 4112 | writing-app |
| 4113 | daily-log |
| 4114 | home |
| 4115 | freewrite |

---

## Gotchas

**`git pull` fails after npm installs modify the lock file.**
Deploy scripts use `git fetch origin master && git reset --hard origin/master` instead of `git pull`.

**`systemctl reload caddy` fails if Caddy is stopped.**
Use `sudo systemctl reload-or-restart caddy` — handles both running and stopped states.

**Bcrypt hashes with `$` get mangled in shell scripts.**
`$2a$14$...` contains `$2`, `$14` which bash expands as variables. Always write the credentials file with `nano`. Never embed in heredocs or shell commands.

**`npm ci` fails for apps with Windows-generated lock files.**
Some npm packages (e.g. `@emnapi`) have platform-specific optional deps. Lock files generated on Windows/macOS are missing Linux variants. Use `npm install` in Dockerfiles instead of `npm ci`.

**Vite `outDir` must be `'../public'`.**
The Dockerfile copies from `apps/<name>/public/` (relative to repo root). If `outDir` is `'dist'` or anything else, the Docker build fails with "path not found".

**GitHub Actions `workflow_dispatch` + `dorny/paths-filter`.**
`paths-filter` requires a push event diff context — it errors on `workflow_dispatch`. The detect job conditionally skips it and outputs `true` for all apps on manual runs.

**Two SSH keys per deployment direction.**
GitHub Actions → VPS uses one keypair. VPS → GitHub (for `git fetch`) uses a separate keypair. Don't reuse the same key for both directions.
