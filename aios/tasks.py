import json
import secrets
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
    from workers.health import run as health_run
    from workers.scrapers.fathom import run as fathom_run
    from workers.scrapers.whisper_transcribe import run as whisper_run
    from workers.scrapers.supadata_transcript import run as supadata_run
    from workers.scrapers.jobspy_scraper import run as sd_run
    from workers.scrapers.yc import run as yc_run
    from workers.scrapers.hn import run as hn_run

    return {
        "health.check": health_run,
        "fathom.received": fathom_run,
        "whisper.transcribe": whisper_run,
        "supadata.transcript": supadata_run,
        "scrape.sd": sd_run,
        "scrape.yc": yc_run,
        "scrape.hn": hn_run,
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
    eid = secrets.token_hex(8)
    with SyncSession() as session:
        session.add(
            OsEvent(
                id=eid,
                source="schedule",
                type=event_type,
                payload={},
                status="pending",
            )
        )
        session.commit()
    process_event.delay(eid)


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
    "health-check-60s": {
        "task": "events.run_scheduled",
        "schedule": 60.0,
        "args": ["health.check"],
    },
}
