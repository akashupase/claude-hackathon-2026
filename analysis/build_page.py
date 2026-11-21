"""Builds web/index.html (one page) from out/follow_the_rupee.json and web/template.html.

Usage:  python analysis/build_page.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scorecard_text import SCORECARD_TEXT  # noqa: E402

data = json.loads((ROOT / "out" / "follow_the_rupee.json").read_text())
for c in data["contractors"]:
    c["text"] = SCORECARD_TEXT.get(c["contractor"], "")
    c["short"] = c["contractor"].replace(" (synthetic)", "")

payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
page = (ROOT / "web" / "template.html").read_text().replace("/*__DATA__*/null", payload)
out = ROOT / "web" / "index.html"
out.write_text(page)
print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
