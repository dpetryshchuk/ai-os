# onekeyflow/tasks.py
import json
from pathlib import Path

import litellm
from celery import Celery

import config
import db
import pandadoc

celery_app = Celery(
    "onekeyflow",
    broker=config.REDIS_URL,
    backend=config.REDIS_URL,
)
celery_app.conf.task_default_queue = "okf"


def _load_prompts() -> dict:
    return json.loads(Path("prompts/proposal.json").read_text())


def _call_llm(prompts: dict, req_data: dict) -> dict:
    examples = []
    for msg in prompts["examples"]:
        content = msg["content"]
        examples.append({
            "role": msg["role"],
            "content": json.dumps(content) if isinstance(content, dict) else content,
        })

    messages = [
        {"role": "system", "content": "You're a helpful, intelligent sales assistant."},
        {"role": "user", "content": prompts["instruction"]},
        *examples,
        {
            "role": "user",
            "content": json.dumps({
                "businessDescription": req_data.get("businessDescription", ""),
                "problem": req_data.get("problem", ""),
                "solution": req_data.get("solution", ""),
                "tools": req_data.get("platforms", ""),
                "timeline": req_data.get("timeline", ""),
            }),
        },
    ]
    response = litellm.completion(
        model="deepseek/deepseek-chat",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=1,
    )
    return json.loads(response.choices[0].message.content)


@celery_app.task(bind=True)
def generate_proposal(self, req_data: dict) -> dict:
    job_id = self.request.id
    db.create_event(job_id, "proposal.generate", req_data)
    db.start_event(job_id)
    try:
        prompts = _load_prompts()
        proposal = _call_llm(prompts, req_data)
        payload = pandadoc.build_payload(req_data, proposal)
        doc_id = pandadoc.create_document(payload)
        session_url = pandadoc.create_session(doc_id, req_data.get("email", ""))
        result = {
            "client": {
                "firstName": req_data.get("firstName", ""),
                "lastName":  req_data.get("lastName", ""),
                "company":   req_data.get("company", ""),
                "email":     req_data.get("email", ""),
                "price":     req_data.get("price", ""),
            },
            "proposal": proposal,
            "pandadoc": {"id": doc_id, "url": session_url},
        }
        db.complete_event(job_id, result)
        return result
    except Exception as e:
        db.fail_event(job_id, str(e))
        raise
