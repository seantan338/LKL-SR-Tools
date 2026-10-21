import os
import sys
import json
import asyncio
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import batch_llm


class FakeCompletions:
    """输入超过 max_rows 行数据时返回 finish_reason='length'，否则把每行解析成一条记录"""

    def __init__(self, max_rows):
        self.max_rows = max_rows
        self.calls = 0

    async def create(self, model, messages, **kwargs):
        self.calls += 1
        await asyncio.sleep(0)
        content = messages[-1]["content"]
        rows = [l for l in content.split("\n") if l.startswith("row")]
        if len(rows) > self.max_rows:
            return SimpleNamespace(choices=[SimpleNamespace(finish_reason="length", message=SimpleNamespace(content='[{"name": "trunc'))])
        payload = json.dumps([{"name": r} for r in rows])
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=payload))])


def _run_halving(monkeypatch, n_rows, max_rows, semaphore_limit, n_batches=1):
    fake = FakeCompletions(max_rows)
    monkeypatch.setattr(batch_llm, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=fake)))
    batch = "header\n" + "\n".join(f"row{i}" for i in range(n_rows))

    async def go():
        sem = asyncio.Semaphore(semaphore_limit)
        tasks = [
            batch_llm.parse_batch_with_retry_and_halving(batch, "sys", "prefix", semaphore=sem, model_name="m")
            for _ in range(n_batches)
        ]
        # 修复前：截断后的对半切分在持有 semaphore 时递归，会永远挂起
        return await asyncio.wait_for(asyncio.gather(*tasks), timeout=5)

    return asyncio.run(go()), fake


def test_halving_does_not_deadlock_single_slot(monkeypatch):
    results, fake = _run_halving(monkeypatch, n_rows=8, max_rows=4, semaphore_limit=1)
    assert [r["name"] for r in results[0]] == [f"row{i}" for i in range(8)]
    assert fake.calls == 3  # 1 次截断 + 2 个半批


def test_halving_does_not_deadlock_parallel_batches(monkeypatch):
    results, _ = _run_halving(monkeypatch, n_rows=8, max_rows=4, semaphore_limit=3, n_batches=3)
    assert all(len(r) == 8 for r in results)


def test_truncation_beyond_retries_raises_instead_of_blind_retry(monkeypatch):
    fake = FakeCompletions(max_rows=0)
    monkeypatch.setattr(batch_llm, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=fake)))
    batch = "header\nrow0"  # 只有 2 行，不能再对半切分

    async def go():
        return await asyncio.wait_for(
            batch_llm.parse_batch_with_retry_and_halving(batch, "sys", "prefix", semaphore=asyncio.Semaphore(1), model_name="m"),
            timeout=5,
        )

    try:
        asyncio.run(go())
        assert False, "should raise"
    except ValueError as e:
        assert "超出模型最大输出长度" in str(e)
    assert fake.calls == 1
