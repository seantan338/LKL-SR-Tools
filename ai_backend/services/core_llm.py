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

# Try loading ai_backend/.env first, then fallback to current working directory
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_file = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_file):
    load_dotenv(_env_file)
load_dotenv()

# ==============================================================================
# Dual Provider Auto-Detection: Google Gemini API (AI Studio) vs OpenRouter
# ==============================================================================
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

def _is_valid_key(k: str) -> bool:
    return bool(k and k not in ("your_gemini_api_key_here", "your_openrouter_api_key_here", "placeholder"))

# Allow explicit override via AI_PROVIDER ('gemini' or 'openrouter')
env_provider = os.getenv("AI_PROVIDER", "").strip().lower()

if env_provider in ("openrouter", "gemini"):
    ACTIVE_PROVIDER = env_provider
elif _is_valid_key(GEMINI_API_KEY):
    ACTIVE_PROVIDER = "gemini"
elif _is_valid_key(OPENROUTER_API_KEY):
    ACTIVE_PROVIDER = "openrouter"
else:
    ACTIVE_PROVIDER = "gemini"

IS_OPENROUTER = (ACTIVE_PROVIDER == "openrouter")

if IS_OPENROUTER:
    BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    API_KEY = OPENROUTER_API_KEY
    MODEL_HEAVY = os.getenv("MODEL_HEAVY", os.getenv("AI_MODEL_NAME", "anthropic/claude-sonnet-4.5"))
    MODEL_LIGHT = os.getenv("MODEL_LIGHT", "google/gemini-2.5-flash")
    MODEL_CV = os.getenv("MODEL_CV", "google/gemini-3.8-flash")
    MODEL_JD = os.getenv("MODEL_JD", "google/gemini-3.8-flash")
    AI_MODEL_NAME = MODEL_HEAVY
    MODEL_TIER_MAP = {
        "candidate": MODEL_LIGHT,
        "interview_schedule": MODEL_LIGHT,
        "job_order": MODEL_HEAVY,
        "resume_cv": MODEL_CV,
        "cv": MODEL_CV,
        "generate_jds": MODEL_JD,
    }
else:
    BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
    API_KEY = GEMINI_API_KEY
    MODEL_PRO = os.getenv("GEMINI_MODEL_PRO", "gemini-3.1-pro-preview")
    MODEL_FLASH = os.getenv("GEMINI_MODEL_FLASH", "gemini-3.8-flash")
    AI_MODEL_NAME = MODEL_PRO
    MODEL_TIER_MAP = {
        "candidate": MODEL_FLASH,
        "interview_schedule": MODEL_FLASH,
        "job_order": MODEL_PRO,
        "resume_cv": MODEL_FLASH,
        "cv": MODEL_FLASH,
        "generate_jds": MODEL_FLASH,
    }

logger.info(f"[core_llm] Active AI Provider: {ACTIVE_PROVIDER.upper()} (Base URL: {BASE_URL}, Default Model: {AI_MODEL_NAME})")

def get_model_for_task(target_type: str) -> str:
    """
    根据任务复杂度分级返回最适模型：
    - 体力活/模式提取（candidate、interview_schedule、resume_cv、generate_jds）：轻量模型 (Flash / MODEL_LIGHT)
    - 深度推理/段落合并/跨行语义（job_order 及未列出的任务）：旗舰模型 (Pro / MODEL_HEAVY)
    """
    normalized = (target_type or "").lower().strip()
    return MODEL_TIER_MAP.get(normalized, AI_MODEL_NAME)

# 单次请求最长等待 120 秒，失败只重试 1 次（SDK 默认 600 秒 + 2 次重试，最坏可挂约 30 分钟）
client = AsyncOpenAI(
    base_url=BASE_URL,
    api_key=API_KEY or "dummy_key_to_prevent_init_crash",
    timeout=httpx.Timeout(120.0, connect=10.0),
    max_retries=1,
)

def get_client() -> AsyncOpenAI:
    return client

def ensure_api_key():
    if IS_OPENROUTER:
        if not _is_valid_key(OPENROUTER_API_KEY):
            logger.error("OPENROUTER_API_KEY not configured")
            raise ValueError("请在 .env 文件中配置 OPENROUTER_API_KEY")
    else:
        if not _is_valid_key(GEMINI_API_KEY):
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

