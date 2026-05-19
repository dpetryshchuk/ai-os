from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


# ─── Base ─────────────────────────────────────────────────────────────────────


class OkResponse(BaseModel):
    ok: bool = True


# ─── Jobsearch — requests ─────────────────────────────────────────────────────


class AgentStreamRequest(BaseModel):
    messages: list[dict[str, Any]]


class NoteCreate(BaseModel):
    category: str = "note"
    title: str | None = None
    url: str | None = None
    content: str | None = None


class NoteUpdate(BaseModel):
    category: str | None = None
    title: str | None = None
    url: str | None = None
    content: str | None = None


# ─── Jobsearch — rows ─────────────────────────────────────────────────────────


class ContactRow(BaseModel):
    id: str
    name: str
    role: str | None = None
    source: str | None = None
    stage: str
    notes: str | None = None
    company_name: str | None = None
    website: str | None = None
    last_contact: date | None = None


class NoteRow(BaseModel):
    id: str
    category: str | None = None
    title: str | None = None
    url: str | None = None
    content: str | None = None
    created_at: datetime | None = None


class LeadRow(BaseModel):
    id: str
    title: str
    link: str | None = None
    source: str | None = None
    status: str
    company_name: str | None = None
    website: str | None = None
    location: str | None = None
    scraped_at: datetime | None = None


class ApplicationRow(BaseModel):
    id: str
    title: str
    link: str | None = None
    source: str | None = None
    status: str
    resume_path: str | None = None
    company_name: str | None = None
    website: str | None = None


class ContentPostRow(BaseModel):
    id: str
    posted_date: date | None = None
    content: str | None = None
    impressions: int = 0
    engagements: int = 0
    comments: int = 0


class OsEventRow(BaseModel):
    id: str
    source: str
    type: str
    status: str
    error: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class WeeklyCount(BaseModel):
    week: datetime
    count: int


class DailyCount(BaseModel):
    date: date
    count: int


class SourceStat(BaseModel):
    source: str | None = None
    total: int
    active: int


class NeedsActionContact(BaseModel):
    id: str
    name: str
    stage: str
    company_name: str | None = None
    last_contact: date | None = None


class RetroStats(BaseModel):
    total_contacts: int = 0
    active_contacts: int = 0
    total_interactions: int = 0
    total_applications: int = 0


class FunnelStage(BaseModel):
    stage: str
    count: int
    pct_of_prev: float | None = None


class RetroFunnel(BaseModel):
    stages: list[FunnelStage]
    avg_days_to_response: float | None = None
    interactions_this_week: int = 0
    interactions_today: int = 0


# ─── Jobsearch — responses ────────────────────────────────────────────────────


class PipelineResponse(OkResponse):
    contacts: list[ContactRow]


class RetroResponse(OkResponse):
    weekly: list[WeeklyCount]
    daily: list[DailyCount]
    by_source: list[SourceStat]
    needs_action: list[NeedsActionContact]
    stats: RetroStats
    funnel: RetroFunnel | None = None


class LeadsResponse(OkResponse):
    leads: list[LeadRow]


class ApplicationsResponse(OkResponse):
    applications: list[ApplicationRow]


class NotesResponse(OkResponse):
    notes: list[NoteRow]


class NoteResponse(OkResponse):
    note: NoteRow


class ContentResponse(OkResponse):
    posts: list[ContentPostRow]


class EventsResponse(OkResponse):
    events: list[OsEventRow]


class TriggerResponse(OkResponse):
    event_id: str


class ResumeResponse(OkResponse):
    path: str


# ─── Daily Log — requests ─────────────────────────────────────────────────────


class HabitCreate(BaseModel):
    name: str
    kind: Literal["boolean", "number"]


class HabitUpdate(BaseModel):
    name: str | None = None
    active: bool | None = None


class DayUpsert(BaseModel):
    did_today: str | None = None
    doing_tomorrow: str | None = None
    habits: dict[str, Any] | None = None


# ─── Daily Log — rows ─────────────────────────────────────────────────────────


class HabitRow(BaseModel):
    id: int
    name: str
    kind: str
    active: bool
    created_at: datetime | None = None


class EntryRow(BaseModel):
    date: date
    did_today: str | None = None
    doing_tomorrow: str | None = None
    updated_at: datetime | None = None


