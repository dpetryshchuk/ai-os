import asyncpg
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import settings

_jobsearch_pool: asyncpg.Pool | None = None
_daily_log_pool: asyncpg.Pool | None = None


async def init_jobsearch_pool() -> None:
    global _jobsearch_pool
    _jobsearch_pool = await asyncpg.create_pool(settings.jobsearch_database_url)


async def close_jobsearch_pool() -> None:
    global _jobsearch_pool
    if _jobsearch_pool:
        await _jobsearch_pool.close()
        _jobsearch_pool = None


async def get_jobsearch_pool() -> asyncpg.Pool:
    return _jobsearch_pool  # type: ignore[return-value]


async def init_daily_log_pool() -> None:
    global _daily_log_pool
    _daily_log_pool = await asyncpg.create_pool(settings.daily_log_database_url)


async def close_daily_log_pool() -> None:
    global _daily_log_pool
    if _daily_log_pool:
        await _daily_log_pool.close()
        _daily_log_pool = None


async def get_daily_log_pool() -> asyncpg.Pool:
    return _daily_log_pool  # type: ignore[return-value]


# Sync SQLAlchemy session (used by Celery workers for os_events)
sync_engine = create_engine(
    settings.jobsearch_database_url.replace("postgresql+asyncpg://", "postgresql://")
)
SyncSession = sessionmaker(sync_engine)
