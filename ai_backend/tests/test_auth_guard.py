import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth_guard import verify_user_or_internal_token, verify_optional_webhook_secret


@pytest.mark.asyncio
async def test_auth_guard_missing_token_raises_401():
    req = MagicMock()
    req.client.host = "127.0.0.1"

    with pytest.raises(HTTPException) as exc_info:
        await verify_user_or_internal_token(request=req, authorization=None, x_api_key=None)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_auth_guard_internal_secret_bearer():
    req = MagicMock()
    with patch("auth_guard._get_internal_secret", return_value="my-secret-123"):
        user = await verify_user_or_internal_token(
            request=req,
            authorization="Bearer my-secret-123",
            x_api_key=None
        )
        assert user["auth_type"] == "internal_secret"
        assert user["uid"] == "internal_service"


@pytest.mark.asyncio
async def test_auth_guard_internal_secret_x_api_key():
    req = MagicMock()
    with patch("auth_guard._get_internal_secret", return_value="my-secret-123"):
        user = await verify_user_or_internal_token(
            request=req,
            authorization=None,
            x_api_key="my-secret-123"
        )
        assert user["auth_type"] == "internal_secret"
        assert user["uid"] == "internal_service"


@pytest.mark.asyncio
async def test_auth_guard_firebase_token_success():
    req = MagicMock()
    with patch("auth_guard._get_internal_secret", return_value="my-secret-123"):
        with patch("auth_guard.get_firestore_client", return_value=MagicMock()):
            with patch("firebase_admin.auth.verify_id_token", return_value={"uid": "usr_999", "email": "test@demo.com", "name": "Tester"}):
                user = await verify_user_or_internal_token(
                    request=req,
                    authorization="Bearer valid-firebase-token",
                    x_api_key=None
                )
                assert user["auth_type"] == "firebase"
                assert user["uid"] == "usr_999"
                assert user["email"] == "test@demo.com"


@pytest.mark.asyncio
async def test_webhook_secret_optional_when_unconfigured():
    req = MagicMock()
    with patch("auth_guard._get_webhook_secret", return_value=""):
        res = await verify_optional_webhook_secret(request=req, authorization=None, x_api_key=None)
        assert res is True


@pytest.mark.asyncio
async def test_webhook_secret_enforced_when_configured():
    req = MagicMock()
    req.client.host = "127.0.0.1"
    with patch("auth_guard._get_webhook_secret", return_value="wh_secure_key"):
        with pytest.raises(HTTPException) as exc_info:
            await verify_optional_webhook_secret(request=req, authorization="Bearer wrong_key", x_api_key=None)
        assert exc_info.value.status_code == 401

        res = await verify_optional_webhook_secret(request=req, authorization="Bearer wh_secure_key", x_api_key=None)
        assert res is True
