import json
import os
import sqlite3
from pathlib import Path

import litellm
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

_DB = Path(os.getenv("DATA_DIR", ".")) / "okf.db"

_SEED = [
    ("Feb 2026", 742.48,  74.248, 362.413, 234.75, 0.28, "BatsCRM $60 · Pearl West $682.48"),
    ("Mar 2026", 2000.00, 200.00, 527.813, 298.45, 0.28, "Irby Report Tool $1,500"),
    ("Apr 2026", 500.00,  50.00,  175.813,   0.00, 0.28, "Jeff Morning Prep Doc $500"),
    ("May 2026", 1000.00, 30.00,  179.813,   0.00, 0.28, "Irby Serial Number Tool $1,000 (50% upfront)"),
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS monthly_pl (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            month            TEXT    NOT NULL UNIQUE,
            gross_revenue    REAL    NOT NULL DEFAULT 0,
            service_fees     REAL    NOT NULL DEFAULT 0,
            fixed_overhead   REAL    NOT NULL DEFAULT 0,
            variable_overhead REAL   NOT NULL DEFAULT 0,
            tax_rate         REAL    NOT NULL DEFAULT 0.28,
            notes            TEXT    NOT NULL DEFAULT ''
        )
    """)
    conn.commit()
    if conn.execute("SELECT COUNT(*) FROM monthly_pl").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO monthly_pl (month, gross_revenue, service_fees, fixed_overhead, variable_overhead, tax_rate, notes) VALUES (?,?,?,?,?,?,?)",
            _SEED,
        )
        conn.commit()
    conn.close()


def _enrich(row: sqlite3.Row) -> dict:
    d = dict(row)
    net_revenue        = d["gross_revenue"] - d["service_fees"]
    total_overhead     = d["fixed_overhead"] + d["variable_overhead"]
    operating_profit   = net_revenue - total_overhead
    tax_provision      = max(0.0, operating_profit) * d["tax_rate"]
    net_profit         = operating_profit - tax_provision
    net_margin         = net_profit / net_revenue if net_revenue else 0.0
    d.update(
        net_revenue=round(net_revenue, 2),
        total_overhead=round(total_overhead, 2),
        operating_profit=round(operating_profit, 2),
        tax_provision=round(tax_provision, 2),
        net_profit=round(net_profit, 2),
        net_margin=round(net_margin, 4),
    )
    return d


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_init_db()


@app.exception_handler(Exception)
async def _exc(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})
    return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


# ---------------------------------------------------------------------------
# Revenue
# ---------------------------------------------------------------------------

class MonthEntry(BaseModel):
    month: str
    gross_revenue: float
    service_fees: float = 0.0
    fixed_overhead: float = 0.0
    variable_overhead: float = 0.0
    tax_rate: float = 0.28
    notes: str = ""


@app.get("/api/revenue")
def get_revenue():
    conn = _connect()
    rows = conn.execute("SELECT * FROM monthly_pl ORDER BY id").fetchall()
    conn.close()
    return {"ok": True, "months": [_enrich(r) for r in rows]}


@app.post("/api/revenue")
def create_month(body: MonthEntry):
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO monthly_pl (month, gross_revenue, service_fees, fixed_overhead, variable_overhead, tax_rate, notes) VALUES (?,?,?,?,?,?,?)",
            (body.month, body.gross_revenue, body.service_fees, body.fixed_overhead, body.variable_overhead, body.tax_rate, body.notes),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM monthly_pl WHERE id=?", (cur.lastrowid,)).fetchone()
        return {"ok": True, "month": _enrich(row)}
    except sqlite3.IntegrityError:
        raise HTTPException(400, f"Month '{body.month}' already exists")
    finally:
        conn.close()


@app.put("/api/revenue/{month_id}")
def update_month(month_id: int, body: MonthEntry):
    conn = _connect()
    try:
        conn.execute(
            "UPDATE monthly_pl SET month=?, gross_revenue=?, service_fees=?, fixed_overhead=?, variable_overhead=?, tax_rate=?, notes=? WHERE id=?",
            (body.month, body.gross_revenue, body.service_fees, body.fixed_overhead, body.variable_overhead, body.tax_rate, body.notes, month_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM monthly_pl WHERE id=?", (month_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        return {"ok": True, "month": _enrich(row)}
    finally:
        conn.close()


@app.delete("/api/revenue/{month_id}")
def delete_month(month_id: int):
    conn = _connect()
    conn.execute("DELETE FROM monthly_pl WHERE id=?", (month_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Proposals
# ---------------------------------------------------------------------------

_INSTRUCTION = """We're an operations agency that builds outreach systems, CRM systems, project management systems, no-code systems, and integrations.

Below is a loose scope. Turn that scope into a high-quality proposal in JSON.

Our clients are enterprise, so write in a spartan, no-frills tone that implies intelligence.

Don't write long paragraphs. If giving a numbered list, keep the descriptions short but precise.

Return only valid JSON with exactly these keys:
- title: the proposal headline (shown on the cover page)
- problemTitle: short heading for the problem section
- problemPitch: multi-paragraph problem framing (numbered points)
- solutionTitle: short heading for the solution section
- solutionPitch: multi-paragraph solution description (numbered points)
- platformList: comma-separated list of tools/platforms
- scopeDescription: one sentence describing what will be delivered
- milestones: array of up to 4 objects, each with "name" and "duration"
"""

_FEW_SHOT = [
    {
        "role": "user",
        "content": json.dumps({
            "businessDescription": "Flatiron Search Partners is an executive recruiting firm that specializes in high end technology clients.",
            "problem": "Right now they're managing all of their leads & projects in a massive Google Sheet. The key issues: their system is disorganized, incapable of scaling, and provides little in the way of accountability. Team members are manually updating fields, copying and pasting data, and there is no single source of truth.",
            "solution": "Migration to a dedicated CRM & project management solution like Monday.com, and a bespoke setup that includes a CRM board to handle new leads, alongside a PM board to handle new and ongoing projects. The creation of new records, and various administrative tasks alongside them, will be handled using both built in Monday automations and third party tools. I'll also create a process library of SOPs to improve operations more generally.",
            "tools": "Monday.com, Make.com, Typeform",
            "timeline": "3-4 weeks",
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "title": "Streamlining Flatiron Search Partners & Migrating to Monday",
            "problemTitle": "Your current setup is costing you more than you think",
            "problemPitch": "1. You're using systems that don't scale\n\nCurrently, your team spends a ridiculous amount of time manually updating fields in a Google Sheet. This is resource-intensive, inefficient, and tedious—it's easy for a small mistake to cascade into a large one. Perhaps more importantly, there's no accountability, so when problems arise, it's impossible to trace them back to their root.\n\n2. You're doing (and paying) too much\n\nGoogle Sheets is free. But the impact on your business has been costly. Daily tasks are difficult to operationalize—leading to a large chunk of your employee costs going to admin work that is easily automatable.\n\n3. You're missing a ton of functionality\n\nGoogle Sheets misses the rich functionality of purpose-built CRMs: you can't assign owners to records, automatically notify team members, or take advantage of views that actually represent data flow.",
            "solutionTitle": "A cleaner system, less admin, and a team that can actually scale",
            "solutionPitch": "1. First, I'll migrate & build you a scalable system\n\nI'll help you migrate to Monday.com, a dedicated CRM and project management platform. Your team will be able to assign owners to records, receive notifications on important tasks, and communicate in a public, accountable way.\n\nIn addition, I'll build bespoke automations to eliminate manual record creation and administrative functions—improving cycle time and decreasing the likelihood of costly errors.\n\n2. Then, I'll help you improve cost efficiency\n\nWe'll operationalize your procedures, add them to a library of SOPs, and scope automated solutions for each task. Turning institutional knowledge into a central knowledge base will streamline onboarding, improve margins, and make your team much more flexible.",
            "platformList": "Monday.com, Make.com, Typeform",
            "scopeDescription": "OneKeyFlow will migrate Flatiron Search Partners to Monday.com and build a bespoke CRM and project management setup with automations and a process library.",
            "milestones": [
                {"name": "Discovery & Data Audit", "duration": "Days 1–3"},
                {"name": "Monday.com Build & Automations", "duration": "Week 2"},
                {"name": "Data Migration & Testing", "duration": "Week 3"},
                {"name": "SOP Library & Handoff", "duration": "Week 4"},
            ],
        }),
    },
    {
        "role": "user",
        "content": json.dumps({
            "businessDescription": "Memphis Home Buyers is a residential real estate company that buys and flips homes with recorded payment troubles in the Memphis area.",
            "problem": "They have a list of over 50K contacts with homes they could be pitching to but they're not reaching out at all. All they're doing is calling, which is time and resource-intensive. They're generating a small fraction of the revenue they could if they ran an omnichannel campaign.",
            "solution": "Using a dedicated cold email tool like Instantly to manage 1,000+ outbound emails per day, with a standardized process for a salesperson to qualify over email. Qualified leads get passed to the closing team, who make a purchase offer within 24hrs.",
            "tools": "Instantly.ai, Make.com",
            "timeline": "2 weeks",
        }),
    },
    {
        "role": "assistant",
        "content": json.dumps({
            "title": "Scalable Omnichannel Sales System for Memphis Home Buyers",
            "problemTitle": "You're paying people to do what software should be doing",
            "problemPitch": "1. Your current outreach system doesn't scale\n\nRight now, your team is manually cold-calling each lead in your database. This is time-intensive and costly—you're paying salespeople per hour for work that could be automated. While it occasionally works, this is not a scalable system.\n\n2. You're leaving significant revenue on the table\n\nWith 50K+ contacts sitting idle, every day without a systematic outreach process is lost revenue. Email-first qualification would let you cover your entire database in days rather than months.",
            "solutionTitle": "Email-first outreach, tiered sales process, built to scale",
            "solutionPitch": "1. First, I'll migrate you to Instantly.ai\n\nI'll migrate all of your contacts to Instantly.ai and set up a high-volume cold email campaign designed to qualify leads and drive responses from motivated sellers.\n\n2. Then, I'll build you a tiered sales process\n\nBy splitting outreach into two steps—email first, call second—we significantly improve efficiency. I'll document the full process as a set of SOPs so you can hire, train, and scale your sales team without losing operational quality.",
            "platformList": "Instantly.ai, Make.com",
            "scopeDescription": "OneKeyFlow will configure Instantly.ai for high-volume outreach, migrate contacts, and build a documented two-tier sales process with SOPs.",
            "milestones": [
                {"name": "Contact Audit & Cleanup", "duration": "Days 1–2"},
                {"name": "Instantly Setup & Campaign Build", "duration": "Days 3–7"},
                {"name": "SOP Documentation", "duration": "Days 8–10"},
                {"name": "Go-Live & Handoff", "duration": "Day 14"},
            ],
        }),
    },
]


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


@app.post("/api/proposals/generate")
async def generate_proposal(req: ProposalRequest):
    messages = [
        {"role": "system", "content": "You're a helpful, intelligent sales assistant."},
        {"role": "user", "content": _INSTRUCTION},
        *_FEW_SHOT,
        {
            "role": "user",
            "content": json.dumps({
                "businessDescription": req.businessDescription,
                "problem": req.problem,
                "solution": req.solution,
                "tools": req.platforms,
                "timeline": req.timeline,
            }),
        },
    ]
    response = await litellm.acompletion(
        model="deepseek/deepseek-chat",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=1,
    )
    proposal = json.loads(response.choices[0].message.content)
    return {
        "ok": True,
        "client": {
            "firstName": req.firstName,
            "lastName": req.lastName,
            "company": req.company,
            "email": req.email,
            "price": req.price,
        },
        "proposal": proposal,
    }


# ---------------------------------------------------------------------------
# Health + SPA
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"ok": True, "status": "healthy"}


_PUBLIC = Path("public")

if _PUBLIC.exists():
    app.mount("/assets", StaticFiles(directory=_PUBLIC / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        candidate = _PUBLIC / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_PUBLIC / "index.html")
