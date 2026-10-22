from .core_llm import get_client, ensure_api_key, safe_json_parse, AI_MODEL_NAME, get_model_for_task, logger


JOB_ORDER_SYSTEM_PROMPT = """You are a professional headhunter/HR processing business Job Orders.
Please extract ALL job positions from the unstructured text, chat message, or raw table data into a strict JSON ARRAY of objects (`[...]`).
Extract information as accurately as possible. For missing fields, use empty string "".

CRITICAL MULTI-JOB & SPLITTING RULES:
1. SHARED COMPANY INHERITANCE:
   - If a company/client name is mentioned once at the top, bottom, or header (e.g., "acompany is hiring:", "Client: XYZ Sdn Bhd"), inherit and populate that exact `company` name into EVERY extracted job order in the array.
2. COMPOUND / SLASHED POSITIONS MUST BE SPLIT:
   - If a single block lists multiple positions combined with "/" or "and" (e.g., "Refining Chemist / Refining Manager")—especially when they have distinct salary ranges like "Salary: Refining Chemist (3.5k - 5k) Refining Manager (8k - 10k)"—you MUST split them into SEPARATE JSON objects in the array, assigning each position its own specific title and corresponding salary range, while inheriting shared fields (company, gender/requirements, location).
3. INLINE CLUES EXTRACTION:
   - If a job title contains a location in parentheses, e.g., "Business development executive (Johor/KL)", set `position` to "Business development executive" and `location` to "Johor/KL".
   - If salary contains commission/allowance perks, e.g., "3.5k - 4.5k (have commission)", keep `salary` as "3.5k - 4.5k (have commission)" and also extract "Commission" into `benefits`.
   - Include any stated attributes such as "Gender: Male" or "Gender: Open" inside `requirements`.
4. DEFAULT HEADCOUNT:
   - If headcount is not specified, set `headcount` to 1.

Each object in the JSON array MUST follow this schema:
[
  {
    "company": "Client / Company Name (e.g. acompany)",
    "position": "Single Clean Job Title",
    "headcount": 1,
    "location": "Work Location (or empty string if not mentioned)",
    "workHours": "Working Hours / Shifts (or empty string if not mentioned)",
    "salary": "Salary Range for this specific position",
    "requirements": "String combining all requirements (including Gender, experience, qualifications, etc.)",
    "responsibilities": "String combining all responsibilities",
    "benefits": "String combining all benefits / commission / allowances",
    "notes": "Any other remarks"
  }
]
Output ONLY a valid JSON array `[...]`. All extracted/summarized content should be in ENGLISH.
"""

async def parse_job_orders(raw_text: str) -> list:
    """
    Parses unformatted raw text, Excel/Sheets exports, or pasted documents into structured Job Orders.
    """
    ensure_api_key()
    client = get_client()

    try:
        model_name = get_model_for_task("job_order")
        logger.info(f"Parsing job orders using model: {model_name}")
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": JOB_ORDER_SYSTEM_PROMPT},
                {"role": "user", "content": f"需要解析的招聘需求数据：\n\n{raw_text}\n\n请直接输出 JSON 数组："}
            ],
            temperature=0.1,
            max_tokens=8000
        )
        
        content = response.choices[0].message.content
        
        try:
            parsed_json = safe_json_parse(content, '[', ']')
        except Exception as parse_err:
            logger.warning(f"Initial safe_json_parse failed for job orders: {parse_err}. Attempting auto-fix. Raw response:\n{content}")
            fix_response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "你上一次输出的JSON格式有误，请只输出修复后的合法标准JSON数组，确保双引号正确转义，不要有任何其他文字和分析。"},
                    {"role": "user", "content": content}
                ],
                temperature=0.1,
                max_tokens=8000
            )

            fixed_content = fix_response.choices[0].message.content
            parsed_json = safe_json_parse(fixed_content, '[', ']')

        # Handle cases where LLM wrapped list in a dictionary { "job_orders": [...] }
        if isinstance(parsed_json, dict) and len(parsed_json.keys()) == 1:
            first_key = list(parsed_json.keys())[0]
            if isinstance(parsed_json[first_key], list):
                parsed_json = parsed_json[first_key]
                
        if not isinstance(parsed_json, list):
            parsed_json = [parsed_json]
            
        return parsed_json

    except Exception as e:
        logger.error(f"Exception in parse_job_orders: {str(e)}", exc_info=True)
        raise ValueError(f"招聘需求解析失败: {str(e)}")
