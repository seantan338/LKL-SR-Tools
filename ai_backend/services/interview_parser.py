import json
from typing import Union, List, Dict, Any
from .core_llm import get_client, ensure_api_key, extract_json_block, AI_MODEL_NAME, get_model_for_task, logger

try:
    from normalize import extract_company_from_tab_name, normalize_company_name
except ImportError:
    from ..normalize import extract_company_from_tab_name, normalize_company_name

INTERVIEW_SCHEDULE_SYSTEM_PROMPT = """You are an HR processing recruitment interview/Walk-in registration records.
The user provides a block of scattered text data representing candidate records.
Please parse it into a STRICT JSON array of objects.

[Extraction Rules]
Extract the following fields for each candidate. If missing, leave as empty string "":
1. name: Candidate Name
2. position: Job Applied For
3. company: Target Company
4. interviewDate: Date/Time of interview
5. icNo: IC Number
6. age: Age (number)
7. degree: Education Level
8. experience: Work Experience
9. location: Staying Area
10. phone: Phone Number
11. picName: PIC / Consultant
12. remarks: Original remarks text
13. normalizedStatus: Must be one of ["attended", "no_show", "unable_to_attend", "pending"] based on remarks.
14. offered: Salary offered
15. department: Department
16. notes: Extra unmapped info

Output ONLY valid JSON array.
"""


def format_rows_to_text(rows: List[List[Any]]) -> str:
    """Helper to convert 2D array rows to clean markdown-style table string for LLM."""
    lines = []
    for row in rows:
        line = " | ".join(str(cell or "").strip() for cell in row)
        if line.replace("|", "").strip():
            lines.append(line)
    return "\n".join(lines)

from .batch_llm import split_by_token_budget, execute_parallel_batches

async def parse_interview_schedule(raw_data: Union[str, List[List[Any]]], source_tab: str = "") -> List[Dict[str, Any]]:
    """
    Parses messy interview schedule / walk-in records into normalized candidate interview objects.

    Each row is strictly treated as an independent candidate record (no merging).
    Uses dynamic token budgeting, length cutoff halving retries, and parallel execution.
    """
    ensure_api_key()

    if isinstance(raw_data, list):
        input_text = format_rows_to_text(raw_data)
    else:
        input_text = str(raw_data or "").strip()

    if not input_text:
        return []

    lines = [line for line in input_text.strip().split("\n") if line.strip()]
    if not lines:
        return []

    header_lines = []
    data_start = 0
    if len(lines) > 0:
        header_lines.append(lines[0])
        data_start = 1
        if len(lines) > 1 and ("---" in lines[1] or "|---|:" in lines[1]):
            header_lines.append(lines[1])
            data_start = 2

    data_lines = lines[data_start:]
    if not data_lines:
        return []

    batches = split_by_token_budget(
        lines=data_lines,
        header_lines=header_lines,
        max_output_tokens_per_batch=2800
    )

    tab_hint = f"【当前所属 Tab / 项目名称】：{source_tab}\n" if source_tab else "【当前所属 Tab / 项目名称】：未指定\n"
    user_prompt_prefix = f"{tab_hint}需要清洗归一化的面试排期表格数据："

    logger.info(f"Interview schedule parsing (tab='{source_tab}'): {len(data_lines)} rows partitioned into {len(batches)} batches.")

    model_to_use = get_model_for_task("interview_schedule")
    raw_results, failed_batches = await execute_parallel_batches(
        batch_texts=batches,
        system_prompt=INTERVIEW_SCHEDULE_SYSTEM_PROMPT,
        user_prompt_prefix=user_prompt_prefix,
        concurrency_limit=3,
        model_name=model_to_use
    )


    if failed_batches:
        logger.warning(f"Warning: {len(failed_batches)} interview batches failed: {failed_batches}")

    # Ensure sourceTab, field validation and valid status enum on every record
    valid_statuses = {"attended", "no_show", "unable_to_attend", "pending"}
    cleaned_results = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        
        name = str(item.get("candidateName") or "").strip()
        pos = str(item.get("position") or "").strip()
        if not name and not pos:
            continue

        if source_tab and not item.get("sourceTab"):
            item["sourceTab"] = source_tab
        if not item.get("company") and source_tab:
            item["company"] = extract_company_from_tab_name(source_tab)
            item["companySource"] = "tab_inferred"
        elif item.get("company"):
            item["company"] = normalize_company_name(item["company"])
            if not item.get("companySource"):
                item["companySource"] = "row_explicit"

        norm_status = str(item.get("normalizedStatus") or "").lower().strip()
        if norm_status not in valid_statuses:
            if any(k in norm_status for k in ["attend", "到场", "出席"]):
                norm_status = "attended"
            elif any(k in norm_status for k in ["no_show", "no show", "noshow", "未到", "无响应"]):
                norm_status = "no_show"
            elif any(k in norm_status for k in ["unable", "cancel", "请假", "改期"]):
                norm_status = "unable_to_attend"
            else:
                norm_status = "pending"
        item["normalizedStatus"] = norm_status

        cleaned_results.append(item)

    return cleaned_results

