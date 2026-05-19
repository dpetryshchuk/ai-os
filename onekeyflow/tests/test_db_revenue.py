import pytest


@pytest.fixture
def clean_db(tmp_path, monkeypatch):
    import db
    monkeypatch.setattr(db, "_DB", tmp_path / "test.db")
    db.init()
    yield db


def test_seed_data_loaded(clean_db):
    months = clean_db.get_all_months()
    assert len(months) == 4
    assert months[0]["month"] == "Feb 2026"


def test_create_month(clean_db):
    entry = {"month": "Jun 2026", "gross_revenue": 1000.0}
    result = clean_db.create_month(entry)
    assert result["month"] == "Jun 2026"
    assert result["gross_revenue"] == 1000.0
    assert "net_profit" in result
    assert "net_margin" in result


def test_update_month(clean_db):
    months = clean_db.get_all_months()
    m = months[0]
    updated = clean_db.update_month(m["id"], {**m, "gross_revenue": 9999.0})
    assert updated["gross_revenue"] == 9999.0


def test_delete_month(clean_db):
    months = clean_db.get_all_months()
    clean_db.delete_month(months[0]["id"])
    remaining = clean_db.get_all_months()
    assert len(remaining) == 3


def test_enrich_computes_net_revenue(clean_db):
    # Feb 2026: gross=742.48, fees=74.248
    months = clean_db.get_all_months()
    m = months[0]
    assert m["net_revenue"] == round(742.48 - 74.248, 2)
    assert "total_overhead" in m
    assert "operating_profit" in m
    assert "tax_provision" in m
