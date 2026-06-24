import json
import os
import secrets
from pathlib import Path
from typing import AsyncIterator

import asyncpg
import litellm

import intake

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_instructions() -> str:
    from config import settings
    try:
        base = (_PROMPTS_DIR / "ima.md").read_text()
    except OSError:
        base = "You are Ima, an AI assistant."

    sections = []
    try:
        memory_dir = Path(settings.data_dir) / "memory"
        for fname, label in [("USER.md", "About the user"), ("MEMORY.md", "Accumulated memory")]:
            f = memory_dir / fname
            if f.exists():
                content = f.read_text().strip()
                if content:
                    sections.append(f"\n\n---\n## {label} (from {fname})\n{content}")
    except Exception:
        pass

    return base + "".join(sections)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "upsert_company",
            "description": "Find or create a company by name. Returns JSON with id and created flag.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "website": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upsert_contact",
            "description": "Find or create a contact at a company. Returns JSON with id and created flag.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "company_id": {"type": "string"},
                    "role": {"type": "string"},
                    "source": {"type": "string"},
                    "stage": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["name", "company_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upsert_job_posting",
            "description": "Find or create a job posting. Status values: new, applied, dropped.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_id": {"type": "string"},
                    "title": {"type": "string"},
                    "link": {"type": "string"},
                    "source": {"type": "string"},
                    "status": {"type": "string", "enum": ["new", "applied", "dropped"]},
                    "resume_path": {"type": "string"},
                },
                "required": ["company_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_stage",
            "description": "Update the pipeline stage for a contact. Stage values: Outreached, Responded, Ongoing, Dead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_id": {"type": "string"},
                    "stage": {"type": "string", "enum": ["Outreached", "Responded", "Ongoing", "Dead"]},
                },
                "required": ["contact_id", "stage"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_interaction",
            "description": "Log an interaction with a contact. Direction: out (sent by me), in (received reply).",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_id": {"type": "string"},
                    "direction": {"type": "string", "enum": ["out", "in"]},
                    "notes": {"type": "string"},
                },
                "required": ["contact_id", "direction"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_content_post",
            "description": "Log a LinkedIn or social media content post with engagement metrics.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "impressions": {"type": "integer"},
                    "engagements": {"type": "integer"},
                    "comments": {"type": "integer"},
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Full-text search across notes. Returns matching notes as a JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_db",
            "description": "Run a read-only SELECT query against the database. Returns results as a JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string"},
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead_status",
            "description": "Set the status on a job_postings row. Use 'dropped' to dismiss a lead (excluded from re-scrapes), 'applied' when the user applied, 'new' to restore.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lead_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["new", "applied", "dropped"]},
                },
                "required": ["lead_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_scraper_settings",
            "description": "Read the current scraper config for a source (e.g. 'jobspy_sd'). Returns the JSON config so you can show or propose edits.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                },
                "required": ["source"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_scraper_settings",
            "description": "Replace the scraper config for a source. Pass the FULL config object — partial updates are not supported. Always confirm with the user first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "config": {
                        "type": "object",
                        "properties": {
                            "search_terms":   {"type": "array", "items": {"type": "string"}},
                            "locations":      {"type": "array", "items": {"type": "string"}},
                            "area_keywords":  {"type": "array", "items": {"type": "string"}},
                            "skip_titles":    {"type": "array", "items": {"type": "string"}},
                            "results_wanted": {"type": "integer"},
                            "hours_old":      {"type": "integer"},
                        },
                    },
                },
                "required": ["source", "config"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_notes",
            "description": "Read all personal notes from the job search notes section. Returns recent notes to give Ima context about the user's job search thoughts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max notes to return, default 20"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_essays",
            "description": "Read essay titles and content from the user's writing section. Use this to understand who the user is, their background, and their thoughts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max essays to return, default 5"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_code_file",
            "description": "Read a file from the AI OS git repo. Paths are relative to the repo root. Use search_files first to find the right file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to repo root, e.g. 'aios/agent.py', 'aios/frontend/src/Shell.tsx', 'docker-compose.yml', 'aios/prompts/ima.md'",
                    },
                    "offset": {"type": "integer", "description": "Line to start reading from (0-indexed). Use for large files."},
                    "limit": {"type": "integer", "description": "Max lines to return (default 500)."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_code_file",
            "description": "Surgical find-and-replace edit in a file. old_string must appear exactly once. Use read_code_file first — edit will fail if old_string doesn't match exactly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path relative to repo root, e.g. 'aios/frontend/src/Shell.tsx'"},
                    "old_string": {"type": "string", "description": "The exact string to replace (must appear exactly once in the file)"},
                    "new_string": {"type": "string", "description": "The replacement string"},
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_commit_and_push",
            "description": "Stage, commit, and push changes to the AI OS repo. Triggers CI/CD deploy. Always build frontend first if you edited frontend files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "Commit message describing what changed and why"},
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Paths relative to repo root to stage, e.g. ['aios/frontend/src/Shell.tsx']. If empty, stages all modified tracked files.",
                    },
                },
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_code_files",
            "description": "List all files in the AI OS git repo (or a subdirectory). Paths are relative to repo root.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subdir": {
                        "type": "string",
                        "description": "Subdirectory to list, e.g. 'aios', 'aios/routers', 'aios/frontend/src'. Defaults to repo root.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_skills",
            "description": "List available skills in the prompts/skills/ directory. Returns name, description, and tags for each. Use this to discover what skills exist before loading one with read_code_file.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_memory",
            "description": "Read persistent memory. type='user' reads USER.md (preferences/background), type='general' reads MEMORY.md (accumulated facts), type='sessions' lists recent session summaries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["user", "general", "sessions"], "description": "Which memory to read"},
                    "limit": {"type": "integer", "description": "For sessions: max to list, default 10"},
                },
                "required": ["type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "append_memory",
            "description": "Append a fact or preference to persistent memory. Use 'user' for things about the user (preferences, background). Use 'general' for facts about their job search, projects, decisions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "What to remember. Write as a complete sentence."},
                    "type": {"type": "string", "enum": ["user", "general"], "description": "user=USER.md, general=MEMORY.md"},
                },
                "required": ["content", "type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_session_summary",
            "description": "Save a summary of this conversation session for future reference. Call this at the end of a productive session covering a significant topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "2-5 sentences covering: what was discussed, decisions made, actions taken, follow-ups needed."},
                    "title": {"type": "string", "description": "Short title for this session (5-8 words)"},
                },
                "required": ["summary", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_outreach_contact",
            "description": "Log a new LinkedIn outreach contact. Use when the user says they messaged or connected with someone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name":         {"type": "string", "description": "Full name"},
                    "company":      {"type": "string"},
                    "linkedin_url": {"type": "string"},
                    "message_sent": {"type": "string", "description": "The message you sent them"},
                    "status":       {"type": "string", "enum": ["sent", "connected", "replied", "converted", "ignored"], "description": "Default: sent"},
                    "notes":        {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_outreach_contact",
            "description": "Update an outreach contact's status or notes. Use when someone replied, connected, or converted.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_id": {"type": "string"},
                    "status":     {"type": "string", "enum": ["sent", "connected", "replied", "converted", "ignored"]},
                    "notes":      {"type": "string"},
                },
                "required": ["contact_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_outreach_contacts",
            "description": "List outreach contacts, optionally filtered by status. Use to check pipeline or find a specific contact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["sent", "connected", "replied", "converted", "ignored"], "description": "Optional filter"},
                    "limit":  {"type": "integer", "description": "Max to return, default 30"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_outreach_stats",
            "description": "Get outreach funnel stats: counts by status, today's outreach count.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_outreach_retro",
            "description": "Get weekly outreach retro showing funnel metrics per week.",
            "parameters": {
                "type": "object",
                "properties": {
                    "weeks": {"type": "integer", "description": "Number of weeks to show, default 4"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "semantic_search",
            "description": "Search across notes, vault, and job postings by semantic meaning. For job matching ('what jobs would I like?', 'find roles that fit me'), use source_type='job_posting' — results include title, company, link, and status so you can give direct recommendations. For general knowledge search, omit source_type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural-language description of what to find. For job matching, describe skills/interests/role type, e.g. 'senior AI engineer LLM tooling small team ownership'"},
                    "limit": {"type": "integer", "description": "Max results, default 8"},
                    "source_type": {"type": "string", "description": "Filter to one source: 'job_posting', 'vault', or 'note'. Omit to search everything."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_shell",
            "description": "Run a shell command. Default cwd is /repo (the personal writing site). For AI OS repo commands (builds, git) use cwd=/aios. E.g. cd /aios/aios/frontend && npm run build.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run"},
                    "cwd": {"type": "string", "description": "Working directory, defaults to /repo. Use /aios for AI OS repo operations."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Search for a string across AI OS source files (aios/, frontend/, docker-compose.yml, etc). Faster than run_shell grep. Returns matching files and line-level matches. Use before editing to find the right file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "String or pattern to search for"},
                    "subdir": {"type": "string", "description": "Subdirectory to limit search to, e.g. 'aios/frontend/src'. Defaults to entire repo."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "HTTP GET a URL and return the text content. Use for: reading docs, checking APIs, fetching web pages for research.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch"},
                },
                "required": ["url"],
            },
        },
    },
]


