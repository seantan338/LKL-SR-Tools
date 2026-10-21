import re
from typing import List, Dict, Any, Tuple, Optional

try:
    from logger import logger
except ImportError:
    from .logger import logger

# 常见的表头同义词词库（精确适配 12 列招聘面试排期/候选人表头）
HEADER_SYNONYMS = {
    "interviewDate": ["interview date", "interview_date", "interviewdate", "date", "日期", "面试日期", "day"],
    "position": ["applied for position", "position", "role", "job", "职位", "岗位", "申请职位", "应聘岗位", "post"],
    "candidateName": ["name", "candidate", "candidate name", "full name", "姓名", "候选人", "名字", "应聘者"],
    "icNoAge": ["ic no / age", "ic no/age", "ic no", "ic", "age", "ic / age", "身份证", "年龄", "岁数"],
    "degree": ["education level / certificate", "education level", "certificate", "qualification", "qualifications", "edu", "education", "学历", "证书", "资质", "最高学历"],
    "experience": ["working experience", "work experience", "experience", "exp", "工作经验", "工作经历", "经验"],
    "location": ["staying area", "staying", "area", "location", "居住地", "地点", "地区", "venue", "工作地点", "面试地点", "住址"],
    "phone": ["contact number", "contact", "phone", "tel", "mobile", "电话", "手机", "联系电话", "联系方式", "hp"],
    "picName": ["pic", "pic name", "hr", "recruiter", "负责人", "顾问", "in charge", "经办人"],
    "rawStatus": ["remarks", "remark", "status", "interview status", "result", "attendance", "备注", "说明", "状态", "出席情况", "面试结果", "出席"],
    "offered": ["offered", "offer", "salary", "薪资", "薪水", "待遇", "底薪", "录用薪资"],
    "department": ["department", "dept", "部门", "工种", "所属部门"],
    "company": ["company", "company name", "client", "client name", "employer", "客户", "公司", "企业", "雇主", "用人单位", "意向企业", "应聘公司", "意向公司"]
}

# 快速规则状态判定词典
DETERMINISTIC_STATUS_RULES = {
    "attended": ["attend", "attended", "present", "到场", "出席", "已到", "已出席", "到达", "yes", "y"],
    "no_show": ["no show", "no-show", "noshow", "absent", "未到", "缺席", "无响应", "未出席", "no response", "did not attend"],
    "unable_to_attend": ["unable to attend", "cancel", "cancelled", "postpone", "postponed", "请假", "改期", "取消", "无法出席", "不来"],
    "pending": ["pending", "tbd", "待定", "", "-", "—", "na", "n/a", "none", "null"]
}

def normalize_company_name(name: str) -> str:
    """
    企业/客户名称清洗与规范化：
    - 全角字符转半角
    - 去除两端标点符号及多余空格
    - 剥离常见法人后缀 (如 Sdn Bhd, Bhd, Pte Ltd, Ltd, Inc, Corp 等)
    - 结合别名映射表实现大小写与简写规范化 (如 gsp -> GSP, santak -> Santak)
    """
    if not name:
        return ""
    name_str = str(name).strip()
    # 全角符号转半角
    name_str = name_str.replace("（", "(").replace("）", ")").replace("【", "[").replace("】", "]")
    name_str = name_str.replace("—", "-").replace("–", "-")
    # 去除两端标点符号和空格
    cleaned = re.sub(r'^[\s\-_,:;.\'\"/]+|[\s\-_,:;.\'\"/]+$', '', name_str).strip()
    # 统一连续空格为单空格
    cleaned = re.sub(r'\s+', ' ', cleaned)
    # 剥离常见法人后缀 (如 Sdn Bhd, Bhd, Pte Ltd, Ltd, Inc, Corp 等)
    legal_suffix_pattern = r'(?i)\s+(?:sdn\.?\s*bhd\.?|bhd\.?|pte\.?\s*ltd\.?|ltd\.?|co\.?,?\s*ltd\.?|inc\.?|corp\.?|llc)$'
    cleaned = re.sub(legal_suffix_pattern, '', cleaned).strip()
    
    # 核心已知企业别名与大小写规范化字典
    alias_map = {
        "ipe": "IPE",
        "psa": "PSA",
        "santak": "Santak",
        "epg": "EPG",
        "waveplus": "Waveplus",
        "gaa": "GAA",
        "gsp": "GSP",
    }
    key = cleaned.lower()
    if key in alias_map:
        return alias_map[key]
    return cleaned

