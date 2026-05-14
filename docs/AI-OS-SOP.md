# AI OS — Standard Operating Procedure

A personal/client operating system of self-hosted AI apps. One VPS, one repo, N apps.

This document is the source of truth for architecture decisions, infrastructure choices, and operational procedures. Every choice here was made deliberately — see the **Reasoning** section at the bottom for the full rationale.

---

## Infrastructure

| Layer | Choice | Why |
|---|---|---|
| VPS | Hetzner CX22 (~€4/mo) | Cheap, fast, bare metal |
| Containers | Docker Compose | One file, reproducible everywhere |
| Reverse proxy | Caddy | Auto-HTTPS, zero config |
| Registry | GHCR (free) | Tied to GitHub, no extra auth |
| CI/CD | GitHub Actions | Path-filtered per app, push to deploy |
| Secrets | `.env` on VPS | Simple, no extra tooling; back up to encrypted notes/private gist |
| VPS auth | GitHub CLI (`gh`) | One token covers git pull + GHCR pull |
| LLM gateway | LiteLLM | OpenAI-compatible proxy — swap models without touching app code |
| LLM tracing | Langfuse | Per-agent trace logging, token cost tracking |

All apps share one VPS, one Caddy instance, one Postgres container.

---

## Repo Structure

```
ai-os/
├── apps/
│   └── <app-name>/          # one dir per app
│       ├── Dockerfile
│       ├── server.ts         # Express or Mastra entry
│       ├── frontend/         # Vite + React
│       └── CLAUDE.md
├── packages/
│   └── ui/
│       ├── src/tokens.css    # HSL design tokens (light mode)
│       └── tailwind.config.base.mjs
├── caddy/Caddyfile
├── postgres/init.sh
├── docker-compose.yml
├── .env.example
└── .github/workflows/deploy.yml
```

---

## App Anatomy

**Backend:** Express + TypeScript → `dist/server.js`  
**Frontend:** Vite + React + Tailwind → `public/` (served by the backend)  
**AI backend:** Mastra (Hono-based) → `.mastra/output/index.mjs` when agent-first  
**Database:** Postgres (shared container, per-app user + database)

New apps use **Next.js** instead of Vite + Express (simpler, same Docker pattern).

---

## Deploy Pattern

1. Push to `master`
2. GitHub Actions detects which `apps/<name>/**` changed
3. Builds Docker image → pushes to `ghcr.io/<owner>/ai-os/<app>:latest`
4. SSHs into VPS → `docker compose pull <app> && docker compose up -d <app>`

Caddy and Postgres only redeploy when `caddy/**` or `docker-compose.yml` change.

---

## Security

- Caddy `basicauth` on every subdomain (single shared password)
- VPS firewall: only ports 80 and 443 open (`ufw`)
- Postgres never exposed to host — internal Docker network only
- Local DB access via SSH tunnel: `ssh -L 5432:localhost:5432 user@host`
- No secrets in repo — `.env` on VPS only, `.env.example` committed

---

## LLM Gateway (LiteLLM)

LiteLLM runs as a Docker service, exposes an OpenAI-compatible `/v1` endpoint internally, and proxies to any model backend (DeepSeek, OpenAI, Anthropic, local Ollama).

Apps never call model provider APIs directly — they call LiteLLM at `http://litellm:4000`. Swapping models is a config change, not a code change.

Add to `docker-compose.yml`:
```yaml
litellm:
  image: ghcr.io/berriai/litellm:main-latest
  env_file: .env
  environment:
    - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
  volumes:
    - ./litellm/config.yaml:/app/config.yaml
  command: ["--config", "/app/config.yaml"]
  networks: [internal]
```