def _new_id() -> str:
    return secrets.token_hex(8)


async def _tool_upsert_company(inputs, pool):
            cid, created = await intake.find_or_create_company(pool, inputs["name"], inputs.get("website"))
            return json.dumps({"id": cid, "created": created})


async def _tool_upsert_contact(inputs, pool):
            row = await pool.fetchrow(
                "SELECT id FROM contacts WHERE lower(name) = lower($1) AND company_id = $2",
                inputs["name"], inputs["company_id"],
            )
            if row:
                return json.dumps({"id": row["id"], "created": False})
            cid = _new_id()
            await pool.execute(
                "INSERT INTO contacts (id, name, company_id, role, source, stage, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                cid, inputs["name"], inputs["company_id"],
                inputs.get("role"), inputs.get("source"),
                inputs.get("stage", "Outreached"), inputs.get("notes"),
            )
            return json.dumps({"id": cid, "created": True})


async def _tool_upsert_job_posting(inputs, pool):
            jid, created, _existing = await intake.find_or_create_job_posting(
                pool, inputs["company_id"], inputs["title"],
                link=inputs.get("link"), source=inputs.get("source"),
                status=inputs.get("status", "new"), resume_path=inputs.get("resume_path"),
            )
            if not created:
                status = inputs.get("status")
                resume_path = inputs.get("resume_path")
                if status or resume_path:
                    await pool.execute(
                        "UPDATE job_postings SET status = COALESCE($2, status), resume_path = COALESCE($3, resume_path) WHERE id = $1",
                        jid, status, resume_path,
                    )
            return json.dumps({"id": jid, "created": created})