def extract_company_from_tab_name(tab_name: str) -> str:
    """
    通用智能算法：从 Google Sheet 底部工作表 Tab 名称中动态提取目标企业/客户名称。
    具有高度可扩展性，无需为每个新客户硬编码正则：
    1. 剥离前缀噪声（如 Copy of, 副本, Sheet1 等）
    2. 括号内容智能剥离（如 Waveplus (JUL2026) -> Waveplus）
    3. 结构化连字符/斜杠分隔符切分（如 IPE - Production Worker -> IPE, Inari - IV List -> Inari）
    4. 通用噪声词过滤（剥离月份缩写、年份、工种词、面试排期词如 IV List, Open IV, Record 等）
    5. Token 级保底与法人后缀归一化（normalize_company_name）
    """
    if not tab_name:
        return ""
    raw = str(tab_name).strip()
    # 1. 剥离前缀噪声（如 Copy of, 副本, Sheet1 等）
    raw = re.sub(r'(?i)^(?:copy\s+of\s+|副本\s*[-_:]*\s*|sheet\d*\s*[-_:]*\s*|tab\s*[-_:]*\s*)', '', raw).strip()
    
    # 2. 如果包含括号，先剥离括号内容，如 'Waveplus (JUL2026)' -> 'Waveplus'
    raw_no_paren = re.sub(r'\s*[\(\[\{（【].*?[\)\]\}）】]', '', raw).strip()
    if raw_no_paren:
        raw = raw_no_paren

    # 3. 如果包含明确分隔符（如 ' - ', ' _ ', ' / '），先尝试以分隔符切分
    # 例如 'IPE - Production Worker IV' -> 'IPE', 'Inari - IV List' -> 'Inari'
    delim_match = re.split(r'\s*[\-–—_/|]\s*', raw)
    if len(delim_match) > 1 and delim_match[0].strip():
        first_part = delim_match[0].strip()
        # 检查第一段是否不是纯日期或业务词
        if not re.match(r'(?i)^(?:202\d|q[1-4]|iv|list|interview|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)', first_part):
            norm = normalize_company_name(first_part)
            if norm:
                return norm

    # 4. 剔除末尾/中间的常见组合业务噪声后缀（年份、月份组合、工种、面试词汇）
    noise_pattern = r'(?i)\s+(?:' \
                    r'iv\s*list.*|open\s*iv.*|production\s*worker.*|general\s*worker.*|' \
                    r'operator.*|technician.*|worker.*|record.*|interview.*|list.*|' \
                    r'attendance.*|schedule.*|candidate.*|walk-?in.*|drive.*|tracker.*|batch.*|' \
                    r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*|\d{4}' \
                    r')\b.*$'
    cleaned = re.sub(noise_pattern, '', raw).strip()
    
    # 5. 如果被剔除完了或仍然包含噪声词，做首个有效 token 截取
    if not cleaned:
        tokens = raw.split()
        cleaned = tokens[0] if tokens else raw

    return normalize_company_name(cleaned)

def parse_ic_and_age(val: str) -> Tuple[str, str]:
    """
    智能拆分 'IC No / Age' 组合字段：
    支持马来西亚 12 位 IC 或 010203-01-1234 格式，及 18-70 岁年龄数字
    """
    if not val:
        return "", ""
    clean = str(val).strip()
    
    # 查找马来西亚 IC 格式
    ic_match = re.search(r'(\d{6}-\d{2}-\d{4}|\d{12})', clean)
    ic_no = ic_match.group(1) if ic_match else ""
    
    rem_text = clean
    if ic_no:
        rem_text = rem_text.replace(ic_no, "").strip()
        
    # 查找年龄 (通常为 18-75 之间的 2 位数)
    age_match = re.search(r'\b(1[89]|[2-6]\d|7[0-5])\b', rem_text)
    age = age_match.group(1) if age_match else ""
    
    # 纯数字容错
    if not age and not ic_no and clean.isdigit():
        if len(clean) <= 2:
            age = clean
        elif len(clean) >= 6:
            ic_no = clean
            
    if not ic_no and not age and clean:
        if any(c in clean for c in ['-', '/']) and len(clean) >= 6:
            ic_no = clean
        else:
            age = clean
            
    return ic_no, age

