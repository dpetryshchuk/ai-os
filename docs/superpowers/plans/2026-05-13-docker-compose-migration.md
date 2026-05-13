# Docker Compose Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all three VPS apps from systemd + host Node.js + host Caddy to a fully containerised Docker Compose stack with images published to GHCR and deployed via a single GitHub Actions workflow.

**Architecture:** Five containers on one bridge network — `caddy`, `writing-app`, `daily-log`, `jobsearch`, `postgres`. Caddy is the only container with external ports (80/443). Each app container is self-contained: Express or Mastra serves both API and static files. Images are built in GitHub Actions and pushed to `ghcr.io/dpetryshchuk/ai-os/<service>:latest`; the VPS pulls and restarts the changed service only.

**Tech Stack:** Docker, Docker Compose v2, Caddy 2, Postgres 16, Node 20 Alpine, GHCR, `docker/build-push-action`, `dorny/paths-filter`, `appleboy/ssh-action`

---

## File Map

**Create:**
- `apps/writing-app/Dockerfile` — multi-stage build; installs git in runner for git sync
- `apps/daily-log-vps/Dockerfile` — multi-stage build; Express + Vite frontend
- `apps/jobsearch-vps/Dockerfile` — multi-stage build; Mastra build + Vite frontend
- `postgres/init.sh` — creates per-app Postgres users and databases on first start
- `docker-compose.yml` — five services, one bridge network, named volumes
- `caddy/Caddyfile` — routes subdomains to containers, Caddy env var for auth hash
- `.env.example` — committed template; `.env` is never committed
- `.dockerignore` — excludes node_modules, .env, dist, .mastra from build context
- `.github/workflows/deploy.yml` — single workflow replacing the three per-app workflows

**Modify:**
- `apps/jobsearch-vps/src/mastra/index.ts` — change hardcoded `UPLOADS_DIR`, add static file catch-all route

**Delete:**
- `.github/workflows/deploy-jobsearch.yml`
- `.github/workflows/deploy-writing-app.yml`
- `.github/workflows/deploy-daily-log.yml`

---

## Task 1: Patch jobsearch Mastra to serve static files and fix UPLOADS_DIR

Mastra currently doesn't serve the React frontend — the host Caddy did. In Docker, the container must serve everything on port 4111. We add a catch-all GET route at the end of `apiRoutes` that serves files from `public/` relative to `process.cwd()` (which is `/app` in the Docker runner). The route falls back to `index.html` for any path without a matching file — standard SPA behaviour.

Also change the hardcoded `/home/dima/jobsearch/uploads` path to an env var so it works at `/app/uploads` inside Docker.

**Files:**
- Modify: `apps/jobsearch-vps/src/mastra/index.ts`

- [ ] **Step 1: Edit `apps/jobsearch-vps/src/mastra/index.ts`**

Replace the top of the file so `readFileSync` is imported and `UPLOADS_DIR` uses an env var:

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
```

```typescript
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads'
```

Then add this entry as the **last item** in the `apiRoutes` array (after the DELETE notes route):

```typescript
      {
        path: '/*',
        method: 'GET' as const,
        handler: async (c: any) => {
          const reqPath = c.req.path === '/' ? '/index.html' : c.req.path
          const publicDir = join(process.cwd(), 'public')
          const filePath = join(publicDir, reqPath)
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.json': 'application/json',
            '.ico': 'image/x-icon',
            '.woff2': 'font/woff2',
            '.woff': 'font/woff',
            '.ttf': 'font/ttf',
          }
          try {
            const content = readFileSync(filePath)
            const contentType = mimeTypes[extname(filePath)] ?? 'application/octet-stream'
            return new Response(content, { headers: { 'Content-Type': contentType } })
          } catch {
            const html = readFileSync(join(publicDir, 'index.html'), 'utf-8')
            return c.html(html)
          }
        },
      },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/jobsearch-vps
npx tsc --noEmit 2>&1 | head -20
cd ../..
```

Expected: no output (no errors). If there are errors, they'll be type issues in the handler — fix by adjusting the `any` casts.

- [ ] **Step 3: Commit**

```bash
git add apps/jobsearch-vps/src/mastra/index.ts
git commit -m "feat: add static file serving to Mastra and make UPLOADS_DIR configurable"
```

---

## Task 2: Dockerfile — writing-app

Two-stage build. The runner stage installs `git` and `openssh-client` so the app can run `git pull` / `git push` against the essays repo. The essays directory is mounted as a volume at `/repo` at runtime.

**Files:**
- Create: `apps/writing-app/Dockerfile`

Build context is always the **repo root** (not the app dir). Run `docker build -f apps/writing-app/Dockerfile .` from the repo root.

- [ ] **Step 1: Create `apps/writing-app/Dockerfile`**

```dockerfile
# Build context: repo root
FROM node:20-alpine AS builder
WORKDIR /app

