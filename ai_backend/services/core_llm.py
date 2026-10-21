import os
import json
import re
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv

try:
    from logger import logger
except ImportError:
    from ..logger import logger

load_dotenv()

# Google Gemini API（通过官方 OpenAI 兼容端点调用，沿用 openai SDK）
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")

# 两档模型：Pro（深度推理）与 Flash（高效提取）
MODEL_PRO = os.getenv("GEMINI_MODEL_PRO", "gemini-3.1-pro-preview")
MODEL_FLASH = os.getenv("GEMINI_MODEL_FLASH", "gemini-3.8-flash")
AI_MODEL_NAME = MODEL_PRO

# 按任务复杂度分级路由模型
MODEL_TIER_MAP = {
    "candidate": MODEL_FLASH,
    "interview_schedule": MODEL_FLASH,
    "job_order": MODEL_PRO,
    "resume_cv": MODEL_FLASH,
    "cv": MODEL_FLASH,
    "generate_jds": MODEL_FLASH,
}

def get_model_for_task(target_type: str) -> str:
    """
    根据任务复杂度分级返回最适模型：
    - 体力活/模式提取（candidate、interview_schedule、resume_cv、generate_jds）：使用 Flash (MODEL_FLASH)
    - 深度推理/段落合并/跨行语义（job_order 及未列出的任务）：使用 Pro (MODEL_PRO)
    """
    normalized = (target_type or "").lower().strip()
    return MODEL_TIER_MAP.get(normalized, AI_MODEL_NAME)

# 单次请求最长等待 120 秒，失败只重试 1 次（SDK 默认 600 秒 + 2 次重试，最坏可挂约 30 分钟）
client = AsyncOpenAI(
    base_url=GEMINI_BASE_URL,
    api_key=GEMINI_API_KEY,
    timeout=httpx.Timeout(120.0, connect=10.0),
    max_retries=1,
)


def get_client() -> AsyncOpenAI:
    return client

def ensure_api_key():
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key_here":
        logger.error("GEMINI_API_KEY not configured")
        raise ValueError("请在 .env 文件中配置 GEMINI_API_KEY")

def extract_json_block(content: str, start_char='{', end_char='}') -> str:
    """
    Extracts the first matching balanced JSON block from content.
    Handles Markdown code blocks, nested string characters, and text before/after.
    """
    # 1. Try markdown code block if present
    code_block_pattern = r'```(?:json)?\s*([\{\[].*?[\}\]])\s*```'
    match = re.search(code_block_pattern, content, re.DOTALL)
    if match:
        candidate = match.group(1).strip()
        if candidate.startswith(start_char) and candidate.endswith(end_char):
            return candidate

    # 2. Bracket counting method with string quote escaping awareness
    start = content.find(start_char)
    if start == -1:
        raise ValueError(f"未找到 JSON 起始符号 '{start_char}'")

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(content)):
        char = content[i]
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if not in_string:
            if char == start_char:
                depth += 1
            elif char == end_char:
                depth -= 1
                if depth == 0:
                    return content[start:i+1]

    raise ValueError(f"JSON 未闭合 ('{start_char}' 到 '{end_char}')，可能已被模型截断")


def safe_json_parse(content: str, fallback_start='{', fallback_end='}'):
    """
    Ultra-robust JSON parser that handles:
    1. Markdown code blocks (```json ... ```)
    2. Raw literal newlines / control characters inside strings
    3. Unescaped quotes inside long text values
    4. Missing commas / delimiters (e.g., 'Expecting \',\' delimiter')
    5. Trailing commas and incomplete brackets
    """
    import json_repair

    if not content or not content.strip():
        raise ValueError("输入内容为空，无法解析 JSON")

    # 1. Greedy markdown code block match
    code_block_pattern = r'```(?:json)?\s*([\{\[].*[\}\]])\s*```'
    match = re.search(code_block_pattern, content, re.DOTALL)
    if match:
        candidate_str = match.group(1).strip()
        try:
            return json.loads(candidate_str, strict=False)
        except Exception:
            try:
                repaired = json_repair.loads(candidate_str)
                if repaired and (isinstance(repaired, dict) or isinstance(repaired, list)):
                    return repaired
            except Exception:
                pass

    # 2. Extract balanced bracket block
    try:
        raw_json_str = extract_json_block(content, fallback_start, fallback_end)
        try:
            return json.loads(raw_json_str, strict=False)
        except Exception:
            try:
                repaired = json_repair.loads(raw_json_str)
                if repaired and (isinstance(repaired, dict) or isinstance(repaired, list)):
                    return repaired
            except Exception:
                pass
    except Exception:
        pass

    # 3. Outermost slice
    start = content.find(fallback_start)
    end = content.rfind(fallback_end)
    if start != -1 and end != -1 and end > start:
        slice_str = content[start:end+1]
        try:
            repaired = json_repair.loads(slice_str)
            if repaired and (isinstance(repaired, dict) or isinstance(repaired, list)):
                return repaired
        except Exception:
            pass

    # 4. Fallback: json_repair on full content
    try:
        repaired = json_repair.loads(content)
        if repaired and (isinstance(repaired, dict) or isinstance(repaired, list)):
            return repaired
    except Exception:
        pass

    raise ValueError("未能从模型返回内容中解析或修复出有效的 JSON 结构")