def parse_date_and_time(val: str) -> Tuple[str, str]:
    """
    智能提取标准化面试日期与面试时刻：
    支持 18/8/2026, 18/8 Fri 10am, 21/8 14:00, 2026-08-18 等格式
    返回 (date_str, time_str)，例如 ('2026-08-18', '10:00')
    """
    if not val:
        return "", ""
    s = str(val).strip()
    time_str = ""
    
    # 提取时间 (如 10am, 2:30pm, 14:00, 10:30)
    time_match = re.search(r'(?:at\s*)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b', s, re.IGNORECASE)
    if not time_match:
        time_match = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', s)
        if time_match:
            h = int(time_match.group(1))
            m = int(time_match.group(2))
            time_str = f"{h:02d}:{m:02d}"
            s = s[:time_match.start()] + s[time_match.end():]
    else:
        h = int(time_match.group(1))
        m = int(time_match.group(2) or 0)
        meridiem = (time_match.group(3) or "").lower()
        if meridiem == "pm" and h < 12:
            h += 12
        elif meridiem == "am" and h == 12:
            h = 0
        time_str = f"{h:02d}:{m:02d}"
        s = s[:time_match.start()] + s[time_match.end():]
        
    # 清理星期/无用词汇
    s = re.sub(r'\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', '', s, flags=re.IGNORECASE)
    s = re.sub(r'[周星期][一二三四五六日]', '', s).strip()
    
    date_str = ""
    m1 = re.search(r'\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b', s)
    if m1:
        d, mo, y = int(m1.group(1)), int(m1.group(2)), m1.group(3)
        date_str = f"{y}-{mo:02d}-{d:02d}"
    else:
        m2 = re.search(r'\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b', s)
        if m2:
            y, mo, d = m2.group(1), int(m2.group(2)), int(m2.group(3))
            date_str = f"{y}-{mo:02d}-{d:02d}"
        else:
            m3 = re.search(r'\b(\d{1,2})[\/\-\.](\d{1,2})\b', s)
            if m3:
                from datetime import datetime
                d, mo = int(m3.group(1)), int(m3.group(2))
                y = datetime.now().year
                date_str = f"{y}-{mo:02d}-{d:02d}"
            else:
                date_str = s.strip()
                
    return date_str, time_str

def detect_header_mapping(headers: List[str]) -> Tuple[Dict[int, str], List[int]]:
    """
    通过正则与同义词探测表头列索引映射。
    返回 (col_index_to_field, extra_notes_col_indices)。
    """
    col_mapping = {}
    matched_cols = set()

    for col_idx, raw_header in enumerate(headers):
        header_clean = str(raw_header or "").lower().strip()
        header_norm = re.sub(r'[\(\)\[\]:：\-_/]', ' ', header_clean).strip()

        matched_field = None
        for field, synonyms in HEADER_SYNONYMS.items():
            if field in col_mapping.values():
                continue  # Avoid duplicate mapping to the same field
            if any(syn in header_norm for syn in synonyms):
                matched_field = field
                break

        if matched_field:
            col_mapping[col_idx] = matched_field
            matched_cols.add(col_idx)

    # 无法匹配到任何标准 12 列但有内容的列，才视为 extra_notes 列
    extra_notes_indices = [
        i for i in range(len(headers)) 
        if i not in matched_cols and str(headers[i] or "").strip() != ""
    ]

    return col_mapping, extra_notes_indices

def quick_normalize_status(raw_status: str) -> Tuple[str, bool]:
    """
    快速规则状态判定。
    返回 (normalizedStatus, is_deterministic)。
    如果遇到无法明确确定的描述（如 'Heavy rain not attend', 'Car broke'），is_deterministic 为 False，交给 LLM 进一步处理。
    """
    val = str(raw_status or "").lower().strip()
    
    # 1. 空白与默认待定
    if val in ("", "-", "—", "na", "n/a", "none", "null", "pending", "tbd", "待定"):
        return "pending", True

    # 2. 包含否定或具体原因词汇（如 not, unable, rain, car, sick），避免被单纯的 "attend" 子串误伤
    negative_or_reason_cues = ["not", "no", "unable", "cannot", "cancel", "rain", "sick", "car", "jam", "postpone", "未", "假", "雨", "病"]
    has_reason = any(cue in val for cue in negative_or_reason_cues)

    # 3. 严格全匹配或标准短语判定
    for norm_status, keywords in DETERMINISTIC_STATUS_RULES.items():
        if val in keywords:
            return norm_status, True

    # 如果有原因词，且不是标准确定性短语，判定为歧义语义，必须由 LLM 理解
    if has_reason:
        return "pending", False

    # 4. 单词全词匹配（避免子串误伤）
    tokens = set(re.findall(r'\b\w+\b', val))
    if tokens & {"attend", "attended", "present", "到场", "出席"}:
        return "attended", True
    if tokens & {"noshow", "absent", "未到", "缺席"}:
        return "no_show", True

    # 其它未知描述一律交由 LLM
    return "pending", False


