"""
Backwards compatibility shim for legacy imports.
All domain logic has been modularized under `ai_backend/services/`.
"""
from services import (
     generate_jds,
     parse_job_orders,
     parse_candidates,
     parse_cv,
     parse_interview_schedule,
     parse_sheet_data,
     extract_json_block,
     get_client,
     ensure_api_key,
 )
from services.core_llm import client, GEMINI_API_KEY, AI_MODEL_NAME

__all__ = [
     "generate_jds",
     "parse_job_orders",
     "parse_candidates",
     "parse_cv",
     "parse_interview_schedule",
     "parse_sheet_data",
     "extract_json_block",
     "client",
     "GEMINI_API_KEY",
     "AI_MODEL_NAME",
]

