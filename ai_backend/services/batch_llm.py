import asyncio
import json
import re
from typing import List, Tuple, Optional, Dict, Any, Callable
from .core_llm import get_client, extract_json_block, safe_json_parse, AI_MODEL_NAME, logger

# Global concurrency limiter (max 3 concurrent requests to the Gemini API to respect rate limits)
DEFAULT_SEMAPHORE_LIMIT = 3
global_semaphore = asyncio.Semaphore(DEFAULT_SEMAPHORE_LIMIT)

def estimate_tokens(text: str) -> int:
    """
    Estimates token count with sensitivity to CJK (Chinese/Japanese/Korean) and Latin characters.
    - CJK characters: ~1.5 - 2 chars per token
    - English/numbers: ~3.5 - 4 chars per token
    """
    if not text:
        return 0
    cjk_count = len(re.findall(r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]', text))
    other_count = len(text) - cjk_count
    return int((cjk_count / 1.5) + (other_count / 3.5)) + 2

def split_by_token_budget(
    lines: List[str], 
    header_lines: List[str], 
    max_output_tokens_per_batch: int = 3000
) -> List[str]:
    """
    Splits rows into sub-batches based on estimated output JSON token budget.
    Each candidate output object takes approximately 80-120 tokens.
    If rows contain lengthy notes, the token consumption is dynamically accounted for.
    """
    if not lines:
        return []

    header_text = "\n".join(header_lines).strip()
    header_tokens = estimate_tokens(header_text)
    
    batches = []
    current_lines = []
    # Base overhead per batch (system prompt + JSON wrappers) ~ 200 tokens
    current_projected_output_tokens = 200

    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
            
        # An output candidate object typically expands ~1.2x to 1.8x the input row size in JSON formatting, minimum 90 tokens
        line_tokens = estimate_tokens(line_clean)
        projected_row_output_tokens = max(90, int(line_tokens * 1.5))

        if current_lines and (current_projected_output_tokens + projected_row_output_tokens > max_output_tokens_per_batch):
            # Close current batch
            batch_content = f"{header_text}\n" + "\n".join(current_lines) if header_text else "\n".join(current_lines)
            batches.append(batch_content)
            current_lines = []
            current_projected_output_tokens = 200

        current_lines.append(line_clean)
        current_projected_output_tokens += projected_row_output_tokens

    if current_lines:
        batch_content = f"{header_text}\n" + "\n".join(current_lines) if header_text else "\n".join(current_lines)
        batches.append(batch_content)

    return batches

def validate_and_sanitize_candidate(item: dict) -> Tuple[Optional[dict], List[str]]:
    """
    降级模型后，用轻量规则校验补一道安全网，抓那些便宜模型容易犯的低级错误：
    - 过滤空姓名（模型在行尾偶尔脑补出的空对象）
    - 规范化电话号码格式，剥离多余的前缀
    - 保证字段非 None，去除前后冗余空格
    """
    issues = []
    if not isinstance(item, dict):
        return None, ["非合法对象结构"]

    name = str(item.get("name") or item.get("candidateName") or "").strip()
    if not name:
        return None, ["姓名为空，已作为无效行剔除"]

    phone = str(item.get("phone") or "").strip()
    if phone:
        # 清除模型可能加上的 'Tel:', 'Phone:' 等冗余字符
        clean_phone = re.sub(r'^(?:tel|phone|contact|hp|电话|手机)[\s:：]*', '', phone, flags=re.IGNORECASE).strip()
        if not re.match(r'^[\d\-\+\s\(\)]+$', clean_phone):
            issues.append(f"电话号码格式含非常规字符: {phone}")
        item["phone"] = clean_phone

    # 规范化全部字段为合法字符串
    for k, v in list(item.items()):
        if v is None:
            item[k] = ""
        elif isinstance(v, str):
            item[k] = v.strip()

    return item, issues

async def parse_batch_with_retry_and_halving(
    batch_text: str,
    system_prompt: str,
    user_prompt_prefix: str,
    semaphore: asyncio.Semaphore = global_semaphore,
    max_retries: int = 2,
    extract_start='[',
    extract_end=']',
    model_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Parses a batch with:
    1. Semaphore concurrency control
    2. finish_reason == 'length' cutoff detection
    3. Self-healing halving recursion (splits batch in half if truncated)
    4. Auto-retry for transient errors or formatting issues
    5. Support for tiered models (e.g. MODEL_LIGHT vs MODEL_HEAVY)
    """
    client = get_client()
    lines = [l for l in batch_text.strip().split("\n") if l.strip()]
    active_model = model_name or AI_MODEL_NAME

    async with semaphore:
        for attempt in range(max_retries + 1):
            try:
                response = await client.chat.completions.create(
                    model=active_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"{user_prompt_prefix}\n\n{batch_text}\n\nPlease directly output a JSON array:"}
                    ],
                    temperature=0.1,
                    max_tokens=6000
                )

                choice = response.choices[0]
                finish_reason = choice.finish_reason
                content = choice.message.content or ""

                # 关键：检测是否因达到 max_tokens 发生截断
                if finish_reason == "length":
                    logger.warning(
                        f"批次输出触发 token 上限截断 (finish_reason='length', attempt {attempt + 1}), 模型: {active_model}, 行数: {len(lines)}"
                    )
                    # 如果发生截断且还有重试次数，执行自愈式“对半切”，绝不原样盲目重试
                    if attempt < max_retries and len(lines) > 2:
                        header_line = lines[0]
                        data_lines = lines[1:]
                        mid = len(data_lines) // 2
                        
                        first_half_text = f"{header_line}\n" + "\n".join(data_lines[:mid])
                        second_half_text = f"{header_line}\n" + "\n".join(data_lines[mid:])
                        
                        logger.info(f"将超长批次自动对半切分重试: 前半段({mid}行) + 后半段({len(data_lines) - mid}行)")
                        
                        first_task = parse_batch_with_retry_and_halving(
                            first_half_text, system_prompt, user_prompt_prefix, semaphore, max_retries - attempt - 1, extract_start, extract_end, active_model
                        )
                        second_task = parse_batch_with_retry_and_halving(
                            second_half_text, system_prompt, user_prompt_prefix, semaphore, max_retries - attempt - 1, extract_start, extract_end, active_model
                        )
                        half_results = await asyncio.gather(first_task, second_task)
                        return half_results[0] + half_results[1]
                    else:
                        raise ValueError(f"批次数据过于庞大，多次切分重试后仍超出模型最大输出长度")

                # 提取并解析 JSON 块
                try:
                    parsed = safe_json_parse(content, extract_start, extract_end)
                    
                    if isinstance(parsed, dict) and len(parsed.keys()) == 1:
                        first_key = list(parsed.keys())[0]
                        if isinstance(parsed[first_key], list):
                            parsed = parsed[first_key]
                            
                    if not isinstance(parsed, list):
                        parsed = [parsed]
                    return parsed

                except (ValueError, json.JSONDecodeError) as parse_err:
                    if attempt < max_retries:
                        logger.warning(f"JSON 解析失败，尝试修复/重试 (attempt {attempt + 1}): {parse_err}")
                        continue
                    raise

            except Exception as e:
                logger.error(f"批次请求失败 (attempt {attempt + 1}/{max_retries + 1}): {str(e)}")
                if attempt < max_retries:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise

async def execute_parallel_batches(
    batch_texts: List[str],
    system_prompt: str,
    user_prompt_prefix: str,
    concurrency_limit: int = 3,
    dedup_key_fn: Optional[Callable[[Dict[str, Any]], str]] = None,
    model_name: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], List[int]]:
    """
    Executes all batches concurrently bounded by semaphore.
    Isolates batch failures, applies rule-based validation safety net, and dedups.
    Returns: (all_successful_records, failed_batch_indices)
    """
    if not batch_texts:
        return [], []

    semaphore = asyncio.Semaphore(concurrency_limit)
    active_model = model_name or AI_MODEL_NAME
    logger.info(f"Launching {len(batch_texts)} batches in parallel using model '{active_model}' (concurrency limit = {concurrency_limit})...")

    tasks = [
        parse_batch_with_retry_and_halving(
            batch_text=b_text,
            system_prompt=system_prompt,
            user_prompt_prefix=user_prompt_prefix,
            semaphore=semaphore,
            model_name=active_model
        )
        for b_text in batch_texts
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_records = []
    failed_batches = []

    for idx, res in enumerate(results):
        if isinstance(res, Exception):
            logger.error(f"批次 {idx + 1} 解析失败: {res}")
            failed_batches.append(idx + 1)
        elif isinstance(res, list):
            # 执行规则校验安全网
            for raw_item in res:
                sanitized, issues = validate_and_sanitize_candidate(raw_item)
                if sanitized:
                    if issues:
                        logger.debug(f"Row validation notice: {issues}")
                    all_records.append(sanitized)


    # 边界切分防重机制 (按姓名+电话或自定义 key 去重)
    if dedup_key_fn or True:
        seen_keys = set()
        deduped = []
        for item in all_records:
            if not isinstance(item, dict):
                continue
            name = str(item.get("candidateName") or item.get("name") or "").strip().lower()
            phone = re.sub(r'\D', '', str(item.get("phone") or ""))
            
            # If both name and phone exist, use composite key; otherwise name+position
            if name and phone:
                key = f"{name}::{phone}"
            elif name:
                pos = str(item.get("position") or item.get("currentPosition") or "").strip().lower()
                key = f"{name}::{pos}"
            else:
                key = None

            if key:
                if key in seen_keys:
                    continue
                seen_keys.add(key)
            deduped.append(item)
            
        all_records = deduped

    logger.info(f"Parallel batch execution completed: {len(all_records)} records, {len(failed_batches)} failed batches")
    return all_records, failed_batches
