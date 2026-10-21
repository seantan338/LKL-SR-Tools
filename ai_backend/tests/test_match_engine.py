import os
import sys
import json
import asyncio
from types import SimpleNamespace

import chromadb
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import embedding_service, match_engine


class KeywordEmbedding(chromadb.EmbeddingFunction):
    """离线、确定性的假向量：按关键词计数，避免测试下载模型或调用 API"""

    VOCAB = ["operator", "driver", "account", "factory", "penang", "kl"]

    def __init__(self):
        pass

    def __call__(self, input):
        return [[float(t.lower().count(w)) + 0.01 for w in self.VOCAB] for t in input]

    @staticmethod
    def name():
        return "keyword-test"


class FakeCompletions:
    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    async def create(self, model, messages, **kwargs):
        self.calls += 1
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=self.reply(messages)))])


@pytest.fixture
def chroma(monkeypatch):
    client = chromadb.EphemeralClient()
    for name in ("candidates", "job_orders"):
        try:
            client.delete_collection(name)
        except Exception:
            pass
    monkeypatch.setattr(embedding_service, "_chroma_client", client)
    monkeypatch.setattr(embedding_service, "_embedding_fn", KeywordEmbedding())
    monkeypatch.setattr(embedding_service, "_candidate_collection", None)
    monkeypatch.setattr(embedding_service, "_order_collection", None)
    return client


def _rerank_reply(messages):
    # 模型按 RERANK_SYSTEM_PROMPT 输出 "id"，并混入一个向量检索没召回的编造 ID
    ids = [l.split(":", 1)[1].strip() for l in messages[-1]["content"].split("\n") if l.startswith("Candidate ID:")]
    out = [{"id": cid, "score": 90 - i, "highlights": ["h"], "risks": [], "analysis": "a"} for i, cid in enumerate(ids)]
    out.append({"id": "hallucinated", "score": 99})
    return "```json\n" + json.dumps(out) + "\n```"


def _sync(team_id, candidates):
    return asyncio.run(embedding_service.sync_candidates(candidates, team_id=team_id))


def test_match_returns_candidates_scoped_to_team(chroma, monkeypatch):
    _sync("team_a", [
        {"id": "a1", "position": "Factory Operator", "location": "Penang"},
        {"id": "a2", "position": "Driver", "location": "KL"},
    ])
    _sync("team_b", [{"id": "b1", "position": "Factory Operator", "location": "Penang"}])

    fake = FakeCompletions(_rerank_reply)
    monkeypatch.setattr(match_engine, "openai_client", SimpleNamespace(chat=SimpleNamespace(completions=fake)))

    matches = asyncio.run(match_engine.match_candidates_for_order(
        {"position": "Factory Operator", "location": "Penang"}, top_k=5, pre_filter_k=10, team_id="team_a"))

    ids = [m["candidateId"] for m in matches]
    assert set(ids) == {"a1", "a2"}           # 只返回 team_a，不含 b1
    assert "hallucinated" not in ids          # 过滤模型编造的 ID
    assert matches[0]["score"] >= matches[-1]["score"]
    assert fake.calls == 1


def test_match_without_synced_team_raises_clear_error(chroma, monkeypatch):
    monkeypatch.setattr(match_engine, "openai_client", SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions(_rerank_reply))))
    with pytest.raises(ValueError, match="同步向量库"):
        asyncio.run(match_engine.match_candidates_for_order({"position": "Driver"}, team_id="empty_team"))


def test_sync_prunes_deleted_candidates_only_for_that_team(chroma):
    _sync("team_a", [{"id": "a1", "position": "Driver"}, {"id": "a2", "position": "Driver"}])
    _sync("team_b", [{"id": "b1", "position": "Driver"}])
    _sync("team_a", [{"id": "a1", "position": "Driver"}])  # a2 已在 Firestore 删除

    col = embedding_service.get_candidate_collection()
    assert sorted(col.get(where={"teamId": "team_a"})["ids"]) == ["a1"]
    assert col.get(where={"teamId": "team_b"})["ids"] == ["b1"]
