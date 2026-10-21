from .core_llm import get_client, ensure_api_key, extract_json_block, logger
from .jd_generator import generate_jds
from .order_parser import parse_job_orders
from .candidate_parser import parse_candidates
from .cv_parser import parse_cv
from .interview_parser import parse_interview_schedule
from .embedding_service import sync_candidates, sync_orders
from .match_engine import match_candidates_for_order
from .telegram_service import (
    start_telegram_polling,
    handle_telegram_update,
    stop_telegram_polling,
    send_telegram_message,
    save_resume_file,
    parse_cv_payload,
    upsert_candidate_to_firestore,
)
from .attendance_service import (
    get_client_ip,
    haversine_distance,
    verify_clockin_eligibility,
    resolve_ddns_domain,
)

async def parse_sheet_data(raw_text: str, target_type: str, source_tab: str = "") -> list:
    """
    Unified router for sheet/text parsing backwards compatibility.
    Directs to order_parser, interview_parser, or candidate_parser based on target_type.
    """
    normalized = (target_type or "").lower().strip().replace("-", "_").replace(" ", "_")
    if normalized in ("job_order", "job_orders", "joborder", "joborders", "order", "orders"):
        return await parse_job_orders(raw_text)
    elif normalized in ("interview_schedule", "interview", "schedule", "walk_in", "walkin"):
        return await parse_interview_schedule(raw_text, source_tab=source_tab)
    elif normalized in ("candidate", "candidates"):
        return await parse_candidates(raw_text, source_tab=source_tab)
    else:
        logger.warning(f"Unknown target_type '{target_type}', defaulting to candidates parser")
        return await parse_candidates(raw_text, source_tab=source_tab)

__all__ = [
    "get_client",
    "ensure_api_key",
    "extract_json_block",
    "generate_jds",
    "parse_job_orders",
    "parse_candidates",
    "parse_cv",
    "parse_interview_schedule",
    "parse_sheet_data",
    "sync_candidates",
    "sync_orders",
    "match_candidates_for_order",
    "start_telegram_polling",
    "handle_telegram_update",
    "stop_telegram_polling",
    "send_telegram_message",
]

