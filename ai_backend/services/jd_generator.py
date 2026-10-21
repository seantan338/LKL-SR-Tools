import re
import asyncio
from .core_llm import get_client, ensure_api_key, safe_json_parse, get_model_for_task, logger

REQUIRED_KEYS = {"internal", "public_cn", "public_en", "public_my"}

# 单次生成与拆分降级的最大输出 Token 预算（适配 Gemini Flash 大输出上限，防止 4 版本合并截断）
PRIMARY_MAX_TOKENS = 16384
FALLBACK_MAX_TOKENS = 12000

JD_SYSTEM_PROMPT = """You are an elite Recruitment Specialist and High-Conversion Job Ad Copywriter in Malaysia.
Your task is to extract key facts from the user's raw, fragmented recruitment notes (which may contain a single role or multiple positions in one batch) and transform them into 4 complete versions: 1 Internal Recruiter Briefing and 3 Public High-Conversion Job Ads (Chinese, English, Malay).

[CORE PRINCIPLE 1: ZERO HALLUCINATION & EXPLICIT PLACEHOLDERS]
1. NEVER invent, guess, or fabricate any unmentioned benefits, facilities, or allowances (e.g., DO NOT mention free hostel, factory bus, meal allowance, or air-conditioned environment unless explicitly stated in the raw input!).
2. If critical information is missing or ambiguous in the raw text, you MUST insert a highly visible placeholder in the corresponding language so the user knows to fill it in or delete the line before publishing:
   - Chinese format: 【⚠️待补充：...】 or 【⚠️待确认：...】
   - English format: [⚠️To be confirmed: ...] or [⚠️Insert: ...]
   - Malay format: [⚠️Sila lengkapkan: ...] or [⚠️Sila sahkan: ...]
3. Always include a placeholder for application contact info at the bottom if no phone number/WhatsApp/email is provided in the raw text.

[CORE PRINCIPLE 2: MULTI-POSITION & SPECIFIC RULES HANDLING]
1. If the raw text lists multiple positions under the same employer (e.g., 1) CNC Tech, 2) Operator, 3) QA), clearly list EACH position with its respective headcount and specific requirements under the Positions section, while grouping shared location, working hours, salary base, and general conditions cleanly.
2. Preserve all practical screening rules mentioned by the client (e.g., "must have own transport, no Grab/family fetch", "no employment gap > 2 months", "able to work rotating shifts"). Express them clearly and professionally in the public ads.

[CORE PRINCIPLE 3: INTERNAL VS. PUBLIC COMPLIANCE BOUNDARIES]
1. In ===INTERNAL===: Keep 100% of the raw truth for internal recruiters! Retain the REAL client company name (e.g., Edmund Optics), exact sensitive criteria (e.g., specific gender, race, or age requests), all strict screening red lines, and list a "Missing/Ambiguous Info Checklist" to clarify with the client.
2. In ===PUBLIC_CN===, ===PUBLIC_EN===, and ===PUBLIC_MY===:
   - Strictly HIDE the real company name! Generalize it naturally based on location and industry clues (e.g., "知名跨国精密/光学制造企业" / "Leading Multinational Precision Manufacturing Company in Gelang Patah").
   - Strictly REMOVE discriminatory restrictions (Race, Religion, Gender, Age, Marital Status). Reframe them into legitimate operational or physical readiness requirements where appropriate, and comply with the Malaysia Employment Act 1955.
   - Maintain 1:1 structural and informational parity across the Chinese, English, and Malay public versions!

[PUBLIC AD 5-SECTION HIGH-CONVERSION STRUCTURE]
Each of the 3 public versions (CN, EN, MY) must be formatted as a clean, scannable, social-media-ready job ad (suitable for WhatsApp, Facebook Groups, Xiaohongshu) containing these 5 sections with appropriate bullet points and emojis:
1. 🔥 [Headline & Highlights Banner]: Catchy title with Location + Industry + Core Salary/Benefit Hooks.
2. 📌 [Open Positions & Specific Requirements]: Clearly numbered list of role(s), headcount (pax), minimum education, and role-specific skills/duties (use placeholder if duties are missing).
3. ✅ [General Requirements & Screening Criteria]: Experience needed, transport rules (e.g., own transport required, no Grab/fetch), work gap limits, shift readiness, etc.
4. 💰 [Compensation & Benefits]: Basic salary, shift allowances (morning/noon/evening), bonuses, and other stated perks (flag any salary ambiguity across roles with a placeholder).
5. 🕒 [Working Hours & Location] & 📩 [How to Apply]: Work days, shift rotation schedule, exact shift timings, location area, and Contact/WhatsApp placeholder.

[STRICT OUTPUT FORMAT: Use Explicit Tag Delimiters]
Wrap the 4 versions strictly using the exact delimiters below. Do not output any extra introductory or closing remarks outside the delimiters:

===INTERNAL===
[Internal Recruiter Briefing & Fact Sheet - Output in clear Chinese & English mix or English. Include: 1. Real Client & Overview, 2. Unrestricted Hard Filters (Gender/Race/Age/Transport/Employment Gap), 3. Role Breakdown, 4. Missing Info Checklist to ask client]

===PUBLIC_CN===
[Public High-Conversion Job Ad - Chinese Version. Must follow the 5-section ad structure with explicit 【⚠️待补充/确认】 placeholders for missing items.]

===PUBLIC_EN===
[Public High-Conversion Job Ad - English Version. 1:1 aligned with PUBLIC_CN, following the 5-section ad structure with [⚠️To be confirmed/Insert] placeholders.]

===PUBLIC_MY===
[Public High-Conversion Job Ad - Bahasa Melayu Version. Authentic Malaysian recruitment style, 1:1 aligned with PUBLIC_CN, following the 5-section ad structure with [⚠️Sila lengkapkan/sahkan] placeholders.]
"""

