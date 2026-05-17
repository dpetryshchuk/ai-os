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

## Installed software (host)

- **Docker + Docker Compose** — all app services run as containers
- **Caddy** — systemd service (`caddy.service`), reverse proxy + automatic HTTPS. Binary: `/usr/bin/caddy`. Config: `/home/dima/ai-os/caddy/Caddyfile`. Reload: `sudo systemctl reload-or-restart caddy`. The `dima` user has passwordless sudo for this command (`/etc/sudoers.d/dima-caddy`).
- **PostgreSQL 16** — systemd service (`postgresql@16-main.service`) running on `127.0.0.1:5432`. This is a host-level Postgres separate from the Docker Compose Postgres container (which is internal-only). Not used by any app currently — the Docker Compose Postgres handles all app databases.
- **fail2ban** — SSH brute-force protection

Everything else (Python, Node.js, Redis) runs inside containers.

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

## Directory layout (`/home/dima`)

```
/home/dima/
├── ai-os/          ← monorepo (git, docker-compose.yml, caddy/, etc.)
├── writing/        ← clone of dpetryshchuk/dmytropetryshchuk.com (personal site)
│                     mounted as /repo inside writing-app container
│                     remote: https://github.com/dpetryshchuk/dmytropetryshchuk.com.git
├── freewrite/      ← freewrite entries (mounted into writing-app container)
├── daily_log.sql   ← SQL backup (manual snapshot)
└── jobsearch.sql   ← SQL backup (manual snapshot)
```

The personal site repo (`writing/`) is a standalone clone, not the git submodule at `external/dmytropetryshchuk`. The submodule can't be used as a Docker volume because its `.git` file uses a host-relative path that breaks inside containers.

---

## Common commands

```bash
# SSH in
ssh dima@46.225.78.10

# View running containers
cd ~/ai-os && docker compose ps

# Tail logs for a service
docker compose logs -f <service>

# Restart a service (picks up config changes — use up -d, not restart)
docker compose up -d <service>

# Bring everything up (after infra changes)
docker compose up -d --remove-orphans

# Reload Caddy after Caddyfile change
sudo systemctl reload-or-restart caddy
```

> **Note:** `docker compose restart` does NOT re-read `.env`. Always use `docker compose up -d <service>` when env vars change.

---

## Caddyfile

Location in repo: `caddy/Caddyfile`. Read directly by the Caddy systemd service from that path on the host.

Auth credentials stored in `caddy/auth_credentials` on the VPS (not committed to git). Format: one `username <bcrypt-hash>` per line.

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

## Postgres (Docker)

Managed by Docker Compose. Init script: `postgres/init.sh` — creates users and databases on first boot.

Current databases: `daily_log`, `jobsearch`

Passwords set via environment variables in `.env` on the VPS:
- `POSTGRES_PASSWORD` — superuser password
- `DAILY_LOG_DB_PASSWORD`
- `JOBSEARCH_DB_PASSWORD`

To query locally, open an SSH tunnel:
```bash
ssh -L 5433:localhost:5432 dima@46.225.78.10
# then connect to localhost:5433 (use 5433 to avoid conflict with host Postgres on 5432)
```

---

## Writing-app: publishing to personal site

The writing-app pushes essays to `dpetryshchuk/dmytropetryshchuk.com` via the **GitHub API** (HTTPS token, no SSH keys needed inside the container).

Required env vars in `/home/dima/ai-os/.env`:
```
WRITING_DIR=/home/dima/writing
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=dpetryshchuk/dmytropetryshchuk.com
```

When push or pull is triggered from the writing-app UI, it uses `x-access-token:<GITHUB_TOKEN>` in the HTTPS remote URL. No SSH key setup needed inside Docker.

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
cd ~/ai-os
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

**`docker compose restart` doesn't re-read `.env`.**
Use `docker compose up -d <service>` instead whenever env vars change.

**`systemctl reload caddy` fails if Caddy is stopped.**
Use `sudo systemctl reload-or-restart caddy` — handles both running and stopped states. The `dima` user has NOPASSWD sudo for this command via `/etc/sudoers.d/dima-caddy`.

**Caddy is a systemd service, not a Docker container.**
`systemctl status caddy`, not `docker compose logs caddy`. Config is read from `/home/dima/ai-os/caddy/Caddyfile` on the host directly.

**The personal site clone at `/home/dima/writing` must use HTTPS remote.**
The writing-app container pushes via GitHub token over HTTPS. SSH remotes won't work inside the container. Remote should be `https://github.com/dpetryshchuk/dmytropetryshchuk.com.git`.

**Don't use the `external/dmytropetryshchuk` submodule as the writing volume.**
The submodule's `.git` file uses a host-relative path (`../../.git/modules/...`) that doesn't resolve inside a Docker container. Use the standalone clone at `/home/dima/writing` instead.

**SSH tunnel for Postgres uses port 5433, not 5432.**
The host has its own PostgreSQL 16 running on port 5432. Tunnel to 5433 locally to avoid the conflict: `ssh -L 5433:localhost:5432 dima@46.225.78.10`.

**Bcrypt hashes with `$` get mangled in shell scripts.**
`$2a$14$...` contains `$2`, `$14` which bash expands as variables. Always write the credentials file with `nano`. Never embed in heredocs or shell commands.

**`npm ci` fails for apps with Windows-generated lock files.**
Some npm packages (e.g. `@emnapi`) have platform-specific optional deps. Lock files generated on Windows/macOS are missing Linux variants. Use `npm install` in Dockerfiles instead of `npm ci`.

**Vite `outDir` must be `'../public'`.**
The Dockerfile copies from `apps/<name>/public/` (relative to repo root). If `outDir` is `'dist'` or anything else, the Docker build fails with "path not found".

**GitHub Actions `workflow_dispatch` + `dorny/paths-filter`.**
`paths-filter` requires a push event diff context — it errors on `workflow_dispatch`. The detect job conditionally skips it and outputs `true` for all apps on manual runs.
