from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import okf_db

router = APIRouter()


class OutreachContactCreate(BaseModel):
    name: str
    company: str = ""
    linkedin_url: str = ""
    message_sent: str = ""
    status: str = "sent"
    notes: str = ""


class OutreachContactUpdate(BaseModel):
    name: str
    company: str = ""
    linkedin_url: str = ""
    message_sent: str = ""
    status: str
    notes: str = ""


class SessionLog(BaseModel):
    date: str
    hours: float
    notes: str = ""


@router.get("/stats")
def get_stats():
    okf_db.init()
    return {"ok": True, "stats": okf_db.get_outreach_stats()}


@router.get("/contacts")
def list_contacts(status: str | None = None, limit: int = 100):
    okf_db.init()
    return {"ok": True, "contacts": okf_db.list_outreach_contacts(limit, status)}


@router.post("/contacts")
def create_contact(body: OutreachContactCreate):
    okf_db.init()
    contact = okf_db.create_outreach_contact(body.model_dump())
    return {"ok": True, "contact": contact}


@router.patch("/contacts/{contact_id}")
def update_contact(contact_id: str, body: OutreachContactUpdate):
    okf_db.init()
    contact = okf_db.update_outreach_contact(contact_id, body.model_dump())
    if not contact:
        raise HTTPException(404, "Contact not found")
    return {"ok": True, "contact": contact}


@router.post("/sessions")
def log_session(body: SessionLog):
    okf_db.init()
    session = okf_db.log_session_hours(body.date, body.hours, body.notes)
    return {"ok": True, "session": session}


@router.get("/retro")
def get_retro(weeks: int = 4):
    okf_db.init()
    return {"ok": True, "weeks": okf_db.get_weekly_retro(weeks)}