async def _tool_update_stage(inputs, pool):
            await pool.execute("UPDATE contacts SET stage = $2 WHERE id = $1", inputs["contact_id"], inputs["stage"])
            return json.dumps({"ok": True})


async def _tool_log_interaction(inputs, pool):
            iid = _new_id()
            await pool.execute(
                "INSERT INTO interactions (id, contact_id, direction, notes) VALUES ($1,$2,$3,$4)",
                iid, inputs["contact_id"], inputs["direction"], inputs.get("notes"),
            )
            return json.dumps({"id": iid})


async def _tool_log_content_post(inputs, pool):
            pid = _new_id()
            await pool.execute(
                "INSERT INTO content_posts (id, content, impressions, engagements, comments) VALUES ($1,$2,$3,$4,$5)",
                pid, inputs["content"],
                inputs.get("impressions", 0), inputs.get("engagements", 0), inputs.get("comments", 0),
            )
            return json.dumps({"id": pid})


async def _tool_search_notes(inputs, pool):
            rows = await pool.fetch(
                "SELECT id, category, title, url, content FROM notes "
                "WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) "
                "@@ plainto_tsquery('english', $1) LIMIT 20",
                inputs["query"],
            )
            return json.dumps([dict(r) for r in rows])


async def _tool_query_db(inputs, pool):
            sql = inputs["sql"].strip()
            sql_upper = sql.upper()
            forbidden = ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE")
            if not sql_upper.startswith("SELECT") or ";" in sql or any(f" {kw} " in f" {sql_upper} " for kw in forbidden):
                return json.dumps({"error": "Only simple SELECT queries allowed (no semicolons, no DML/DDL)"})
            rows = await pool.fetch(sql)
            return json.dumps([dict(r) for r in rows], default=str)