SPLIT_CN_PROMPT = """You are an elite Recruitment Specialist and High-Conversion Job Ad Copywriter in Malaysia.
Based on the user's raw recruitment notes, generate the [Internal Recruiter Briefing] and the [Public High-Conversion Job Ad - Chinese].

Rules:
1. ZERO HALLUCINATION: Never invent unmentioned benefits (e.g., hostel, bus, meals, AC). Use explicit placeholders like 【⚠️待补充：...】 or 【⚠️待确认：...】 for missing or ambiguous details (including application contact info).
2. MULTI-POSITION SUPPORT: If multiple roles are listed, present each role and its headcount/education clearly, while grouping shared salary, shifts, location, and general rules (like no Grab/fetch, employment gap limits).
3. INTERNAL vs PUBLIC:
   - ===INTERNAL=== keeps the REAL company name, raw gender/race/age filters, strict screening red lines, and a checklist of missing info.
   - ===PUBLIC_CN=== hides the real company name (use industry/location descriptor), removes discriminatory terms (race/gender/age) in compliance with Malaysia labor laws, and formats the text into a punchy 5-section social media job ad (Headline, Positions, General Criteria, Salary & Benefits, Working Hours & Apply CTA).

Output strictly using these delimiters:
===INTERNAL===
[Internal Recruiter Briefing content]

===PUBLIC_CN===
[Chinese Public Job Ad content]
"""

SPLIT_TRANSLATE_PROMPT_TEMPLATE = """You are a professional Malaysian Recruitment Copywriter and Localization Specialist.
Below is the finalized Chinese high-conversion job advertisement (including explicit placeholders for missing info).

Please completely translate and localize it into an authentic, punchy [{target_lang_name}] job advertisement.
[CORE RULES: Strict 1:1 Alignment & Zero Hallucination]
1. Retain 100% of the structure, bullet points, positions, screening rules (e.g., transport/Grab rules, work gap limits), shift timings, and salary details from the Chinese version.
2. Convert any Chinese placeholders 【⚠️待补充/待确认：...】 into natural [{target_lang_name}] placeholders (e.g., [⚠️To be confirmed: ...] for English, [⚠️Sila lengkapkan: ...] for Malay). Do NOT make up fake information to fill the placeholders!
3. Keep the company name anonymized and ensure full compliance with the Malaysia Employment Act.

Output directly wrapped in the delimiter:
==={target_tag}===
[{target_lang_name} full job ad text]
"""


