import os
import io
import uuid
import base64
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import httpx
from logger import setup_logger
from file_parser import parse_file, extract_images_from_pdf
from services.cv_parser import parse_cv, parse_cv_from_images
from firebase_admin_init import get_firestore_client

logger = setup_logger(__name__)

# --- Configuration ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_DEFAULT_TEAM = os.getenv("TELEGRAM_DEFAULT_TEAM", "default_team").strip()
TELEGRAM_ALLOWED_USERS = [u.strip().lower() for u in os.getenv("TELEGRAM_ALLOWED_USERS", "").split(",") if u.strip()]
TELEGRAM_ALLOWED_CHATS = [c.strip().lower() for c in os.getenv("TELEGRAM_ALLOWED_CHATS", "").split(",") if c.strip()]
TELEGRAM_SILENT_MODE = os.getenv("TELEGRAM_SILENT_MODE", "true").lower() in ("true", "1", "yes")
TELEGRAM_ENABLE_POLLING = os.getenv("TELEGRAM_ENABLE_POLLING", "false").lower() in ("true", "1", "yes")
WEB_APP_BASE_URL = os.getenv("WEB_APP_BASE_URL", "http://localhost:3000").rstrip("/")
STORAGE_BUCKET_NAME = os.getenv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "").strip()


API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
FILE_URL = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}"

def extract_filename_hints(filename: str) -> dict:
    """
    Extracts company, position, and candidate name hints from standard corporate CV filenames.
    E.g. 'Greif SG- Stacker-Mohd Izzat Ezmer Bin Mohd Isa.docx' ->
         company='Greif SG', position='Stacker', name='Mohd Izzat Ezmer Bin Mohd Isa'
    """
    clean = filename.rsplit(".", 1)[0]
    # Replace common formatting variations
    parts = [p.strip() for p in clean.replace(" - ", "-").replace(" -", "-").replace("- ", "-").split("-") if p.strip()]
    if len(parts) >= 3:
        return {
            "company": parts[0],
            "position": parts[1],
            "name": parts[2]
        }
    elif len(parts) == 2:
        return {
            "company": "",
            "position": parts[0],
            "name": parts[1]
        }
    return {}


# --- Telegram API Client Helpers ---

async def telegram_api_call(method: str, params: Optional[Dict[str, Any]] = None, json_data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Makes an asynchronous call to the Telegram Bot API."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("Telegram Bot Token is not set.")
        return None

    url = f"{API_URL}/{method}"
    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            if json_data is not None:
                resp = await client.post(url, json=json_data)
            else:
                resp = await client.post(url, params=params)
            
            data = resp.json()
            if not data.get("ok"):
                desc = data.get("description", "")
                if "Conflict" in desc and "webhook is active" in desc:
                    logger.warning("[Telegram Bot] 检测到 Telegram Webhook 已处于激活状态，自动停止本地长轮询以避免冲突。")
                    stop_telegram_polling()
                    return None
                logger.error(f"Telegram API call {method} error: {desc}")
                return None
            return data.get("result")
    except Exception as e:
        logger.error(f"Telegram API call {method} exception: {e}")
        return None

async def send_telegram_message(chat_id: int | str, text: str, parse_mode: str = "HTML", reply_to_message_id: Optional[int] = None) -> bool:
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True
    }
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id

    res = await telegram_api_call("sendMessage", json_data=payload)
    return res is not None

async def send_chat_action(chat_id: int | str, action: str = "typing") -> None:
    await telegram_api_call("sendChatAction", params={"chat_id": chat_id, "action": action})

async def download_telegram_file(file_id: str) -> Optional[tuple[bytes, str]]:
    """Retrieves file path via getFile and downloads file bytes."""
    file_info = await telegram_api_call("getFile", params={"file_id": file_id})
    if not file_info or "file_path" not in file_info:
        logger.error(f"Failed to get file info for file_id: {file_id}")
        return None

    remote_path = file_info["file_path"]
    download_url = f"{FILE_URL}/{remote_path}"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(download_url)
            if resp.status_code == 200:
                filename = os.path.basename(remote_path)
                return resp.content, filename
            else:
                logger.error(f"Download failed from Telegram with status: {resp.status_code}")
                return None
    except Exception as e:
        logger.error(f"Error downloading file {file_id}: {e}")
        return None

# --- File Storage (Firebase Storage & Local Fallback) ---

