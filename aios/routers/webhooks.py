import hmac
import hashlib
from typing import Callable

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

import db
import events as ev
from config import settings
from schemas import WebhookResponse
from tasks import process_event

router = APIRouter()


# ── Signature verifiers ───────────────────────────────────────────────────────

def _verify_noop(body: bytes, headers: dict) -> None:
    pass


def _verify_fathom(body: bytes, headers: dict) -> None:
    """Verify Fathom webhook signature using HMAC-SHA256.

    Fathom sends a `Fathom-Signature` header. The secret is the `whsec_...` value
    returned when creating the webhook.
    """
    secret = settings.fathom_webhook_secret
    if not secret:
        raise HTTPException(500, "Fathom webhook secret not configured")

    sig_header = headers.get("fathom-signature", "")
    if not sig_header:
        raise HTTPException(401, "Missing Fathom-Signature header")

    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig_header):
        raise HTTPException(401, "Invalid Fathom webhook signature")


VERIFIERS: dict[str, Callable[[bytes, dict], None]] = {
    "fathom": _verify_fathom,
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