def parse_delimited_jds(content: str) -> dict:
    """
    Parses delimiter blocks: ===INTERNAL===, ===PUBLIC_CN===, ===PUBLIC_EN===, ===PUBLIC_MY===.
    Immune to unescaped quotes, raw newlines, or markdown delimiters.
    """
    result = {}
    patterns = {
        "internal": r"===\s*INTERNAL\s*===\s*\n?(.*?)(?=(?:===\s*(?:PUBLIC_CN|PUBLIC_EN|PUBLIC_MY)\s*===)|\Z)",
        "public_cn": r"===\s*PUBLIC_CN\s*===\s*\n?(.*?)(?=(?:===\s*(?:INTERNAL|PUBLIC_EN|PUBLIC_MY)\s*===)|\Z)",
        "public_en": r"===\s*PUBLIC_EN\s*===\s*\n?(.*?)(?=(?:===\s*(?:INTERNAL|PUBLIC_CN|PUBLIC_MY)\s*===)|\Z)",
        "public_my": r"===\s*PUBLIC_MY\s*===\s*\n?(.*?)(?=(?:===\s*(?:INTERNAL|PUBLIC_CN|PUBLIC_EN)\s*===)|\Z)",
    }
    for key, pat in patterns.items():
        match = re.search(pat, content, re.DOTALL | re.IGNORECASE)
        if match:
            text = match.group(1).strip()
            # Clean possible markdown code fence artifacts if model mistakenly wrapped with ```
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            result[key] = text.strip()
    return result


def _validate_jds(result: dict) -> dict:
    """
    Validates field completeness and substantive content for all 4 JD versions.
    """
    if not isinstance(result, dict):
        raise ValueError(f"AI 解析结果非字典对象: {type(result).__name__}")
        
    missing = REQUIRED_KEYS - set(result.keys())
    if missing:
        raise ValueError(f"AI 生成缺少必需字段: {', '.join(missing)}")
        
    short_or_empty = []
    for k in REQUIRED_KEYS:
        val = str(result.get(k) or "").strip()
        if len(val) < 50:  # Any valid full JD/Ad must be well over 50 chars
            short_or_empty.append(f"{k} (长度: {len(val)})")
            
    if short_or_empty:
        raise ValueError(f"AI 生成字段内容为空或过短: {', '.join(short_or_empty)}")
        
    return result


async def _generate_jds_split_fallback(client, model_name: str, raw_text: str) -> dict:
    """
    Two-Phase fallback:
    Phase 1: Generate Internal + Public CN
    Phase 2: Concurrently generate Public EN + Public MY mirrored 1:1 from Public CN
    """
    logger.info("Executing two-phase split fallback for JD generation...")
    # Phase 1: Internal + CN
    resp_phase1 = await client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": SPLIT_CN_PROMPT},
            {"role": "user", "content": f"以下是原始招聘需求/随手记内容：\n\n{raw_text}\n\n请严格提取信息并输出 ===INTERNAL=== 与 ===PUBLIC_CN===："}
        ],
        temperature=0.2,
        max_tokens=FALLBACK_MAX_TOKENS
    )
    p1_content = resp_phase1.choices[0].message.content or ""
    p1_parsed = parse_delimited_jds(p1_content)
    
    internal_text = p1_parsed.get("internal", "")
    public_cn_text = p1_parsed.get("public_cn", "")
    
    if not public_cn_text:
        try:
            json_fallback = safe_json_parse(p1_content, '{', '}')
            internal_text = internal_text or json_fallback.get("internal", "")
            public_cn_text = public_cn_text or json_fallback.get("public_cn", "")
        except Exception:
            pass
            
    if not public_cn_text or len(public_cn_text) < 50:
        raise ValueError("两阶段降级执行中中文版广告生成失败，无法进行后续多语言对齐")

    # Phase 2: Concurrently generate EN & MY from Public CN
    async def translate_branch(target_lang_name: str, target_tag: str, key_name: str) -> tuple[str, str]:
        prompt = SPLIT_TRANSLATE_PROMPT_TEMPLATE.format(target_lang_name=target_lang_name, target_tag=target_tag)
        resp = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"以下是定稿的中文版招聘广告（含待补充占位符）：\n\n{public_cn_text}\n\n请直接输出 ==={target_tag}=== 内容："}
            ],
            temperature=0.2,
            max_tokens=FALLBACK_MAX_TOKENS
        )
        content = resp.choices[0].message.content or ""
        m = re.search(rf"===\s*{target_tag}\s*===\s*\n?(.*?)(?:\Z)", content, re.DOTALL | re.IGNORECASE)
        val = m.group(1).strip() if m else content.strip()
        val = re.sub(r"^```[a-zA-Z]*\n?", "", val)
        val = re.sub(r"\n?```$", "", val).strip()
        return key_name, val

    results = await asyncio.gather(
        translate_branch("英文 (English)", "PUBLIC_EN", "public_en"),
        translate_branch("马来文 (Bahasa Melayu)", "PUBLIC_MY", "public_my")
    )
    
    merged = {
        "internal": internal_text,
        "public_cn": public_cn_text,
        results[0][0]: results[0][1],
        results[1][0]: results[1][1],
    }
    return _validate_jds(merged)


