from typing import Callable

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

import db
import events as ev
from schemas import WebhookResponse
from tasks import process_event

router = APIRouter()


# ── Signature verifiers ───────────────────────────────────────────────────────

def _verify_noop(body: bytes, headers: dict) -> None:
    pass


VERIFIERS: dict[str, Callable[[bytes, dict], None]] = {
    # Add real verifiers here as webhooks are onboarded
    # "typebot": _verify_typebot,
}


def _verify_signature(source: str, body: bytes, headers) -> None:
    verifier = VERIFIERS.get(source)
    if verifier is None and source not in VERIFIERS:
        raise HTTPException(401, f"Unknown webhook source: {source}")
    if verifier:
        verifier(body, dict(headers))


# ── Webhook endpoint ──────────────────────────────────────────────────────────

@router.post("/{source}")
async def receive_webhook(
    source: str,
    request: Request,
    pool: asyncpg.Pool = Depends(db.get_jobsearch_pool),
) -> WebhookResponse:
    body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    _verify_signature(source, body, request.headers)

    event_id = await ev.create(pool, source="webhook", type=f"{source}.received", payload=payload)
    process_event.delay(event_id)

    return WebhookResponse(event_id=event_id)