class HabitLogRow(BaseModel):
    habit_type_id: int
    date: date
    value: Any


class CalendarDay(BaseModel):
    date: str
    entry: bool
    habits: dict[str, Any]


class ArchiveDay(BaseModel):
    date: str
    did_today: str | None = None
    doing_tomorrow: str | None = None
    habits: dict[str, Any]


# ─── Daily Log — responses ────────────────────────────────────────────────────


class HabitsResponse(OkResponse):
    habits: list[HabitRow]


class HabitResponse(OkResponse):
    habit: HabitRow


class DayResponse(OkResponse):
    entry: EntryRow | None
    habits: list[HabitLogRow]


class CalendarResponse(OkResponse):
    days: list[CalendarDay]


class ArchiveResponse(OkResponse):
    days: list[ArchiveDay]


# ─── Writing — requests ───────────────────────────────────────────────────────


class EssayCreate(BaseModel):
    folder: str
    title: str


class EssaySave(BaseModel):
    body: str = ""
    frontmatter: dict[str, Any] = {}


class EssayMove(BaseModel):
    folder: str


class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str


class GitPush(BaseModel):
    message: str = "update essays"


class FreewriteSave(BaseModel):
    text: str = ""


# ─── Writing — rows ───────────────────────────────────────────────────────────


class EssayMeta(BaseModel):
    model_config = ConfigDict(extra="allow")
    folder: str
    slug: str


class EssayDetail(BaseModel):
    folder: str
    slug: str
    frontmatter: dict[str, Any]
    body: str


class FreewriteEntry(BaseModel):
    id: str
    created_at: str
    is_video: bool
    preview: str


# ─── Writing — responses ──────────────────────────────────────────────────────


class EssaysResponse(OkResponse):
    essays: list[EssayMeta]


class EssayResponse(OkResponse):
    essay: EssayDetail


class EssayCreateResponse(OkResponse):
    essay: EssayMeta


class FoldersResponse(OkResponse):
    folders: list[str]


class FreewriteEntriesResponse(OkResponse):
    entries: list[FreewriteEntry]


class FreewriteTextResponse(OkResponse):
    text: str


class FreewriteCreateResponse(OkResponse):
    id: str


class GitResponse(OkResponse):
    output: str


# ─── Ideas — requests ─────────────────────────────────────────────────────────


class IdeaCreate(BaseModel):
    content: str
    category: Literal["idea", "fix", "todo", "vision"] = "idea"
    status: Literal["open", "in_progress", "done"] = "open"
    priority: Literal["low", "normal", "high"] = "normal"


class IdeaUpdate(BaseModel):
    content: str | None = None
    category: Literal["idea", "fix", "todo", "vision"] | None = None
    status: Literal["open", "in_progress", "done"] | None = None
    priority: Literal["low", "normal", "high"] | None = None


# ─── Ideas — rows ─────────────────────────────────────────────────────────────


class IdeaRow(BaseModel):
    id: str
    content: str
    category: str
    status: str
    priority: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Ideas — responses ────────────────────────────────────────────────────────


class IdeasResponse(OkResponse):
    ideas: list[IdeaRow]


class IdeaResponse(OkResponse):
    idea: IdeaRow


# ─── Look — requests ─────────────────────────────────────────────────────────


class LookItemCreate(BaseModel):
    category: str
    note: str | None = None
    source: str | None = None


# ─── Look — rows ──────────────────────────────────────────────────────────────


class LookItemRow(BaseModel):
    id: str
    category: str
    media_type: str
    file_path: str
    mime_type: str | None = None
    note: str | None = None
    source: str | None = None
    created_at: datetime | None = None


# ─── Look — responses ─────────────────────────────────────────────────────────


class LookItemsResponse(OkResponse):
    items: list[LookItemRow]


class LookItemResponse(OkResponse):
    item: LookItemRow


# ─── Home — rows ──────────────────────────────────────────────────────────────


class AppEntry(BaseModel):
    name: str
    url: str
    description: str
    section: str


# ─── Home — responses ─────────────────────────────────────────────────────────


class AppsResponse(OkResponse):
    apps: list[AppEntry]


class HealthResponse(OkResponse):
    apps: dict[str, str]


# ─── Webhooks — responses ─────────────────────────────────────────────────────


class WebhookResponse(OkResponse):
    event_id: str
