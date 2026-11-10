import json
import re
from services.core_llm import client as openai_client, AI_MODEL_NAME, safe_json_parse
from services.embedding_service import get_candidate_collection, get_order_collection, build_candidate_text, build_order_text
from logger import setup_logger

logger = setup_logger(__name__)

RERANK_SYSTEM_PROMPT = """You are an expert headhunter re-ranking candidates for a job order.
You will be given the Job Order JSON and a list of Candidate JSONs (each with an 'id').
Your task is to thoroughly analyze how well each candidate fits the job.
Please score each candidate from 0 to 100 based on their fit, and provide professional reasoning.

Output a strict JSON array of objects, with each object structured as:
[
  {
    "id": "Candidate ID",
    "score": 85,
    "highlights": ["Highlight 1", "Highlight 2"],
    "risks": ["Risk 1", "Risk 2"],
    "analysis": "A concise paragraph summarizing the overall fit and specific reasons."
  }
]
Output ONLY valid JSON and ensure all generated texts (highlights, risks, analysis) are in ENGLISH.
"""

async def match_candidates_for_order(order: dict, filters: dict = None, top_k: int = 5, pre_filter_k: int = 20, team_id: str = None):
    collection = get_candidate_collection()
    order_text = build_order_text(order)

    # Build ChromaDB Where Filter
    where_filter = {}
    safe_team_id = team_id if (team_id and str(team_id).strip() and str(team_id).lower() not in ("none", "null", "undefined")) else "default_team"
    where_filter["teamId"] = safe_team_id
    if not collection.get(where={"teamId": safe_team_id}, limit=1).get("ids"):
        # Auto-heal: pull candidates from Firestore and sync them immediately
        try:
            from firebase_admin_init import get_firestore_client
            db = get_firestore_client()
            if db:
                cand_docs = db.collection(f"teams/{safe_team_id}/candidates").stream()
                cand_list = []
                for doc in cand_docs:
                    d = doc.to_dict()
                    d['id'] = doc.id
                    cand_list.append(d)
                if cand_list:
                    from services.embedding_service import sync_candidates
                    await sync_candidates(cand_list, team_id=safe_team_id)
        except Exception as sync_err:
            logger.warning(f"Auto-sync candidates failed for team {safe_team_id}: {sync_err}")

        if not collection.get(where={"teamId": safe_team_id}, limit=1).get("ids"):
            raise ValueError(f"向量库与系统暂无本团队 ({safe_team_id}) 的候选人档案，请先录入候选人或点击「同步向量库」 / No candidates found for team {safe_team_id}, please add candidates or click 'Sync Vector DB'")

    if filters:
        if filters.get("location"):
            where_filter["location"] = filters["location"].lower()

        # The filter UI passes `excludeRejected`, but by default we might want to prioritize them
        if filters.get("excludeRejected"):
            # ChromaDB supports $ne
            where_filter["status"] = {"$ne": "rejected"}

        # Additional where logic can be added here

    query_args = {
        "query_texts": [order_text],
        "n_results": pre_filter_k,
    }

    if where_filter:
        # If where_filter has only 1 key, use it. If multiple, use $and
        if len(where_filter) == 1:
            query_args["where"] = where_filter
        else:
            query_args["where"] = {"$and": [{k: v} for k, v in where_filter.items()]}

    # 1. Vector Search (Rough Filter)
    results = collection.query(**query_args)

    if not results or not results['ids'] or not results['ids'][0]:
        return []

    candidate_ids = results['ids'][0]
    candidate_docs = results['documents'][0]
    distances = (results.get('distances') or [[0] * len(candidate_ids)])[0]

    # 2. Prepare candidates for LLM Reranking
    candidates_info = []
    for cid, doc, dist in zip(candidate_ids, candidate_docs, distances):
        candidates_info.append(f"Candidate ID: {cid}\nInfo: {doc}\nVectorDistance: {dist:.4f}")

    user_prompt = f"""
招聘需求 (Job Order):
{order_text}

待评估的候选人列表 (基于语义相似度初步筛选):
---
{chr(10).join(candidates_info)}
---
请按照系统提示要求，对上述候选人进行精排和打分，并以JSON数组返回。
"""
    # 3. LLM Rerank (client 是 AsyncOpenAI，必须 await)
    response = await openai_client.chat.completions.create(
        model=AI_MODEL_NAME,
        messages=[
            {"role": "system", "content": RERANK_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )

    result_text = (response.choices[0].message.content or "").strip()
    try:
        matches = safe_json_parse(result_text, '[', ']')
    except ValueError as e:
        logger.error(f"Failed to parse LLM match response: {e}\nResponse: {result_text}")
        raise ValueError("AI 精排结果解析失败，请重试 / Failed to parse AI reranking results, please retry")

    if isinstance(matches, dict) and "matches" in matches:
        matches = matches["matches"]
    if not isinstance(matches, list):
        matches = [matches]

    # 模型按提示输出 "id"，前端读取 "candidateId"；只保留向量检索召回过的候选人，过滤模型编造的 ID
    allowed_ids = set(candidate_ids)
    valid_matches = []
    for m in matches:
        if not isinstance(m, dict):
            continue
        cid = str(m.get('candidateId') or m.get('id') or '').strip()
        if cid in allowed_ids:
            m['candidateId'] = cid
            valid_matches.append(m)

    valid_matches.sort(key=lambda x: x.get('score', 0) if isinstance(x.get('score', 0), (int, float)) else 0, reverse=True)
    return valid_matches[:top_k]


ORDER_RERANK_SYSTEM_PROMPT = """You are an expert headhunter re-ranking job orders for a candidate.
You will be given the Candidate Profile JSON and a list of Job Order JSONs (each with an 'id').
Your task is to thoroughly analyze how well each job fits the candidate (skill set, experience, location, expected salary, career trajectory, etc.).
If the candidate was previously rejected or put into a talent pool, examine whether this job order overcomes the previous rejection reason (e.g. better location, higher/lower salary tier, different role requirements).
Please score each job from 0 to 100 based on fit, and provide professional reasoning.

Output a strict JSON array of objects, with each object structured as:
[
  {
    "id": "Job Order ID",
    "score": 85,
    "highlights": ["Highlight 1", "Highlight 2"],
    "risks": ["Risk 1", "Risk 2"],
    "analysis": "A concise paragraph summarizing the overall fit and specific reasons."
  }
]
Output ONLY valid JSON and ensure all generated texts (highlights, risks, analysis) are in ENGLISH.
"""


async def match_orders_for_candidate(candidate: dict, filters: dict = None, top_k: int = 5, pre_filter_k: int = 20, team_id: str = None):
    collection = get_order_collection()
    candidate_text = build_candidate_text(candidate)

    # Build ChromaDB Where Filter
    where_filter = {}
    safe_team_id = team_id if (team_id and str(team_id).strip() and str(team_id).lower() not in ("none", "null", "undefined")) else "default_team"
    where_filter["teamId"] = safe_team_id
    if not collection.get(where={"teamId": safe_team_id}, limit=1).get("ids"):
        # Auto-heal: pull orders from Firestore and sync them immediately
        try:
            from firebase_admin_init import get_firestore_client
            db = get_firestore_client()
            if db:
                orders_docs = db.collection(f"teams/{safe_team_id}/job_orders").stream()
                orders_list = []
                for doc in orders_docs:
                    d = doc.to_dict()
                    d['id'] = doc.id
                    orders_list.append(d)
                if orders_list:
                    from services.embedding_service import sync_orders
                    await sync_orders(orders_list, team_id=safe_team_id)
        except Exception as sync_err:
            logger.warning(f"Auto-sync job orders failed for team {safe_team_id}: {sync_err}")

        if not collection.get(where={"teamId": safe_team_id}, limit=1).get("ids"):
            raise ValueError(f"向量库与系统暂无本团队 ({safe_team_id}) 的招聘需求，请先录入招聘需求或在「招聘需求」页面点击「同步向量库」 / No job orders found for team {safe_team_id}, please add job orders or click 'Sync Vector DB'")

    if filters:
        if filters.get("location"):
            where_filter["location"] = filters["location"].lower()

        if filters.get("onlyActive", True):
            # Exclude closed and filled orders
            where_filter["status"] = {"$ne": "closed"}

    query_args = {
        "query_texts": [candidate_text],
        "n_results": pre_filter_k,
    }

    if where_filter:
        if len(where_filter) == 1:
            query_args["where"] = where_filter
        else:
            query_args["where"] = {"$and": [{k: v} for k, v in where_filter.items()]}

    # 1. Vector Search (Rough Filter)
    results = collection.query(**query_args)

    if not results or not results['ids'] or not results['ids'][0]:
        return []

    order_ids = results['ids'][0]
    order_docs = results['documents'][0]
    distances = (results.get('distances') or [[0] * len(order_ids)])[0]

    # 2. Prepare orders for LLM Reranking
    orders_info = []
    for oid, doc, dist in zip(order_ids, order_docs, distances):
        orders_info.append(f"Job Order ID: {oid}\nInfo: {doc}\nVectorDistance: {dist:.4f}")

    user_prompt = f"""
候选人档案 (Candidate Profile):
{candidate_text}

待评估的职位需求列表 (基于语义相似度初步筛选):
---
{chr(10).join(orders_info)}
---
请按照系统提示要求，对上述职位进行精排和打分，并以JSON数组返回。
"""
    # 3. LLM Rerank
    response = await openai_client.chat.completions.create(
        model=AI_MODEL_NAME,
        messages=[
            {"role": "system", "content": ORDER_RERANK_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )

    result_text = (response.choices[0].message.content or "").strip()
    try:
        matches = safe_json_parse(result_text, '[', ']')
    except ValueError as e:
        logger.error(f"Failed to parse LLM match response: {e}\nResponse: {result_text}")
        raise ValueError("AI 精排结果解析失败，请重试 / Failed to parse AI reranking results, please retry")

    if isinstance(matches, dict) and "matches" in matches:
        matches = matches["matches"]
    if not isinstance(matches, list):
        matches = [matches]

    allowed_ids = set(order_ids)
    doc_map = {oid: doc for oid, doc in zip(order_ids, order_docs)}
    valid_matches = []
    for m in matches:
        if not isinstance(m, dict):
            continue
        oid = str(m.get('orderId') or m.get('id') or '').strip()
        if oid in allowed_ids:
            m['orderId'] = oid
            doc = doc_map.get(oid, '')
            if not m.get('position'):
                m_pos = re.search(r'职位:\s*([^.]+)', doc)
                if m_pos:
                    m['position'] = m_pos.group(1).strip()
            if not m.get('company'):
                m_comp = re.search(r'公司:\s*([^.]+)', doc)
                if m_comp:
                    m['company'] = m_comp.group(1).strip()
            valid_matches.append(m)

    valid_matches.sort(key=lambda x: x.get('score', 0) if isinstance(x.get('score', 0), (int, float)) else 0, reverse=True)
    return valid_matches[:top_k]
