import pytest


@pytest.fixture
def clean_db(tmp_path, monkeypatch):
    import db
    monkeypatch.setattr(db, "_DB", tmp_path / "test.db")
    db.init()
    yield db


def test_create_event(clean_db):
    clean_db.create_event("job-1", "proposal.generate", {"company": "Acme"})
    events = clean_db.list_events()
    assert len(events) == 1
    assert events[0]["id"] == "job-1"
    assert events[0]["type"] == "proposal.generate"
    assert events[0]["status"] == "pending"
    assert events[0]["source"] == "onekeyflow"
    assert events[0]["payload"] == {"company": "Acme"}


def test_start_event(clean_db):
    clean_db.create_event("job-2", "proposal.generate", {})
    clean_db.start_event("job-2")
    events = clean_db.list_events()
    assert events[0]["status"] == "processing"
    assert events[0]["started_at"] is not None


def test_complete_event(clean_db):
    clean_db.create_event("job-3", "proposal.generate", {})
    clean_db.start_event("job-3")
    clean_db.complete_event("job-3", {"pandadoc": {"url": "https://app.pandadoc.com/s/abc"}})
    events = clean_db.list_events()
    assert events[0]["status"] == "done"
    assert events[0]["result"]["pandadoc"]["url"] == "https://app.pandadoc.com/s/abc"
    assert events[0]["completed_at"] is not None


def test_fail_event(clean_db):
    clean_db.create_event("job-4", "proposal.generate", {})
    clean_db.start_event("job-4")
    clean_db.fail_event("job-4", "LLM timeout")
    events = clean_db.list_events()
    assert events[0]["status"] == "failed"
    assert events[0]["error"] == "LLM timeout"
    assert events[0]["completed_at"] is not None


def test_list_events_limit(clean_db):
    for i in range(5):
        clean_db.create_event(f"job-{i}", "proposal.generate", {})
    events = clean_db.list_events(limit=3)
    assert len(events) == 3


def test_list_events_ordered_newest_first(clean_db):
    import time
    clean_db.create_event("oldest", "proposal.generate", {})
    time.sleep(0.01)
    clean_db.create_event("newest", "proposal.generate", {})
    events = clean_db.list_events()
    assert events[0]["id"] == "newest"
