import uvicorn

from fastapi import FastAPI, UploadFile, Form, File, HTTPException, Request, Header, Depends
from auth_guard import verify_user_or_internal_token, verify_optional_webhook_secret

from fastapi.responses import JSONResponse

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from typing import Optional, Any

import traceback

from file_parser import parse_file

import os
import asyncio
from fastapi.staticfiles import StaticFiles

from services import (

    generate_jds,

    parse_job_orders,

    parse_candidates,

    parse_sheet_data,

    parse_cv,

    parse_interview_schedule,

    sync_candidates,

    sync_orders,

    match_candidates_for_order,

    start_telegram_polling,

    handle_telegram_update,

    stop_telegram_polling,

    save_resume_file,

    parse_cv_payload,

    upsert_candidate_to_firestore,

    get_client_ip,

    verify_clockin_eligibility,

)

from sheets_service import get_sheet_values, get_spreadsheet_tabs

from normalize import normalize_interview_schedule

from logger import logger

app = FastAPI(title="Talent Flow AI API")

# Max upload size limit (25MB) to prevent memory exhaustion (OOM) Denial of Service attacks
MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB

def check_file_size(file_bytes: bytes, max_size: int = MAX_UPLOAD_SIZE):
    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"文件体积过大（已超过 {max_size // (1024 * 1024)}MB 限制），拒绝处理以保护服务器内存 / File size exceeds {max_size // (1024 * 1024)}MB limit"
        )


# Mount static uploads directory for resume attachments & previews
uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.on_event("startup")
async def startup_event():
    logger.info("Talent Flow AI API starting up...")
    asyncio.create_task(start_telegram_polling())

@app.on_event("shutdown")
def shutdown_event():
    stop_telegram_polling()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": str(exc.detail)}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):

    error_msg = f"Internal Server Error: {str(exc)}\n{traceback.format_exc()}"

    logger.critical(error_msg)

    err_str = str(exc)

    err_lower = err_str.lower()

    from services.core_llm import IS_OPENROUTER

    if "429" in err_str or "resource_exhausted" in err_lower or "quota" in err_lower or "rate limit" in err_lower:
        if IS_OPENROUTER:
            msg = f"AI 提供商 (OpenRouter) 配额或频率超限 (HTTP 429) / OpenRouter quota or rate limit exceeded: {err_str}"
        else:
            msg = f"AI 提供商 (Gemini API) 配额或频率超限 (HTTP 429)，请稍后重试 / Gemini API rate limit exceeded, please retry later: {err_str}"
    elif "402" in err_str or "credits" in err_lower or "insufficient_quota" in err_lower:
        msg = f"AI 提供商账户余额不足 (HTTP 402)，请充值后重试 / AI provider insufficient balance (HTTP 402): {err_str}"
    elif "api key" in err_lower or "api_key_invalid" in err_lower or "permission_denied" in err_lower:
        if IS_OPENROUTER:
            msg = f"OpenRouter API 密钥无效或无权限 / Invalid OpenRouter API key: {err_str}"
        else:
            msg = f"Gemini API 密钥无效或无权限 / Invalid Gemini API key: {err_str}"
    else:
        msg = f"服务器内部处理异常 / Internal server error: {err_str}"

    return JSONResponse(

        status_code=500,

        content={"status": "error", "message": msg}

    )

# Add CORS so frontend can call it directly if not going through next.js proxy

app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)

class TextParseRequest(BaseModel):

    text: str

class SheetParseRequest(BaseModel):

    data: str

    targetType: str

    sourceTab: Optional[str] = ""

class FetchSheetRequest(BaseModel):

    spreadsheetId: str

    sheetName: str

    range: Optional[str] = None

class NormalizeInterviewRequest(BaseModel):

    spreadsheetId: Optional[str] = None

    sheetName: Optional[str] = None

    rawRows: Optional[list] = None

    sourceTab: Optional[str] = ""

    useAi: Optional[bool] = True

class SyncRequest(BaseModel):

    teamId: Optional[str] = "default_team"

class MatchCandidatesRequest(BaseModel):

    order: dict

    topK: Optional[int] = 5

    preFilterK: Optional[int] = 20

    filters: Optional[dict] = None

    teamId: Optional[str] = None

@app.get("/")

def health_check():

    return {"status": "ok", "message": "Talent Flow AI Parser API is running"}

@app.post("/api/parse/text")

