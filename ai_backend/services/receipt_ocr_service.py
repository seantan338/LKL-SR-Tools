import os
import json
import base64
import re
from typing import Dict, Any, Optional

try:
    from logger import logger
except ImportError:
    from ..logger import logger

from .core_llm import get_client, get_model_for_task, clean_json_response

RECEIPT_OCR_PROMPT = """You are an expert OCR and financial expense analyst specializing in receipts, tax invoices, and travel vouchers across Malaysia (MYR), Singapore (SGD), and international currencies.

Analyze the provided receipt or invoice image/text and extract the structured financial data.
Your output must be a single, strict, valid JSON object matching this schema exactly:

{
  "merchantName": "Merchant / Vendor or Store Name (e.g. Shell, Grab, McDonald's, Watsons)",
  "receiptDate": "YYYY-MM-DD (e.g. 2026-10-28; if not found, use current date or empty string)",
  "invoiceNo": "Invoice / Receipt / Tax Invoice number or Order ID (e.g. INV-10928, if not found use empty string)",
  "currency": "Standard 3-letter currency code, default MYR (e.g. MYR, SGD, USD)",
  "totalAmount": 0.00,
  "taxAmount": 0.00,
  "category": "MEAL | TRANSPORT | ACCOMMODATION | OFFICE | ENTERTAINMENT | OTHER",
  "confidence": 0.95,
  "summary": "Short 1-sentence description in English or Chinese of purchased items"
}

Category Guidelines:
- MEAL: Dining, coffee, restaurants, groceries, fast food.
- TRANSPORT: Grab, taxi, parking, toll (Touch 'n Go), flight tickets, petrol/fuel (Shell, Petronas, Caltex).
- ACCOMMODATION: Hotel, Airbnb, lodging.
- OFFICE: Stationary, electronics, software subscriptions, office supplies.
- ENTERTAINMENT: Client dinner/entertaining, gifts.
- OTHER: Miscellaneous fees.

Rules:
1. `totalAmount` MUST be a pure positive number (float) rounded to 2 decimal places. Do NOT include currency symbols like RM or $.
2. `taxAmount` is SST, GST, or VAT if clearly displayed, otherwise 0.00.
3. If the receipt is blurry or some fields are missing, make your best reasonable inference and adjust `confidence` (0.0 to 1.0).
4. Do NOT output markdown code fences or conversational text. Return ONLY the raw JSON string.
"""

async def parse_receipt_image(file_bytes: bytes, filename: str, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """
    使用双轨多模态大模型 (Gemini 3.8 Flash Vision / OpenRouter) 进行票据 OCR 与结构化提取
    """
    logger.info(f"[receipt_ocr_service] Starting OCR extraction for {filename} ({len(file_bytes)} bytes, mime: {mime_type})")
    
    # 防 OOM 限制：单文件最大 10MB
    if len(file_bytes) > 10 * 1024 * 1024:
        raise ValueError("File exceeds 10MB limit / 文件超过 10MB 限制")

    client = get_client()
    model_name = get_model_for_task("receipt_ocr")
    if not model_name or model_name == "gemini-3.1-pro-preview":
        model_name = os.getenv("GEMINI_MODEL_FLASH", "gemini-3.8-flash")

    # 如果是 PDF 文件，优先尝试提取文本流
    extracted_text = ""
    is_pdf = filename.lower().endswith(".pdf") or "pdf" in mime_type.lower()
    if is_pdf:
        try:
            import io
            import pypdf
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page in pdf_reader.pages:
                t = page.extract_text()
                if t:
                    extracted_text += t + "\n"
        except Exception as e:
            logger.warn(f"[receipt_ocr_service] PDF text extraction failed: {e}")

    # 如果 PDF 包含足够纯文本，则直接发送文本给模型进行结构化
    if extracted_text.strip() and len(extracted_text.strip()) > 30:
        messages = [
            {"role": "system", "content": RECEIPT_OCR_PROMPT},
            {"role": "user", "content": f"Filename: {filename}\n\nReceipt Text Content:\n{extracted_text}"}
        ]
    else:
        # 否则作为多模态图片 Base64 处理
        b64_data = base64.b64encode(file_bytes).decode("utf-8")
        clean_mime = mime_type if mime_type.startswith("image/") else "image/jpeg"
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": RECEIPT_OCR_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{clean_mime};base64,{b64_data}"
                        }
                    }
                ]
            }
        ]

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.1,
            max_tokens=2048
        )
        content = response.choices[0].message.content or "{}"
        cleaned_json = clean_json_response(content)
        data = json.loads(cleaned_json)
        
        # 基础校验与补全
        data["totalAmount"] = round(float(data.get("totalAmount") or 0.0), 2)
        data["taxAmount"] = round(float(data.get("taxAmount") or 0.0), 2)
        if "currency" not in data or not data["currency"]:
            data["currency"] = "MYR"
        if "category" not in data or not data["category"]:
            data["category"] = "OTHER"
            
        logger.info(f"[receipt_ocr_service] OCR Success: {data.get('merchantName')} - {data.get('currency')} {data.get('totalAmount')}")
        return data
    except Exception as e:
        logger.error(f"[receipt_ocr_service] OCR Model call failed: {e}")
        # 降级返回优雅空结构
        return {
            "merchantName": os.path.splitext(filename)[0],
            "receiptDate": "",
            "invoiceNo": "",
            "currency": "MYR",
            "totalAmount": 0.0,
            "taxAmount": 0.0,
            "category": "OTHER",
            "confidence": 0.0,
            "summary": f"OCR 解析失败，已保留原文件名 / OCR failed: {str(e)}"
        }