`litellm/config.yaml` defines models and routes — see [LiteLLM docs](https://docs.litellm.ai/docs/proxy/configs).

---

## Observability

- **Langfuse** — LLM trace logging (per-agent, drill into prompt steps); use cloud-hosted free tier or self-host
- **Sentry** — runtime error alerting (add to each app's server entry point)

---

## Starting a New App

1. `mkdir apps/<name>` — scaffold Express/TS or Next.js
2. Add `Dockerfile` (copy from an existing app, swap port and entry point)
3. Add service block to `docker-compose.yml` (next available port from `CLAUDE.md`)
4. Add subdomain block to `caddy/Caddyfile`
5. Add `apps/<name>/**` path filter to `.github/workflows/deploy.yml`
6. Add database user to `postgres/init.sh` if needed
7. Add any new env vars to `.env` on VPS and `.env.example` in repo
8. Update `CLAUDE.md` — increment the port log
9. Push → GitHub Actions builds and deploys

---

## Secrets

Secrets live in a `.env` file at `/home/dima/ai-os/.env` on the VPS. Never committed to git — `.env.example` documents the schema.

Back up the real values to an encrypted note (1Password, Bitwarden, or a private GitHub gist). That backup is the source of truth when spinning up a new VPS.

When a new app adds env vars: add to `.env` on the VPS, add the key (blank value) to `.env.example` in the repo.

> **When to graduate to Infisical:** once you're managing 3+ client VPSes and rotating one key means SSH-ing into multiple servers. Not before.

---

## VPS Authentication (GitHub CLI)

GitHub CLI covers both git operations and GHCR image pulls with one token.

### One-time setup

```bash
# Install gh CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install -y gh

# Authenticate (generates a PAT scoped to repo + packages)
gh auth login

# Log in to GHCR using the same token
gh auth token | docker login ghcr.io -u <github-username> --password-stdin
```

### Cloning the repo

```bash
gh repo clone dpetryshchuk/ai-os /home/dima/ai-os
```

### Pulling images

Docker is already authenticated to GHCR after setup. `docker compose pull` works without extra flags.

### Git operations on the VPS

After `gh auth login`, run this once to wire up the git credential helper:
```bash
gh auth setup-git
```

Without this, `git pull` prompts for a username. After running it, all git HTTPS operations use gh's token automatically. Use `git pull` as normal after that.

---

## Context: When to Add Supabase

Self-hosted Postgres is the default. Switch to **Supabase** for client projects that need:
- Auth (social login, magic links, SSO)
- Realtime subscriptions
- Public API access without a custom backend
- Row-level security without writing it from scratch

Keep Supabase out of personal apps — it adds a paid dependency and a third-party trust boundary. For client work, the auth alone is usually worth it — rolling your own auth is where most projects introduce security bugs.

---

## Gotchas & FAQ

**`pg_dump` fails with "Peer authentication failed"**  
The old (non-Docker) Postgres uses peer auth. Run dumps as the postgres system user:
```bash
sudo -u postgres pg_dump jobsearch > /home/dima/jobsearch.sql
sudo -u postgres pg_dump daily_log > /home/dima/daily_log.sql
```

**`gh auth login` hangs or errors with escape sequences over SSH**  
Interactive prompts don't work in all SSH sessions. Use token directly:
```bash
echo <your-pat> | gh auth login --hostname github.com --with-token
```

**PAT scope error: "missing required scope 'read:org'"**  
When creating the PAT, check `read:org` (under the org section) in addition to `repo`, `read:packages`, `write:packages`.

**`git pull` still prompts for username after `gh auth login`**  
Run `gh auth setup-git` once — this wires gh's token into git's credential helper so HTTPS operations work without prompts.

**Caddy `basicauth` directive is deprecated**  
Use `basic_auth` instead. `basicauth` still works but logs warnings. Use a named snippet to avoid repeating it across sites:
```caddy
(auth) {
  basic_auth {
    import /etc/caddy/auth_credentials
  }
}

site.example.com {
  import auth
  reverse_proxy app:4111
}
```

**Caddy can't reach Let's Encrypt (DNS resolution fails in container)**  
Symptom: `dial tcp: lookup acme-v02.api.letsencrypt.org on 127.0.0.53:53: read: connection refused`. Fix: restart systemd-resolved on the host, then restart the stack:
```bash
sudo systemctl restart systemd-resolved
docker compose down && docker compose up -d
```

**`expose` vs `ports` in Docker Compose**  
`expose` only makes a port reachable within the Docker network — other containers can reach it by service name, but the host cannot. `ports` publishes to the host. Only Caddy needs `ports` (80/443). Never use localhost:PORT to test app containers directly — test through the domain via Caddy instead.

**Docker layer cache serves stale compiled output**  
If a build uses `--no-cache` but the pushed digest is identical to what's already in the registry, the image on the VPS won't update. Confirm a new digest was pushed by checking the push output — new layers say `Pushed`, not `Layer already exists`.

**Do I need `DATABASE_URL` in `.env`?**  
No. `docker-compose.yml` constructs it from `DAILY_LOG_DB_PASSWORD` and `JOBSEARCH_DB_PASSWORD` and injects it automatically.

**Can all three DB passwords be the same?**  
Yes. At this scale there's no meaningful security benefit to separate values. Set `POSTGRES_PASSWORD`, `DAILY_LOG_DB_PASSWORD`, and `JOBSEARCH_DB_PASSWORD` to the same thing.

**Caddy basicauth hash has `$` signs that Docker Compose mangles**  
Don't put the hash in `.env`. Store it in `caddy/auth_credentials` (gitignored) and use Caddy's `import` directive — Docker Compose never touches that file so no escaping needed.

Generate the hash:
```bash
docker run --rm caddy caddy hash-password --plaintext 'yourpassword'
```
Paste raw output into `caddy/auth_credentials`:
```
dima $2a$14$...hash...
```
The Caddyfile imports it:
```
basicauth {
  import /etc/caddy/auth_credentials
}
```

---

## Reasoning

Every infrastructure choice here favors the lowest operational overhead that still meets the requirement.

**Hetzner over AWS/GCP/DO:** €4/mo bare metal outperforms equivalently-priced cloud VMs. No managed services means no vendor lock-in and predictable costs. Germany region is fine for personal tools; move to US region for latency-sensitive client work.

**Docker Compose over Kubernetes:** One file, `docker compose up -d`, done. Kubernetes is correct at 10+ services or when you need rolling deploys and auto-scaling. At N < 10 apps on one server, Compose has 10× less ops overhead.

**Caddy over Nginx:** Caddy auto-provisions Let's Encrypt certs, hot-reloads config, and has a readable Caddyfile syntax. Nginx requires certbot cron jobs and manual reload. Caddy's only drawback is less Stack Overflow coverage — not a real problem.

**GHCR over DockerHub:** Free for private repos when tied to a GitHub org. No separate auth — the same `GITHUB_TOKEN` used in Actions is the registry credential. DockerHub's free tier rate-limits pulls.

**GitHub Actions over other CI:** Already where the code lives. Path-filtered jobs (via `dorny/paths-filter`) mean only the changed app rebuilds. No separate CI subscription.

**`.env` over secrets managers:** At one VPS you own, a `.env` file is the right tool. Secrets managers (Infisical, Doppler) earn their overhead at 3+ servers or when multiple people need access. Until then they add auth surfaces, CLI dependencies, and dashboard accounts for zero practical gain. Back up the real values to an encrypted note — that's the source of truth.

**GitHub CLI over raw SSH keys for git auth:** A PAT from `gh auth login` covers git clone, git pull, and GHCR image pulls in one token. SSH deploy keys only cover git; GHCR needs a separate credential. One token, one rotation point.

**Shared Postgres over per-app databases:** One container, one backup job, one connection string pattern. Apps get isolated users and databases — same security boundary as separate instances at zero extra cost. Supabase replaces this only when auth or realtime is needed (see above).
