import os
import chromadb
from chromadb.utils import embedding_functions
from chromadb.config import Settings
from logger import setup_logger

logger = setup_logger(__name__)

# Constants
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_data"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

_chroma_client = None
_candidate_collection = None
_order_collection = None
_embedding_fn = None

def get_chroma_client():
    global _chroma_client, _embedding_fn
    if _chroma_client is None:
        logger.info(f"Initializing ChromaDB at {CHROMA_PERSIST_DIR}")
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        
        if OPENAI_API_KEY:
            _embedding_fn = embedding_functions.OpenAIEmbeddingFunction(
                api_key=OPENAI_API_KEY,
                model_name=EMBEDDING_MODEL
            )
        else:
            logger.warning("OPENAI_API_KEY not found. Using default default sentence-transformers embedding function.")
            _embedding_fn = embedding_functions.DefaultEmbeddingFunction()

    return _chroma_client

def get_collection(name: str):
    client = get_chroma_client()
    # get_or_create_collection
    return client.get_or_create_collection(
        name=name,
        embedding_function=_embedding_fn
    )

def get_candidate_collection():
    global _candidate_collection
    if _candidate_collection is None:
        _candidate_collection = get_collection("candidates")
    return _candidate_collection

def get_order_collection():
    global _order_collection
    if _order_collection is None:
        _order_collection = get_collection("job_orders")
    return _order_collection

def build_candidate_text(candidate: dict) -> str:
    """
    Combine all useful candidate fields into a single rich text block for embedding.
    """
    parts = []
    
    if candidate.get('position'):
        parts.append(f"申请职位: {candidate['position']}")
    if candidate.get('company'):
        parts.append(f"曾意向/目标公司: {candidate['company']}")
    if candidate.get('degree'):
        parts.append(f"学历: {candidate['degree']}")
    if candidate.get('school'):
        parts.append(f"毕业学校: {candidate['school']}")
    if candidate.get('experience'):
        parts.append(f"工作经验年限: {candidate['experience']}")
    if candidate.get('location'):
        parts.append(f"目前所在地/居住地: {candidate['location']}")
    if candidate.get('skills') and isinstance(candidate['skills'], list):
        parts.append(f"专业技能: {', '.join(candidate['skills'])}")
    if candidate.get('summary'):
        parts.append(f"个人简介: {candidate['summary']}")
        
    # Handling rejected candidates specifically
    if candidate.get('status') == 'rejected':
        reason = candidate.get('rejectReason', '')
        note = candidate.get('rejectNote', '')
        if reason or note:
            parts.append(f"历史记录/放弃原因: {reason} - {note}")

    # Work experience
    work_exp = candidate.get('workExperience', [])
    if work_exp and isinstance(work_exp, list):
        exp_texts = []
        for w in work_exp[:3]:
            # Each entry is a dict
            c = w.get('company', '') if isinstance(w, dict) else ''
            p = w.get('position', '') if isinstance(w, dict) else ''
            r = w.get('responsibilities', '') if isinstance(w, dict) else ''
            exp_texts.append(f"{c} {p} {r}".strip())
        
        valid_exp = [x for x in exp_texts if x]
        if valid_exp:
            parts.append(f"详细工作经历: {'; '.join(valid_exp)}")
    
    text = '. '.join(parts)
    return text if text.strip() else f"候选人姓名: {candidate.get('name', '未知')}"

def build_order_text(order: dict) -> str:
    """
    Combine job order fields for embedding.
    """
    parts = []
    if order.get('position'): parts.append(f"职位: {order['position']}")
    if order.get('company'): parts.append(f"公司: {order['company']}")
    if order.get('salary'): parts.append(f"薪资: {order['salary']}")
    if order.get('location'): parts.append(f"工作地点: {order['location']}")
    if order.get('requirements'): parts.append(f"职位要求/JD: {order['requirements']}")
    if order.get('workHours'): parts.append(f"工作时间: {order['workHours']}")
    if order.get('benefits'): parts.append(f"福利亮点: {order['benefits']}")
    
    return '. '.join(parts)

def extract_candidate_metadata(candidate: dict) -> dict:
    meta = {}
    if candidate.get('location'):
        meta['location'] = str(candidate['location']).lower()
    
    status = candidate.get('status') or 'pending'
    # Treat 'rejected' specially to allow querying
    meta['status'] = status

    # Only include basic primitives in ChromaDB metadata
    return {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))}

def extract_order_metadata(order: dict) -> dict:
    meta = {}
    if order.get('location'):
        meta['location'] = str(order['location']).lower()
    meta['status'] = order.get('status') or 'open'
    
    return {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))}

async def sync_candidates(candidates: list):
    """
    Batch upsert candidates to ChromaDB
    candidates: list of dicts directly from Firestore
    """
    if not candidates:
        return 0

    collection = get_candidate_collection()
    
    ids = []
    documents = []
    metadatas = []
    
    for c in candidates:
        cid = c.get('id')
        if not cid: continue
        
        ids.append(cid)
        documents.append(build_candidate_text(c))
        metadatas.append(extract_candidate_metadata(c))
        
    if ids:
        # ChromaDB handles chunking or we might need to batch it. 
        # For simplicity, do it in chunks of 100
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            collection.upsert(
                ids=ids[i:i+batch_size],
                documents=documents[i:i+batch_size],
                metadatas=metadatas[i:i+batch_size]
            )
            
    return len(ids)

async def sync_orders(orders: list):
    """
    Batch upsert orders to ChromaDB
    """
    if not orders:
        return 0

    collection = get_order_collection()
    
    ids = []
    documents = []
    metadatas = []
    
    for o in orders:
        oid = o.get('id')
        if not oid: continue
        
        ids.append(oid)
        documents.append(build_order_text(o))
        metadatas.append(extract_order_metadata(o))
        
    if ids:
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            collection.upsert(
                ids=ids[i:i+batch_size],
                documents=documents[i:i+batch_size],
                metadatas=metadatas[i:i+batch_size]
            )
            
    return len(ids)