async def _tool_update_lead_status(inputs, pool):
            row = await pool.fetchrow(
                "UPDATE job_postings SET status = $2 WHERE id = $1 RETURNING id",
                inputs["lead_id"], inputs["status"],
            )
            if not row:
                return json.dumps({"error": "Lead not found"})
            return json.dumps({"ok": True, "id": row["id"], "status": inputs["status"]})


async def _tool_get_scraper_settings(inputs, pool):
            from workers.scrapers.jobspy_scraper import DEFAULT_CONFIG, SOURCE_KEY
            defaults_by_source = {SOURCE_KEY: DEFAULT_CONFIG}
            source = inputs["source"]
            if source not in defaults_by_source:
                return json.dumps({"error": f"Unknown source: {source}"})
            row = await pool.fetchrow(
                "SELECT config, updated_at FROM scraper_settings WHERE source = $1", source,
            )
            if not row:
                return json.dumps({"source": source, "config": defaults_by_source[source], "is_default": True})
            cfg = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"])
            merged = {**defaults_by_source[source], **(cfg or {})}
            return json.dumps({"source": source, "config": merged, "is_default": False, "updated_at": str(row["updated_at"])})


async def _tool_update_scraper_settings(inputs, pool):
            from workers.scrapers.jobspy_scraper import DEFAULT_CONFIG, SOURCE_KEY
            defaults_by_source = {SOURCE_KEY: DEFAULT_CONFIG}
            source = inputs["source"]
            if source not in defaults_by_source:
                return json.dumps({"error": f"Unknown source: {source}"})
            merged = {**defaults_by_source[source], **(inputs.get("config") or {})}
            await pool.execute(
                """
                INSERT INTO scraper_settings (source, config, updated_at)
                VALUES ($1, $2::jsonb, now())
                ON CONFLICT (source) DO UPDATE
                  SET config = EXCLUDED.config, updated_at = now()
                """,
                source, json.dumps(merged),
            )
            return json.dumps({"ok": True, "source": source, "config": merged})


async def _tool_read_notes(inputs, pool):
            limit = inputs.get("limit", 20)
            rows = await pool.fetch(
                "SELECT content, created_at FROM notes ORDER BY created_at DESC LIMIT $1",
                limit,
            )
            result = [{"content": r["content"], "date": str(r["created_at"])} for r in rows]
            return json.dumps(result, default=str)


async def _tool_read_essays(inputs, pool):
            limit = inputs.get("limit", 5)
            from config import settings
            essays = []
            try:
                essays_dir = Path(settings.writing_dir) / "content" / "essays"
                md_files = sorted(essays_dir.rglob("*.md")) if essays_dir.exists() else []
                for fpath in md_files[-limit:]:
                    content = fpath.read_text(encoding="utf-8")[:3000]
                    essays.append({"filename": str(fpath.relative_to(settings.writing_dir)), "preview": content})
            except Exception as e:
                essays = [{"error": str(e)}]
            return json.dumps(essays)


async def _tool_read_code_file(inputs, pool):
            from config import settings as app_settings
            rel_path = inputs.get("path", "").lstrip("/")
            base = Path(app_settings.aios_repo_dir).resolve()
            target = (base / rel_path).resolve()
            if not str(target).startswith(str(base) + "/") and target != base:
                result = {"error": "Access denied: path outside aios repo"}
            elif not target.exists():
                # Try to give a helpful hint about what files exist nearby
                result = {"error": f"File not found: {rel_path}. Use list_code_files to explore."}
            else:
                lines = target.read_text().splitlines()
                offset = inputs.get("offset", 0)
                limit = inputs.get("limit", 500)
                sliced = lines[offset:offset + limit]
                numbered = "\n".join(f"{offset + i + 1}|{l}" for i, l in enumerate(sliced))
                result = {"path": rel_path, "content": numbered, "total_lines": len(lines), "shown": len(sliced)}
            return json.dumps(result)


