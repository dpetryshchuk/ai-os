# onekeyflow/routers/revenue.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db

router = APIRouter()


class MonthEntry(BaseModel):
    month: str
    gross_revenue: float
    service_fees: float = 0.0
    fixed_overhead: float = 0.0
    variable_overhead: float = 0.0
    tax_rate: float = 0.28
    notes: str = ""


@router.get("")
def get_revenue():
    return {"ok": True, "months": db.get_all_months()}


@router.post("")
def create_revenue(body: MonthEntry):
    try:
        month = db.create_month(body.model_dump())
        return {"ok": True, "month": month}
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(400, f"Month '{body.month}' already exists")
        raise


@router.put("/{month_id}")
def update_revenue(month_id: int, body: MonthEntry):
    month = db.update_month(month_id, body.model_dump())
    if not month:
        raise HTTPException(404, "Not found")
    return {"ok": True, "month": month}


@router.delete("/{month_id}")
def delete_revenue(month_id: int):
    db.delete_month(month_id)
    return {"ok": True}