# packages/ui is needed by the frontend's tailwind config and CSS imports
COPY packages/ui ./packages/ui

# Install backend deps (cache layer — re-runs only if package files change)
COPY apps/writing-app/package.json apps/writing-app/package-lock.json ./apps/writing-app/
RUN cd apps/writing-app && npm ci

# Install frontend deps
COPY apps/writing-app/frontend/package.json apps/writing-app/frontend/package-lock.json ./apps/writing-app/frontend/
RUN cd apps/writing-app/frontend && npm ci

# Copy all source and build
COPY apps/writing-app ./apps/writing-app

# Compile TypeScript backend → apps/writing-app/dist/
RUN cd apps/writing-app && npx tsc -p tsconfig.json

# Build Vite frontend → apps/writing-app/public/ (outDir is ../public in vite.config)
RUN cd apps/writing-app/frontend && npm run build

# ── Runner ──
FROM node:20-alpine AS runner
# git and openssh-client are needed at runtime for git pull / git push
RUN apk add --no-cache git openssh-client
WORKDIR /app
COPY apps/writing-app/package.json apps/writing-app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/writing-app/dist ./dist
COPY --from=builder /app/apps/writing-app/public ./public
ENV PORT=4112 NODE_ENV=production
EXPOSE 4112
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Build the image and verify it succeeds**

Run from the **repo root**:

```bash
docker build -f apps/writing-app/Dockerfile -t writing-app:local .
```

Expected: `Successfully built <id>` and `Successfully tagged writing-app:local`. The build takes 2-5 minutes on the first run (downloads base image, installs deps). Subsequent builds use the cache and are faster.

If the Vite build fails with a missing `packages/ui` import, double-check that `packages/ui/tailwind.config.base.mjs` and `packages/ui/src/tokens.css` exist in the repo root.

- [ ] **Step 3: Commit**

```bash
git add apps/writing-app/Dockerfile
git commit -m "feat: add writing-app Dockerfile"
```

---

## Task 3: Dockerfile — daily-log

Two-stage build. The `build:frontend` npm script runs Vite and copies the output to `../public` using a Node.js inline script — this runs correctly inside the builder stage.

**Files:**
- Create: `apps/daily-log-vps/Dockerfile`

- [ ] **Step 1: Create `apps/daily-log-vps/Dockerfile`**

```dockerfile
# Build context: repo root
FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/ui ./packages/ui

COPY apps/daily-log-vps/package.json apps/daily-log-vps/package-lock.json ./apps/daily-log-vps/
RUN cd apps/daily-log-vps && npm ci

COPY apps/daily-log-vps/frontend/package.json apps/daily-log-vps/frontend/package-lock.json ./apps/daily-log-vps/frontend/
RUN cd apps/daily-log-vps/frontend && npm ci

COPY apps/daily-log-vps ./apps/daily-log-vps

# Compile TypeScript backend → apps/daily-log-vps/dist/
RUN cd apps/daily-log-vps && npx tsc -p tsconfig.json

# Build Vite frontend and copy to ../public (build:frontend script does both)
RUN cd apps/daily-log-vps && npm run build:frontend

# ── Runner ──
FROM node:20-alpine AS runner
WORKDIR /app
COPY apps/daily-log-vps/package.json apps/daily-log-vps/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/daily-log-vps/dist ./dist
COPY --from=builder /app/apps/daily-log-vps/public ./public
ENV PORT=4113 NODE_ENV=production
EXPOSE 4113
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Build the image**

```bash
docker build -f apps/daily-log-vps/Dockerfile -t daily-log:local .
```

Expected: `Successfully tagged daily-log:local`

- [ ] **Step 3: Commit**

```bash
git add apps/daily-log-vps/Dockerfile
git commit -m "feat: add daily-log Dockerfile"
```

---

## Task 4: Dockerfile — jobsearch

Two-stage build. Builder installs all deps, builds the React frontend (outputs to `apps/jobsearch-vps/public/`), then runs `npx mastra build` which bundles the Mastra server to `.mastra/output/index.mjs`. Runner copies only the bundle and the built frontend.

The `WORKDIR` in the runner is `/app`. The static file handler in `index.ts` uses `join(process.cwd(), 'public')` which resolves to `/app/public` — matching where we copy the frontend.

**Files:**
- Create: `apps/jobsearch-vps/Dockerfile`

- [ ] **Step 1: Create `apps/jobsearch-vps/Dockerfile`**

```dockerfile
# Build context: repo root
FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/ui ./packages/ui