async def _tool_edit_code_file(inputs, pool):
            from config import settings as app_settings
            rel_path = inputs.get("path", "").lstrip("/")
            base = Path(app_settings.aios_repo_dir).resolve()
            target = (base / rel_path).resolve()
            if not str(target).startswith(str(base) + "/") and target != base:
                result = {"error": "Access denied: path outside aios repo"}
            elif not target.exists():
                result = {"error": f"File not found: {rel_path}"}
            else:
                old_str = inputs.get("old_string", "")
                new_str = inputs.get("new_string", "")
                content = target.read_text()
                count = content.count(old_str)
                if count == 0:
                    result = {"error": "old_string not found in file. Use read_code_file first to verify exact content."}
                elif count > 1:
                    result = {"error": f"old_string appears {count} times — add more surrounding context to make it unique"}
                else:
                    target.write_text(content.replace(old_str, new_str, 1))
                    result = {"ok": True, "path": rel_path, "message": "Edit applied"}
            return json.dumps(result)


async def _tool_git_commit_and_push(inputs, pool):
            import subprocess
            from config import settings as app_settings

            repo_root = Path(app_settings.aios_repo_dir)
            aios_base = repo_root / "aios"
            msg = inputs.get("message", "agent edit")
            files = inputs.get("files", [])

            env = {
                **os.environ,
                "GIT_AUTHOR_NAME": app_settings.git_author_name,
                "GIT_AUTHOR_EMAIL": app_settings.git_author_email,
                "GIT_COMMITTER_NAME": app_settings.git_author_name,
                "GIT_COMMITTER_EMAIL": app_settings.git_author_email,
            }

            try:
                if files:
                    for f in files:
                        rel = repo_root / f.lstrip("/")
                        subprocess.run(["git", "add", str(rel)], cwd=repo_root, check=True, env=env)
                else:
                    subprocess.run(["git", "add", "-u"], cwd=repo_root, check=True, env=env)

                status = subprocess.run(["git", "status", "--porcelain"], cwd=repo_root, capture_output=True, text=True, env=env)
                if not status.stdout.strip():
                    result = {"ok": False, "message": "Nothing to commit"}
                else:
                    subprocess.run(["git", "commit", "-m", msg], cwd=repo_root, check=True, env=env)
                    push_result = subprocess.run(
                        ["git", "push", "private", "master"],
                        cwd=repo_root, capture_output=True, text=True, env=env,
                    )
                    subprocess.run(
                        ["git", "push", "origin", "master"],
                        cwd=repo_root, capture_output=True, text=True, env=env,
                    )
                    if push_result.returncode != 0:
                        result = {"ok": False, "error": push_result.stderr}
                    else:
                        result = {"ok": True, "message": f"Committed and pushed: {msg}"}
            except subprocess.CalledProcessError as e:
                result = {"error": str(e)}
            return json.dumps(result)


async def _tool_list_code_files(inputs, pool):
            from config import settings as app_settings
            base = Path(app_settings.aios_repo_dir).resolve()
            subdir = inputs.get("subdir", "").lstrip("/")
            target = (base / subdir).resolve() if subdir else base
            if not str(target).startswith(str(base)):
                result = {"error": "Access denied"}
            elif not target.exists():
                result = {"error": f"Directory not found: {subdir or '(root)'}"}
            else:
                files = []
                for p in sorted(target.rglob("*")):
                    if p.is_file() and not any(part.startswith(".") for part in p.parts) and "__pycache__" not in str(p) and "node_modules" not in str(p):
                        files.append(str(p.relative_to(base)))
                result = {"files": files}
            return json.dumps(result)


async def _tool_search_files(inputs, pool):
            import subprocess
            from config import settings as app_settings
            base = Path(app_settings.aios_repo_dir).resolve()
            query = inputs.get("query", "")
            subdir = inputs.get("subdir", "").lstrip("/")
            search_root = (base / subdir).resolve() if subdir else base
            if not str(search_root).startswith(str(base)):
                result = {"error": "Access denied"}
            else:
                # Use grep for content search
                try:
                    out = subprocess.run(
                        ["grep", "-rn", "--include=*.py", "--include=*.tsx", "--include=*.ts",
                         "--include=*.md", "--include=*.yml", "--include=*.yaml",
                         "-l", query, str(search_root)],
                        capture_output=True, text=True, timeout=15,
                    )
                    matching_files = [
                        str(Path(f).relative_to(base))
                        for f in out.stdout.strip().splitlines() if f
                    ]
                    # Also get line-level matches (max 30 lines)
                    out2 = subprocess.run(
                        ["grep", "-rn", "--include=*.py", "--include=*.tsx", "--include=*.ts",
                         "--include=*.md", "--include=*.yml", "--include=*.yaml",
                         query, str(search_root)],
                        capture_output=True, text=True, timeout=15,
                    )
                    raw_matches = out2.stdout.strip().splitlines()[:30]
                    matches = [
                        m.replace(str(search_root) + "/", "", 1).replace(str(base) + "/", "", 1)
                        for m in raw_matches
                    ]
                    result = {"files": matching_files, "matches": matches, "total_matches": len(out2.stdout.strip().splitlines())}
                except subprocess.TimeoutExpired:
                    result = {"error": "Search timed out"}
            return json.dumps(result)


