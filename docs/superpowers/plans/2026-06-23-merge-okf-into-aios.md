# Merge okf-os into aios — Private Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb okf-os into the aios codebase, create a private GitHub monorepo as the real working copy, and route both domains (`dmytropetryshchuk.com` and `onekeyflow.com`) to one app with domain-based theming.

**Architecture:** One FastAPI app on port 4116 serves all routes; okf backend code moves into `aios/` with an `okf_` prefix to avoid collisions; the React SPA detects `window.location.hostname` at runtime and applies dark mode + business nav for the onekeyflow domain. The private repo `dpetryshchuk/aios-private` is the real working copy; the public `ai-os` repo becomes a portfolio snapshot.

**Tech Stack:** FastAPI, Python 3.12, SQLite (okf data), asyncpg (personal data), Celery, React 19, Vite, Tailwind CSS (class dark mode), Docker, Caddy, GitHub Actions.

## Global Constraints

- All Python changes live under `aios/` in the repo root.
- Keep okf SQLite db at `DATA_DIR/okf.db` (volume-mounted, never in image).
- Never hardcode secrets — always use `settings.*` from `aios/config.py`.
- The Celery `okf` queue already exists in docker-compose; celery-worker just needs to listen on it.
- No new npm packages — all needed UI components already exist in aios frontend.
- Build context for Docker is repo root (existing pattern).

---

### Task 1: Create private GitHub repo and wire git remotes

**Files:**
- No code files — git and GitHub operations only.

**Interfaces:**
- Produces: `dpetryshchuk/aios-private` private repo, local remote `private` pointing to it, VPS updated to pull from it.

- [ ] **Step 1: Create the private repo via gh**

```bash
gh repo create dpetryshchuk/aios-private --private --description "AI OS — private monorepo"
```

Expected: repo created at `github.com/dpetryshchuk/aios-private`

- [ ] **Step 2: Add remote and push**

Run from `/Users/dima/Projects/ai operating systems/ai-os`:
```bash
git remote add private https://github.com/dpetryshchuk/aios-private.git
git push private master
```

Expected: master branch appears on aios-private.

- [ ] **Step 3: Copy deploy SSH secret to private repo**

