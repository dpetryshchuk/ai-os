import json
import os
from typing import AsyncIterator

import anthropic
import asyncpg


INSTRUCTIONS = """You are a job search CRM assistant. Help the user manage their job search pipeline.

You have access to tools to:
- Upsert companies and contacts
- Track job postings and applications
- Log interactions
- Update pipeline stages
- Search and manage notes
- Query the database directly

Rules:
- Always call upsert_company first before creating contacts or job postings
- Never create duplicates — tools search before inserting
- When logging a reply, first use query_db to find the contact
- Stage values: Outreached → Responded → Ongoing → Dead
"""

TOOLS = [
    {
        "name": "upsert_company",
        "description": "Find or create a company by name. Returns company id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "website": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "upsert_contact",
        "description": "Find or create a contact at a company.",
        "input_schema": {
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
    {
        "name": "upsert_job_posting",
        "description": "Find or create a job posting.",
        "input_schema": {
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
    {
        "name": "update_stage",
        "description": "Update the pipeline stage for a contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "stage": {"type": "string", "enum": ["Outreached", "Responded", "Ongoing", "Dead"]},
            },
            "required": ["contact_id", "stage"],
        },
    },
    {
        "name": "log_interaction",
        "description": "Log an interaction with a contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "direction": {"type": "string", "enum": ["out", "in"]},
                "notes": {"type": "string"},
            },
            "required": ["contact_id", "direction"],
        },
    },
    {
        "name": "log_content_post",
        "description": "Log a LinkedIn/social media content post.",
        "input_schema": {
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
    {
        "name": "search_notes",
        "description": "Full-text search across notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "query_db",
        "description": "Run a read-only SQL SELECT query against the database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {"type": "string"},
            },
            "required": ["sql"],
        },
    },
]


def _new_id() -> str:
    import secrets
    return secrets.token_hex(8)


async def run_tool(name: str, inputs: dict, pool: asyncpg.Pool) -> str:
    try:
        if name == "upsert_company":
            company_name = inputs["name"]
            website = inputs.get("website")
            row = await pool.fetchrow("SELECT id FROM companies WHERE lower(name) = lower($1)", company_name)
            if row:
                return json.dumps({"id": row["id"], "created": False})
            cid = _new_id()
            await pool.execute(
                "INSERT INTO companies (id, name, website) VALUES ($1, $2, $3)",
                cid, company_name, website,
            )
            return json.dumps({"id": cid, "created": True})

        elif name == "upsert_contact":
            cname = inputs["name"]
            company_id = inputs["company_id"]
            row = await pool.fetchrow(
                "SELECT id FROM contacts WHERE lower(name) = lower($1) AND company_id = $2",
                cname, company_id,
            )
            if row:
                return json.dumps({"id": row["id"], "created": False})
            cid = _new_id()
            await pool.execute(
                "INSERT INTO contacts (id, name, company_id, role, source, stage, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                cid, cname, company_id,
                inputs.get("role"), inputs.get("source"),
                inputs.get("stage", "Outreached"), inputs.get("notes"),
            )
            return json.dumps({"id": cid, "created": True})

        elif name == "upsert_job_posting":
            title = inputs["title"]
            company_id = inputs["company_id"]
            link = inputs.get("link")
            row = await pool.fetchrow(
                "SELECT id FROM job_postings WHERE company_id = $1 AND lower(title) = lower($2)",
                company_id, title,
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
                jid, company_id, title, link,
                inputs.get("source"), inputs.get("status", "new"), inputs.get("resume_path"),
            )
            return json.dumps({"id": jid, "created": True})

        elif name == "update_stage":
            await pool.execute(
                "UPDATE contacts SET stage = $2 WHERE id = $1",
                inputs["contact_id"], inputs["stage"],
            )
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
                "SELECT id, category, title, url, content FROM notes WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(url,'')) @@ plainto_tsquery('english', $1) LIMIT 20",
                inputs["query"],
            )
            return json.dumps([dict(r) for r in rows])

        elif name == "query_db":
            sql = inputs["sql"].strip()
            if not sql.upper().startswith("SELECT"):
                return json.dumps({"error": "Only SELECT queries allowed"})
            rows = await pool.fetch(sql)
            return json.dumps([dict(r) for r in rows], default=str)

        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


async def agentic_stream(
    messages: list,
    pool: asyncpg.Pool,
    anthropic_client: anthropic.AsyncAnthropic,
) -> AsyncIterator[str]:
    current_messages = list(messages)

    while True:
        async with anthropic_client.messages.stream(
            model="claude-opus-4-7",
            max_tokens=4096,
            system=INSTRUCTIONS,
            messages=current_messages,
            tools=TOOLS,
        ) as stream:
            tool_uses = []
            async for event in stream:
                if (
                    event.type == "content_block_delta"
                    and event.delta.type == "text_delta"
                ):
                    yield f"data: {json.dumps({'type': 'text-delta', 'payload': {'text': event.delta.text}})}\n\n"
                elif event.type == "content_block_start" and hasattr(event.content_block, "type") and event.content_block.type == "tool_use":
                    tool_uses.append({
                        "id": event.content_block.id,
                        "name": event.content_block.name,
                        "input": "",
                    })
                elif event.type == "content_block_delta" and event.delta.type == "input_json_delta":
                    if tool_uses:
                        tool_uses[-1]["input"] += event.delta.partial_json

            final = await stream.get_final_message()

        if final.stop_reason == "end_turn":
            yield "data: [DONE]\n\n"
            return

        if final.stop_reason == "tool_use":
            content_list = []
            for block in final.content:
                if hasattr(block, "type") and block.type == "text":
                    content_list.append({"type": "text", "text": block.text})
                elif hasattr(block, "type") and block.type == "tool_use":
                    content_list.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            current_messages.append({"role": "assistant", "content": content_list})

            tool_results = []
            for block in final.content:
                if not (hasattr(block, "type") and block.type == "tool_use"):
                    continue
                tool_name = block.name
                tool_input = block.input
                tool_id = block.id

                yield f"data: {json.dumps({'type': 'tool-call', 'payload': {'toolCallId': tool_id, 'toolName': tool_name, 'args': tool_input}})}\n\n"

                result = await run_tool(tool_name, tool_input, pool)

                yield f"data: {json.dumps({'type': 'tool-result', 'payload': {'toolCallId': tool_id, 'toolName': tool_name, 'result': result}})}\n\n"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result,
                })

            current_messages.append({"role": "user", "content": tool_results})
