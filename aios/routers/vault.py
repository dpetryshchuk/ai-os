import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import settings

router = APIRouter()

def _vault() -> Path:
    return Path(settings.vault_dir)

def _safe(rel: str) -> Path:
    """Resolve a relative path inside the vault, raise 404 if outside."""
    base = _vault().resolve()
    target = (base / rel.lstrip("/")).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(400, "Path outside vault")
    return target


@router.get("/tree")
def get_tree():
    """Return a flat list of all .md files in the vault with relative paths."""
    base = _vault()
    if not base.exists():
        return {"ok": True, "files": []}
    files = []
    for p in sorted(base.rglob("*.md")):
        rel = str(p.relative_to(base))
        # Skip .obsidian internals
        if rel.startswith(".obsidian") or "/.obsidian/" in rel:
            continue
        stat = p.stat()
        files.append({
            "path": rel,
            "name": p.stem,
            "folder": str(p.parent.relative_to(base)) if p.parent != base else "",
            "size": stat.st_size,
            "modified": stat.st_mtime,
        })
    return {"ok": True, "files": files}


@router.get("/file")
def get_file(path: str):
    """Read a single markdown file."""
    target = _safe(path)
    if not target.exists():
        raise HTTPException(404, "Not found")
    content = target.read_text(errors="replace")
    return {"ok": True, "path": path, "content": content}


class FileSave(BaseModel):
    content: str

@router.put("/file")
def save_file(path: str, body: FileSave):
    """Write content to a file. Creates parent dirs if needed."""
    target = _safe(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body.content)
    return {"ok": True}


@router.post("/file")
def create_file(path: str):
    """Create a new empty markdown file."""
    target = _safe(path)
    if target.exists():
        raise HTTPException(400, "File already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("")
    return {"ok": True}
