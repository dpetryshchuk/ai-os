import pytest
from pandadoc import build_payload

REQ = {
    "firstName": "John",
    "lastName": "Doe",
    "company": "Acme Corp",
    "email": "john@acme.com",
    "price": "$2,500",
}

PROPOSAL = {
    "title": "Test Proposal",
    "problemTitle": "The Problem",
    "problemPitch": "You have a problem.",
    "solutionTitle": "The Solution",
    "solutionPitch": "We'll fix it.",
    "platformList": "Monday.com",
    "scopeDescription": "We'll build it.",
    "milestones": [
        {"name": "Phase 1", "duration": "Week 1"},
        {"name": "Phase 2", "duration": "Week 2"},
        {"name": "Phase 3", "duration": "Week 3"},
        {"name": "Phase 4", "duration": "Week 4"},
        {"name": "Phase 5 (extra)", "duration": "Week 5"},
    ],
}


def test_payload_name_and_template():
    payload = build_payload(REQ, PROPOSAL)
    assert payload["name"] == "Test Proposal"
    assert payload["template_uuid"] == "RrDD8yBMNu6hSCzqxUQ5i3"
    assert payload["folder_uuid"] == "/vfHANiBferJbQZKdke9MbF"


def test_payload_client_tokens():
    payload = build_payload(REQ, PROPOSAL)
    tokens = {t["name"]: t["value"] for t in payload["tokens"]}
    assert tokens["Client.FirstName"] == "John"
    assert tokens["Client.LastName"] == "Doe"
    assert tokens["Client.Email"] == "john@acme.com"
    assert tokens["Client.Company"] == "Acme Corp"
    assert tokens["Client.Title"] == "Test Proposal"


def test_payload_sender_tokens():
    payload = build_payload(REQ, PROPOSAL)
    tokens = {t["name"]: t["value"] for t in payload["tokens"]}
    assert tokens["Sender.FirstName"] == "Dima"
    assert tokens["Sender.Company"] == "OneKeyFlow"


def test_payload_milestones_capped_at_4():
    payload = build_payload(REQ, PROPOSAL)
    tokens = {t["name"]: t["value"] for t in payload["tokens"]}
    assert tokens["Client.milestone-1"] == "Phase 1"
    assert tokens["Client.milestone-4"] == "Phase 4"
    assert "Client.milestone-5" not in tokens


def test_payload_price_with_dollar_and_comma():
    payload = build_payload(REQ, PROPOSAL)
    row = payload["pricing_tables"][0]["sections"][0]["rows"][0]
    assert row["data"]["price"] == 2500.0


def test_payload_price_plain_number():
    payload = build_payload({**REQ, "price": "3000"}, PROPOSAL)
    row = payload["pricing_tables"][0]["sections"][0]["rows"][0]
    assert row["data"]["price"] == 3000.0


def test_payload_price_invalid_falls_back_to_zero():
    payload = build_payload({**REQ, "price": "TBD"}, PROPOSAL)
    row = payload["pricing_tables"][0]["sections"][0]["rows"][0]
    assert row["data"]["price"] == 0.0
