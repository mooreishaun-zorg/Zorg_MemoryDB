#!/usr/bin/env python3
"""Static contract check for request-to-response timing requirements."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SKILL = (ROOT / "skills/zorg-db-memory/SKILL.md").read_text()
MASTER = (ROOT / "package/zorg/rules/ZORG_MEMORYDB_MASTER_RULES.md").read_text()
PRODUCTION = (ROOT / "package/zorg/rules/PRODUCTION_MEMORY_RULES.md").read_text()


def check() -> None:
    required = (
        "trusted inbound request timestamp",
        "response-preparation timestamp",
        "backend scan duration",
        "fail closed",
    )
    for text in required:
        assert text in SKILL, f"missing timing guard in skill: {text}"
    assert "runtime response-preparation timestamp" in MASTER
    assert "Database scan duration and tool timing are never substitutes." in PRODUCTION
    assert "actual response/send timestamp" not in MASTER
    assert "actual response timestamp" not in PRODUCTION


if __name__ == "__main__":
    check()
    print("reply timing contract: OK")
