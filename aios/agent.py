import json
import os
import secrets
from typing import AsyncIterator

import asyncpg
import litellm

INSTRUCTIONS = """You are Jobby, the user's job-search CRM assistant.

Your job is to capture complete, accurate information before writing to the
database. Do NOT call write tools (upsert_*, log_*, update_*) until you have
every required field — and ideally the useful optional ones too.

How to operate:

1. ONE QUESTION AT A TIME.
   When the user mentions an event ("emailed someone", "got a reply",
   "applied somewhere", "had a call", "saw a posting"), drive a short
   interview. Ask one focused question per turn until you have everything.
   Prefer multiple-choice / short options. Example:
     "Got a reply from who?
      (a) name them
      (b) you don't remember yet — let's check the recent outreach list"

2. SEARCH BEFORE INSERT.
   Before creating any contact, company, or posting, use query_db or
   search_notes to check for an existing record. Never create duplicates —
   if a near-match exists, surface it and ask the user to confirm.

3. RESTATE BEFORE WRITING.
   Right before any write tool, summarize the action in one short line and
   wait for explicit confirmation, unless the user already gave it. Example:
     "About to log: outbound email to Jane Doe at Acme (CTO, source LinkedIn),
      stage Outreached. Confirm?"

4. DON'T FABRICATE.
   If you don't know a field (role, company website, source, link), ASK.
   Empty is better than wrong. Never guess emails, URLs, or names.

5. STAGE TRANSITIONS: Outreached → Responded → Ongoing → Dead.
   "They replied" → find the contact via query_db, then propose moving them
   to Responded and confirm.
   "They went silent" / "no longer interested" → propose Dead and confirm.

6. LEAD STATUS: new → applied / dropped.
   When the user wants to dismiss a lead ("not interested", "skip that one"),
   use update_lead_status with status='dropped' — DO NOT delete. Dropped
   leads are excluded from re-scrapes, so this is how we prune.

7. SCRAPER TUNING.
   When the user wants to change what gets scraped ("stop showing me senior
   roles", "add staff engineer to the skip list", "look for ML engineer too"):
   a) call get_scraper_settings(source='jobspy_sd')
   b) propose the exact edit (which array, what to add/remove)
   c) confirm with the user
   d) call update_scraper_settings with the FULL new config

8. KEEP PROSE SHORT.
   One question per turn. No long explanations unless asked. After each
   write, give a one-line confirmation and stop.
"""

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
]


def _new_id() -> str:
    return secrets.token_hex(8)


async def run_tool(name: str, inputs: dict, pool: asyncpg.Pool) -> str:
    try:
        if name == "upsert_company":
            row = await pool.fetchrow("SELECT id FROM companies WHERE lower(name) = lower($1)", inputs["name"])
            if row:
                return json.dumps({"id": row["id"], "created": False})
            cid = _new_id()
            await pool.execute("INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)", cid, inputs["name"], inputs.get("website"))
            return json.dumps({"id": cid, "created": True})

        elif name == "upsert_contact":
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

        elif name == "upsert_job_posting":
            row = await pool.fetchrow(
                "SELECT id FROM job_postings WHERE company_id = $1 AND lower(title) = lower($2)",
                inputs["company_id"], inputs["title"],
            )
            if row:
                jid = row["id"]
                status = inputs.get("status")
                resume_path = inputs.get("resume_path")
                if status or resume_path:
                    await pool.execute(
                        "UPDATE job_postings SET status = COALESCE($2, status), resume_path = COALESCE($3, resume_path) WHERE id = $1",
                        jid, status, resume_path,
                    )
                return json.dumps({"id": jid, "created": False})
            jid = _new_id()
            await pool.execute(
                "INSERT INTO job_postings (id, company_id, title, link, source, status, resume_path) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                jid, inputs["company_id"], inputs["title"], inputs.get("link"),
                inputs.get("source"), inputs.get("status", "new"), inputs.get("resume_path"),
            )
            return json.dumps({"id": jid, "created": True})

        elif name == "update_stage":
            await pool.execute("UPDATE contacts SET stage = $2 WHERE id = $1", inputs["contact_id"], inputs["stage"])
            return json.dumps({"ok": True})

        elif name == "log_interaction":
            iid = _new_id()
            await pool.execute(
                "INSERT INTO interactions (id, contact_id, direction, notes) VALUES ($1,$2,$3,$4)",
                iid, inputs["contact_id"], inputs["direction"], inputs.get("notes"),
            )
            return json.dumps({"id": iid})

        elif name == "log_content_post":
            pid = _new_id()
            await pool.execute(
                "INSERT INTO content_posts (id, content, impressions, engagements, comments) VALUES ($1,$2,$3,$4,$5)",
                pid, inputs["content"],
                inputs.get("impressions", 0), inputs.get("engagements", 0), inputs.get("comments", 0),
            )
            return json.dumps({"id": pid})

        elif name == "search_notes":
            rows = await pool.fetch(
                "SELECT id, category, title, url, content FROM notes "
                "WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) "
                "@@ plainto_tsquery('english', $1) LIMIT 20",
                inputs["query"],
            )
            return json.dumps([dict(r) for r in rows])

        elif name == "query_db":
            sql = inputs["sql"].strip()
            if not sql.upper().startswith("SELECT"):
                return json.dumps({"error": "Only SELECT queries allowed"})
            rows = await pool.fetch(sql)
            return json.dumps([dict(r) for r in rows], default=str)

        elif name == "update_lead_status":
            row = await pool.fetchrow(
                "UPDATE job_postings SET status = $2 WHERE id = $1 RETURNING id",
                inputs["lead_id"], inputs["status"],
            )
            if not row:
                return json.dumps({"error": "Lead not found"})
            return json.dumps({"ok": True, "id": row["id"], "status": inputs["status"]})

        elif name == "get_scraper_settings":
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

        elif name == "update_scraper_settings":
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

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


async def agentic_stream(messages: list, pool: asyncpg.Pool) -> AsyncIterator[str]:
    current_messages = [{"role": "system", "content": INSTRUCTIONS}] + list(messages)

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
