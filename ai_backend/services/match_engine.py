import json
from services.core_llm import client as openai_client, AI_MODEL_NAME
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

async def match_candidates_for_order(order: dict, filters: dict = None, top_k: int = 5, pre_filter_k: int = 20):
    try:
        collection = get_candidate_collection()
        order_text = build_order_text(order)
        
        # Build ChromaDB Where Filter
        where_filter = {}
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
        candidate_metas = results['metadatas'][0]
        distances = results.get('distances', [[0]*len(candidate_ids)])[0]
        
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
        # 3. LLM Rerank
        response = openai_client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {"role": "system", "content": RERANK_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        result_text = response.choices[0].message.content.strip()
        # Clean markdown
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
            
        try:
            matches = json.loads(result_text)
            # Ensure it is a list
            if isinstance(matches, dict) and "matches" in matches:
                matches = matches["matches"]
                
            # Filter and Sort by score descending
            valid_matches = []
            for m in matches:
                # Only keep top_k
                if m.get('candidateId'):
                    valid_matches.append(m)
                    
            valid_matches.sort(key=lambda x: x.get('score', 0), reverse=True)
            return valid_matches[:top_k]
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM match response: {e}\nResponse: {result_text}")
            return []

    except Exception as e:
        logger.error(f"Match Engine Error: {e}", exc_info=True)
        return []