async def _tool_add_outreach_contact(inputs, pool):
            from services import okf_db
            okf_db.init()
            contact = okf_db.create_outreach_contact({
                "name": inputs["name"],
                "company": inputs.get("company", ""),
                "linkedin_url": inputs.get("linkedin_url", ""),
                "message_sent": inputs.get("message_sent", ""),
                "status": inputs.get("status", "sent"),
                "notes": inputs.get("notes", ""),
            })
            return json.dumps({"ok": True, "contact": contact})


async def _tool_update_outreach_contact(inputs, pool):
            from services import okf_db
            okf_db.init()
            match = okf_db.get_outreach_contact(inputs["contact_id"])
            if not match:
                return json.dumps({"error": "Contact not found"})
            updated = okf_db.update_outreach_contact(inputs["contact_id"], {
                "name": match["name"],
                "company": match.get("company", ""),
                "linkedin_url": match.get("linkedin_url", ""),
                "message_sent": match.get("message_sent", ""),
                "status": inputs["status"],
                "notes": inputs.get("notes", match.get("notes", "")),
            })
            return json.dumps({"ok": True, "contact": updated})


async def _tool_list_outreach_contacts(inputs, pool):
            from services import okf_db
            okf_db.init()
            contacts = okf_db.list_outreach_contacts(
                limit=inputs.get("limit", 30),
                status=inputs.get("status"),
            )
            return json.dumps(contacts, default=str)


async def _tool_get_outreach_stats(inputs, pool):
            from services import okf_db
            okf_db.init()
            return json.dumps(okf_db.get_outreach_stats())


async def _tool_get_outreach_retro(inputs, pool):
            from services import okf_db
            okf_db.init()
            return json.dumps(okf_db.get_weekly_retro(inputs.get("weeks", 4)), default=str)


async def _tool_list_skills(inputs, pool):
            skills_dir = Path(__file__).parent / "prompts" / "skills"
            skills = []
            if skills_dir.exists():
                for f in sorted(skills_dir.glob("*.md")):
                    if f.name.startswith("STANDARD"):
                        continue  # skip the meta doc
                    content = f.read_text()
                    # Parse YAML frontmatter if present
                    name_val = f.stem
                    desc_val = ""
                    tags_val = []
                    if content.startswith("---"):
                        end = content.find("---", 3)
                        if end > 0:
                            fm = content[3:end]
                            for line in fm.splitlines():
                                if line.startswith("name:"):
                                    name_val = line.split(":", 1)[1].strip()
                                elif line.startswith("description:"):
                                    desc_val = line.split(":", 1)[1].strip()
                                elif line.startswith("tags:"):
                                    tags_val = [t.strip(" []'\"") for t in line.split(":", 1)[1].split(",")]
                    skills.append({"name": name_val, "description": desc_val, "tags": tags_val, "path": f"prompts/skills/{f.name}"})
            return json.dumps({"skills": skills})


async def _tool_read_memory(inputs, pool):
            from config import settings
            memory_dir = Path(settings.data_dir) / "memory"
            mem_type = inputs.get("type", "general")

            if mem_type == "user":
                f = memory_dir / "USER.md"
                content = f.read_text().strip() if f.exists() else "USER.md is empty — nothing recorded yet."
                return json.dumps({"type": "user", "content": content})

            elif mem_type == "general":
                f = memory_dir / "MEMORY.md"
                content = f.read_text().strip() if f.exists() else "MEMORY.md is empty — nothing recorded yet."
                return json.dumps({"type": "general", "content": content})

            elif mem_type == "sessions":
                sessions_dir = memory_dir / "sessions"
                limit = inputs.get("limit", 10)
                sessions = []
                if sessions_dir.exists():
                    for f in sorted(sessions_dir.glob("*.md"), reverse=True)[:limit]:
                        text = f.read_text()
                        first_line = text.splitlines()[0] if text else ""
                        sessions.append({"filename": f.name, "title": first_line.lstrip("# ")})
                return json.dumps({"sessions": sessions})


