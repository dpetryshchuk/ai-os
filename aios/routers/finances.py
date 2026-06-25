import csv
from pathlib import Path

import json5
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import settings

router = APIRouter()

_IMG_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _finances_dir() -> Path:
    return Path(settings.finances_dir)


def _src() -> Path:
    return _finances_dir() / "finance-dashboard" / "src"


def _receipts_dir() -> Path:
    return _finances_dir() / "finance-dashboard" / "public" / "receipts"


def extract_js_literal(text: str, name: str):
    """Pull `export const NAME = <object|array literal>` out of a JS module and
    parse it with json5.

    The dashboard's data.js / budgets.js are hand-edited JS modules (unquoted
    keys, single quotes, trailing commas, comments), so `json.loads` can't read
    them. We scan for the literal's matching bracket — skipping over strings and
    comments so braces inside them don't fool the matcher — then hand the exact
    literal to json5.
    """
    i = text.find(f"export const {name}")
    if i < 0:
        return None
    eq = text.find("=", i)
    if eq < 0:
        return None

    s = text[eq + 1:]
    n = len(s)
    # advance to the first bracket that opens the literal
    j = 0
    while j < n and s[j] not in "{[":
        j += 1
    if j >= n:
        return None

    open_ch = s[j]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    in_str = None     # current string quote char, or None
    esc = False
    start = j
    end = -1
    while j < n:
        ch = s[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            j += 1
            continue
        # not in a string: skip comments so braces/quotes inside them don't fool us
        if ch == "/" and j + 1 < n and s[j + 1] == "/":
            nl = s.find("\n", j)
            if nl < 0:
                break
            j = nl
            continue
        if ch == "/" and j + 1 < n and s[j + 1] == "*":
            close = s.find("*/", j + 2)
            j = close + 2 if close >= 0 else n
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                end = j + 1
                break
        j += 1

    if end < 0:
        return None
    try:
        return json5.loads(s[start:end])
    except Exception:
        return None


@router.get("/data")
def get_data():
    """Serve data.js — the dashboard's DATA + TXNS exports — as JSON."""
    p = _src() / "data.js"
    if not p.exists():
        raise HTTPException(503, "Finances data not available")
    text = p.read_text(encoding="utf-8")
    data = extract_js_literal(text, "DATA") or {}
    txns = extract_js_literal(text, "TXNS") or {}
    return {"ok": True, "data": data, "txns": txns}


@router.get("/budgets")
def get_budgets():
    """Serve budgets.js — the BUDGETS envelope map — as JSON."""
    p = _src() / "budgets.js"
    if not p.exists():
        return {"ok": True, "budgets": {}}
    budgets = extract_js_literal(p.read_text(encoding="utf-8"), "BUDGETS") or {}
    return {"ok": True, "budgets": budgets}


def read_ledger_rows() -> list[dict]:
    """Read ledger.csv into typed row dicts. Shared by the API and agent tools."""
    p = _finances_dir() / "ledger.csv"
    if not p.exists():
        return []
    rows = []
    with open(p, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            try:
                amount = float(row.get("amount") or 0)
            except (ValueError, TypeError):
                amount = 0.0
            rows.append({
                "id": str(i),
                "date": row.get("date", ""),
                "account": row.get("account", ""),
                "category": row.get("category", ""),
                "subcategory": row.get("subcategory", ""),
                "description": row.get("description", ""),
                "amount": amount,
                "direction": row.get("direction", "out"),
                "source": row.get("source", ""),
                "uncertain": bool(row.get("uncertain", "")),
                "annotation": row.get("annotation", ""),
            })
    return rows


@router.get("/ledger")
def get_ledger():
    """Read ledger.csv and return typed JSON rows."""
    return {"ok": True, "rows": read_ledger_rows()}


@router.get("/receipts")
def get_receipts():
    """Serve the receipts manifest (receipts.json) as JSON."""
    p = _receipts_dir() / "receipts.json"
    if not p.exists():
        return {"ok": True, "receipts": []}
    try:
        data = json5.loads(p.read_text(encoding="utf-8"))
    except Exception:
        data = []
    return {"ok": True, "receipts": data if isinstance(data, list) else []}


@router.get("/receipts/{filename}")
def get_receipt_image(filename: str):
    """Serve a receipt image, resolved strictly inside the receipts directory."""
    base = _receipts_dir().resolve()
    target = (base / filename).resolve()
    if target.parent != base or not target.is_file():
        raise HTTPException(404, "Receipt not found")
    media = _IMG_TYPES.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(target, media_type=media)