# Backend deps
COPY apps/jobsearch-vps/package.json apps/jobsearch-vps/package-lock.json ./apps/jobsearch-vps/
RUN cd apps/jobsearch-vps && npm ci

# Frontend deps
COPY apps/jobsearch-vps/frontend/package.json apps/jobsearch-vps/frontend/package-lock.json ./apps/jobsearch-vps/frontend/
RUN cd apps/jobsearch-vps/frontend && npm ci

COPY apps/jobsearch-vps ./apps/jobsearch-vps

# Build React frontend → apps/jobsearch-vps/public/ (vite outDir is ../public)
RUN cd apps/jobsearch-vps/frontend && npm run build

# Bundle Mastra server → apps/jobsearch-vps/.mastra/output/index.mjs
RUN cd apps/jobsearch-vps && npx mastra build

# ── Runner ──
FROM node:20-alpine AS runner
WORKDIR /app
COPY apps/jobsearch-vps/package.json apps/jobsearch-vps/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/apps/jobsearch-vps/.mastra/output ./.mastra/output
COPY --from=builder /app/apps/jobsearch-vps/public ./public
ENV PORT=4111 NODE_ENV=production UPLOADS_DIR=/app/uploads
EXPOSE 4111
CMD ["node", ".mastra/output/index.mjs"]
```

- [ ] **Step 2: Build the image**

```bash
docker build -f apps/jobsearch-vps/Dockerfile -t jobsearch:local .
```

Expected: `Successfully tagged jobsearch:local`. The `npx mastra build` step takes 30-90 seconds.

If `mastra build` exits with a TypeScript error, check `apps/jobsearch-vps/src/mastra/index.ts` — the static file handler changes from Task 1 must be present and compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add apps/jobsearch-vps/Dockerfile
git commit -m "feat: add jobsearch Dockerfile"
```

---

## Task 5: .dockerignore

