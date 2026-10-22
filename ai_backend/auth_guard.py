import os
import secrets
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, Request
import firebase_admin.auth
from firebase_admin_init import get_firestore_client
from logger import setup_logger

logger = setup_logger(__name__)


def _get_internal_secret() -> str:
    return os.getenv("INTERNAL_API_SECRET", "").strip()


def _get_webhook_secret() -> str:
    return os.getenv("WEBHOOK_SECRET", "").strip()


async def verify_user_or_internal_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> Dict[str, Any]:
    """
    统一鉴权依赖：
    1. 支持内部服务密钥 (INTERNAL_API_SECRET)，通过 Authorization: Bearer <secret> 或 X-API-Key: <secret> 传递；
    2. 支持前端登录用户的 Firebase ID Token (Authorization: Bearer <id_token>)；
    3. 验签失败一律返回 401 Unauthorized，绝不执行未验签的 Base64 裸解码。
    """
    internal_secret = _get_internal_secret()

    # 1. Check X-API-Key header for internal secret
    if x_api_key and internal_secret and secrets.compare_digest(x_api_key.strip(), internal_secret):
        return {
            "uid": "internal_service",
            "email": "system@talentflow.internal",
            "name": "Internal Service",
            "auth_type": "internal_secret",
        }

    # 2. Check Authorization Bearer header
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="未授权访问：缺少有效的 Authorization Bearer Token，请重新登录系统后重试 / Unauthorized: Missing valid Authorization Bearer Token, please sign in again",
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="未授权访问：Token 为空 / Unauthorized: Empty token")

    # 2a. Match against INTERNAL_API_SECRET if configured
    if internal_secret and secrets.compare_digest(token, internal_secret):
        return {
            "uid": "internal_service",
            "email": "system@talentflow.internal",
            "name": "Internal Service",
            "auth_type": "internal_secret",
        }

    # 2b. Verify Firebase ID Token (ensure Firebase Admin app is initialized first)
    get_firestore_client()
    try:
        decoded = firebase_admin.auth.verify_id_token(token, clock_skew_seconds=60)
        return {
            "uid": decoded.get("uid") or decoded.get("sub"),
            "email": decoded.get("email", ""),
            "name": decoded.get("name", ""),
            "auth_type": "firebase",
        }
    except Exception as e:
        logger.warning(f"Firebase ID Token verification failed from {request.client.host if request.client else 'unknown'}: {e}")
        raise HTTPException(
            status_code=401,
            detail="登录凭证已过期或无效，请刷新页面或重新登录 / Session expired or invalid, please refresh or sign in again",
        )


async def verify_optional_webhook_secret(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> bool:
    """
    外部 Webhook（Google Sheets Apps Script / n8n / Telegram）平滑鉴权依赖：
    - 若环境变量配置了 WEBHOOK_SECRET，则强制比对请求头中的 Bearer Token 或 X-API-Key；
    - 若未配置 WEBHOOK_SECRET，则记录调试日志并放行，确保现有外部脚本不中断。
    """
    webhook_secret = _get_webhook_secret()
    if not webhook_secret:
        return True

    candidate = ""
    if x_api_key:
        candidate = x_api_key.strip()
    elif authorization and authorization.startswith("Bearer "):
        candidate = authorization.split("Bearer ", 1)[1].strip()

    if candidate and secrets.compare_digest(candidate, webhook_secret):
        return True

    logger.warning(f"Webhook request rejected due to invalid WEBHOOK_SECRET from {request.client.host if request.client else 'unknown'}")
    raise HTTPException(status_code=401, detail="Invalid Webhook Secret")
