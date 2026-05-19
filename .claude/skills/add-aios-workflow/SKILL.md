---
name: add-aios-workflow
description: Add a new workflow or standalone service to Dima's AI OS (home.dmytropetryshchuk.com). Use when the user says "add a new app", "add a workflow", "spin up a service", or "add a section" to the AI OS. Covers two patterns: (1) workflow = new router + frontend page inside the existing aios app, (2) standalone service = new Docker container with its own port and subdomain.
---

# Add AI OS Workflow

## Repo layout

```
ai-os/
├── aios/                  # The unified app (port 4116)
│   ├── main.py            # Mount new routers here
│   ├── routers/           # One file per feature area
│   ├── workers/           # Celery background workers
│   ├── alembic/           # jobsearch DB migrations
│   ├── alembic_daily/     # daily_log DB migrations
│   ├── Dockerfile         # build context = repo root
│   └── frontend/src/
│       ├── pages/         # One folder per feature area
│       ├── Shell.tsx      # Sidebar nav — add links here
│       └── App.tsx        # React Router routes
├── caddy/Caddyfile        # Caddy reverse proxy (systemd on VPS, NOT Docker)
├── docker-compose.yml     # Add new standalone services here
└── .github/workflows/deploy.yml
```

**Next available port: 4117** (update CLAUDE.md when you use it)

---

## Pattern 1: Add a workflow to aios (recommended)

Use when the feature belongs inside the same app — same auth, same DB, same deploy.

### 1. Backend router

Create `aios/routers/<name>.py`:

```python
from fastapi import APIRouter, Depends
import asyncpg
import db

router = APIRouter()

@router.get("/")
async def list_items(pool: asyncpg.Pool = Depends(db.get_jobsearch_pool)):
    rows = await pool.fetch("SELECT * FROM items")
    return {"ok": True, "items": [dict(r) for r in rows]}
```

Mount in `aios/main.py`:
```python
from routers import <name>
app.include_router(<name>.router, prefix="/api/<name>")
```

### 2. Database (if needed)

Create migration `aios/alembic/versions/XXXX_create_<name>_schema.py`:
```python
revision = "XXXX"
down_revision = "<previous>"

def upgrade():
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            ...
        )
    """))

def downgrade():
    op.execute(sa.text("DROP TABLE IF EXISTS items"))
```

Run on VPS after deploy:
```bash
ssh dima@46.225.78.10
docker compose exec aios alembic upgrade head
```

### 3. Frontend page

Create `aios/frontend/src/pages/<Name>/index.tsx`. **Match the existing design system exactly** (see Design System section below).

Add route in `aios/frontend/src/App.tsx`:
```tsx
import Name from './pages/Name'
// inside <Routes> under <Route element={<Shell />}>:
<Route path="/<name>" element={<Name />} />
```

Add nav link in `aios/frontend/src/Shell.tsx` — add to the `WORKFLOWS` array:
```tsx
{ label: 'Name', path: '/<name>', icon: SomeIcon },
```

### 4. Deploy

```bash
git add aios/
git commit -m "feat(<name>): add <name> workflow"
git push
```

GitHub Actions `deploy-app` triggers automatically on `aios/**` changes.

---

## Design System

The site uses shadcn/ui CSS tokens on a dark theme. **Never use custom colors, font imports, or inline styles.** Every new page must look indistinguishable from existing pages.

### Color tokens (always use these)

| Token | Use for |
|---|---|
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary/dim text |
| `bg-background` | Page/input backgrounds |
| `bg-muted/10`, `bg-muted/20` | Subtle section backgrounds, hover states |
| `border-border` | All borders |
| `border-border/50` | Lighter dividers |
| `bg-foreground text-background` | Active/selected state (tabs, buttons) |
| `text-destructive` | Danger/delete actions |

### Typography

- Body text: `text-sm` — standard size for all content
- Labels/meta: `text-xs text-muted-foreground`
- Badges: `text-[9px] font-mono uppercase tracking-widest`
- Headings: `text-sm font-medium` (keep them small — this is a dense tool)

### Layout patterns

**Page wrapper** (must be full-height, scrollable list):
```tsx
<div className="flex flex-col h-full overflow-hidden">
  {/* sticky header */}
  <div className="sticky top-0 bg-background z-10 px-4 py-3 border-b border-border flex items-center justify-between">
    <h1 className="text-sm font-medium">Page Title</h1>
    <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1.5 hover:text-foreground hover:border-foreground/30 transition-colors">
      <Plus size={12} /> Add
    </button>
  </div>
  {/* scrollable content */}
  <div className="flex-1 overflow-y-auto">
    {/* list items */}
  </div>
</div>
```