One `.dockerignore` at the repo root applies to all `docker build` commands run from there. Excluding `node_modules` and build artifacts keeps the build context small — Docker sends the entire context to the daemon before building.

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
.git
.env
**/node_modules
**/dist
**/public
**/.mastra
**/frontend/dist
**/.env
**/*.local
```

- [ ] **Step 2: Verify build context size dropped**

```bash
docker build -f apps/writing-app/Dockerfile -t writing-app:local . 2>&1 | head -5
```

The first line shows `=> [internal] load build context`. With the `.dockerignore` in place, the context transfer should complete in under a second. Without it, it would transfer all `node_modules` directories and could take minutes.

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for Docker build context"
```

---

## Task 6: Postgres init script

The official Postgres Docker image runs any `.sh` or `.sql` scripts it finds in `/docker-entrypoint-initdb.d/` on **first start only** (when the data volume is empty). This script creates the per-app users and databases. Passwords come from env vars passed by docker-compose.

**Files:**
- Create: `postgres/init.sh`

- [ ] **Step 1: Create `postgres/init.sh`**

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER daily_log WITH PASSWORD '$DAILY_LOG_DB_PASSWORD';
  CREATE DATABASE daily_log OWNER daily_log;
  CREATE USER jobsearch WITH PASSWORD '$JOBSEARCH_DB_PASSWORD';
  CREATE DATABASE jobsearch OWNER jobsearch;
EOSQL
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x postgres/init.sh
```

On Windows Git Bash or WSL this sets the executable bit. If on plain PowerShell, skip this step — Docker on Linux will handle permissions.

- [ ] **Step 3: Commit**

```bash
git add postgres/init.sh
git commit -m "chore: add Postgres init script for per-app users and databases"
```

---

## Task 7: docker-compose.yml, Caddyfile, and .env.example

The three files that define the full stack. All containers share one internal bridge network (`internal`). Only Caddy has external ports.

**Files:**
- Create: `docker-compose.yml`
- Create: `caddy/Caddyfile`
- Create: `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    environment:
      CADDY_BASIC_AUTH_HASH: ${CADDY_BASIC_AUTH_HASH}
    networks:
      - internal
    restart: unless-stopped

  writing-app:
    image: ghcr.io/dpetryshchuk/ai-os/writing-app:latest
    expose:
      - "4112"
    environment:
      PORT: "4112"
      REPO_DIR: /repo
      CONTENT_DIR: /repo/content/essays
    volumes:
      - ${WRITING_DIR}:/repo
      - ${SSH_DIR}:/root/.ssh:ro
    networks:
      - internal
    restart: unless-stopped

  daily-log:
    image: ghcr.io/dpetryshchuk/ai-os/daily-log:latest
    expose:
      - "4113"
    environment:
      PORT: "4113"
      DATABASE_URL: postgresql://daily_log:${DAILY_LOG_DB_PASSWORD}@postgres:5432/daily_log
    depends_on:
      - postgres
    networks:
      - internal
    restart: unless-stopped

  jobsearch:
    image: ghcr.io/dpetryshchuk/ai-os/jobsearch:latest
    expose:
      - "4111"
    environment:
      PORT: "4111"
      DATABASE_URL: postgresql://jobsearch:${JOBSEARCH_DB_PASSWORD}@postgres:5432/jobsearch
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      UPLOADS_DIR: /app/uploads
      LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY}
      LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY}
    depends_on:
      - postgres
    volumes:
      - jobsearch_uploads:/app/uploads
    networks:
      - internal
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    expose:
      - "5432"
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DAILY_LOG_DB_PASSWORD: ${DAILY_LOG_DB_PASSWORD}
      JOBSEARCH_DB_PASSWORD: ${JOBSEARCH_DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sh:/docker-entrypoint-initdb.d/init.sh
    networks:
      - internal
    restart: unless-stopped

networks:
  internal:
    driver: bridge

volumes:
  caddy_data:
  postgres_data:
  jobsearch_uploads:
```

- [ ] **Step 2: Create `caddy/Caddyfile`**

```caddy
jobsearch.dmytropetryshchuk.com {
  basicauth {
    dima {$CADDY_BASIC_AUTH_HASH}
  }
  reverse_proxy jobsearch:4111
}

write.dmytropetryshchuk.com {
  basicauth {
    dima {$CADDY_BASIC_AUTH_HASH}
  }
  reverse_proxy writing-app:4112
}

log.dmytropetryshchuk.com {
  basicauth {
    dima {$CADDY_BASIC_AUTH_HASH}
  }
  reverse_proxy daily-log:4113
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Postgres superuser password (used by init.sh to create per-app users)
POSTGRES_PASSWORD=

# Per-app Postgres passwords (must match what init.sh creates)
DAILY_LOG_DB_PASSWORD=
JOBSEARCH_DB_PASSWORD=

# Caddy basic auth — generate with: docker run --rm caddy:2-alpine caddy hash-password
CADDY_BASIC_AUTH_HASH=

# jobsearch Mastra agent
DEEPSEEK_API_KEY=

# jobsearch Langfuse observability (optional — app starts without these)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# writing-app — paths on the VPS host that are mounted into the container
WRITING_DIR=/home/dima/writing      # root of the essays git repo
SSH_DIR=/home/dima/.ssh             # SSH keys used by git push
```

- [ ] **Step 4: Validate docker-compose.yml syntax**

```bash
docker compose config --quiet
```

Expected: exits 0 with no output. If it prints errors, fix the YAML syntax.

Note: this will warn about missing `.env` values — that's expected since `.env` doesn't exist locally. The command still validates the YAML structure.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml caddy/Caddyfile .env.example
git commit -m "feat: add docker-compose stack, Caddyfile, and .env.example"
```

---

## Task 8: GitHub Actions — single deploy.yml

Replace the three separate per-app workflows with one `deploy.yml`. A detection job uses `dorny/paths-filter` to determine which services changed; downstream jobs run only if their paths triggered.

Each app job: build image → push to GHCR → SSH to VPS and pull + restart that service. The infra job just SSHs and does a `git pull` + `docker compose up -d` for Caddy.

**Files:**
- Create: `.github/workflows/deploy.yml`
- Delete: `.github/workflows/deploy-jobsearch.yml`
- Delete: `.github/workflows/deploy-writing-app.yml`
- Delete: `.github/workflows/deploy-daily-log.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [master]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      writing-app: ${{ steps.filter.outputs.writing-app }}
      daily-log: ${{ steps.filter.outputs.daily-log }}
      jobsearch: ${{ steps.filter.outputs.jobsearch }}
      infra: ${{ steps.filter.outputs.infra }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            writing-app:
              - 'apps/writing-app/**'
              - 'packages/ui/**'
            daily-log:
              - 'apps/daily-log-vps/**'
              - 'packages/ui/**'
            jobsearch:
              - 'apps/jobsearch-vps/**'
              - 'packages/ui/**'
            infra:
              - 'docker-compose.yml'
              - 'caddy/**'

  deploy-writing-app:
    needs: detect
    if: needs.detect.outputs.writing-app == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/writing-app/Dockerfile
          push: true
          tags: ghcr.io/dpetryshchuk/ai-os/writing-app:latest
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            docker compose pull writing-app
            docker compose up -d writing-app

  deploy-daily-log:
    needs: detect
    if: needs.detect.outputs.daily-log == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/daily-log-vps/Dockerfile
          push: true
          tags: ghcr.io/dpetryshchuk/ai-os/daily-log:latest
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            docker compose pull daily-log
            docker compose up -d daily-log

  deploy-jobsearch:
    needs: detect
    if: needs.detect.outputs.jobsearch == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ secrets.GITHUB_ACTOR }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/jobsearch-vps/Dockerfile
          push: true
          tags: ghcr.io/dpetryshchuk/ai-os/jobsearch:latest
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            docker compose pull jobsearch
            docker compose up -d jobsearch

  deploy-infra:
    needs: detect
    if: needs.detect.outputs.infra == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy infra to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/vps-apps
            git fetch origin master && git reset --hard origin/master
            docker compose up -d caddy
```

- [ ] **Step 2: Delete the three old workflow files**

```bash
rm .github/workflows/deploy-jobsearch.yml
rm .github/workflows/deploy-writing-app.yml
rm .github/workflows/deploy-daily-log.yml
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/
git commit -m "feat: replace per-app deploy workflows with single path-filtered deploy.yml"
git push
```

After pushing, go to GitHub → Actions and verify the `Deploy` workflow appears. It won't run any deploy jobs yet — nothing has changed in the app paths, only the workflow file itself.

---

## Task 9: VPS cutover

This task runs entirely over SSH. It installs Docker, clones the monorepo, sets up `.env`, migrates the existing Postgres data, does a first cold deploy, then stops the old systemd services.

**Prerequisite:** All three Docker images must exist on GHCR before this task. Trigger a dummy push to each app (e.g., add a blank line to a README) to force the GitHub Actions build, or build and push manually:

```bash
docker login ghcr.io -u dpetryshchuk -p <github-pat-with-write:packages>
docker build -f apps/writing-app/Dockerfile  -t ghcr.io/dpetryshchuk/ai-os/writing-app:latest  . && docker push ghcr.io/dpetryshchuk/ai-os/writing-app:latest
docker build -f apps/daily-log-vps/Dockerfile -t ghcr.io/dpetryshchuk/ai-os/daily-log:latest    . && docker push ghcr.io/dpetryshchuk/ai-os/daily-log:latest
docker build -f apps/jobsearch-vps/Dockerfile  -t ghcr.io/dpetryshchuk/ai-os/jobsearch:latest    . && docker push ghcr.io/dpetryshchuk/ai-os/jobsearch:latest
```

- [ ] **Step 1: SSH into the VPS**

```bash
ssh dima@46.225.78.10
```

- [ ] **Step 2: Install Docker**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker dima
newgrp docker
docker --version
```

Expected: `Docker version 27.x.x` (or similar). `docker ps` should work without `sudo`.

- [ ] **Step 3: Clone the monorepo**

```bash
cd /home/dima
git clone https://github.com/dpetryshchuk/ai-os.git vps-apps
cd vps-apps
```

- [ ] **Step 4: Authenticate Docker to GHCR**

```bash
echo "<github-pat-with-read:packages>" | docker login ghcr.io -u dpetryshchuk --password-stdin
```

The PAT needs `read:packages` scope. Create it at GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens (or classic with `read:packages`).

- [ ] **Step 5: Create `.env` on the VPS**

```bash
cp .env.example .env
nano .env
```

Fill in all values. The bcrypt hash for Caddy: run this on the VPS and paste the output into `CADDY_BASIC_AUTH_HASH`:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-password'
```

Set `WRITING_DIR=/home/dima/writing` and `SSH_DIR=/home/dima/.ssh`.

- [ ] **Step 6: Dump existing Postgres databases**

The current Postgres is running on the host. Dump before starting Docker Postgres.

```bash
pg_dump -U daily_log -h localhost daily_log > /tmp/daily_log.sql
pg_dump -U jobsearch -h localhost jobsearch > /tmp/jobsearch.sql
```

If these fail with auth errors, check `~/.pgpass` or use `sudo -u postgres pg_dump daily_log > /tmp/daily_log.sql`.

- [ ] **Step 7: Start the full stack for the first time**

```bash
docker compose up -d
```

This pulls all images and starts all five containers. Wait 10-15 seconds for Postgres to initialize (the init script runs on first start).

Check all containers are up:
```bash
docker compose ps
```

Expected: all five services in `running` state.

- [ ] **Step 8: Restore Postgres data**

```bash
docker compose exec -T postgres psql -U daily_log -d daily_log < /tmp/daily_log.sql
docker compose exec -T postgres psql -U jobsearch -d jobsearch < /tmp/jobsearch.sql
```

If you get "role does not exist" errors, the init script may not have run yet — wait another 30 seconds and try again.

- [ ] **Step 9: Verify each app responds**

Test from the VPS itself (bypasses Caddy):

```bash
curl -s http://localhost:4112 | head -5   # writing-app
curl -s http://localhost:4113 | head -5   # daily-log
curl -s http://localhost:4111 | head -5   # jobsearch
```

Expected: each returns HTML starting with `<!doctype html>` or `<!DOCTYPE html>`.

Then test through Caddy from a browser (with basic auth):
- https://write.dmytropetryshchuk.com
- https://log.dmytropetryshchuk.com
- https://jobsearch.dmytropetryshchuk.com

Caddy auto-provisions TLS certs on first request — it may take 10-30 seconds.

- [ ] **Step 10: Stop and disable old systemd services**

Only do this after confirming all three apps work via Caddy in Step 9.

```bash
sudo systemctl stop writing daily-log jobsearch
sudo systemctl disable writing daily-log jobsearch
```

The old host Caddy can also be stopped (the Docker Caddy now owns ports 80 and 443):

```bash
sudo systemctl stop caddy
sudo systemctl disable caddy
```

- [ ] **Step 11: Add GitHub Actions secrets to the monorepo**

The new repo needs the same secrets as the old repos. If not already present, add via `gh`:

```bash
gh secret set VPS_HOST  --repo dpetryshchuk/ai-os --body "46.225.78.10"
gh secret set VPS_USER  --repo dpetryshchuk/ai-os --body "dima"
gh secret set VPS_SSH_KEY --repo dpetryshchuk/ai-os < ~/.ssh/<deploy-key>
```

Or add manually: GitHub → ai-os repo → Settings → Secrets and variables → Actions.

- [ ] **Step 12: Trigger a test deploy**

Make a trivial change to one app (e.g., a blank line), push, and watch the GitHub Actions `Deploy` workflow on GitHub. Verify:
1. Only the changed app's job runs (the others are skipped)
2. The job succeeds end-to-end (build → push → SSH → `docker compose up`)
3. The app is accessible via its domain after the deploy

---

## Self-Review

**Spec coverage:**
- ✅ Five containers on one internal network (caddy, writing-app, daily-log, jobsearch, postgres)
- ✅ Caddy only container with external ports
- ✅ Multi-stage Dockerfiles (builder → runner) for all three apps
- ✅ Postgres init script for per-app users and databases
- ✅ `jobsearch` serves its own static files (Mastra catch-all route)
- ✅ `writing-app` has git + ssh in container for essay sync
- ✅ `UPLOADS_DIR` is configurable, mapped to a named volume
- ✅ `.env.example` with all required variables
- ✅ Single deploy.yml replacing three per-app workflows
- ✅ Path-filtered jobs — only changed service is rebuilt and redeployed
- ✅ GHCR for image registry (free, no separate credentials needed in Actions)
- ✅ VPS migration includes pg_dump/restore for live data

**Not covered here:**
- Multi-platform image builds (linux/arm64) — not needed; Hetzner CX22 is amd64
- Secrets rotation procedure
- Database backup strategy inside Docker (separate ops concern)
