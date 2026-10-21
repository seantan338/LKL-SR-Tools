from .core_llm import get_client, ensure_api_key, safe_json_parse, AI_MODEL_NAME, get_model_for_task, logger


JOB_ORDER_SYSTEM_PROMPT = """You are a professional headhunter/HR processing business Job Orders.
Please extract the unstructured text or raw table data into a strict JSON object.
Extract information as accurately as possible. For missing fields, use empty string "".

JSON Schema:
{
  "company": "Client / Company Name (e.g. IPE Automation)",
  "position": "Job Title",
  "headcount": "Number of vacancies (number or string)",
  "location": "Work Location",
  "workHours": "Working Hours / Shifts",
  "salary": "Salary Range",
  "requirements": "String combining all requirements",
  "responsibilities": "String combining all responsibilities",
  "benefits": "String combining all benefits",
  "notes": "Any other remarks"
}
Output ONLY valid JSON. All extracted/summarized content should be in ENGLISH.
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
