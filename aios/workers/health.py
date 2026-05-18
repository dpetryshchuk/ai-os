import httpx
from sqlalchemy.orm import Session


def run(payload: dict, session: Session) -> None:
    health_urls = {
        "aios": "http://aios:4116/api/health",
    }
    results = {}
    for name, url in health_urls.items():
        try:
            r = httpx.get(url, timeout=3)
            results[name] = "ok" if r.status_code < 500 else "error"
        except Exception:
            results[name] = "error"
    return results