def normalize_sheet_rows_sync(
    rows: List[List[Any]], 
    source_tab: str = ""
) -> Tuple[List[Dict[str, Any]], List[List[Any]]]:
    """
    使用纯规则先行做表头映射与初筛：
    1. 找到表头行 (精准覆盖 12 列)
    2. 过滤无效空行（无姓名且无职位）
    3. 解析并映射所有 12 列字段（禁止将核心业务列挤入 notes）
    4. 针对确定性状态直接归一化；对语义复杂的行分流至 ambiguous_rows
    
    返回 (resolved_records, ambiguous_rows)
    """
    if not rows or len(rows) < 2:
        return [], []

    # 寻找包含最多关键表头的行（通常为第 0 行或第 1 行）
    header_row_idx = 0
    best_score = -1
    for r_idx in range(min(5, len(rows))):
        mapping, _ = detect_header_mapping(rows[r_idx])
        if len(mapping) > best_score:
            best_score = len(mapping)
            header_row_idx = r_idx

    headers = rows[header_row_idx]
    col_mapping, extra_notes_indices = detect_header_mapping(headers)
    logger.info(f"Header mapped at row {header_row_idx}: {col_mapping}, extra columns: {extra_notes_indices}")

    data_rows = rows[header_row_idx + 1:]
    resolved_records = []
    ambiguous_rows = []

    for row_cells in data_rows:
        if not row_cells or all(str(c or "").strip() == "" for c in row_cells):
            continue

        # 提取 12 字段结构
        record = {
            "interviewDate": "", "interviewTime": "", "interviewDateRaw": "",
            "position": "", "candidateName": "", "name": "",
            "icNo": "", "age": "", "icNoAge": "", "degree": "", "qualification": "",
            "experience": "", "location": "", "phone": "",
            "picName": "", "remarks": "", "rawStatus": "", "normalizedStatus": "pending",
            "offered": "", "department": "", "company": "", "companySource": "", "notes": "", "sourceTab": source_tab
        }

        for col_idx, field in col_mapping.items():
            if col_idx < len(row_cells):
                record[field] = str(row_cells[col_idx] or "").strip()

        # 冲突优先级与企业来源溯源（Source Tracking）：
        # 1. 若表格中明确有公司列且填有有效值 -> 优先级最高 (row_explicit)
        if record.get("company"):
            record["company"] = normalize_company_name(record["company"])
            record["companySource"] = "row_explicit"
        elif source_tab:
            # 2. 表格正文未提供公司列，但有 Google Sheets Tab 名 -> 自动提取并归一化 (tab_inferred)
            extracted = extract_company_from_tab_name(source_tab)
            if extracted:
                record["company"] = extracted
                record["companySource"] = "tab_inferred"

        # 双向同步字段别名
        if record.get("candidateName") and not record.get("name"):
            record["name"] = record["candidateName"]
        elif record.get("name") and not record.get("candidateName"):
            record["candidateName"] = record["name"]

        if record.get("degree") and not record.get("qualification"):
            record["qualification"] = record["degree"]
        elif record.get("qualification") and not record.get("degree"):
            record["degree"] = record["qualification"]

        if record.get("rawStatus") and not record.get("remarks"):
            record["remarks"] = record["rawStatus"]
        elif record.get("remarks") and not record.get("rawStatus"):
            record["rawStatus"] = record["remarks"]

        # 处理 IC No / Age 分割
        if record.get("icNoAge"):
            ic, age = parse_ic_and_age(record["icNoAge"])
            if ic and not record["icNo"]:
                record["icNo"] = ic
            if age and not record["age"]:
                record["age"] = age

        # 智能提取并标准化面试日期与面试时间
        if record.get("interviewDate"):
            norm_d, norm_t = parse_date_and_time(record["interviewDate"])
            record["interviewDateRaw"] = record["interviewDate"]
            if norm_d:
                record["interviewDate"] = norm_d
            if norm_t:
                record["interviewTime"] = norm_t

        # 跳过无效行规则：如果某一行除日期外全部为空（无姓名且无职位）
        if not record["candidateName"] and not record["position"]:
            continue

        # 仅将真正未被 12 列映射的未知列放入 notes
        extra_parts = []
        for extra_idx in extra_notes_indices:
            if extra_idx < len(row_cells):
                val = str(row_cells[extra_idx] or "").strip()
                if val:
                    header_name = str(headers[extra_idx] or "").strip()
                    extra_parts.append(f"{header_name}: {val}" if header_name else val)
        
        if extra_parts:
            extra_str = ", ".join(extra_parts)
            record["notes"] = f"{record['notes']}, {extra_str}".strip(", ") if record["notes"] else extra_str

        # 状态归一化
        norm_status, is_deterministic = quick_normalize_status(record["rawStatus"])
        record["normalizedStatus"] = norm_status

        if is_deterministic:
            resolved_records.append(record)
        else:
            # 存入待 AI 深度语义判断的候选列表
            ambiguous_rows.append(row_cells)

    return resolved_records, ambiguous_rows

