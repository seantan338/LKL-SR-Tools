import time
import re
from typing import Optional, Dict, Any, List
from logger import setup_logger

logger = setup_logger(__name__)

# In-memory cache for Firestore users to optimize throughput
_USERS_CACHE: List[Dict[str, Any]] = []
_USERS_CACHE_TIME: float = 0.0
CACHE_TTL_SECONDS = 60.0

def get_team_members(db=None) -> List[Dict[str, Any]]:
    global _USERS_CACHE, _USERS_CACHE_TIME
    now = time.time()
    if _USERS_CACHE and (now - _USERS_CACHE_TIME) < CACHE_TTL_SECONDS:
        return _USERS_CACHE

    if not db:
        try:
            from firebase_admin_init import get_firestore_client
            db = get_firestore_client()
        except Exception:
            pass

    if not db:
        return _USERS_CACHE or []

    try:
        users_ref = db.collection("users")
        docs = users_ref.get()
        members = []
        for d in docs:
            data = d.to_dict() or {}
            data["id"] = d.id
            data["uid"] = data.get("uid") or d.id
            members.append(data)
        _USERS_CACHE = members
        _USERS_CACHE_TIME = now
        logger.info(f"Refreshed team members cache: {len(members)} active members loaded.")
        return _USERS_CACHE
    except Exception as e:
        logger.warning(f"Failed to fetch users collection from Firestore: {e}")
        return _USERS_CACHE or []


def resolve_canonical_pic(raw_name: Optional[str], assigned_to: Optional[str] = None, db = None) -> Dict[str, Any]:
    """
    Python counterpart of web/lib/identity.mjs resolveCanonicalPic.
    Normalizes variant PIC names (e.g., 'YeeYuan', 'yeeyuan', 'Yee Yuan', 'hok yeeyuan' -> 'Hok Yee Yuan')
    and binds official Firestore user UID. Freelance/external PICs (e.g. 'MR KEE') are NOT hijacked by assigned_to.
    """
    members = get_team_members(db)

    raw = (raw_name or "").strip()
    is_raw_empty_or_unassigned = (
        not raw or
        raw in ["未分配", "未分配顾问"] or
        raw.lower() in ["unassigned", "none", "null", "n/a", "undefined"]
    )

    # 1. 如果没有填写显式 PIC 姓名，才使用 assigned_to 成员 UID 作为备选归属
    if is_raw_empty_or_unassigned:
        if assigned_to:
            for m in members:
                if m.get("id") == assigned_to or m.get("uid") == assigned_to:
                    disp_name = m.get("displayName") or m.get("name") or (m.get("email", "").split("@")[0] if m.get("email") else "顾问")
                    return {
                        "key": f"uid:{m.get('id') or m.get('uid')}",
                        "displayName": disp_name,
                        "uid": m.get("id") or m.get("uid"),
                        "isExternal": False
                    }
        return {
            "key": "unassigned",
            "displayName": "未分配顾问",
            "uid": "",
            "isExternal": False
        }

    norm_pic = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fa5]', '', raw.lower())
    if not norm_pic:
        return {
            "key": "unassigned",
            "displayName": "未分配顾问",
            "uid": "",
            "isExternal": False
        }

    # 2. 优先匹配在册团队成员（支持 UID、别名、去空格全拼、名与姓切分）
    for m in members:
        uid_val = m.get("id") or m.get("uid")
        disp_name = (m.get("displayName") or m.get("name") or "").strip()
        email_prefix = (m.get("email") or "").split("@")[0].strip()
        aliases = m.get("aliases") if isinstance(m.get("aliases"), list) else []
        candidates_to_match = [c for c in [disp_name, email_prefix] + aliases if c]

        # 直接 UID 匹配
        if uid_val and (raw == uid_val or norm_pic == str(uid_val).lower()):
            return {
                "key": f"uid:{uid_val}",
                "displayName": disp_name or email_prefix or "顾问",
                "uid": uid_val,
                "isExternal": False
            }

        # 完全归一化匹配
        has_exact = False
        for cand in candidates_to_match:
            norm_cand = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fa5]', '', cand.lower())
            if norm_cand and norm_cand == norm_pic:
                has_exact = True
                break

        if has_exact:
            return {
                "key": f"uid:{uid_val}",
                "displayName": disp_name or email_prefix,
                "uid": uid_val,
                "isExternal": False
            }

        # 名字成分匹配 (例如 'Hok Yee Yuan' -> tokens ['hok', 'yee', 'yuan'])
        tokens = [t.lower() for t in disp_name.split() if t]
        if len(tokens) >= 2:
            given_name_norm = "".join(tokens[1:])  # 'yeeyuan'
            full_name_norm = "".join(tokens)       # 'hokyeeyuan'
            first_name_norm = tokens[0]            # 'hok' or 'kalap'
            last_name_norm = tokens[-1]            # 'yuan' or 'lok'

            if norm_pic in [given_name_norm, full_name_norm]:
                return {
                    "key": f"uid:{uid_val}",
                    "displayName": disp_name or email_prefix,
                    "uid": uid_val,
                    "isExternal": False
                }

            if len(norm_pic) >= 4 and (norm_pic == first_name_norm or norm_pic == last_name_norm):
                return {
                    "key": f"uid:{uid_val}",
                    "displayName": disp_name or email_prefix,
                    "uid": uid_val,
                    "isExternal": False
                }

    # 3. 兜底无成员命中：判定为【外部/Freelance顾问】（例如 "MR KEE"）
    words = raw.split()
    formatted_words = []
    for w in words:
        clean = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fa5.]', '', w)
        if not clean:
            continue
        upper = clean.upper().replace('.', '')
        if upper in ['MR', 'MS', 'MRS', 'DR', 'MDM']:
            formatted_words.append(upper.capitalize() + ('.' if '.' in clean else ''))
        else:
            formatted_words.append(clean.capitalize())
    formatted_name = " ".join(formatted_words) if formatted_words else raw

    return {
        "key": f"norm:{norm_pic}",
        "displayName": formatted_name,
        "uid": "",
        "isExternal": True
    }
