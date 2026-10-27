"""
Deterministic Google Sheet -> Job Order mapping (no AI).
Python counterpart of web/lib/job-order-sheet.mjs — keep the two in sync.
Used for sheets that already hold one job order per row with recognizable headers,
e.g. "Job Order 2026" > Database tab.
"""
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# Exact (normalized) header matches only, so "Company Background" never lands in `company`.
FIELD_ALIASES = {
    "company": ["company name", "company", "client", "client name", "employer", "公司", "公司名称", "客户", "企业"],
    "status": ["status", "job status", "状态"],
    "position": ["job title", "position", "role", "job position", "职位", "岗位"],
    "companyBackground": ["company background", "industry", "公司背景", "行业"],
    "location": ["location", "work location", "地点", "工作地点"],
    "salary": ["salary range", "salary", "薪资", "薪水"],
    "workDays": ["working day", "working days", "work days", "工作日"],
    "workHours": ["working hours", "work hours", "工作时间"],
    "gender": ["preferred gender", "gender", "性别"],
    "race": ["race", "种族"],
    "requirements": ["requirement/skill set", "requirements", "requirement", "skill set", "skills", "要求"],
    "benefits": ["benefit/allowance", "benefits", "benefit", "allowance", "福利"],
    "picName": ["person in charge", "pic", "负责人", "顾问"],
    "sourceUpdatedAt": ["time of updated", "updated at", "last updated", "更新时间"],
    "commission": ["commission range", "commission", "佣金"],
    "headcount": ["headcount", "hc", "vacancy", "vacancies", "人数"],
    "country": ["country", "国家"],
}

EMPTY_VALUES = {"-", "–", "—", "n/a", "na", "nil", "none", "null"}

GENDER_MAP = {
    "不限": "Open", "open": "Open", "open gender": "Open", "any": "Open",
    "男": "Male", "女": "Female",
}

STATUS_MAP = {
    "open": "open", "active": "open", "hiring": "open",
    "urgent": "urgent",
    "closed": "closed", "close": "closed", "cancelled": "closed", "canceled": "closed",
    "filled": "filled",
    "pending": "paused", "on hold": "paused", "hold": "paused", "paused": "paused",
}