def save_resume_file(file_bytes: bytes, original_filename: str, team_id: str = "default_team") -> str:
    """
    Saves resume file to Firebase Storage if configured;
    otherwise falls back to local storage in ai_backend/uploads/resumes/.
    Returns accessible URL or path.
    """
    ext = original_filename.split(".")[-1].lower() if "." in original_filename else "bin"
    unique_filename = f"{uuid.uuid4().hex[:10]}_{original_filename}"

    # 1. Try Firebase Storage
    if STORAGE_BUCKET_NAME:
        try:
            import firebase_admin
            from firebase_admin import storage
            bucket = storage.bucket(STORAGE_BUCKET_NAME)
            blob_path = f"resumes/{team_id}/{unique_filename}"
            blob = bucket.blob(blob_path)

            content_type = "application/pdf" if ext == "pdf" else (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if ext == "docx" else "application/octet-stream"
            )
            blob.upload_from_string(file_bytes, content_type=content_type)
            try:
                blob.make_public()
                logger.info(f"Uploaded resume to Firebase Storage: {blob.public_url}")
                return blob.public_url
            except Exception:
                # If make_public is not allowed by bucket security rules, return signed URL
                from datetime import timedelta
                signed_url = blob.generate_signed_url(expiration=timedelta(days=180))
                return signed_url
        except Exception as st_err:
            logger.warning(f"Firebase Storage upload failed: {st_err}. Falling back to local storage.")

    # 2. Fallback: Local file system
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "resumes")
    os.makedirs(upload_dir, exist_ok=True)
    local_path = os.path.join(upload_dir, unique_filename)
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    
    logger.info(f"Saved resume to local path: {local_path}")
    return f"/uploads/resumes/{unique_filename}"

# --- Document & Image AI Parser Pipeline ---

async def parse_cv_payload(file_bytes: bytes, filename: str) -> dict:
    """Parses CV bytes (PDF/DOCX/DOC/TXT or Image) into structured JSON."""
    ext = filename.split(".")[-1].lower() if "." in filename else ""

    if ext in ["jpg", "jpeg", "png", "webp"]:
        logger.info(f"Processing image CV: {filename}")
        img_b64 = base64.b64encode(file_bytes).decode("utf-8")
        return await parse_cv_from_images([img_b64])

    logger.info(f"Extracting text from document: {filename}")
    extracted_text = parse_file(file_bytes, filename)

    # Scanned PDF fallback: if text extracted is too short, extract pages as images for Vision LLM
    if len(extracted_text.strip()) < 50 and ext == "pdf":
        logger.info(f"Document {filename} has short text. Falling back to Vision OCR extraction...")
        images = extract_images_from_pdf(file_bytes)
        if images:
            return await parse_cv_from_images(images)

    if not extracted_text.strip():
        raise ValueError("未能从文件中提取出有效文本，请确认文件是否为空或为未识别的扫描件。")

    # Corporate naming convention hint (Company - Position - Candidate Name)
    hints = extract_filename_hints(filename)
    if hints:
        hint_header = (
            f"[Filename Metadata Clues] Company: {hints.get('company')}, "
            f"Target Position: {hints.get('position')}, "
            f"Candidate Name: {hints.get('name')}\n\n"
        )
        extracted_text = hint_header + extracted_text

    return await parse_cv(extracted_text)

# --- Firestore Upsert & Deduplication ---

def clean_phone_number(raw_phone: Optional[str]) -> str:
    if not raw_phone:
        return ""
    return "".join(c for c in str(raw_phone) if c.isdigit())

