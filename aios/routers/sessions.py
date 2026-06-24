from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import chat_sessions

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SaveBody(BaseModel):
    session_id: str | None = None
    title: str = ""
    messages: list = []
    domain: str = "personal"


@router.get("")
def list_sessions(limit: int = 30):
    return {"ok": True, "sessions": chat_sessions.list_all(limit)}


@router.post("")
def save_session(body: SaveBody):
    sid = chat_sessions.save(body.session_id, body.title, body.messages, body.domain)
    return {"ok": True, "id": sid}


@router.get("/{session_id}")
def get_session(session_id: str):
    s = chat_sessions.get(session_id)
    if not s:
        raise HTTPException(404, "Not found")
    return {"ok": True, "session": s}


@router.delete("/{session_id}")
def delete_session(session_id: str):
    chat_sessions.delete(session_id)
    return {"ok": True}
