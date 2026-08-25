import pytest

from app.sabre_mcp import SabreMcpError, search_documentation


class Response:
    def __init__(self, value, status=200):
        self.value = value
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError("upstream")

    def json(self):
        return self.value


def test_sabre_documentation_search_uses_mcp_tool():
    captured = {}

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return Response({"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Cars API"}]}})

    result = search_documentation("rental car availability", post=post)
    assert result["content"][0]["text"] == "Cars API"
    assert captured["json"]["params"]["name"] == "look_for_artifact_content"
    assert "rental car" in captured["json"]["params"]["arguments"]["searchQuery"]


def test_sabre_documentation_search_degrades_cleanly():
    def post(*_, **__):
        return Response({}, status=500)

    with pytest.raises(SabreMcpError):
        search_documentation("cars", post=post)
