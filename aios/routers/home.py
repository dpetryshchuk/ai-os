import re
from pathlib import Path

from fastapi import APIRouter

from config import settings
from schemas import HealthResponse

router = APIRouter()


@router.get("/health")
async def system_health() -> HealthResponse:
    return HealthResponse(apps={"aios": "ok"})


@router.get("/meetings")
def recent_meetings(limit: int = 5):
    """List recent meeting notes from the vault."""
    meetings_dir = Path(settings.vault_dir) / "Meetings"
    if not meetings_dir.exists():
        return {"ok": True, "meetings": []}
    meetings = []
    for f in sorted(meetings_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]:
        content = f.read_text(errors="replace")
        # Extract first heading as title fallback
        title = f.stem
        for line in content.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        # Extract share URL if present
        share_url = ""
        for line in content.splitlines():
            if "share_url:" in line.lower() or "fathom" in line.lower():
                urls = re.findall(r'https?://\S+', line)
                if urls:
                    share_url = urls[0].rstrip(')')
                    break
        meetings.append({
            "filename": f.name,
            "title": title,
            "modified": f.stat().st_mtime,
            "share_url": share_url,
        })
    return {"ok": True, "meetings": meetings}
