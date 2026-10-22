import os
import sys
import json
import pytest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import order_parser

class FakeCompletions:
    def __init__(self, response_text: str):
        self.response_text = response_text
        self.calls = 0

    async def create(self, *args, **kwargs):
        self.calls += 1
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.response_text))]
        )

@pytest.mark.asyncio
async def test_parse_multi_job_orders(monkeypatch):
    sample_orders = [
        {
            "company": "acompany",
            "position": "Business development executive",
            "location": "Johor/KL",
            "salary": "3.5k - 4.5k (have commission)",
            "requirements": "Gender: Male",
            "benefits": "Commission",
            "headcount": 1
        },
        {
            "company": "acompany",
            "position": "Refining Chemist",
            "location": "",
            "salary": "3.5k - 5k",
            "requirements": "Gender: Male",
            "benefits": "",
            "headcount": 1
        },
        {
            "company": "acompany",
            "position": "Refining Manager",
            "location": "",
            "salary": "8k - 10k",
            "requirements": "Gender: Male",
            "benefits": "",
            "headcount": 1
        }
    ]
    fake = FakeCompletions(json.dumps(sample_orders))
    monkeypatch.setattr(order_parser, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=fake)))
    monkeypatch.setattr(order_parser, "ensure_api_key", lambda: None)

    results = await order_parser.parse_job_orders("some raw text")
    assert len(results) == 3
    assert results[0]["company"] == "acompany"
    assert results[0]["position"] == "Business development executive"
    assert results[1]["position"] == "Refining Chemist"
    assert results[2]["position"] == "Refining Manager"
    assert results[2]["salary"] == "8k - 10k"

@pytest.mark.asyncio
async def test_parse_wrapped_dict_orders(monkeypatch):
    wrapped = {
        "job_orders": [
            {
                "company": "Test Corp",
                "position": "Developer",
                "salary": "5k"
            }
        ]
    }
    fake = FakeCompletions(json.dumps(wrapped))
    monkeypatch.setattr(order_parser, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=fake)))
    monkeypatch.setattr(order_parser, "ensure_api_key", lambda: None)

    results = await order_parser.parse_job_orders("some text")
    assert len(results) == 1
    assert results[0]["company"] == "Test Corp"
    assert results[0]["position"] == "Developer"