async def _tool_append_memory(inputs, pool):
            from config import settings
            from datetime import datetime
            memory_dir = Path(settings.data_dir) / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)

            mem_type = inputs.get("type", "general")
            content = inputs.get("content", "").strip()
            if not content:
                return json.dumps({"error": "content is required"})

            fname = "USER.md" if mem_type == "user" else "MEMORY.md"
            f = memory_dir / fname
            timestamp = datetime.utcnow().strftime("%Y-%m-%d")
            entry = f"\n- [{timestamp}] {content}"
            with open(f, "a") as fp:
                fp.write(entry)
            return json.dumps({"ok": True, "appended_to": fname})


async def _tool_save_session_summary(inputs, pool):
            from config import settings
            from datetime import datetime
            memory_dir = Path(settings.data_dir) / "memory"
            sessions_dir = memory_dir / "sessions"
            sessions_dir.mkdir(parents=True, exist_ok=True)

            title = inputs.get("title", "Session").strip()
            summary = inputs.get("summary", "").strip()
            if not summary:
                return json.dumps({"error": "summary is required"})

            timestamp = datetime.utcnow().strftime("%Y-%m-%d-%H%M")
            safe_title = "".join(c if c.isalnum() or c in " -" else "" for c in title).strip().replace(" ", "-")[:50]
            fname = f"{timestamp}-{safe_title}.md"
            content = f"# {title}\n\n{summary}\n"
            (sessions_dir / fname).write_text(content)
            return json.dumps({"ok": True, "saved_to": f"sessions/{fname}"})


async def _tool_semantic_search(inputs, pool):
            from services import embeddings as emb_svc
            query = inputs.get("query", "").strip()
            limit = inputs.get("limit", 8)
            source_type = inputs.get("source_type") or None  # e.g. "job_posting", "vault", "note"
            if not query:
                return json.dumps({"error": "query is required"})
            results = await emb_svc.search(pool, query, limit, source_type=source_type)
            # Enrich job_posting results with title / company / link / status
            job_ids = [r["source_id"] for r in results if r["source_type"] == "job_posting"]
            if job_ids:
                rows = await pool.fetch(
                    """
                    SELECT j.id, j.title, j.link, j.status, j.location, c.name AS company
                    FROM job_postings j
                    LEFT JOIN companies c ON j.company_id = c.id
                    WHERE j.id = ANY($1)
                    """,
                    job_ids,
                )
                job_meta = {r["id"]: dict(r) for r in rows}
                for r in results:
                    if r["source_type"] == "job_posting":
                        r.update(job_meta.get(r["source_id"], {}))
            return json.dumps({"results": results}, default=str)


async def _tool_run_shell(inputs, pool):
            import subprocess
            from config import settings as _s
            command = inputs.get("command", "").strip()
            if not command:
                return json.dumps({"error": "command is required"})
            cwd = inputs.get("cwd") or getattr(_s, "writing_dir", "/repo")
            try:
                proc = subprocess.run(
                    command,
                    shell=True,
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                    env={**os.environ, "GIT_AUTHOR_NAME": getattr(_s, "git_author_name", "Ima"), "GIT_AUTHOR_EMAIL": getattr(_s, "git_author_email", "ima@aios"), "GIT_COMMITTER_NAME": getattr(_s, "git_author_name", "Ima"), "GIT_COMMITTER_EMAIL": getattr(_s, "git_author_email", "ima@aios")},
                )
                stdout = proc.stdout[-8000:] if len(proc.stdout) > 8000 else proc.stdout
                stderr = proc.stderr[-2000:] if len(proc.stderr) > 2000 else proc.stderr
                return json.dumps({"ok": proc.returncode == 0, "exit_code": proc.returncode, "stdout": stdout, "stderr": stderr})
            except subprocess.TimeoutExpired:
                return json.dumps({"ok": False, "error": "Timed out after 120s"})
            except Exception as exc:
                return json.dumps({"ok": False, "error": str(exc)})


