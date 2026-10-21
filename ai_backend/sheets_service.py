import os
from typing import List, Dict, Any, Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

try:
    from logger import logger
except ImportError:
    from .logger import logger

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

DEFAULT_CREDENTIALS_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "credentials.json")

def get_sheets_service(credentials_path: Optional[str] = None):
    """
    Initializes and returns a Google Sheets API v4 service client.
    Looks for credentials file from argument, environment variable, or default credentials.json.
    """
    cred_file = credentials_path or DEFAULT_CREDENTIALS_FILE
    
    # Check if relative path needs to be resolved relative to ai_backend directory
    if not os.path.isabs(cred_file) and not os.path.exists(cred_file):
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        candidate_path = os.path.join(backend_dir, cred_file)
        if os.path.exists(candidate_path):
            cred_file = candidate_path

    if not os.path.exists(cred_file):
        error_msg = (
            f"Google Service Account 凭据文件未找到: '{cred_file}'。\n"
            "请在 ai_backend 目录下放置 credentials.json，"
            "或通过环境变量 GOOGLE_SERVICE_ACCOUNT_FILE 指定路径。"
        )
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)

    creds = service_account.Credentials.from_service_account_file(cred_file, scopes=SCOPES)
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    return service

def get_sheet_values(
    spreadsheet_id: str, 
    sheet_name: str, 
    cell_range: Optional[str] = None,
    credentials_path: Optional[str] = None
) -> List[List[str]]:
    """
    负责“取数据”，不负责“理解数据”。
    拉取指定 Google Spreadsheet 的某个 Tab 的纯文本二维矩阵。
    
    :param spreadsheet_id: Google Spreadsheet ID (从 URL 中提取)
    :param sheet_name: 工作表名称/Tab 名称 (例如 'PSA', 'EPG', 'GAA')
    :param cell_range: 可选单元格范围 (如 'A1:Z500')，默认读取整个工作表
    :param credentials_path: 可选的凭据文件路径
    :return: 2D 字符串列表 [[col1, col2, ...], [col1, col2, ...]]
    """
    try:
        service = get_sheets_service(credentials_path)
        full_range = f"'{sheet_name}'!{cell_range}" if cell_range else f"'{sheet_name}'"
        
        logger.info(f"Fetching Google Sheet values: id={spreadsheet_id}, range={full_range}")
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=full_range
        ).execute()
        
        values = result.get("values", [])
        logger.info(f"Successfully fetched {len(values)} rows from sheet '{sheet_name}'")
        return values
        
    except HttpError as he:
        logger.error(f"Google Sheets API HTTP Error: {he}", exc_info=True)
        raise RuntimeError(f"Google Sheets API 访问失败: {he.reason or str(he)}")
    except Exception as e:
        logger.error(f"Error fetching sheet values: {str(e)}", exc_info=True)
        raise

def get_spreadsheet_tabs(
    spreadsheet_id: str,
    credentials_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    获取 Google Spreadsheet 中所有可用 Tab (工作表) 的元数据（名称、ID、行数、列数等）。
    用于多 Tab 导入时自动枚举 PSA / EPG / GAA 等工作表。
    """
    try:
        service = get_sheets_service(credentials_path)
        logger.info(f"Fetching spreadsheet metadata for id={spreadsheet_id}")
        meta = service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets.properties"
        ).execute()
        
        sheets = meta.get("sheets", [])
        tabs = []
        for s in sheets:
            props = s.get("properties", {})
            tabs.append({
                "sheetId": props.get("sheetId"),
                "title": props.get("title"),
                "index": props.get("index"),
                "rowCount": props.get("gridProperties", {}).get("rowCount", 0),
                "columnCount": props.get("gridProperties", {}).get("columnCount", 0)
            })
        return tabs
    except Exception as e:
        logger.error(f"Error fetching spreadsheet tabs: {str(e)}", exc_info=True)
        raise


def update_sheet_row_color(spreadsheet_id: str, sheet_id: int, row_index: int, color_rgb: dict):
    """
    Updates the background color of a specific row in Google Sheets.
    row_index is 0-based.
    color_rgb should be like {"red": 0.0, "green": 1.0, "blue": 0.0}
    """
    try:
        service = get_sheets_service()
        
        requests = [{
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": row_index,
                    "endRowIndex": row_index + 1
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": color_rgb
                    }
                },
                "fields": "userEnteredFormat.backgroundColor"
            }
        }]
        
        body = {"requests": requests}
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body=body).execute()
        logger.info(f"Successfully updated row {row_index} color in sheet {spreadsheet_id}")
        return True
    except HttpError as error:
        logger.error(f"Failed to update sheet color: {error}")
        return False
    except Exception as e:
        logger.error(f"Error in update_sheet_row_color: {e}")
        return False

def update_sheet_cell(spreadsheet_id: str, range_name: str, values: list):
    """
    Updates a specific cell or range with new values.
    range_name should be like 'Sheet1!A5:C5'
    values should be a 2D array like [['Value1', 'Value2', 'Value3']]
    """
    try:
        service = get_sheets_service()
        body = {"values": values}
        
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id, 
            range=range_name,
            valueInputOption="USER_ENTERED", 
            body=body
        ).execute()
        
        logger.info(f"Successfully updated cell {range_name} in sheet {spreadsheet_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating cell in sheet {spreadsheet_id}: {e}")
        return False