async def parse_text_endpoint(req: TextParseRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info("Received request at /api/parse/text")

    if not req.text or not req.text.strip():

        logger.warning("Empty text received in /api/parse/text")

        raise HTTPException(status_code=400, detail="文本不能为空 / Text cannot be empty")

    try:

        results = await generate_jds(req.text)

        logger.info("Successfully generated JDs from text")

        return {"status": "success", "data": results}

    except Exception as e:

        logger.error(f"Error in /api/parse/text: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/parse/sheet")

async def parse_sheet_endpoint(req: SheetParseRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info(f"Received request at /api/parse/sheet with targetType: {req.targetType}, sourceTab: {req.sourceTab}")

    if not req.data or not req.data.strip():

        logger.warning("Empty data received in /api/parse/sheet")

        raise HTTPException(status_code=400, detail="解析数据不能为空 / Data to parse cannot be empty")

    try:

        results = await parse_sheet_data(req.data, req.targetType, source_tab=req.sourceTab or "")

        logger.info(f"Successfully parsed sheet data for targetType: {req.targetType}")

        return {"status": "success", "data": results}

    except Exception as e:

        logger.error(f"Error in /api/parse/sheet: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.get("/api/sheets/tabs")

async def get_sheet_tabs_endpoint(spreadsheetId: str, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info(f"Received request at /api/sheets/tabs for spreadsheetId: {spreadsheetId}")

    if not spreadsheetId:

        raise HTTPException(status_code=400, detail="spreadsheetId 不能为空 / spreadsheetId cannot be empty")

    try:

        tabs = get_spreadsheet_tabs(spreadsheetId)

        return {"status": "success", "tabs": tabs}

    except FileNotFoundError as fnf:

        return {"status": "error", "message": str(fnf)}

    except Exception as e:

        logger.error(f"Error in /api/sheets/tabs: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/sheets/fetch")

async def fetch_sheet_endpoint(req: FetchSheetRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info(f"Received request at /api/sheets/fetch for sheet: {req.sheetName}")

    try:

        values = get_sheet_values(req.spreadsheetId, req.sheetName, cell_range=req.range)

        return {"status": "success", "data": values, "rowCount": len(values)}

    except FileNotFoundError as fnf:

        return {"status": "error", "message": str(fnf)}

    except Exception as e:

        logger.error(f"Error in /api/sheets/fetch: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/sheets/normalize-interview")

async def normalize_interview_endpoint(req: NormalizeInterviewRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    """

    两层混合解析管道?    1. 自动?Google Sheets 取数?(或接收传入的 rawRows)

    2. 执行规则映射 + 歧义?AI 归一?    """

    logger.info(f"Received request at /api/sheets/normalize-interview for sourceTab: {req.sourceTab or req.sheetName}")

    rows = req.rawRows

    source_tab = req.sourceTab or req.sheetName or ""

    if not rows and req.spreadsheetId and req.sheetName:

        try:

            rows = get_sheet_values(req.spreadsheetId, req.sheetName)

        except Exception as e:

            return {"status": "error", "message": f"拉取表格失败 / Failed to fetch sheet: {str(e)}"}

    if not rows:

        raise HTTPException(status_code=400, detail="必须提供 rawRows 或合法的 spreadsheetId + sheetName / Must provide rawRows or valid spreadsheetId + sheetName")

    try:

        results = await normalize_interview_schedule(rows, source_tab=source_tab, use_ai=req.useAi if req.useAi is not None else True)

        logger.info(f"Successfully normalized {len(results)} interview records")

        return {"status": "success", "data": results, "count": len(results)}

    except Exception as e:

        logger.error(f"Error in /api/sheets/normalize-interview: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/parse/file")
async def parse_file_endpoint(
    file: UploadFile = File(...),
    text: Optional[str] = Form(None),
    auth_user: dict = Depends(verify_user_or_internal_token)
):

    logger.info(f"Received request at /api/parse/file for filename: {file.filename}")

    try:

        # Read file bytes

        file_bytes = await file.read()
        check_file_size(file_bytes)

        filename = file.filename

        # Extract text from file

        logger.info(f"Extracting text from {filename}...")

        extracted_text = parse_file(file_bytes, filename)

        # Combine with optional manual text

        combined_text = extracted_text

        if text and text.strip():

            combined_text += f"\n\n附加要求:\n{text}"

        if not combined_text.strip():

            logger.warning(f"No valid text extracted from file {filename}")

            raise HTTPException(status_code=400, detail="无法从文件中提取到有效文本 / Unable to extract valid text from file")

        # Call LLM

        logger.info(f"Calling generate_jds for {filename}...")

        results = await generate_jds(combined_text)

        logger.info(f"Successfully generated JDs for file {filename}")

        return {"status": "success", "data": results}

    except ValueError as ve:

        logger.warning(f"Validation error in /api/parse/file: {str(ve)}")

        return {"status": "error", "message": str(ve)}

    except Exception as e:

        logger.error(f"Error in /api/parse/file: {str(e)}", exc_info=True)

        return {"status": "error", "message": f"文件解析或AI生成失败 / File parsing or AI generation failed: {str(e)}"}

@app.post("/api/parse/file/job_order")
async def parse_file_job_order_endpoint(
    file: UploadFile = File(...),
    auth_user: dict = Depends(verify_user_or_internal_token)
):

    logger.info(f"Received request at /api/parse/file/job_order for filename: {file.filename}")

    try:

        # Read file bytes

        file_bytes = await file.read()
        check_file_size(file_bytes)

        filename = file.filename

        # Extract text from file

        logger.info(f"Extracting text from {filename}...")

        extracted_text = parse_file(file_bytes, filename)

        if not extracted_text.strip():

            logger.warning(f"No valid text extracted from {filename} in job order parse")

            raise HTTPException(status_code=400, detail="无法从文件中提取到有效文本 / Unable to extract valid text from file")

        # Call LLM for job_order

        logger.info(f"Calling parse_job_orders for {filename}...")

        results = await parse_job_orders(extracted_text)

        logger.info(f"Successfully parsed job order from file {filename}")

        return {"status": "success", "data": results}

    except ValueError as ve:

        logger.warning(f"Validation error in /api/parse/file/job_order: {str(ve)}")

        return {"status": "error", "message": str(ve)}

    except Exception as e:

        logger.error(f"Error in /api/parse/file/job_order: {str(e)}", exc_info=True)

        return {"status": "error", "message": f"文件解析或AI生成失败 / File parsing or AI generation failed: {str(e)}"}

@app.post("/api/parse/cv")

async def parse_cv_endpoint(req: TextParseRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info("Received request at /api/parse/cv")

    if not req.text or not req.text.strip():

        logger.warning("Empty text received in /api/parse/cv")

        raise HTTPException(status_code=400, detail="文本不能为空 / Text cannot be empty")

    try:

        results = await parse_cv(req.text)

        logger.info("Successfully parsed CV text")

        return {"status": "success", "data": results}

    except Exception as e:

        logger.error(f"Error in /api/parse/cv: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/parse/file/cv")
async def parse_file_cv_endpoint(
    file: UploadFile = File(...),
    auth_user: dict = Depends(verify_user_or_internal_token)
):

    logger.info(f"Received request at /api/parse/file/cv for filename: {file.filename}")

    try:

        file_bytes = await file.read()
        check_file_size(file_bytes)

        filename = file.filename

        
        ext = filename.split('.')[-1].lower() if '.' in filename else ''
        if ext in ['jpg', 'jpeg', 'png', 'webp']:
            logger.info(f"Image CV detected: {filename}. Using Vision OCR directly...")
            import base64
            from services.cv_parser import parse_cv_from_images
            img_b64 = base64.b64encode(file_bytes).decode('utf-8')
            results = await parse_cv_from_images([img_b64])
            logger.info(f"Successfully parsed CV from direct image {filename}")
            return {"status": "success", "data": results}

        logger.info(f"Extracting text from CV file {filename}...")
        extracted_text = parse_file(file_bytes, filename)

        
        if len(extracted_text.strip()) < 50 and filename.lower().endswith('.pdf'):
            logger.info(f"Text too short in {filename}. Attempting Vision OCR fallback...")
            from file_parser import extract_images_from_pdf
            from services.cv_parser import parse_cv_from_images
            base64_images = extract_images_from_pdf(file_bytes)
            if not base64_images:
                raise HTTPException(status_code=400, detail="PDF没有任何页面，无法解析 / PDF has no pages and cannot be parsed")
            results = await parse_cv_from_images(base64_images)
            logger.info(f"Successfully parsed CV from images for file {filename}")
            return {"status": "success", "data": results}

        if not extracted_text.strip():
            logger.warning(f"No valid text extracted from {filename} in CV parse")
            raise HTTPException(status_code=400, detail="无法从文件中提取到有效文本，或非PDF扫描件不支持 / Unable to extract text from file, or unsupported non-PDF scan")

        logger.info(f"Calling parse_cv for {filename}...")
        results = await parse_cv(extracted_text)

        logger.info(f"Successfully parsed CV from file {filename}")

        return {"status": "success", "data": results}

    except ValueError as ve:

        logger.warning(f"Validation error in /api/parse/file/cv: {str(ve)}")

        return {"status": "error", "message": str(ve)}

    except Exception as e:

        logger.error(f"Error in /api/parse/file/cv: {str(e)}", exc_info=True)

        return {"status": "error", "message": f"简历解析失败 / Resume parsing failed: {str(e)}"}

@app.post("/api/match/candidates")

async def match_candidates_endpoint(req: MatchCandidatesRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info(f"Received request at /api/match/candidates")

    try:

        results = await match_candidates_for_order(

            order=req.order,

            filters=req.filters,

            top_k=req.topK,

            pre_filter_k=req.preFilterK,

            team_id=req.teamId

        )

        return {"status": "success", "matches": results}

    except Exception as e:

        logger.error(f"Error in /api/match/candidates: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

@app.post("/api/embeddings/sync")

async def sync_embeddings_endpoint(req: SyncRequest, auth_user: dict = Depends(verify_user_or_internal_token)):

    logger.info(f"Received request at /api/embeddings/sync for teamId: {req.teamId}")

    try:

        from firebase_admin_init import get_firestore_client

        db = get_firestore_client()

        if not db:

            raise HTTPException(status_code=500, detail="Firestore not initialized")

        # Fetch candidates

        candidates_ref = db.collection(f"teams/{req.teamId}/candidates")

        candidates_docs = candidates_ref.stream()

        candidates_list = []

        for doc in candidates_docs:

            data = doc.to_dict()

            data['id'] = doc.id

            candidates_list.append(data)

        c_count = await sync_candidates(candidates_list, team_id=req.teamId)

        # Fetch orders

        orders_ref = db.collection(f"teams/{req.teamId}/job_orders")

        orders_docs = orders_ref.stream()

        orders_list = []

        for doc in orders_docs:

            data = doc.to_dict()

            data['id'] = doc.id

            orders_list.append(data)

        o_count = await sync_orders(orders_list, team_id=req.teamId)

        return {

            "status": "success", 

            "message": f"Synchronized {c_count} candidates and {o_count} job orders to ChromaDB"

        }

    except Exception as e:

        logger.error(f"Error in /api/embeddings/sync: {str(e)}", exc_info=True)

        return {"status": "error", "message": str(e)}

class AgentChatRequest(BaseModel):
    text: str
    teamId: str = "default_team"
    senderUid: Optional[str] = None
    senderName: Optional[str] = None
    senderEmail: Optional[str] = None

@app.post("/api/agent/chat")
async def agent_chat_endpoint(
    req: AgentChatRequest, 
    auth_user: dict = Depends(verify_user_or_internal_token)
):
    logger.info("Received request at /api/agent/chat")
    if auth_user.get("auth_type") == "internal_secret":
        uid = req.senderUid or "system_bot"
        email = req.senderEmail or "bot@talentflow.internal"
        name = req.senderName or "WhatsApp Bot"
    else:
        uid = auth_user.get("uid") or "unknown"
        email = auth_user.get("email") or "未知邮箱"
        name = auth_user.get("name") or "未知用户"

    from services.agent_service import process_agent_message

    result = await process_agent_message(req.text, req.teamId, uid, name, email)
    return result

from pydantic import Field

from fastapi import Header

import firebase_admin.auth

from firebase_admin import firestore

import json

class AuditLogRequest(BaseModel):

    teamId: str

    action: str

    targetType: str

    targetName: str

    details: Optional[Any] = None

@app.post("/api/audit-log")
async def write_audit_log(
    req: AuditLogRequest, 
    request: Request,
    auth_user: dict = Depends(verify_user_or_internal_token)
):
    uid = auth_user.get("uid") or "anonymous"
    email = auth_user.get("email") or "未知邮箱"
    name = auth_user.get("name") or "未知用户"

    from firebase_admin_init import get_firestore_client
    db = get_firestore_client()
    if not db:
        raise HTTPException(status_code=500, detail="Firestore not initialized")

    client_ip = request.client.host

    user_agent = request.headers.get("user-agent", "unknown")

    log_data = {

        "level": "audit",

        "action": req.action,

        "targetType": req.targetType,

        "targetName": req.targetName,

        "user": {

            "uid": uid,

            "email": email,

            "displayName": name

        },

        "context": {

            "ip": client_ip,

            "userAgent": user_agent,

            "source": "server_api"

        },

        "details": req.details if isinstance(req.details, str) else json.dumps(req.details) if req.details else "",

        "timestamp": firestore.SERVER_TIMESTAMP

    }

    try:

        db.collection("teams").document(req.teamId).collection("logs").add(log_data)

        logger.info(f"Audit log written for {uid} in team {req.teamId}: {req.action} {req.targetType}")

        return {"status": "success"}

    except Exception as e:

        logger.error(f"Failed to write audit log: {e}")

        raise HTTPException(status_code=500, detail="Failed to write log")

class ExportDocxRequest(BaseModel):
    parsed_data: dict

@app.post("/api/export/cv-docx")
async def export_cv_docx_endpoint(req: ExportDocxRequest, auth_user: dict = Depends(verify_user_or_internal_token)):
    try:
        from services.docx_exporter import export_cv_to_docx
        from fastapi.responses import StreamingResponse
        out_stream = export_cv_to_docx(req.parsed_data)
        
        headers = {
            'Content-Disposition': 'attachment; filename="Sunrise_CV.docx"'
        }
        return StreamingResponse(out_stream, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers=headers)
        
    except Exception as e:
        from services.core_llm import logger
        logger.error(f"Docx export error: {e}", exc_info=True)
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


class SheetsWebhookRequest(BaseModel):
    spreadsheetId: str
    sheetName: str
    range: str
    values: list
    headers: Optional[list] = None
    event_type: str = "onEdit"
    uid: Optional[str] = None
    teamId: Optional[str] = "default_team"

from fastapi import BackgroundTasks

async def process_webhook_in_background(req: SheetsWebhookRequest):
    try:
        # 合并表头与数据行，向大模型提供最高精度的列语义上下文
        all_rows = []
        if req.headers and len(req.headers) > 0 and req.headers != req.values:
            all_rows.extend(req.headers)
        all_rows.extend(req.values)

        raw_text = "\n".join(["\t".join([str(cell) for cell in row]) for row in all_rows])
        
        from services.__init__ import parse_sheet_data
        from firebase_admin_init import get_firestore_client
        import uuid
        from datetime import datetime, timezone

        # 针对编辑行进行 AI 结构化解析
        results = await parse_sheet_data(raw_text, target_type="candidates", source_tab=req.sheetName)
        
        # Save to Firebase Firestore (Upsert with merge=True to preserve existing data)
        db = get_firestore_client()
        saved_count = 0
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        from services.identity_service import resolve_canonical_pic

        safe_team_id = req.teamId or 'default_team'

        for i, candidate_data in enumerate(results):
            if not candidate_data.get('name'):
                continue
            
            # Canonicalize PIC / Consultant master data
            raw_pic = candidate_data.get('picName') or candidate_data.get('pic') or ''
            raw_assigned = candidate_data.get('assignedTo') or ''
            if raw_pic or raw_assigned:
                canonical = resolve_canonical_pic(raw_pic, raw_assigned, db)
                if canonical.get("displayName") and canonical.get("displayName") != "未分配顾问":
                    candidate_data['picName'] = canonical['displayName']
                if canonical.get("uid"):
                    candidate_data['assignedTo'] = canonical['uid']

            # Use the exact UID generated by Google Sheets!
            # If for some reason it's missing, fallback to UUID
            candidate_id = req.uid if req.uid else str(uuid.uuid4())
            candidate_data['id'] = candidate_id
            candidate_data['updatedAt'] = firestore.SERVER_TIMESTAMP
            candidate_data['source'] = 'Google Sheets Webhook'

            doc_ref = db.collection('teams').document(safe_team_id).collection('candidates').document(candidate_id)
            existing_snap = doc_ref.get()

            if not existing_snap.exists:
                # Safe defaults strictly for brand-new creations
                candidate_data['createdAt'] = firestore.SERVER_TIMESTAMP
                candidate_data.setdefault('status', 'active')
                candidate_data.setdefault('stage', 'screening')
                candidate_data.setdefault('stageHistory', [{'stage': candidate_data['stage'], 'movedAt': now_iso}])

            # MERGE=TRUE updates parsed fields without wiping existing notes, reminders, or web stage
            doc_ref.set(candidate_data, merge=True)
            saved_count += 1

        logger.info(f"Background webhook parsed and UPSERTED {saved_count} candidates for team '{safe_team_id}' with UID: {req.uid}")
    except Exception as e:
        logger.error(f"Background Webhook error: {e}", exc_info=True)

@app.post("/api/sheets/webhook")
async def sheets_webhook_endpoint(req: SheetsWebhookRequest, background_tasks: BackgroundTasks, _webhook_ok: bool = Depends(verify_optional_webhook_secret)):
    logger.info(f"Received Sheets Webhook from {req.spreadsheetId} - {req.sheetName}. Pushing to background task.")
    # 异步解耦：立即返回 HTTP 200 防止 Google Sheets 超时卡顿，耗时的 AI 解析和数据库写入放入后台队列
    background_tasks.add_task(process_webhook_in_background, req)
    return {"status": "processing", "message": "Webhook received, processing AI parsing in background"}

@app.post("/api/telegram/webhook")
async def telegram_webhook_endpoint(request: Request, background_tasks: BackgroundTasks, sync: bool = False, _webhook_ok: bool = Depends(verify_optional_webhook_secret)):
    """
    Direct Telegram Webhook / n8n Ingest endpoint.
    If sync=True, awaits processing and returns the parsed candidate data for n8n visualization.
    If sync=False, delegates to FastAPI background_tasks and returns 200 immediately.
    """
    try:
        data = await request.json()
        if sync:
            res = await handle_telegram_update(data)
            return {"ok": True, "data": res}
        else:
            background_tasks.add_task(handle_telegram_update, data)
            return {"ok": True}
    except Exception as e:
        logger.error(f"Error handling Telegram webhook: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}

@app.post("/api/candidates/ingest-file")
async def ingest_candidate_file_endpoint(
    file: UploadFile = File(...),
    teamId: Optional[str] = Form("default_team"),
    senderName: Optional[str] = Form("n8n_workflow"),
    _webhook_ok: bool = Depends(verify_optional_webhook_secret)
):
    """
    Universal Candidate File Ingest Endpoint (Ideal for n8n, Zapier, Make, or Webhooks).
    Receives CV binary (PDF/DOCX/Image), extracts text/OCR, parses with AI, deduplicates and saves to Firestore.
    """
    try:
        file_bytes = await file.read()
        check_file_size(file_bytes)
        filename = file.filename or "resume.pdf"
        
        # 1. Save file to cloud/local storage
        resume_url = save_resume_file(file_bytes, filename, teamId)
        
        # 2. AI Parse
        parsed_result = await parse_cv_payload(file_bytes, filename)
        
        # 3. Upsert to Firestore
        candidate_res = await upsert_candidate_to_firestore(
            parsed_data=parsed_result,
            resume_url=resume_url,
            original_filename=filename,
            team_id=teamId,
            sender_info={"username": senderName, "id": "n8n_ingest"}
        )
        return {"status": "success", "data": candidate_res}
    except Exception as e:
        logger.error(f"Error in /api/candidates/ingest-file: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

@app.get("/api/attendance/current-ip")
async def get_current_ip_endpoint(request: Request):
    """
    Returns the real client egress public IP to allow 1-click binding of company Wi-Fi.
    """
    client_ip = get_client_ip(request)
    return {"status": "success", "client_ip": client_ip}

class AttendanceVerifyPayload(BaseModel):
    teamId: Optional[str] = "default_team"
    userId: Optional[str] = None
    userRole: Optional[str] = None
    userWfhAllowed: Optional[bool] = None
    type: Optional[str] = "CLOCK_IN"
    workMode: Optional[str] = "OFFICE"
    wfhNote: Optional[str] = ""
    coords: Optional[dict] = None
    rules: Optional[dict] = None

@app.post("/api/attendance/verify")
async def verify_attendance_endpoint(payload: AttendanceVerifyPayload, request: Request):
    """
    Progressive verification for attendance check-ins:
    Stage 0: Special WFH mode check-in.
    Stage 1: Company Wi-Fi Public Egress IP / DDNS match.
    Stage 2: Elastic geofence with indoor drift compensation.
    """
    try:
        client_ip = get_client_ip(request)
        rules = payload.rules or {}

        if not rules:
            rules = {
                "enabled": True,
                "allowWfh": True,
                "maxDistanceMeters": 100,
                "maxDriftCompensation": 40,
                "officeLocations": [],
                "officeWifi": { "allowedIps": [] }
            }

        result = verify_clockin_eligibility(
            client_ip=client_ip,
            coords=payload.coords,
            rules=rules,
            work_mode=payload.workMode or "OFFICE",
            wfh_note=payload.wfhNote or ""
        )
        return {
            "status": "success" if result.get("passed") else "rejected",
            "result": result
        }
    except Exception as e:
        logger.error(f"Error in /api/attendance/verify: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