async def generate_jds(raw_text: str) -> dict:
    """
    Extracts key recruitment facts from raw notes and generates 4 versions
    (internal briefing + public_cn, public_en, public_my high-conversion ads)
    with explicit missing-info placeholders and zero hallucination.
    """
    ensure_api_key()
    client = get_client()
    model_name = get_model_for_task("generate_jds")
    logger.info(f"Generating JDs using model: {model_name}")

    max_tokens_budget = PRIMARY_MAX_TOKENS
    max_retries = 2
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"generate_jds attempt {attempt}/{max_retries} (max_tokens={max_tokens_budget})")
            response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": JD_SYSTEM_PROMPT},
                    {"role": "user", "content": f"以下是原始的招聘需求/随手记内容：\n\n{raw_text}\n\n请严格提取核心事实、标记缺失项，并使用标签定界符输出完整的 4 版本内容："}
                ],
                temperature=0.2,
                max_tokens=max_tokens_budget
            )
            
            choice = response.choices[0]
            
            # 1. 严格区分截断 (finish_reason == "length") 与格式错误
            if choice.finish_reason == "length":
                logger.warning(
                    f"Attempt {attempt}: Output was truncated by max_tokens limit ({max_tokens_budget}). "
                    f"Triggering two-phase split fallback immediately to avoid wasting time."
                )
                break  # 16384 依然被截断说明单次输出过长或底层模型限制，直接跳出循环进入分阶段并发生成
                
            content = choice.message.content or ""
            
            # 2. 优先通过定界符直接切分
            parsed = parse_delimited_jds(content)
            
            # 3. 若定界符未完全提取成功，向下兼容尝试 safe_json_parse
            if not (REQUIRED_KEYS.issubset(parsed.keys()) and all(parsed.get(k) for k in REQUIRED_KEYS)):
                try:
                    json_parsed = safe_json_parse(content, '{', '}')
                    if isinstance(json_parsed, dict):
                        for k in REQUIRED_KEYS:
                            if not parsed.get(k) and json_parsed.get(k):
                                parsed[k] = str(json_parsed[k]).strip()
                except Exception:
                    pass
            
            # 4. 严格校验字段完整性与有效字数
            validated = _validate_jds(parsed)
            logger.info(f"generate_jds succeeded on attempt {attempt}")
            return validated

        except Exception as e:
            last_error = e
            logger.warning(f"generate_jds attempt {attempt} failed: {e}")
            await asyncio.sleep(1)

    # 若单次尝试均未成功或触发截断，启动无缝两阶段拆分降级机制
    logger.warning(f"Single-prompt generation did not complete ({last_error}). Triggering two-phase split fallback...")
    try:
        return await _generate_jds_split_fallback(client, model_name, raw_text)
    except Exception as fallback_err:
        logger.error(f"Two-phase split fallback also failed: {fallback_err}", exc_info=True)
        raise ValueError(f"AI 生成 JD 失败 (重试及拆分降级均未成功): {str(last_error)} | 降级报错: {str(fallback_err)}")