async def normalize_interview_schedule(
    rows: List[List[Any]], 
    source_tab: str = "", 
    use_ai: bool = True
) -> List[Dict[str, Any]]:
    """
    两层架构入口：
    第 1 层：用轻量规则/表头映射快速过滤无效行、合并备注列、归一化绝大部分确定性记录（0 API 成本，极速）。
    第 2 层：仅将含复杂/模糊状态文本的散乱行丢给 AI 逐行归一化；若 use_ai=False 则纯规则降级。
    """
    resolved_records, ambiguous_rows = normalize_sheet_rows_sync(rows, source_tab=source_tab)
    logger.info(f"Rule layer resolved: {len(resolved_records)} records, ambiguous rows needing AI: {len(ambiguous_rows)}")

    if not ambiguous_rows:
        return resolved_records

    if not use_ai:
        # 不使用 AI 时，所有非确定性行以 rawStatus 保留，normalizedStatus 降级为 pending
        headers = rows[0] if rows else []
        col_mapping, _ = detect_header_mapping(headers)
        for row in ambiguous_rows:
            rec = {
                "interviewDate": "", "position": "", "candidateName": "", "name": "",
                "icNo": "", "age": "", "icNoAge": "", "degree": "", "qualification": "",
                "experience": "", "location": "", "phone": "",
                "picName": "", "remarks": "", "rawStatus": "", "normalizedStatus": "pending",
                "offered": "", "department": "", "notes": "", "sourceTab": source_tab
            }
            for col_idx, field in col_mapping.items():
                if col_idx < len(row):
                    rec[field] = str(row[col_idx] or "").strip()
            if rec.get("candidateName"): rec["name"] = rec["candidateName"]
            if rec.get("rawStatus"): rec["remarks"] = rec["rawStatus"]
            if rec.get("icNoAge"):
                ic, age = parse_ic_and_age(rec["icNoAge"])
                if ic: rec["icNo"] = ic
                if age: rec["age"] = age
            resolved_records.append(rec)
        return resolved_records

    # 仅将歧义行交付给 LLM 解析（省 token、精准）
    try:
        from services.interview_parser import parse_interview_schedule
        ai_resolved = await parse_interview_schedule(ambiguous_rows, source_tab=source_tab)
        logger.info(f"AI layer resolved {len(ai_resolved)} ambiguous records")
        resolved_records.extend(ai_resolved)
    except Exception as e:
        logger.warning(f"AI normalization failed for ambiguous rows, falling back to rule default: {e}")
        headers = rows[0] if rows else []
        col_mapping, _ = detect_header_mapping(headers)
        for r in ambiguous_rows:
            rec = {
                "interviewDate": "", "position": "", "candidateName": "", "name": "",
                "icNo": "", "age": "", "icNoAge": "", "degree": "", "qualification": "",
                "experience": "", "location": "", "phone": "",
                "picName": "", "remarks": "", "rawStatus": "", "normalizedStatus": "pending",
                "offered": "", "department": "", "notes": "AI归一化降级", "sourceTab": source_tab
            }
            for col_idx, field in col_mapping.items():
                if col_idx < len(r):
                    rec[field] = str(r[col_idx] or "").strip()
            if rec.get("candidateName"): rec["name"] = rec["candidateName"]
            if rec.get("rawStatus"): rec["remarks"] = rec["rawStatus"]
            if rec.get("icNoAge"):
                ic, age = parse_ic_and_age(rec["icNoAge"])
                if ic: rec["icNo"] = ic
                if age: rec["age"] = age
            resolved_records.append(rec)

    return resolved_records
