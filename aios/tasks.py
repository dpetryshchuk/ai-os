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
    from workers.scrapers.yc import run as yc_run
    from workers.scrapers.hn import run as hn_run
    from workers.scrapers.remoteok import run as remoteok_run
    from workers.scrapers.simplify import run as simplify_run

    return {
        "health.check": health_run,
        "scrape.yc": yc_run,
        "scrape.hn": hn_run,
        "scrape.remoteok": remoteok_run,
        "scrape.simplify": simplify_run,
    }


# ── Core Celery tasks ─────────────────────────────────────────────────────────

@celery_app.task(name="events.process")
def process_event(event_id: str) -> None:
    handlers = _import_handlers()
    with SyncSession() as session:
        event = session.get(OsEvent, event_id)
        if not event:
            return
        event.status = "processing"
        event.started_at = datetime.utcnow()
        session.commit()
        try:
            handler = handlers.get(event.type)
            if handler:
                payload = event.payload or {}
                handler(payload, session)
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
    "scrape-yc-8am": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=8, minute=0),
        "args": ["scrape.yc"],
    },
    "scrape-hn-8am": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=8, minute=5),
        "args": ["scrape.hn"],
    },
    "scrape-remoteok-2pm": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=14, minute=0),
        "args": ["scrape.remoteok"],
    },
    "scrape-simplify-2pm": {
        "task": "events.run_scheduled",
        "schedule": crontab(hour=14, minute=5),
        "args": ["scrape.simplify"],
    },
    "health-check-60s": {
        "task": "events.run_scheduled",
        "schedule": 60.0,
        "args": ["health.check"],
    },
}
