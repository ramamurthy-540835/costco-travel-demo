import json
import re

_SUFFIX_RE = re.compile(r"::(vertex|edge)$")


def parse_agtype(raw: str) -> dict:
    stripped = _SUFFIX_RE.sub("", raw)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as e:
        raise ValueError(f"could not parse agtype string: {raw!r}") from e