async def _tool_fetch_url(inputs, pool):
            import httpx
            from bs4 import BeautifulSoup
            url = inputs.get("url", "").strip()
            if not url:
                return json.dumps({"error": "url is required"})
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                soup = BeautifulSoup(r.text, "html.parser")
                text = soup.get_text(separator="\n", strip=True)
                text = text[:10000] if len(text) > 10000 else text
                return json.dumps({"ok": True, "status": r.status_code, "content": text})
            except Exception as exc:
                return json.dumps({"ok": False, "error": str(exc)})


_TOOL_HANDLERS = {
    "upsert_company": _tool_upsert_company,
    "upsert_contact": _tool_upsert_contact,
    "upsert_job_posting": _tool_upsert_job_posting,
    "update_stage": _tool_update_stage,
    "log_interaction": _tool_log_interaction,
    "log_content_post": _tool_log_content_post,
    "search_notes": _tool_search_notes,
    "query_db": _tool_query_db,
    "update_lead_status": _tool_update_lead_status,
    "get_scraper_settings": _tool_get_scraper_settings,
    "update_scraper_settings": _tool_update_scraper_settings,
    "read_notes": _tool_read_notes,
    "read_essays": _tool_read_essays,
    "read_code_file": _tool_read_code_file,
    "edit_code_file": _tool_edit_code_file,
    "git_commit_and_push": _tool_git_commit_and_push,
    "list_code_files": _tool_list_code_files,
    "search_files": _tool_search_files,
    "add_outreach_contact": _tool_add_outreach_contact,
    "update_outreach_contact": _tool_update_outreach_contact,
    "list_outreach_contacts": _tool_list_outreach_contacts,
    "get_outreach_stats": _tool_get_outreach_stats,
    "get_outreach_retro": _tool_get_outreach_retro,
    "list_skills": _tool_list_skills,
    "read_memory": _tool_read_memory,
    "append_memory": _tool_append_memory,
    "save_session_summary": _tool_save_session_summary,
    "semantic_search": _tool_semantic_search,
    "run_shell": _tool_run_shell,
    "fetch_url": _tool_fetch_url,
}


async def run_tool(name: str, inputs: dict, pool: asyncpg.Pool) -> str:
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        return await handler(inputs, pool)
    except Exception as e:
        return json.dumps({"error": str(e)})


async def agentic_stream(messages: list, pool: asyncpg.Pool) -> AsyncIterator[str]:
    current_messages = [{"role": "system", "content": _load_instructions()}] + list(messages)

    try:
        while True:
            text_content = ""
            tool_calls_acc: dict[int, dict] = {}

            response = await litellm.acompletion(
                model="deepseek/deepseek-chat",
                messages=current_messages,
                tools=TOOLS,
                stream=True,
            )

            async for chunk in response:
                choice = chunk.choices[0]
                delta = choice.delta

                if delta.content:
                    text_content += delta.content
                    yield f"data: {json.dumps({'type': 'text-delta', 'payload': {'text': delta.content}})}\n\n"

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_acc[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_acc[idx]["arguments"] += tc.function.arguments

            if not tool_calls_acc:
                yield "data: [DONE]\n\n"
                return

            tool_calls_list = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]

            assistant_msg: dict = {"role": "assistant", "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                for tc in tool_calls_list
            ]}
            if text_content:
                assistant_msg["content"] = text_content
            current_messages.append(assistant_msg)

            tool_results = []
            for tc in tool_calls_list:
                try:
                    args = json.loads(tc["arguments"])
                except json.JSONDecodeError:
                    args = {}
                yield f"data: {json.dumps({'type': 'tool-call', 'payload': {'toolCallId': tc['id'], 'toolName': tc['name'], 'args': args}})}\n\n"
                result = await run_tool(tc["name"], args, pool)
                yield f"data: {json.dumps({'type': 'tool-result', 'payload': {'toolCallId': tc['id'], 'result': result}})}\n\n"
                tool_results.append({"role": "tool", "tool_call_id": tc["id"], "content": result})

            current_messages.extend(tool_results)

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'payload': {'message': str(e)}})}\n\n"
        yield "data: [DONE]\n\n"
