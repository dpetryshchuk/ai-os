import httpx

import config

PANDADOC_TEMPLATE_UUID = "RrDD8yBMNu6hSCzqxUQ5i3"
PANDADOC_FOLDER_UUID = "/vfHANiBferJbQZKdke9MbF"


def build_payload(req: dict, proposal: dict) -> dict:
    """Pure. Maps form data + LLM output to a PandaDoc API request body."""
    milestones = proposal.get("milestones", [])
    try:
        price = float(str(req.get("price", "0")).replace(",", "").replace("$", "").strip())
    except (ValueError, AttributeError):
        price = 0.0

    tokens = [
        {"name": "Client.FirstName",     "value": req.get("firstName", "")},
        {"name": "Client.LastName",      "value": req.get("lastName", "")},
        {"name": "Client.Email",         "value": req.get("email", "")},
        {"name": "Client.Company",       "value": req.get("company", "")},
        {"name": "Client.Title",         "value": proposal.get("title", "")},
        {"name": "Client.ProblemTitle",  "value": proposal.get("problemTitle", "")},
        {"name": "Client.ProblemPitch",  "value": proposal.get("problemPitch", "")},
        {"name": "Client.SolutionTitle", "value": proposal.get("solutionTitle", "")},
        {"name": "Client.SolutionPitch", "value": proposal.get("solutionPitch", "")},
        {"name": "Sender.FirstName",     "value": "Dima"},
        {"name": "Sender.LastName",      "value": "Petryshchuk"},
        {"name": "Sender.Email",         "value": "dima@onekeyflow.com"},
        {"name": "Sender.Company",       "value": "OneKeyFlow"},
    ]
    for i, m in enumerate(milestones[:4], start=1):
        tokens.append({"name": f"Client.milestone-{i}", "value": m.get("name", "")})
        tokens.append({"name": f"Client.timeline-{i}",  "value": m.get("duration", "")})

    return {
        "name": proposal.get("title", f"Proposal for {req.get('company', '')}"),
        "template_uuid": PANDADOC_TEMPLATE_UUID,
        "folder_uuid": PANDADOC_FOLDER_UUID,
        "tokens": tokens,
        "pricing_tables": [
            {
                "name": "Pricing Table 1",
                "options": {"currency": "USD"},
                "sections": [
                    {
                        "title": "Services",
                        "default": True,
                        "rows": [
                            {
                                "options": {
                                    "optional": False,
                                    "optional_selected": False,
                                    "qty_editable": False,
                                },
                                "data": {
                                    "name": proposal.get("title", "Project"),
                                    "price": price,
                                    "qty": 1,
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }


def create_document(payload: dict) -> str:
    """Sync POST to PandaDoc API. Returns document id."""
    if not config.PANDADOC_API_KEY:
        raise ValueError("PANDADOC_API_KEY is not configured")
    with httpx.Client(timeout=30) as client:
        r = client.post(
            "https://api.pandadoc.com/public/v1/documents",
            headers={
                "Authorization": f"API-Key {config.PANDADOC_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        r.raise_for_status()
        return r.json()["id"]


def create_session(doc_id: str) -> str:
    """Sync POST to create a PandaDoc viewer session. Returns no-login viewer URL."""
    if not config.PANDADOC_API_KEY:
        raise ValueError("PANDADOC_API_KEY is not configured")
    with httpx.Client(timeout=30) as client:
        r = client.post(
            f"https://api.pandadoc.com/public/v1/documents/{doc_id}/session",
            headers={
                "Authorization": f"API-Key {config.PANDADOC_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"lifetime": 900, "recipient": "viewer"},
        )
        r.raise_for_status()
        session_id = r.json()["id"]
        return f"https://app.pandadoc.com/s/{session_id}"
