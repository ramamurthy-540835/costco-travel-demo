"""Build the deployable v3 single-file frontend from maintainable sources."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
html = (STATIC / "index.html").read_text(encoding="utf-8")
css = (STATIC / "styles.css").read_text(encoding="utf-8")
flow = (STATIC / "flow-machine.js").read_text(encoding="utf-8")
app = (STATIC / "app.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="/styles.css">', f"<style>\n{css}\n</style>")
html = html.replace('<script src="/flow-machine.js?v=1"></script>', f"<script>\n{flow}\n</script>")
html = html.replace('<script type="module" src="/app.js?v=10"></script>', f"<script type=\"module\">\n{app}\n</script>")
(STATIC / "costco-travel-agent-v3.html").write_text(html, encoding="utf-8")
print("built static/costco-travel-agent-v3.html")