async def upsert_candidate_to_firestore(
    parsed_data: dict,
    resume_url: str,
    original_filename: str,
    team_id: str = "default_team",
    sender_info: Optional[dict] = None
) -> dict:
    """
    Deduplicates and persists parsed candidate data into Firestore teams/{team_id}/candidates.
    """
    db = get_firestore_client()
    if not db:
        raise RuntimeError("Firestore 数据库未初始化，无法保存候选人。")

    cv = parsed_data.get("parsed_cv", {})
    personal = cv.get("personal_information", {}) or {}
    education_list = cv.get("education", []) or []
    history_list = cv.get("professional_history", []) or []
    missing_analysis = parsed_data.get("missing_analysis", {}) or {}

    hints = extract_filename_hints(original_filename)

    name = personal.get("name") or hints.get("name") or "未命名候选人"
    raw_phone = personal.get("phone") or ""
    clean_phone = clean_phone_number(raw_phone)
    email = personal.get("email") or ""
    address = personal.get("address") or ""
    age = str(personal.get("age")) if personal.get("age") is not None else ""
    salary = personal.get("expected_salary") or personal.get("last_drawn_salary") or ""

    # Sunrise CV Specific Fields
    nationality = personal.get("nationality") or ""
    race = personal.get("race") or ""
    gender = personal.get("gender") or ""
    marital_status = personal.get("marital_status") or ""
    last_drawn_salary = personal.get("last_drawn_salary") or ""
    expected_salary = personal.get("expected_salary") or ""
    availability = personal.get("availability") or ""
    languages = cv.get("languages", []) or []

    # Primary Education
    school = education_list[0].get("school", "") if education_list else ""
    major = education_list[0].get("major", "") if education_list else ""
    degree = education_list[0].get("degree", "") or (education_list[0].get("qualification", "") if education_list else "")

    # Primary Work
    experience = cv.get("total_years_experience") or ""
    # Target company: only extract if corporate filename pattern exists; never fallback to past employers
    company = hints.get("company", "") or ""
    position = cv.get("position_applied") or hints.get("position") or (history_list[0].get("position", "") if history_list else "") or "待定职位"


    skills = cv.get("skills", []) or []
    missing_fields = missing_analysis.get("missing_critical_fields", []) or []
    suggested_questions = missing_analysis.get("suggested_questions_for_hr", []) or []

    candidates_ref = db.collection("teams").document(team_id).collection("candidates")

    # 1. Deduplication check by phone or email
    existing_doc = None
    if clean_phone and len(clean_phone) >= 7:
        snaps = candidates_ref.where("phone", "==", clean_phone).limit(1).get()
        if snaps:
            existing_doc = snaps[0]

    if not existing_doc and email and "@" in email:
        snaps = candidates_ref.where("email", "==", email.lower()).limit(1).get()
        if snaps:
            existing_doc = snaps[0]

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sender_name = sender_info.get("username") or sender_info.get("first_name") or str(sender_info.get("id", "TelegramBot"))

    from services.identity_service import resolve_canonical_pic
    canonical_pic = resolve_canonical_pic(sender_name, None, db)
    pic_display_name = canonical_pic["displayName"] if canonical_pic["key"] != "unassigned" else sender_name
    canonical_assigned_to = canonical_pic["uid"] if canonical_pic["uid"] else f"tg_{sender_name}"

    if existing_doc:
        candidate_id = existing_doc.id
        existing_data = existing_doc.to_dict() or {}
        
        # Merge update
        update_payload = {
            "name": name if name != "未命名候选人" else existing_data.get("name", name),
            "phone": clean_phone or existing_data.get("phone", ""),
            "email": email or existing_data.get("email", ""),
            "position": position or existing_data.get("position", ""),
            "salary": expected_salary or salary or existing_data.get("salary", ""),
            "offered": expected_salary or salary or existing_data.get("offered", ""),
            "location": address or existing_data.get("location", ""),
            "school": school or existing_data.get("school", ""),
            "major": major or existing_data.get("major", ""),
            "degree": degree or existing_data.get("degree", ""),
            "experience": experience or existing_data.get("experience", ""),
            "skills": list(set((existing_data.get("skills") or []) + skills)),
            # Sunrise CV Fields
            "nationality": nationality or existing_data.get("nationality", ""),
            "race": race or existing_data.get("race", ""),
            "gender": gender or existing_data.get("gender", ""),
            "maritalStatus": marital_status or existing_data.get("maritalStatus", ""),
            "lastDrawnSalary": last_drawn_salary or existing_data.get("lastDrawnSalary", ""),
            "expectedSalary": expected_salary or existing_data.get("expectedSalary", ""),
            "availability": availability or existing_data.get("availability", ""),
            "languages": languages if languages else existing_data.get("languages", []),
            "workExperience": history_list if history_list else existing_data.get("workExperience", []),
            "resumeUrl": resume_url or existing_data.get("resumeUrl", ""),
            "rawResumeFilename": original_filename,
            "parsedCvData": parsed_data,
            "missingFields": missing_fields,
            "suggestedQuestions": suggested_questions,
            "updatedAt": now_iso,
            "lastSource": "Telegram Update",
        }
        
        if not existing_data.get("picName"):
            update_payload["picName"] = pic_display_name
        if not existing_data.get("assignedTo"):
            update_payload["assignedTo"] = canonical_assigned_to

        # Append to notes or history
        note_entry = f"[{now_iso[:16]}] 顾问 {pic_display_name} (@{sender_name}) 重新投递/更新了简历 ({original_filename})"
        existing_notes = existing_data.get("notes", "")
        update_payload["notes"] = f"{existing_notes}\n{note_entry}".strip() if existing_notes else note_entry

        candidates_ref.document(candidate_id).set(update_payload, merge=True)
        logger.info(f"Updated existing candidate {candidate_id} ({name}) from Telegram")
        return {
            "is_new": False,
            "candidate_id": candidate_id,
            "name": name,
            "phone": clean_phone or raw_phone,
            "position": position,
            "salary": salary,
            "school": school,
            "degree": degree,
            "experience": experience,
            "missing_fields": missing_fields,
            "suggested_questions": suggested_questions,
            "resume_url": resume_url
        }
    else:
        # Create brand new candidate
        candidate_id = str(uuid.uuid4())
        candidate_payload = {
            "id": candidate_id,
            "name": name,
            "phone": clean_phone or raw_phone,
            "email": email,
            "school": school,
            "major": major,
            "degree": degree,
            "experience": experience,
            "location": address,
            "age": age,
            "salary": expected_salary or salary,
            "offered": expected_salary or salary,
            "company": company,
            "position": position,
            # Sunrise CV Fields
            "nationality": nationality,
            "race": race,
            "gender": gender,
            "maritalStatus": marital_status,
            "lastDrawnSalary": last_drawn_salary,
            "expectedSalary": expected_salary,
            "availability": availability,
            "languages": languages,
            "workExperience": history_list,
            "source": "Telegram",
            "stage": "screening",
            "stageHistory": [{"stage": "screening", "movedAt": now_iso}],
            "status": "active",
            "interviewDate": None,
            "interviewTime": None,
            "resumeUrl": resume_url,
            "rawResumeFilename": original_filename,
            "skills": skills,
            "parsedCvData": parsed_data,
            "missingFields": missing_fields,
            "suggestedQuestions": suggested_questions,
            "picName": pic_display_name,
            "assignedTo": canonical_assigned_to,
            "notes": f"[{now_iso[:16]}] 由顾问 {pic_display_name} (@{sender_name}) 上传解析入库",
            "createdAt": now_iso,
            "updatedAt": now_iso
        }
        candidates_ref.document(candidate_id).set(candidate_payload)
        logger.info(f"Created new candidate {candidate_id} ({name}) from Telegram")
        return {
            "is_new": True,
            "candidate_id": candidate_id,
            "name": name,
            "phone": clean_phone or raw_phone,
            "position": position,
            "salary": salary,
            "school": school,
            "degree": degree,
            "experience": experience,
            "missing_fields": missing_fields,
            "suggested_questions": suggested_questions,
            "resume_url": resume_url
        }