def _norm_header(h: Any) -> str:
    s = str(h or "").lower()
    s = re.sub(r"\s*/\s*", "/", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_cell(v: Any) -> str:
    s = str(v if v is not None else "").strip()
    return "" if s.lower() in EMPTY_VALUES else s


def detect_job_order_columns(headers: List[Any]) -> Optional[Dict[str, int]]:
    cols: Dict[str, int] = {}
    for i, h in enumerate(headers or []):
        n = _norm_header(h)
        for field, aliases in FIELD_ALIASES.items():
            if field not in cols and n in aliases:
                cols[field] = i
                break
    return cols if "company" in cols and "position" in cols else None


def normalize_job_order_status(raw: Any) -> str:
    return STATUS_MAP.get(clean_cell(raw).lower(), "open")


def parse_sheet_timestamp(raw: Any) -> int:
    """Accepts "2026-10-21 9:54" or Sheets' US-locale "11/5/2025" (M/D/YYYY). Returns epoch ms, or 0."""
    s = clean_cell(raw)
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?", s)
    if m:
        dt = datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4] or 0), int(m[5] or 0), tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        dt = datetime(int(m[3]), int(m[1]), int(m[2]), tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    return 0


def _key_part(v: Any) -> str:
    return re.sub(r"\s+", " ", clean_cell(v).lower())


def job_order_sheet_key(order: Dict[str, Any]) -> str:
    """Same company + position at different outlets are separate orders."""
    location = _key_part(order.get("location"))
    if location == "tbd":
        location = ""
    return "::".join([_key_part(order.get("company")), _key_part(order.get("position")), location])


def map_sheet_rows_to_job_orders(headers: List[Any], rows: List[List[Any]], row_offset: int = 2) -> Dict[str, Any]:
    cols = detect_job_order_columns(headers)
    if not cols:
        return {"orders": [], "skipped": [], "mergedCount": 0, "columns": None}

    def get(row: List[Any], field: str) -> str:
        idx = cols.get(field)
        if idx is None or idx >= len(row):
            return ""
        return clean_cell(row[idx])

    by_key: Dict[str, Dict[str, Any]] = {}
    skipped: List[Dict[str, Any]] = []
    merged_count = 0

    for i, row in enumerate(rows or []):
        row_number = i + row_offset
        if not row or not any(clean_cell(c) for c in row):
            continue

        company = get(row, "company")
        position = get(row, "position")
        if not company or not position:
            skipped.append({
                "row": row_number,
                "reason": "missing_company" if not company else "missing_position",
                "position": position,
                "company": company,
            })
            continue

        gender = get(row, "gender")
        race = get(row, "race")
        skills = get(row, "requirements")
        background = get(row, "companyBackground")
        commission = get(row, "commission")
        work_days = get(row, "workDays")
        hours = get(row, "workHours")
        updated_ms = parse_sheet_timestamp(get(row, "sourceUpdatedAt"))
        norm_gender = GENDER_MAP.get(gender.lower(), gender)

        order: Dict[str, Any] = {
            "company": company,
            "position": position,
            "status": normalize_job_order_status(get(row, "status")),
            "salary": get(row, "salary") or "Negotiable",
            "location": get(row, "location") or get(row, "country") or "TBD",
            "workHours": " · ".join(x for x in [work_days, hours] if x) or "TBD",
            "requirements": "\n".join(x for x in [
                f"Gender: {norm_gender}" if norm_gender else "",
                f"Race: {race}" if race else "",
                skills,
            ] if x) or "TBD",
            "benefits": get(row, "benefits"),
            "notes": " | ".join(x for x in [
                f"Background: {background}" if background else "",
                f"Commission: {commission}" if commission else "",
            ] if x),
            "companyBackground": background,
            "commission": commission,
            "workDays": work_days,
            "gender": norm_gender,
            "race": race,
            "country": get(row, "country"),
            "picName": get(row, "picName"),
            "sourceUpdatedAt": datetime.fromtimestamp(updated_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z") if updated_ms else "",
            "sourceRow": row_number,
            "importSource": "google_sheet",
        }
        try:
            headcount = int(get(row, "headcount"))
        except ValueError:
            headcount = 0
        if headcount > 0:
            order["headcount"] = headcount
        order["sheetKey"] = job_order_sheet_key(order)

        # Re-posted rows: keep the most recently updated one (ties keep the earlier row; the sheet is newest-first).
        prev = by_key.get(order["sheetKey"])
        if prev:
            merged_count += 1
            if updated_ms > parse_sheet_timestamp(prev["sourceUpdatedAt"]):
                by_key[order["sheetKey"]] = order
        else:
            by_key[order["sheetKey"]] = order

    return {"orders": list(by_key.values()), "skipped": skipped, "mergedCount": merged_count, "columns": cols}


def find_existing_job_order(existing: List[Dict[str, Any]], order: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    key = order.get("sheetKey") or job_order_sheet_key(order)
    for o in existing or []:
        if o.get("sheetKey") == key or job_order_sheet_key(o) == key:
            return o
    return None


def upsert_job_orders(db, team_id: str, orders: List[Dict[str, Any]], default_assigned_to: str = "system",
                      dry_run: bool = True) -> Dict[str, Any]:
    """
    Writes mapped orders into teams/{team_id}/job_orders, updating existing ones matched by
    company + position + location instead of creating duplicates. Mirrors FirestoreStore.addJobOrder/updateJobOrder.
    """
    import uuid
    from firebase_admin import firestore
    from services.identity_service import resolve_canonical_pic

    coll = db.collection("teams").document(team_id).collection("job_orders")
    existing = []
    for d in coll.stream():
        data = d.to_dict() or {}
        data["id"] = d.id
        existing.append(data)

    created, updated = [], []
    for order in orders:
        payload = dict(order)
        assigned_to = ""
        if payload.get("picName"):
            canonical = resolve_canonical_pic(payload["picName"], None, db)
            if canonical.get("displayName") and canonical["displayName"] != "未分配顾问":
                payload["picName"] = canonical["displayName"]
            assigned_to = canonical.get("uid") or ""
        # 外部/自由顾问留空 assignedTo，避免被当前操作员劫持；完全未指定 PIC 才归到默认操作员
        if not payload.get("picName"):
            assigned_to = default_assigned_to

        match = find_existing_job_order(existing, payload)
        payload["updatedAt"] = firestore.SERVER_TIMESTAMP
        if match:
            updated.append({"id": match["id"], "company": payload["company"], "position": payload["position"]})
            if not dry_run:
                coll.document(match["id"]).update(payload)
        else:
            order_id = str(uuid.uuid4())
            payload.update({"id": order_id, "assignedTo": assigned_to, "createdAt": firestore.SERVER_TIMESTAMP})
            created.append({"id": order_id, "company": payload["company"], "position": payload["position"]})
            if not dry_run:
                coll.document(order_id).set(payload)
            existing.append({"id": order_id, "sheetKey": payload["sheetKey"]})

    return {"created": created, "updated": updated, "dryRun": dry_run}
