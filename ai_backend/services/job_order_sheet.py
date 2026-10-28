"""
Deterministic Google Sheet -> Job Order mapping (no AI).
Python counterpart of web/lib/job-order-sheet.mjs — keep the two in sync.
Used for sheets that already hold one job order per row with recognizable headers,
e.g. "Job Order 2026" > Database tab.
"""
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from logger import setup_logger

logger = setup_logger(__name__)

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


# Bookkeeping fields that never count as a change (sourceRow shifts whenever a row is inserted above it)
UNTRACKED_FIELDS = {"sourceRow", "updatedAt", "createdAt", "id", "assignedTo"}


def upsert_job_orders(db, team_id: str, orders: List[Dict[str, Any]], default_assigned_to: str = "system",
                      dry_run: bool = True, existing_docs: Optional[List[Dict[str, Any]]] = None,
                      report_orphans: bool = False) -> Dict[str, Any]:
    """
    Writes mapped orders into teams/{team_id}/job_orders, updating existing ones matched by
    company + position + location instead of creating duplicates. Mirrors FirestoreStore.addJobOrder/updateJobOrder.
    existing_docs lets a caller pass a pre-filtered set instead of reading the whole collection.
    report_orphans (full-sheet syncs only) lists sheet-imported orders whose row is no longer in the sheet.
    """
    import uuid
    from firebase_admin import firestore
    from services.identity_service import resolve_canonical_pic

    coll = db.collection("teams").document(team_id).collection("job_orders")
    if existing_docs is not None:
        existing = list(existing_docs)
    else:
        existing = []
        for d in coll.stream():
            data = d.to_dict() or {}
            data["id"] = d.id
            existing.append(data)
    # Report-only: a renamed or deleted sheet row leaves its old order behind; never auto-delete
    orphans = []
    if report_orphans:
        sheet_keys = {o.get("sheetKey") or job_order_sheet_key(o) for o in orders}
        orphans = [
            {"id": o["id"], "company": o.get("company", ""), "position": o.get("position", ""), "status": o.get("status", "")}
            for o in existing
            if o.get("importSource") == "google_sheet" and o.get("status") not in ("closed", "filled")
            and (o.get("sheetKey") or job_order_sheet_key(o)) not in sheet_keys
        ]

    # Batched writes (Firestore allows 500 ops per batch): one round trip per 400 orders instead of per order
    batch = None if dry_run else db.batch()
    pending = 0

    def flush():
        nonlocal batch, pending
        if batch is not None and pending:
            batch.commit()
            logger.info(f"Committed {len(created) + len(updated)} job order writes ({len(unchanged)} unchanged)")
            batch = db.batch()
            pending = 0

    created, updated, unchanged = [], [], []
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
        if match:
            # Only write orders whose sheet data actually changed, so a daily sync reports real changes
            changed = {k: v for k, v in payload.items() if k not in UNTRACKED_FIELDS and match.get(k) != v}
            if not changed:
                unchanged.append(match["id"])
                continue
            item = {"id": match["id"], "company": payload["company"], "position": payload["position"],
                    "changedFields": sorted(changed)}
            if "status" in changed:
                item["statusChange"] = [match.get("status"), changed["status"]]
            updated.append(item)
            payload["updatedAt"] = firestore.SERVER_TIMESTAMP
            if batch is not None:
                batch.update(coll.document(match["id"]), payload)
                pending += 1
        else:
            payload["updatedAt"] = firestore.SERVER_TIMESTAMP
            order_id = str(uuid.uuid4())
            payload.update({"id": order_id, "assignedTo": assigned_to, "createdAt": firestore.SERVER_TIMESTAMP})
            created.append({"id": order_id, "company": payload["company"], "position": payload["position"]})
            if batch is not None:
                batch.set(coll.document(order_id), payload)
                pending += 1
            existing.append({"id": order_id, "sheetKey": payload["sheetKey"]})

        if pending >= 400:
            flush()
    flush()

    return {"created": created, "updated": updated, "unchanged": len(unchanged), "orphans": orphans, "dryRun": dry_run}


def sync_job_order_rows(db, team_id: str, headers: List[Any], rows: List[List[Any]], first_row_number: int = 2) -> Dict[str, Any]:
    """
    Real-time path for a Google Sheets onEdit webhook on a Job Order sheet: maps only the edited
    row(s) and upserts them, looking existing orders up by sheetKey instead of reading the collection.
    """
    mapped = map_sheet_rows_to_job_orders(headers, rows, row_offset=first_row_number)
    coll = db.collection("teams").document(team_id).collection("job_orders")
    existing = []
    for order in mapped["orders"]:
        key = order["sheetKey"]
        docs = list(coll.where("sheetKey", "==", key).limit(1).stream())
        if not docs and not key.endswith("::"):
            # Location typed after company + title: adopt the order created while location was still blank
            docs = list(coll.where("sheetKey", "==", key.rsplit("::", 1)[0] + "::").limit(1).stream())
        for d in docs:
            data = d.to_dict() or {}
            data["id"] = d.id
            data["sheetKey"] = key
            existing.append(data)
    result = upsert_job_orders(db, team_id, mapped["orders"], dry_run=False, existing_docs=existing)
    result["skipped"] = mapped["skipped"]
    return result