# --- Message Processing Core ---

def is_request_authorized(chat: dict, from_user: dict) -> bool:
    """
    Checks if message from a private chat or group chat is authorized.
    For Group/Supergroup:
      - If TELEGRAM_ALLOWED_CHATS is configured, matches against chat ID (e.g. -1003899979396 or 1003899979396) or title.
      - If TELEGRAM_ALLOWED_CHATS is empty, all groups the bot is invited into are automatically authorized!
    For Private Chat:
      - Checks TELEGRAM_ALLOWED_USERS whitelist (if empty, allows all).
    """
    chat_type = chat.get("type", "private")
    chat_id = str(chat.get("id", "")).lower()
    chat_title = str(chat.get("title", "")).lower()

    if chat_type in ("group", "supergroup"):
        if not TELEGRAM_ALLOWED_CHATS:
            return True
        clean_id = chat_id.replace("-100", "").replace("-", "")
        for allowed in TELEGRAM_ALLOWED_CHATS:
            clean_allowed = allowed.lstrip("@").lower().replace("-100", "").replace("-", "")
            if clean_allowed in (clean_id, chat_id, chat_title):
                return True
        return False

    # Private chat
    if not TELEGRAM_ALLOWED_USERS:
        return True
    user_id = str(from_user.get("id", "")).lower()
    username = str(from_user.get("username", "")).lower()
    for allowed in TELEGRAM_ALLOWED_USERS:
        clean = allowed.lstrip("@").lower()
        if clean in (user_id, username):
            return True
    return False

