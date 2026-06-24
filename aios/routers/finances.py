import csv
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import settings

router = APIRouter()


def _src() -> Path:
    return Path(settings.finances_dir) / "finance-dashboard" / "src"


@router.get("/data")
def get_data():
    """Serve data.js as JSON by stripping the JS export wrapper."""
    p = _src() / "data.js"
    if not p.exists():
        raise HTTPException(503, "Finances data not available")
    text = p.read_text()
    start = text.find('{')
    txns_start = text.find('export const TXNS')
    if txns_start > 0:
        data_text = text[start:txns_start].rstrip().rstrip(',').rstrip(';').rstrip()
        try:
            data = json.loads(data_text)
        except Exception:
            data = {}
        txns_start2 = text.find('{', txns_start)
        txns_end = text.rfind('}') + 1
        try:
            txns = json.loads(text[txns_start2:txns_end].rstrip().rstrip(';'))
        except Exception:
            txns = {}
        return {"ok": True, "data": data, "txns": txns}
    try:
        data = json.loads(text[start:text.rfind('}') + 1].rstrip().rstrip(';'))
    except Exception:
        data = {}
    return {"ok": True, "data": data, "txns": {}}


@router.get("/ledger")
def get_ledger():
    """Read ledger.csv and return typed JSON rows."""
    p = Path(settings.finances_dir) / "ledger.csv"
    if not p.exists():
        return {"ok": True, "rows": []}
    rows = []
    with open(p, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
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
    return {"ok": True, "rows": rows}


@router.get("/budgets")
def get_budgets():
    """Serve budgets.js as JSON. Handles unquoted JS object keys."""
    p = _src() / "budgets.js"
    if not p.exists():
        return {"ok": True, "budgets": {}}
    text = p.read_text()
    # Parse JS object literal: match 'Key': num or Key: num patterns
    budgets: dict[str, int] = {}
    for m in re.finditer(r"""['\"]?([A-Za-z][A-Za-z0-9 ]*)['\"]?\s*:\s*(\d+)""", text):
        budgets[m.group(1).strip()] = int(m.group(2))
    return {"ok": True, "budgets": budgets}
