import os
from celery import Celery
import httpx

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery("home", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.timezone = "UTC"

celery_app.conf.beat_schedule = {
    "health-check-every-60s": {
        "task": "tasks.check_app_health",
        "schedule": 60.0,
    },
}

JOBSEARCH_URL = os.environ.get("JOBSEARCH_URL", "http://jobsearch:4111")
WRITING_APP_URL = os.environ.get("WRITING_APP_URL", "http://writing-app:4112")
DAILY_LOG_URL = os.environ.get("DAILY_LOG_URL", "http://daily-log:4113")

HEALTH_URLS = {
    "Job Search": f"{JOBSEARCH_URL}/api/health",
    "Writing": f"{WRITING_APP_URL}/api/health",
    "Daily Log": f"{DAILY_LOG_URL}/api/health",
}


@celery_app.task(name="tasks.check_app_health")
def check_app_health():
    results = {}
    for name, url in HEALTH_URLS.items():
        try:
            r = httpx.get(url, timeout=3)
            results[name] = "ok" if r.status_code < 500 else "error"
        except Exception:
            results[name] = "error"
    return results
