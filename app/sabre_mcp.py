"""Server-side client for Sabre's public Developer Hub documentation MCP."""
from __future__ import annotations

import os
from typing import Any, Callable

import httpx

MCP_ENDPOINT = os.environ.get("SABRE_DOCS_MCP_URL", "https://developer.mcp.sabre.com/mcp")


class SabreMcpError(RuntimeError):
    pass


def call_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    post: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    try:
        response = (post or httpx.post)(
            MCP_ENDPOINT,
            json=payload,
            headers={"accept": "application/json, text/event-stream"},
            timeout=8.0,
        )
        response.raise_for_status()
        value = response.json()
    except Exception as exc:
        raise SabreMcpError("Sabre Developer Hub MCP is unavailable") from exc
    if value.get("error") or not isinstance(value.get("result"), dict):
        raise SabreMcpError("Sabre Developer Hub MCP returned an invalid result")
    return value["result"]


def search_documentation(query: str, *, post: Callable[..., Any] | None = None) -> dict[str, Any]:
    return call_tool(
        "look_for_artifact_content",
        {"searchQuery": query[:500]},
        post=post,
    )