def format_telegram_reply(candidate_res: dict, is_group: bool = False) -> str:
    """Constructs a clean HTML confirmation message for Telegram without emojis."""
    cid = candidate_res.get("candidate_id")
    name = candidate_res.get("name") or "未知"
    phone = candidate_res.get("phone") or "未提供"
    position = candidate_res.get("position") or "待定职位"
    company = candidate_res.get("company") or ""
    salary = candidate_res.get("salary") or "面议 / 未说明"
    school = candidate_res.get("school") or "未填写"
    degree = candidate_res.get("degree") or ""
    experience = candidate_res.get("experience") or "未说明"
    resume_url = candidate_res.get("resume_url") or ""
    web_link = f"{WEB_APP_BASE_URL}/candidates?id={cid}"

    edu_str = f"{school} ({degree})" if degree else school

    # Group mode: Clean, high-density, professional card without emojis
    if is_group:
        is_new = candidate_res.get("is_new", True)
        status_tag = "<b>[简历已入库]</b>" if is_new else "<b>[档案已更新]</b>"
        lines = [
            f"{status_tag} <b>{name}</b>",
            f"岗位: {position}" + (f" ({company})" if company else ""),
            f"电话: {phone} | 薪资: {salary}",
            f"学历: {edu_str} | 经验: {experience}",
        ]
        missing = candidate_res.get("missing_fields") or []
        if missing:
            short_missing = [m.split(".")[-1] for m in missing[:2]]
            lines.append(f"待补项: {', '.join(short_missing)}")
        lines.append(f"<a href=\"{web_link}\">在 Talent Flow 查看档案</a>")
        return "\n".join(lines)

    # Private chat: Detailed card without emojis
    is_new = candidate_res.get("is_new", True)
    title = "<b>[新简历录入成功]</b>" if is_new else "<b>[候选人档案已更新]</b>"

    lines = [
        title,
        "",
        f"姓名: {name}",
        f"电话: {phone}",
        f"目标岗位: {position}" + (f" ({company})" if company else ""),
        f"薪资期望: {salary}",
        f"教育背景: {edu_str}",
        f"工作经验: {experience}",
    ]

    missing = candidate_res.get("missing_fields") or []
    if missing:
        lines.append("")
        lines.append("待补关键信息:")
        for m in missing[:3]:
            field_name = m.split(".")[-1]
            lines.append(f"  - {field_name}")

    questions = candidate_res.get("suggested_questions") or []
    if questions:
        lines.append("")
        lines.append("AI 建议追问问题:")
        for q in questions[:2]:
            lines.append(f"  * <i>{q}</i>")

    lines.append("")
    if resume_url:
        lines.append(f"<a href=\"{resume_url}\">预览原始简历附件</a>")
    
    lines.append(f"<a href=\"{web_link}\">在 Talent Flow 看板中查看</a>")

    return "\n".join(lines)