**List rows** (group pattern for hover actions):
```tsx
<div className="group border-b border-border/50 hover:bg-muted/20 transition-colors">
  <div className="px-4 py-3 flex items-start gap-3">
    {/* content */}
    <div className="flex items-center gap-1.5 shrink-0">
      <button className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all">
        <Pencil size={12} />
      </button>
      <button className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all">
        <Trash2 size={12} />
      </button>
    </div>
  </div>
</div>
```

**Forms / input sections** (collapsible add panel):
```tsx
<div className="border-b border-border bg-muted/10 px-4 py-4 flex flex-col gap-3 shrink-0">
  <textarea
    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring/30 resize-none"
  />
  <div className="flex justify-end">
    <button
      disabled={saving}
      className="px-4 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-80 transition-opacity disabled:opacity-40"
    >
      Save
    </button>
  </div>
</div>
```

**Filter tabs**:
```tsx
<button className={cn(
  'px-2.5 py-1 text-xs rounded-md transition-colors',
  isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
)}>
  Label
</button>
```

**Badges** (category/status chips):
```tsx
<span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-muted-foreground">
  label
</span>
```

### Imports

Always import `cn` and lucide icons:
```tsx
import { cn } from '@/lib/utils'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
```

Never import external fonts, custom color palettes, or animation libraries. The site has no custom CSS beyond Tailwind.

---

## Pattern 2: Standalone service (new Docker container)

Use when the service needs its own process, language, or has no frontend.

### 1. Create the app

```
<appname>/
├── main.py          # or index.js, etc.
├── requirements.txt
└── Dockerfile
```

**Dockerfile** (build context = repo root, so prefix paths):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY <appname>/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY <appname>/ .
EXPOSE <PORT>
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "<PORT>"]
```

### 2. Add to docker-compose.yml

```yaml
<appname>:
  image: ghcr.io/dpetryshchuk/ai-os/<appname>:latest
  ports:
    - "127.0.0.1:<PORT>:<PORT>"
  environment:
    DATABASE_URL: postgresql://...@postgres:5432/<appname>
  depends_on:
    - postgres
    - redis
  networks:
    - internal
  restart: unless-stopped
```

If it needs its own DB, add user/DB to `postgres/init.sh`:
```bash
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE USER <appname> WITH PASSWORD '$<APPNAME>_DB_PASSWORD';
  CREATE DATABASE <appname> OWNER <appname>;
EOSQL
```

### 3. Add Caddy block

In `caddy/Caddyfile`:
```
<subdomain>.dmytropetryshchuk.com {
  import auth
  reverse_proxy localhost:<PORT> {
    flush_interval -1
  }
}
```

### 4. Add GitHub Actions job

In `.github/workflows/deploy.yml`, add a new job following the `deploy-app` pattern, filtering on `<appname>/**` changes. Image tag: `ghcr.io/dpetryshchuk/ai-os/<appname>:latest`.

### 5. Deploy

```bash
git add <appname>/ docker-compose.yml caddy/Caddyfile .github/workflows/deploy.yml
git commit -m "feat(<appname>): add standalone <appname> service"
git push
```

- `deploy-app` builds and pushes the Docker image, then SSHs in: `docker compose pull <appname> && docker compose up -d <appname>`
- `deploy-infra` reloads Caddy for the new subdomain

---

## VPS facts

- **Host**: `46.225.78.10`, user `dima`, pw `tenor1324`
- **App directory**: `/home/dima/ai-os/`
- **Caddy**: systemd service, NOT Docker. Reload: `sudo systemctl reload-or-restart caddy`
- **Caddy config on VPS**: `/home/dima/ai-os/caddy/Caddyfile` (symlinked or copied — deploy-infra runs `git reset --hard` then reloads)
- **Docker network**: `internal` bridge — containers reach each other by service name (e.g. `postgres:5432`, `redis:6379`, `aios:4116`)
- **Env vars**: stored in `/home/dima/ai-os/.env`, loaded by docker-compose via `${VAR}` syntax
- **PYTHONPATH**: set to `/app` in celery-worker — required for `workers.*` imports to work

## Update CLAUDE.md

After using port 4117, increment "Next available port" in root `CLAUDE.md`.
