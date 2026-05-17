import os
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def freewrite_dir(monkeypatch, tmp_path):
    fw_dir = tmp_path / "freewrite"
    fw_dir.mkdir()
    content_dir = tmp_path / "essays"
    content_dir.mkdir()
    monkeypatch.setenv("FREEWRITE_DIR", str(fw_dir))
    monkeypatch.setenv("CONTENT_DIR", str(content_dir))
    return fw_dir


@pytest.fixture
async def client(freewrite_dir):
    import importlib
    import main as m
    importlib.reload(m)
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_list_entries_empty(client):
    r = await client.get("/api/freewrite/entries")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "entries": []}


async def test_create_entry(client, freewrite_dir):
    r = await client.post("/api/freewrite/entries")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "id" in data
    entry_id = data["id"]
    assert (freewrite_dir / f"{entry_id}.md").exists()


async def test_get_entry(client):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    r2 = await client.get(f"/api/freewrite/entries/{entry_id}")
    assert r2.status_code == 200
    assert r2.json()["ok"] is True
    assert "text" in r2.json()


async def test_save_entry(client):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    r2 = await client.put(f"/api/freewrite/entries/{entry_id}", json={"text": "hello world"})
    assert r2.status_code == 200
    r3 = await client.get(f"/api/freewrite/entries/{entry_id}")
    assert r3.json()["text"] == "hello world"


async def test_delete_entry(client, freewrite_dir):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    r2 = await client.delete(f"/api/freewrite/entries/{entry_id}")
    assert r2.status_code == 200
    assert not (freewrite_dir / f"{entry_id}.md").exists()


async def test_list_entries_returns_created(client):
    await client.post("/api/freewrite/entries")
    r = await client.get("/api/freewrite/entries")
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert len(entries) == 1
    assert "id" in entries[0]
    assert "created_at" in entries[0]
    assert entries[0]["is_video"] is False


async def test_path_traversal_rejected(client):
    r = await client.get("/api/freewrite/entries/../../../etc/passwd")
    assert r.status_code in (400, 404, 422)


async def test_get_nonexistent_entry(client):
    fake_id = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890-2026-01-01-00-00-00"
    r = await client.get(f"/api/freewrite/entries/{fake_id}")
    assert r.status_code == 404


async def test_upload_video(client, freewrite_dir):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    fake_webm = b"WEBM_FAKE_BYTES"
    r2 = await client.post(
        f"/api/freewrite/entries/{entry_id}/video",
        files={"video": ("rec.webm", fake_webm, "video/webm")},
        data={"transcript": "Hello world"},
    )
    assert r2.status_code == 200
    vdir = freewrite_dir / "videos" / entry_id
    assert (vdir / f"{entry_id}.webm").exists()
    assert (vdir / "transcript.md").read_text() == "Hello world"
    # entry file should now say "Video Entry"
    assert (freewrite_dir / f"{entry_id}.md").read_text() == "Video Entry"


async def test_upload_video_marks_is_video(client):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    await client.post(
        f"/api/freewrite/entries/{entry_id}/video",
        files={"video": ("rec.webm", b"FAKE", "video/webm")},
    )
    r2 = await client.get("/api/freewrite/entries")
    entry = next(e for e in r2.json()["entries"] if e["id"] == entry_id)
    assert entry["is_video"] is True


async def test_stream_video(client, freewrite_dir):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    fake_bytes = b"FAKE_VIDEO_CONTENT"
    await client.post(
        f"/api/freewrite/entries/{entry_id}/video",
        files={"video": ("rec.webm", fake_bytes, "video/webm")},
    )
    r2 = await client.get(f"/api/freewrite/entries/{entry_id}/video")
    assert r2.status_code == 200
    assert r2.content == fake_bytes


async def test_delete_entry_removes_video(client, freewrite_dir):
    r = await client.post("/api/freewrite/entries")
    entry_id = r.json()["id"]
    await client.post(
        f"/api/freewrite/entries/{entry_id}/video",
        files={"video": ("rec.webm", b"FAKE", "video/webm")},
    )
    await client.delete(f"/api/freewrite/entries/{entry_id}")
    assert not (freewrite_dir / "videos" / entry_id).exists()
