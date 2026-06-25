"""Tests for the finances router — JS-literal parsing + endpoints.

data.js / budgets.js are hand-edited JS modules (unquoted keys, single quotes,
trailing commas, comments). extract_js_literal must read them faithfully; the
old json.loads parser returned {} and left the dashboard stale.
"""
import json

import pytest

from routers import finances
from config import settings


DATA_JS = """\
/* header comment with a stray } brace and 'quote' */
export const DATA = {
  overview: {
    period: 'Feb – May 2026',   // a trailing inline comment {not real}
    revenue: 3317,
    margin: 34.0,
  },
  note: 'a string with a } brace and a // slash inside',
  accounts: [
    { name: 'Checking', val: 1138 },
    { name: 'Savings',  val: 108 },
  ],
}

export const TXNS = {
  groceries: { Jun: { Costco: [{ date: '2026-06-01', amt: 313.11 }] } },
}
"""

BUDGETS_JS = """\
// envelopes
export const BUDGETS = {
  Groceries:        650,
  'Personal Care':  150,
  Dining:           120,
}
"""


def test_extract_object_with_comments_quotes_trailing_commas():
    data = finances.extract_js_literal(DATA_JS, "DATA")
    assert data["overview"]["revenue"] == 3317
    assert data["overview"]["margin"] == 34.0
    # a string containing } and // must not truncate the literal
    assert data["note"] == "a string with a } brace and a // slash inside"
    assert [a["name"] for a in data["accounts"]] == ["Checking", "Savings"]


def test_extract_second_export_is_isolated():
    txns = finances.extract_js_literal(DATA_JS, "TXNS")
    assert txns["groceries"]["Jun"]["Costco"][0]["amt"] == 313.11
    # DATA must not bleed into TXNS
    assert "overview" not in txns


def test_extract_budgets_unquoted_and_quoted_keys():
    budgets = finances.extract_js_literal(BUDGETS_JS, "BUDGETS")
    assert budgets == {"Groceries": 650, "Personal Care": 150, "Dining": 120}


def test_extract_missing_name_returns_none():
    assert finances.extract_js_literal(DATA_JS, "NOPE") is None


@pytest.fixture
def finances_fixture(tmp_path, monkeypatch):
    src = tmp_path / "finance-dashboard" / "src"
    src.mkdir(parents=True)
    (src / "data.js").write_text(DATA_JS, encoding="utf-8")
    (src / "budgets.js").write_text(BUDGETS_JS, encoding="utf-8")
    receipts = tmp_path / "finance-dashboard" / "public" / "receipts"
    receipts.mkdir(parents=True)
    (receipts / "receipts.json").write_text(
        json.dumps([{"date": "2026-04-03", "total": 121.65, "image": "r.jpg", "merchant": "Costco"}]),
        encoding="utf-8",
    )
    (receipts / "r.jpg").write_bytes(b"\xff\xd8\xff\xe0jpegbytes")
    (tmp_path / "ledger.csv").write_text(
        "date,account,category,subcategory,description,amount,direction,source,uncertain,annotation\n"
        "2026-06-01,Bank Checking,Groceries,Costco,COSTCO,313.11,out,checking,,\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "finances_dir", str(tmp_path))
    return tmp_path


async def test_data_endpoint_returns_parsed_data(client, finances_fixture):
    resp = await client.get("/api/finances/data")
    body = resp.json()
    assert body["ok"] is True
    assert body["data"]["overview"]["revenue"] == 3317
    assert body["txns"]["groceries"]["Jun"]["Costco"][0]["amt"] == 313.11


async def test_budgets_endpoint(client, finances_fixture):
    body = (await client.get("/api/finances/budgets")).json()
    assert body["budgets"]["Groceries"] == 650


async def test_receipts_manifest_and_image(client, finances_fixture):
    manifest = (await client.get("/api/finances/receipts")).json()
    assert manifest["receipts"][0]["merchant"] == "Costco"

    img = await client.get("/api/finances/receipts/r.jpg")
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/jpeg"


async def test_receipt_image_missing_returns_404(client, finances_fixture):
    resp = await client.get("/api/finances/receipts/nope.jpg")
    assert resp.status_code == 404


async def test_receipt_image_does_not_leak_outside_dir(client, finances_fixture):
    # An encoded-slash traversal can't match the single-segment {filename} route,
    # so it never reaches the handler; ensure ledger.csv contents never leak.
    resp = await client.get("/api/finances/receipts/..%2f..%2f..%2fledger.csv")
    assert "Bank" not in resp.text


async def test_ledger_endpoint(client, finances_fixture):
    body = (await client.get("/api/finances/ledger")).json()
    assert body["rows"][0]["category"] == "Groceries"
    assert body["rows"][0]["amount"] == 313.11
