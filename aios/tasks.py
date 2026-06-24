from datetime import datetime
from typing import Callable

from celery import Celery
from celery.schedules import crontab

from config import settings
from db import SyncSession
from models import OsEvent

celery_app = Celery("aios", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.timezone = "UTC"

# ── Import workers lazily to avoid circular imports ───────────────────────────

def _import_handlers() -> dict[str, Callable]:
    from workers.scrapers.fathom import run as fathom_run
    from workers.scrapers.supadata_transcript import run as supadata_run
    from workers.scrapers.local_events import run as events_run
    from workers.scrapers.jobspy_scraper import run as sd_run
    from workers.scrapers.yc import run as yc_run
    from workers.scrapers.hn import run as hn_run

    return {
        "fathom.received": fathom_run,
        "supadata.transcript": supadata_run,
        "local_events.pull": events_run,
        "scrape.sd": sd_run,
        "scrape.yc": yc_run,
        "scrape.hn": hn_run,
        "embed.backfill": lambda payload, session: embed_backfill(),
        "embed.vault": lambda payload, session: embed_vault(),
    }


# ── Core Celery tasks ─────────────────────────────────────────────────────────

@celery_app.task(name="events.process")
def process_event(event_id: str) -> None:
    with SyncSession() as session:
        event = session.get(OsEvent, event_id)
        if not event:
            return
        event.status = "processing"
        event.started_at = datetime.utcnow()
        session.commit()
        try:
            handlers = _import_handlers()
            handler = handlers.get(event.type)
            if handler:
                payload = event.payload or {}
                result = handler(payload, session)
                if result is not None:
                    event.payload = {**(event.payload or {}), "result": result}
            else:
                raise ValueError(f"No handler for event type: {event.type}")
            event.status = "done"
        except Exception as exc:
            event.status = "failed"
            event.error = str(exc)
        finally:
            event.completed_at = datetime.utcnow()
            session.commit()


@celery_app.task(name="events.run_scheduled")
def run_scheduled(event_type: str) -> None:
    from events import emit_sync
    emit_sync(source="schedule", type=event_type)


# ── OKF: proposal generation ──────────────────────────────────────────────────


def _load_proposal_prompts() -> dict:
    import json as _json
    from pathlib import Path as _Path
    return _json.loads((_Path(__file__).parent / "prompts" / "proposal.json").read_text())


def _call_proposal_llm(prompts: dict, req_data: dict) -> dict:
    import json as _json
    import litellm as _litellm
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
    from services import okf_db as _okf_db
    from services import pandadoc as _pandadoc
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


# ── Beat schedule ─────────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    "scrape-sd-morning": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=8, minute=0),
        "args": ["scrape.sd"],
    },
    "scrape-sd-evening": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=20, minute=0),
        "args": ["scrape.sd"],
    },
    "scrape-yc-8am": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=8, minute=10),
        "args": ["scrape.yc"],
    },
    "scrape-hn-8am": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=8, minute=15),
        "args": ["scrape.hn"],
    },
    "embed-backfill-weekly": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Sunday 3am UTC
        "args": ["embed.backfill"],
    },
}


# ── Embedding tasks ───────────────────────────────────────────────────────────

@celery_app.task(name="embed.document")
def embed_document(source_type: str, source_id: str, text: str) -> None:
    """Embed a single document and upsert into the embeddings table."""
    import psycopg2
    from services.embeddings import upsert_sync

    if not text.strip():
        return

    conn = psycopg2.connect(settings.jobsearch_database_url)
    try:
        upsert_sync(conn, source_type, source_id, text)
    except Exception as e:
        # Don't crash the task queue if embeddings fail (e.g. no API key)
        print(f"embed_document failed for {source_type}/{source_id}: {e}")
    finally:
        conn.close()


@celery_app.task(name="embed.backfill")
def embed_backfill() -> dict:
    """Backfill embeddings for all existing notes and job postings."""
    import psycopg2
    from services.embeddings import upsert_sync

    conn = psycopg2.connect(settings.jobsearch_database_url)
    counts = {"notes": 0, "jobs": 0, "errors": 0}

    try:
        with conn.cursor() as cur:
            # Notes
            cur.execute("SELECT id, COALESCE(title,'') || ' ' || COALESCE(content,'') FROM notes WHERE content IS NOT NULL")
            notes = cur.fetchall()

        for note_id, text in notes:
            if not text.strip():
                continue
            try:
                upsert_sync(conn, "note", note_id, text)
                counts["notes"] += 1
            except Exception as e:
                counts["errors"] += 1
                print(f"backfill note {note_id}: {e}")

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT j.id,
                       j.title || E'\n' || COALESCE(c.name, '') || E'\n\n' || COALESCE(j.description, j.link, '')
                FROM job_postings j
                LEFT JOIN companies c ON j.company_id = c.id
                WHERE j.status != 'dropped'
                """
            )
            jobs = cur.fetchall()

        for job_id, text in jobs:
            if not text.strip():
                continue
            try:
                upsert_sync(conn, "job_posting", job_id, text)
                counts["jobs"] += 1
            except Exception as e:
                counts["errors"] += 1
                print(f"backfill job {job_id}: {e}")

    finally:
        conn.close()

    return counts


@celery_app.task(name="embed.vault")
def embed_vault() -> dict:
    """Embed all markdown files in the vault into the embeddings table."""
    from pathlib import Path
    import psycopg2
    from services.embeddings import upsert_sync

    vault_dir = Path(settings.vault_dir)
    if not vault_dir.exists():
        return {"error": "vault not found", "files": 0}

    conn = psycopg2.connect(settings.jobsearch_database_url)
    counts = {"files": 0, "errors": 0}
    try:
        for md_file in vault_dir.rglob("*.md"):
            rel = str(md_file.relative_to(vault_dir))
            if ".obsidian" in rel:
                continue
            text = md_file.read_text(errors="replace").strip()
            if not text:
                continue
            try:
                upsert_sync(conn, "vault", rel, text)
                counts["files"] += 1
            except Exception as e:
                counts["errors"] += 1
                print(f"embed vault {rel}: {e}")
    finally:
        conn.close()
    return counts
