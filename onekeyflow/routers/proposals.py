# onekeyflow/routers/proposals.py
from fastapi import APIRouter
from pydantic import BaseModel

import db
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
    return {"ok": True, "events": db.list_events(limit)}