async def handle_telegram_update(update: dict) -> None:
    """
    Processes incoming Telegram update in pure silent monitoring mode.
    Silently downloads, AI-parses, deduplicates, and saves to Firestore without chatting.
    """
    message = update.get("message") or update.get("edited_message")
    if not message:
        return

    chat = message["chat"]
    chat_id = chat["id"]
    from_user = message.get("from", {})
    msg_id = message.get("message_id")
    is_group = chat.get("type") in ("group", "supergroup")

    # 1. Authorization check
    if not is_request_authorized(chat, from_user):
        if not is_group and not TELEGRAM_SILENT_MODE:
            logger.warning(f"Unauthorized Telegram access attempt by user: {from_user}")
            await send_telegram_message(
                chat_id,
                "[访问被拒绝] 抱歉，您未在 Talent Flow 授权顾问白名单中。",
                reply_to_message_id=msg_id
            )
        return

    # 2. Check for commands
    text = (message.get("text") or message.get("caption") or "").strip()
    if text.startswith("/start") or text.startswith("/help"):
        if not is_group and not TELEGRAM_SILENT_MODE:
            help_msg = (
                "[Talent Flow 智能招聘工作流机器人]\n\n"
                "向我发送：\n"
                "- PDF / Word (.docx/.doc) / TXT 简历文件\n"
                "- 纸质简历照片 / 截图 (自动触发 Vision 视觉识别)\n"
                "- 整段简历纯文本\n\n"
                "系统将自动由 AI 提取结构化数据并沉淀至系统人才库。"
            )
            await send_telegram_message(chat_id, help_msg, reply_to_message_id=msg_id)
        return

    file_bytes = None
    original_filename = ""

    # 3. Handle Document
    if "document" in message:
        doc = message["document"]
        original_filename = doc.get("file_name", "resume.pdf")
        file_id = doc["file_id"]
        
        logger.info(f"[Telegram Bot] 监听到群组/会话中的简历文件: {original_filename} (来自: {from_user.get('username') or from_user.get('id')})")
        res = await download_telegram_file(file_id)
        if res:
            file_bytes, _ = res

    # 4. Handle Photo
    elif "photo" in message:
        photos = message["photo"]
        largest_photo = photos[-1]
        file_id = largest_photo["file_id"]
        original_filename = f"photo_{file_id[:8]}.jpg"

        logger.info(f"[Telegram Bot] 监听到简历照片 (来自: {from_user.get('username') or from_user.get('id')})")
        res = await download_telegram_file(file_id)
        if res:
            file_bytes, _ = res

    # 5. Handle Text (Pasted CV)
    elif text and len(text) >= 80:
        logger.info(f"[Telegram Bot] 监听到长简历文本 (来自: {from_user.get('username') or from_user.get('id')})")
        file_bytes = text.encode("utf-8")
        original_filename = "pasted_resume.txt"

    else:
        return

    if not file_bytes:
        logger.warning(f"[Telegram Bot] 文件下载失败或为空: {original_filename}")
        return

    try:
        # A. Save to storage
        resume_url = save_resume_file(file_bytes, original_filename, TELEGRAM_DEFAULT_TEAM)

        # B. Parse with AI
        parsed_result = await parse_cv_payload(file_bytes, original_filename)

        # C. Upsert into Firestore
        candidate_res = await upsert_candidate_to_firestore(
            parsed_data=parsed_result,
            resume_url=resume_url,
            original_filename=original_filename,
            team_id=TELEGRAM_DEFAULT_TEAM,
            sender_info=from_user
        )

        # D. Log success silently (Zero-interference mode)
        logger.info(
            f"[Telegram Bot] [静默监控建档成功] 候选人: {candidate_res['name']} "
            f"| 岗位: {candidate_res['position']} | 团队: {TELEGRAM_DEFAULT_TEAM} "
            f"| ID: {candidate_res['candidate_id']}"
        )

        # E. Only reply if silent mode is explicitly disabled
        if not TELEGRAM_SILENT_MODE:
            reply_html = format_telegram_reply(candidate_res, is_group=is_group)
            await send_telegram_message(chat_id, reply_html, reply_to_message_id=msg_id)

        return {"status": "success", "candidate": candidate_res}

    except Exception as err:
        logger.error(f"[Telegram Bot] 静默解析建档异常 ({original_filename}): {err}", exc_info=True)
        if not TELEGRAM_SILENT_MODE:
            await send_telegram_message(
                chat_id,
                f"[处理失败] 无法解析文件 {original_filename}: {str(err)}",
                reply_to_message_id=msg_id
            )
        return {"status": "error", "message": str(err)}

# --- Polling Runner (Background Daemon) ---

_is_polling = False

async def start_telegram_polling() -> None:
    """Runs long-polling loop in the background if TELEGRAM_BOT_TOKEN is set and TELEGRAM_ENABLE_POLLING is enabled."""
    global _is_polling
    if not TELEGRAM_BOT_TOKEN:
        logger.info("未配置 TELEGRAM_BOT_TOKEN，跳过 Telegram Bot 轮询启动。")
        return

    if not TELEGRAM_ENABLE_POLLING:
        logger.info("[Telegram Bot] 后台长轮询已禁用 (TELEGRAM_ENABLE_POLLING=false)，系统处于 Webhook / n8n 接收模式。")
        return

    _is_polling = True
    logger.info(f"[Telegram Bot] 静默监控服务已启动 (静默模式: {TELEGRAM_SILENT_MODE})，正在监听消息流...")
    offset = 0

    while _is_polling:
        try:
            updates = await telegram_api_call("getUpdates", params={"offset": offset, "timeout": 20})
            if updates and isinstance(updates, list):
                for update in updates:
                    offset = max(offset, update["update_id"] + 1)
                    # Process concurrently without blocking poll loop
                    asyncio.create_task(handle_telegram_update(update))
            elif updates is None and not _is_polling:
                break
        except asyncio.CancelledError:
            logger.info("Telegram polling task cancelled.")
            break
        except Exception as e:
            logger.warning(f"Telegram polling error: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)

def stop_telegram_polling() -> None:
    global _is_polling
    _is_polling = False

