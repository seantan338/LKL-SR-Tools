import json
from .core_llm import get_client, ensure_api_key, extract_json_block, AI_MODEL_NAME, get_model_for_task, logger

try:
    from normalize import extract_company_from_tab_name, normalize_company_name
except ImportError:
    from ..normalize import extract_company_from_tab_name, normalize_company_name

CANDIDATE_SYSTEM_PROMPT = """You are a professional headhunter/HR, responsible for cleaning recruitment interview and candidate registration forms.
The user provides data using the following standard headers (or similar variants):
[Interview Date | Applied for position | Name | IC No / Age | Education Level / Certificate | Working experience | Staying Area | Contact Number | PIC | Remarks | Offered | Department]

Please accurately parse the table data into a strict JSON array of objects.
Each row represents one candidate. Rows are completely independent, merging across rows is strictly prohibited. If a field is missing, leave it as an empty string.

[Field Exact Mapping & Extraction Rules]
1. name: Candidate name (From Name column, extract as is)
2. position: Applied for position (From Applied for position column)
3. company: Target enterprise/company (From Company/Client column, if none, extract from the Worksheet Tab name, e.g., IPE, PSA, Santak, EPG)
4. interviewDate: Interview Date (From Interview Date column, e.g., 18/8/2026, 21/8 Fri 10am)
5. icNo: IC Number (Extract if present in IC No / Age column, else empty)
6. age: Age (Number or string, extract from IC No / Age column, e.g., 39, 26)
7. degree: Education Level / Certificate (From Education Level / Certificate column, e.g., SPM, Diploma)
8. experience: Working experience (From Working experience column, e.g., 3 years in CNC)
9. location: Staying Area (From Staying Area column)
10. phone: Contact Number (From Contact Number column, e.g., 0198488186)
11. picName: PIC / Consultant (From PIC column. Must be empty string "" if none)
12. remarks: Original remarks (From Remarks column, e.g., Attend, No response, unable to attend)
13. normalizedStatus: Status normalization (analyzed from Remarks). Must be ONE of these 4:
    - "attended" (Attend, attended, present)
    - "no_show" (No response, noshow, absent)
    - "unable_to_attend" (unable to attend, cancel, postpone, including weather/objective reasons)
    - "pending" (blank or TBD)
14. offered: Offered salary (From Offered column, e.g., RM1900, if not hired or blank, leave "")
15. department: Department (From Department column, e.g., Operations, Logistics)
16. notes: Any extra unmapped info

JSON Schema:
[
  {
    "name": "Candidate Name",
    "position": "Applied position",
    "company": "Target company",
    "interviewDate": "Interview date",
    "icNo": "IC number",
    "age": "Age",
    "degree": "Education certificate",
    "experience": "Working experience",
    "location": "Staying location",
    "phone": "Contact number",
    "picName": "PIC",
    "remarks": "Original remarks",
    "normalizedStatus": "attended | no_show | unable_to_attend | pending",
    "offered": "Offered salary",
    "department": "Department",
    "notes": "Extra notes"
  }
]
"""


from .batch_llm import split_by_token_budget, execute_parallel_batches

async def parse_candidates(raw_text: str, source_tab: str = "") -> list:
    """
    Parses unformatted raw text, Excel/Sheets candidate exports into structured candidate objects.
    Uses token budget splitting, finish_reason cutoff detection, and parallel execution.
    Automatically routes to lightweight tier model (e.g. Gemini 2.5 Flash / GPT-4o-mini).
    """
    ensure_api_key()

    if not raw_text or not raw_text.strip():
        return []

    lines = [line for line in raw_text.strip().split("\n") if line.strip()]
    if not lines:
        return []

    def _is_header_row(text: str) -> bool:
        low = text.lower()
        header_keywords = [
            "name", "姓名", "phone", "电话", "contact", "mobile", "手机",
            "position", "职位", "岗位", "degree", "学历", "education",
            "interview", "面试", "remarks", "备注", "status", "状态",
            "age", "年龄", "ic no", "department", "部门", "offered", "salary"
        ]
        match_count = sum(1 for kw in header_keywords if kw in low)
        return match_count >= 2 or ("applied for" in low) or ("working experience" in low)

    header_lines = []
    if len(lines) == 1:
        # 单行数据场景（如 Google Sheets onEdit 仅推送当行变更）
        if _is_header_row(lines[0]):
            return []  # 确实是表头行被修改，跳过建档
        data_lines = lines
    else:
        # 多行数据场景
        if _is_header_row(lines[0]):
            header_lines.append(lines[0])
            data_start = 1
            if len(lines) > 1 and ("---" in lines[1] or "|---|:" in lines[1]):
                header_lines.append(lines[1])
                data_start = 2
            data_lines = lines[data_start:]
        else:
            data_lines = lines

    if not data_lines:
        return []

    # 按预估输出 token 预算切批次（动态适应备注长短）
    batches = split_by_token_budget(
        lines=data_lines,
        header_lines=header_lines,
        max_output_tokens_per_batch=2800
    )

    model_to_use = get_model_for_task("candidate")
    logger.info(f"Candidate parsing: {len(data_lines)} rows partitioned into {len(batches)} batches using model '{model_to_use}'.")

    # 并行并发请求（Semaphore 控制上限为 3，防 429）
    all_candidates, failed_batches = await execute_parallel_batches(
        batch_texts=batches,
        system_prompt=CANDIDATE_SYSTEM_PROMPT,
        user_prompt_prefix="需要解析的候选人数据：",
        concurrency_limit=3,
        model_name=model_to_use
    )

    if failed_batches:
        logger.warning(f"Warning: {len(failed_batches)} candidate batches encountered errors: {failed_batches}")

    cleaned_candidates = []
    for item in all_candidates:
        if not isinstance(item, dict):
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
        cleaned_candidates.append(item)

    return cleaned_candidates