The VPS deploy workflow uses `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Copy from the public repo:
```bash
gh secret list --repo dpetryshchuk/ai-os
# For each secret, read the value and set it on the private repo:
gh secret set VPS_HOST --repo dpetryshchuk/aios-private
gh secret set VPS_USER --repo dpetryshchuk/aios-private
gh secret set VPS_SSH_KEY --repo dpetryshchuk/aios-private
```

Note: `gh secret set` opens an editor or reads from stdin — paste the value from the public repo's secret or from your 1Password/local notes.

- [ ] **Step 4: Update VPS git remote**

```bash
ssh dima@46.225.78.10 "cd /home/dima/ai-os && git remote set-url origin https://github.com/dpetryshchuk/aios-private.git && git fetch origin"
```

Expected: no errors, VPS now tracks the private repo.

- [ ] **Step 5: Commit note on public repo**

In the public `ai-os` repo README (or a new line at top), note that active development moved to a private repo. This is cosmetic — no code changes needed here yet.

---

### Task 2: Absorb okf-os backend into aios

**Files:**
- Modify: `aios/config.py`
- Create: `aios/okf_db.py`
- Create: `aios/pandadoc.py`
- Create: `aios/prompts/proposal.json` (copy)
- Modify: `aios/tasks.py`
- Create: `aios/routers/proposals.py`
- Create: `aios/routers/revenue.py`
- Modify: `aios/main.py`
- Modify: `aios/Dockerfile`

**Interfaces:**
- Consumes: `okf-os/db.py`, `okf-os/pandadoc.py`, `okf-os/prompts/proposal.json`, `okf-os/routers/proposals.py`, `okf-os/routers/revenue.py`, `okf-os/tasks.py`
- Produces: `/api/proposals/*` and `/api/revenue/*` routes on the aios FastAPI app; `generate_proposal` Celery task on the `okf` queue.

- [ ] **Step 1: Add okf settings to config.py**

In `aios/config.py`, add two fields to the `Settings` class (after `supadata_api_key`):

```python
    pandadoc_api_key: str = ""
    data_dir: str = "/app/data"
```

- [ ] **Step 2: Create aios/okf_db.py**

Copy `okf-os/db.py` to `aios/okf_db.py`. Change the one import at the top:

Replace:
```python
import config

_DB = Path(config.DATA_DIR) / "okf.db"
```

With:
```python
from config import settings

_DB = Path(settings.data_dir) / "okf.db"
```

No other changes needed — all function signatures stay identical.

- [ ] **Step 3: Create aios/pandadoc.py**

Copy `okf-os/pandadoc.py` to `aios/pandadoc.py`. Change the config import:

Replace:
```python
import config
```
with:
```python
from config import settings
```

Replace the one usage of `config.PANDADOC_API_KEY`:
```python
    "Authorization": f"API-Key {config.PANDADOC_API_KEY}",
```
with:
```python
    "Authorization": f"API-Key {settings.pandadoc_api_key}",
```

- [ ] **Step 4: Copy prompts directory**

```bash
cp -r "/Users/dima/Projects/ai operating systems/okf-os/prompts" "/Users/dima/Projects/ai operating systems/ai-os/aios/prompts"
```

- [ ] **Step 5: Add generate_proposal task to aios/tasks.py**

At the bottom of `aios/tasks.py`, add (after existing tasks):

```python
# ── OKF: proposal generation ──────────────────────────────────────────────────

import json as _json
from pathlib import Path as _Path
import litellm as _litellm
import okf_db as _okf_db
import pandadoc as _pandadoc


def _load_proposal_prompts() -> dict:
    return _json.loads((_Path(__file__).parent / "prompts" / "proposal.json").read_text())


def _call_proposal_llm(prompts: dict, req_data: dict) -> dict:
    examples = []
    for msg in prompts["examples"]:
        content = msg["content"]
        examples.append({
            "role": msg["role"],
            "content": _json.dumps(content) if isinstance(content, dict) else content,
        })
    messages = [
        {"role": "system", "content": "You're a helpful, intelligent sales assistant."},
        {"role": "user", "content": prompts["instruction"]},
        *examples,
        {
            "role": "user",
            "content": _json.dumps({
                "businessDescription": req_data.get("businessDescription", ""),
                "problem": req_data.get("problem", ""),
                "solution": req_data.get("solution", ""),
                "tools": req_data.get("platforms", ""),
                "timeline": req_data.get("timeline", ""),
            }),
        },
    ]
    response = _litellm.completion(
        model="deepseek/deepseek-chat",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=1,
    )
    return _json.loads(response.choices[0].message.content)


@celery_app.task(bind=True, queue="okf")
def generate_proposal(self, req_data: dict) -> dict:
    job_id = self.request.id
    _okf_db.init()
    _okf_db.create_event(job_id, "proposal.generate", req_data)
    _okf_db.start_event(job_id)
    try:
        prompts = _load_proposal_prompts()
        proposal = _call_proposal_llm(prompts, req_data)
        payload = _pandadoc.build_payload(req_data, proposal)
        doc_id = _pandadoc.create_document(payload)
        _pandadoc.wait_for_draft(doc_id)
        doc_url = f"https://app.pandadoc.com/a/#/documents/{doc_id}"
        result = {
            "client": {
                "firstName": req_data.get("firstName", ""),
                "lastName": req_data.get("lastName", ""),
                "company": req_data.get("company", ""),
                "email": req_data.get("email", ""),
                "price": req_data.get("price", ""),
            },
            "proposal": proposal,
            "pandadoc": {"id": doc_id, "url": doc_url},
        }
        _okf_db.complete_event(job_id, result)
        return result
    except Exception as e:
        _okf_db.fail_event(job_id, str(e))
        raise
```

- [ ] **Step 6: Create aios/routers/proposals.py**

```python
from fastapi import APIRouter
from pydantic import BaseModel

import okf_db
from tasks import celery_app, generate_proposal

router = APIRouter()


class ProposalRequest(BaseModel):
    firstName: str
    lastName: str
    company: str
    email: str
    businessDescription: str
    problem: str
    solution: str
    platforms: str
    timeline: str
    price: str


@router.post("/generate")
def start_generate(req: ProposalRequest):
    task = generate_proposal.delay(req.model_dump())
    return {"ok": True, "job_id": task.id}


@router.get("/status/{job_id}")
def get_status(job_id: str):
    result = celery_app.AsyncResult(job_id)
    if result.state == "SUCCESS":
        return {"ok": True, "status": "done", **result.result}
    if result.state == "FAILURE":
        return {"ok": True, "status": "failed", "error": str(result.result)}
    return {"ok": True, "status": "pending"}


@router.get("/events")
def get_events(limit: int = 100):
    okf_db.init()
    return {"ok": True, "events": okf_db.list_events(limit)}
```

- [ ] **Step 7: Create aios/routers/revenue.py**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import okf_db

router = APIRouter()


class MonthEntry(BaseModel):
    month: str
    gross_revenue: float
    service_fees: float = 0.0
    fixed_overhead: float = 0.0
    variable_overhead: float = 0.0
    tax_rate: float = 0.28
    notes: str = ""


@router.get("")
def get_revenue():
    okf_db.init()
    return {"ok": True, "months": okf_db.get_all_months()}


@router.post("")
def create_revenue(body: MonthEntry):
    okf_db.init()
    try:
        month = okf_db.create_month(body.model_dump())
        return {"ok": True, "month": month}
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(400, f"Month '{body.month}' already exists")
        raise


@router.put("/{month_id}")
def update_revenue(month_id: int, body: MonthEntry):
    okf_db.init()
    month = okf_db.update_month(month_id, body.model_dump())
    if not month:
        raise HTTPException(404, "Not found")
    return {"ok": True, "month": month}


@router.delete("/{month_id}")
def delete_revenue(month_id: int):
    okf_db.init()
    okf_db.delete_month(month_id)
    return {"ok": True}
```

- [ ] **Step 8: Register routers in aios/main.py**

Add the two new router imports alongside existing ones:

```python
from routers import daily_log, home, ideas, jobsearch, look, webhooks, writing, proposals, revenue
```

Add the router registrations after the existing `app.include_router` calls:

```python
app.include_router(proposals.router, prefix="/api/proposals")
app.include_router(revenue.router, prefix="/api/revenue")
```

- [ ] **Step 9: Update aios/Dockerfile**

The `COPY` line for Python files needs to include the new modules. Replace:

```dockerfile
COPY aios/main.py aios/config.py aios/db.py aios/schemas.py aios/models.py aios/events.py aios/agent.py aios/tasks.py ./
```

With:

```dockerfile
COPY aios/main.py aios/config.py aios/db.py aios/schemas.py aios/models.py aios/events.py aios/agent.py aios/tasks.py aios/okf_db.py aios/pandadoc.py ./
COPY aios/prompts ./prompts
```

- [ ] **Step 10: Syntax-check the backend**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os"
python3 -c "
import sys, ast, os
files = ['aios/config.py','aios/okf_db.py','aios/pandadoc.py','aios/tasks.py','aios/main.py','aios/routers/proposals.py','aios/routers/revenue.py']
for f in files:
    try:
        ast.parse(open(f).read()); print('OK', f)
    except SyntaxError as e:
        print('FAIL', f, e); sys.exit(1)
"
```

Expected: all lines print `OK`.

- [ ] **Step 11: Commit**

```bash
git add aios/config.py aios/okf_db.py aios/pandadoc.py aios/prompts/ aios/tasks.py aios/routers/proposals.py aios/routers/revenue.py aios/main.py aios/Dockerfile
git commit -m "feat: absorb okf-os backend into aios (proposals, revenue, okf_db)"
```

---

### Task 3: Frontend — domain theming + business pages

**Files:**
- Modify: `aios/frontend/tailwind.config.ts`
- Modify: `aios/frontend/src/index.css`
- Create: `aios/frontend/src/pages/Business/Proposals.tsx`
- Create: `aios/frontend/src/pages/Business/Revenue.tsx`
- Create: `aios/frontend/src/pages/Business/Outreach.tsx`
- Create: `aios/frontend/src/pages/Business/Events.tsx`
- Modify: `aios/frontend/src/Shell.tsx`
- Modify: `aios/frontend/src/App.tsx`

**Interfaces:**
- Consumes: okf-os frontend page files (copy verbatim, no changes needed)
- Produces: SPA that applies dark mode + business nav on `onekeyflow.com`, light mode + personal nav on `dmytropetryshchuk.com`

- [ ] **Step 1: Enable Tailwind class-based dark mode**

In `aios/frontend/tailwind.config.ts`, add `darkMode: 'class'` as the first key after the opening brace:

```typescript
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // ... rest unchanged
```

- [ ] **Step 2: Add dark mode CSS variables to index.css**

Append after the `:root { ... }` block in `aios/frontend/src/index.css`:

```css
.dark {
  --background: 240 10% 3.9%;
  --card: 240 6% 7%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --border: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
  --destructive: 0 62.8% 30.6%;
}
```

- [ ] **Step 3: Copy business pages**

```bash
mkdir -p "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend/src/pages/Business"
cp "/Users/dima/Projects/ai operating systems/okf-os/frontend/src/pages/Proposals.tsx" \
   "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend/src/pages/Business/Proposals.tsx"
cp "/Users/dima/Projects/ai operating systems/okf-os/frontend/src/pages/Revenue.tsx" \
   "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend/src/pages/Business/Revenue.tsx"
cp "/Users/dima/Projects/ai operating systems/okf-os/frontend/src/pages/Outreach.tsx" \
   "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend/src/pages/Business/Outreach.tsx"
cp "/Users/dima/Projects/ai operating systems/okf-os/frontend/src/pages/Events/index.tsx" \
   "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend/src/pages/Business/OkfEvents.tsx"
```

In `OkfEvents.tsx`, change the export name so it doesn't collide:

Replace:
```typescript
export default function Events() {
```
With:
```typescript
export default function OkfEvents() {
```

- [ ] **Step 4: Update Shell.tsx with domain detection and business nav**

At the top of `aios/frontend/src/Shell.tsx`, add the hook right after the existing imports:

```typescript
const IS_OKF = typeof window !== 'undefined' && window.location.hostname.includes('onekeyflow')
```

Add a business nav constant after the existing `WORKFLOWS` array:

```typescript
const BUSINESS: WorkflowSection[] = [
  { label: 'Proposals', path: '/proposals', icon: ClipboardList },
  { label: 'Revenue', path: '/revenue', icon: TrendingUp },
  { label: 'Outreach', path: '/outreach', icon: Megaphone },
  { label: 'Events', path: '/okf-events', icon: Activity },
]
```

Add the missing icon imports to the existing import line — add `ClipboardList`, `Megaphone` (the icons already used in okf-os Shell):

```typescript
import {
  Activity,
  BookOpen,
  BriefcaseIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Home,
  Lightbulb,
  Megaphone,
  Menu,
  MessageSquare,
  PenLine,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
```

Inside the Shell component function body, add the dark mode effect as the first thing after `const [open, setOpen] = useState(false)`:

```typescript
  useEffect(() => {
    if (IS_OKF) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])
```

In the sidebar nav list (where `WORKFLOWS.map(...)` renders), replace the map with:

```typescript
{(IS_OKF ? BUSINESS : WORKFLOWS).map((item) => (
  <NavItem key={item.path} item={item} collapsed={collapsed} onNavigate={() => setOpen(false)} />
))}
```

- [ ] **Step 5: Register business routes in App.tsx**

Add imports at the top:

```typescript
import Proposals from './pages/Business/Proposals'
import Revenue from './pages/Business/Revenue'
import Outreach from './pages/Business/Outreach'
import OkfEvents from './pages/Business/OkfEvents'
```

Inside the `<Route element={<Shell />}>` block, add after the existing routes:

```typescript
          <Route path="proposals" element={<Proposals />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="outreach" element={<Outreach />} />
          <Route path="okf-events" element={<OkfEvents />} />
```

- [ ] **Step 6: Build check**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os/aios/frontend"
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` with no errors. Fix any TypeScript errors before continuing.

- [ ] **Step 7: Commit**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os"
git add aios/frontend/tailwind.config.ts aios/frontend/src/index.css aios/frontend/src/pages/Business/ aios/frontend/src/Shell.tsx aios/frontend/src/App.tsx
git commit -m "feat: domain-based theming — dark mode + business nav on onekeyflow.com"
```

---

### Task 4: Infra — docker-compose, Caddy, CI

**Files:**
- Modify: `docker-compose.yml`
- Modify: `caddy/Caddyfile`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: single `aios` container serving both domains on port 4116; CI deploys from private repo; Caddy routes both domains to 4116.

- [ ] **Step 1: Update docker-compose.yml**

Remove the three `onekeyflow` / `onekeyflow-worker` service blocks entirely.

In the `aios` service `environment:` block, add:
```yaml
      PANDADOC_API_KEY: ${PANDADOC_API_KEY}
      DATA_DIR: /app/data
```

In the `aios` service `volumes:` block, add:
```yaml
      - okf_data:/app/data
```

Update the `celery-worker` service `command:` to consume both queues:
```yaml
    command: celery -A tasks worker --loglevel=info -Q celery,okf
```

In the top-level `volumes:` block, the `okf_data:` entry already exists — leave it.

Remove the `okf_data` volume from `onekeyflow`/`onekeyflow-worker` (they're being deleted anyway).

- [ ] **Step 2: Update Caddyfile**

Change the `os.onekeyflow.com` block from port 4117 to 4116:

```
os.onekeyflow.com {
  import auth
  reverse_proxy localhost:4116 {
    flush_interval -1
  }
}
```

- [ ] **Step 3: Simplify deploy.yml — remove deploy-onekeyflow job**

Delete the entire `deploy-onekeyflow` job block. The `deploy-app` job already handles everything. Also update `deploy-app` `paths-filter` to keep aios-only:

```yaml
          filters: |
            aios:
              - 'aios/**'
```

(No change needed — this was already correct. Just confirm the onekeyflow job is gone.)

- [ ] **Step 4: Commit**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os"
git add docker-compose.yml caddy/Caddyfile .github/workflows/deploy.yml
git commit -m "infra: consolidate to single aios container, both domains → port 4116"
```

---

### Task 5: Deploy and VPS transition

**Files:** No code files — SSH and git operations.

**Interfaces:**
- Consumes: all commits from Tasks 2–4
- Produces: running merged app on VPS, both domains working

- [ ] **Step 1: Push to private repo**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os"
git push private master
```

- [ ] **Step 2: Add PANDADOC_API_KEY to VPS .env**

```bash
ssh dima@46.225.78.10 "echo 'PANDADOC_API_KEY=<your-key>' >> /home/dima/ai-os/.env"
```

Replace `<your-key>` with the actual key from your notes / the old VPS container env.

To find the current value:
```bash
ssh dima@46.225.78.10 "docker inspect ai-os-onekeyflow-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep PANDADOC"
```

- [ ] **Step 3: Pull and restart on VPS**

```bash
ssh dima@46.225.78.10 "
  set -e
  cd /home/dima/ai-os
  git fetch origin master
  git reset --hard origin/master
  docker compose pull aios
  docker compose up -d aios celery-worker celery-beat
  docker compose stop onekeyflow onekeyflow-worker
  docker compose rm -f onekeyflow onekeyflow-worker
  sudo systemctl reload-or-restart caddy
"
```

- [ ] **Step 4: Verify both domains**

```bash
curl -u dima:<password> https://home.dmytropetryshchuk.com/api/health
curl -u dima:<password> https://os.onekeyflow.com/api/health
curl -u dima:<password> https://os.onekeyflow.com/api/revenue
```

Expected: all return `{"ok": true, ...}`.

- [ ] **Step 5: Verify okf data volume was preserved**

```bash
ssh dima@46.225.78.10 "docker compose exec aios python3 -c 'import okf_db; okf_db.init(); print(len(okf_db.get_all_months()), \"months\")"
```

Expected: prints the number of months already in the SQLite db (e.g., `4 months`).

---

### Task 6: Public repo cleanup

**Files:**
- Modify: `README.md` (or create one) in the public `ai-os` repo

- [ ] **Step 1: Note the snapshot status**

In `/Users/dima/Projects/ai operating systems/ai-os/README.md`, add or update the top:

```markdown
> **Note:** This is a portfolio snapshot. Active development happens in a private monorepo.
```

- [ ] **Step 2: Commit and push to public origin**

```bash
cd "/Users/dima/Projects/ai operating systems/ai-os"
git add README.md
git commit -m "docs: mark as portfolio snapshot"
git push origin master
```

---

## Self-Review

**Spec coverage:**
- ✅ Private monorepo created (Task 1)
- ✅ okf backend absorbed — proposals, revenue, okf_db, pandadoc, prompts (Task 2)
- ✅ Frontend dark mode for onekeyflow domain (Task 3)
- ✅ Business nav (Proposals, Revenue, Outreach, Events) on okf domain (Task 3)
- ✅ Single container on port 4116 serves both domains (Task 4)
- ✅ Caddy updated (Task 4)
- ✅ CI simplified — removed onekeyflow deploy job (Task 4)
- ✅ VPS transition with data preservation (Task 5)
- ✅ Public repo marked as snapshot (Task 6)

**Gaps / notes:**
- The okf-os Events page is renamed `OkfEvents` to avoid collision with the personal Events page.
- `okf_db.init()` is called at the start of each revenue/proposals route handler (idempotent). This is simpler than adding it to the FastAPI lifespan since the SQLite db doesn't need pooling.
- The `generate_proposal` task uses `queue="okf"` decorator arg — Celery respects this even on the shared celery_app.
- The existing `okf_data` Docker volume is preserved via Task 5 Step 2 (we never `docker volume rm` it).
- Terraform `providers.tf` already updated to use Porkbun (done in prior session) — no changes needed here.
