"""Tests for the agent tool registry seam.

The dispatch is now a `_TOOL_HANDLERS` registry instead of a 500-line if/elif.
The key invariant: every tool declared in TOOLS has exactly one handler, and
vice versa — adding a tool means registering an adapter, not editing a ladder.
"""
import json

from unittest.mock import AsyncMock

import agent


def test_registry_covers_exactly_the_declared_tools():
    declared = {t["function"]["name"] for t in agent.TOOLS}
    registered = set(agent._TOOL_HANDLERS)
    assert registered == declared


async def test_run_tool_dispatches_upsert_company_to_intake(mock_jobsearch_pool):
    out = await agent.run_tool("upsert_company", {"name": "Acme"}, mock_jobsearch_pool)
    assert json.loads(out) == {"id": json.loads(out)["id"], "created": True}
    assert "INSERT INTO companies" in mock_jobsearch_pool.execute.call_args.args[0]


async def test_run_tool_search_notes_builds_fts_query(mock_jobsearch_pool):
    mock_jobsearch_pool.fetch = AsyncMock(return_value=[])
    await agent.run_tool("search_notes", {"query": "rust"}, mock_jobsearch_pool)
    sql = mock_jobsearch_pool.fetch.call_args.args[0]
    assert "plainto_tsquery" in sql


async def test_run_tool_unknown_returns_error(mock_jobsearch_pool):
    out = await agent.run_tool("does_not_exist", {}, mock_jobsearch_pool)
    assert "Unknown tool" in json.loads(out)["error"]
