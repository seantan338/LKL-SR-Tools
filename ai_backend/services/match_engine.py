import json
from services.core_llm import client as openai_client, AI_MODEL_NAME, safe_json_parse
from services.embedding_service import get_candidate_collection, build_order_text
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
    if team_id:
        # 向量库所有团队共用一个 collection，必须按团队隔离
        where_filter["teamId"] = team_id
        if not collection.get(where={"teamId": team_id}, limit=1).get("ids"):
            raise ValueError("向量库中还没有本团队的候选人，请先在「招聘订单」页点击「同步向量库」")

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
        raise ValueError("AI 精排结果解析失败，请重试")

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
