import os
import tempfile
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def essay_dir(monkeypatch, tmp_path):
    content_dir = tmp_path / "essays"
    content_dir.mkdir()
    (content_dir / "blog").mkdir()

    # Pre-create one essay
    (content_dir / "blog" / "hello.md").write_text(
        "---\ntitle: Hello\n---\nBody text here\n"
    )

    monkeypatch.setenv("CONTENT_DIR", str(content_dir))
    monkeypatch.setenv("REPO_DIR", str(tmp_path))
    return content_dir


@pytest.fixture
async def client(essay_dir):
    # Import after env is set so CONTENT_DIR is available at module load
    import importlib
    import main as m
    importlib.reload(m)
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_list_essays(client):
    r = await client.get("/api/essays")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert any(e["slug"] == "hello" for e in data["essays"])


async def test_read_essay(client):
    r = await client.get("/api/essays/blog/hello")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["essay"]["frontmatter"]["title"] == "Hello"
    assert "Body text here" in data["essay"]["body"]


async def test_read_essay_not_found(client):
    r = await client.get("/api/essays/blog/nonexistent")
    assert r.status_code == 404


async def test_create_essay(client):
    r = await client.post("/api/essays", json={"folder": "blog", "title": "New Post"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["essay"]["slug"] == "new-post"


async def test_create_essay_missing_fields(client):
    r = await client.post("/api/essays", json={"folder": "blog"})
    assert r.status_code == 400


async def test_write_essay(client):
    r = await client.put(
        "/api/essays/blog/hello",
        json={"frontmatter": {"title": "Updated"}, "body": "new body"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_delete_essay(client, essay_dir):
    (essay_dir / "blog" / "todelete.md").write_text("---\ntitle: Del\n---\n")
    r = await client.delete("/api/essays/blog/todelete")
    assert r.status_code == 200
    assert not (essay_dir / "blog" / "todelete.md").exists()


async def test_list_folders(client):
    r = await client.get("/api/folders")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "blog" in data["folders"]


async def test_create_folder(client, essay_dir):
    r = await client.post("/api/folders", json={"name": "drafts"})
    assert r.status_code == 200
    assert (essay_dir / "drafts").is_dir()


async def test_delete_nonempty_folder_fails(client):
    r = await client.delete("/api/folders/blog")
    assert r.status_code == 400


async def test_path_traversal_rejected(client):
    # Folder name containing ".." should be rejected by _validate()
    r = await client.get("/api/essays/bad..folder/hello")
    assert r.status_code == 400


async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "status": "healthy"}
