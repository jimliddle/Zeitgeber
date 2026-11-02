#!/usr/bin/env python3
"""Builds the single-file app. Run: python3 build.py   Output: index.html
--test writes dist/zeitgeber.test.html, which exposes internals to the browser tests."""
import base64, hashlib, json, pathlib, sys

root = pathlib.Path(__file__).parent
src = root / "src"
test = "--test" in sys.argv
b64 = lambda p: base64.b64encode((root / p).read_bytes()).decode()
png = lambda n: "data:image/png;base64," + b64(f"assets/icons/{n}.png")

css = (src / "style.css").read_text()
css = css.replace("%%FONT_DISPLAY%%", b64("assets/fonts/display.woff2")).replace("%%FONT_BODY%%", b64("assets/fonts/body.woff2"))

sports = json.loads((src / "sports.json").read_text())
js = "".join((src / f).read_text() + "\n" for f in sorted(p.name for p in src.glob("*.js")))
js = js.replace("/* Application shell", "const SPORTS=" + json.dumps(sports, separators=(",", ":")) + ";\n/* Application shell", 1)
icons = {"a192": png("any-192"), "a512": png("any-512"), "m512": png("mask-512")}
js = js.replace("/*ICONS*/{}", json.dumps(icons, separators=(",", ":")))
if test:
    js = js.replace("/*TEST_HOOK*/", "window.__zg={D,R,F,CFG,UI,St,Zip,Vault,Cloud,Live,ingestExport,parseCSV,parseTs,persist,rebuild,render,selection,sleepRegularity,socialJetlag,FIGS,loadSample,boot2,dirty,tzOffsetMin,RELAY_PY,exportSheet,renderFigCanvas,installState};")
assert "</script" not in js.lower()

sha = lambda s: "sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
page = (src / "template.html").read_text()
for key, value in (("%%SCRIPT_HASH%%", sha(js)), ("%%STYLE_HASH%%", sha(css)), ("%%ICON_APPLE%%", png("apple-180")), ("%%ICON_FAV%%", png("fav-48")), ("%%STYLE%%", css), ("%%SCRIPT%%", js)):
    page = page.replace(key, value)

out = root / "dist" / "zeitgeber.test.html" if test else root / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page)
print(out, f"{out.stat().st_size / 1024:.0f} KB")
