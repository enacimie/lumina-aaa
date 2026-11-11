#!/usr/bin/env python3
"""External validation of the rendered demo with axe-core and Lighthouse.

Runs both tools against the static demo served locally, on a virtual display,
and writes a summary to docs/paper/data/tool-comparison.json. The raw tool
output is kept alongside it for review.

The demo renders the reference palette from the released tokens, so a passing
axe/Lighthouse colour-contrast check is an independent confirmation that the
certified token values also hold in a real browser DOM.

Uso:
    python3 tools/tool-comparison.py [--display :99] [--puerto 8130]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "docs" / "paper" / "data" / "tool-comparison.json"
RAW = ROOT / "docs" / "paper" / "data" / "tool-comparison-raw"
DEMO = "demo/"


def esperar_servidor(url: str, timeout: float = 30.0) -> None:
    inicio = time.time()
    while time.time() - inicio < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.3)
    raise SystemExit(f"el servidor no respondio en {url}")


def ejecutar(cmd: list[str], env: dict, timeout: int = 240) -> tuple[int, str, str]:
    p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def resumen_axe(ruta: Path) -> dict:
    data = json.loads(ruta.read_text(encoding="utf-8"))
    r = data[0] if isinstance(data, list) else data
    violations = r.get("violations", [])
    passes = r.get("passes", [])
    contrast = next((p for p in passes if p["id"] == "color-contrast"), None)
    return {
        "engine": r.get("testEngine", {}),
        "url": r.get("url"),
        "violations": len(violations),
        "violation_ids": sorted({v["id"] for v in violations}),
        "passes": len(passes),
        "pass_ids": sorted(p["id"] for p in passes),
        "inapplicable": len(r.get("inapplicable", [])),
        "incomplete": len(r.get("incomplete", [])),
        "color_contrast_nodes": len(contrast["nodes"]) if contrast else 0,
        "color_contrast_passes": bool(contrast),
    }


def resumen_lighthouse(ruta: Path) -> dict:
    d = json.loads(ruta.read_text(encoding="utf-8"))
    acc = d["categories"]["accessibility"]
    failing = []
    for a in d["audits"].values():
        sc = a.get("score")
        mode = a.get("scoreDisplayMode")
        if sc is not None and sc < 1 and mode not in ("notApplicable", "manual", "informative"):
            failing.append({"id": a["id"], "score": sc, "title": a.get("title", "")})
    contrast = d["audits"].get("color-contrast", {})
    return {
        "lighthouse_version": d.get("lighthouseVersion"),
        "url": d.get("requestedUrl"),
        "accessibility_score": acc.get("score"),
        "failing_audits": failing,
        "color_contrast": {
            "score": contrast.get("score"),
            "display_mode": contrast.get("scoreDisplayMode"),
            "items": len(contrast.get("details", {}).get("items", [])),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--display", default=":99")
    ap.add_argument("--puerto", type=int, default=8130)
    ap.add_argument("--url", help="auditar esta URL en lugar de servir la demo local")
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["DISPLAY"] = args.display

    url = args.url or f"http://localhost:{args.puerto}/{DEMO}"
    servidor = None
    if not args.url:
        servidor = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(args.puerto), "--bind", "127.0.0.1"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        esperar_servidor(url)
        axe_json = RAW / "axe.json"
        lh_json = RAW / "lighthouse.json"
        rc_axe, out_axe, err_axe = ejecutar(
            ["axe", url, "-t", "wcag2a,wcag2aa,wcag21aa,wcag22aa", "-j"], env)
        axe_json.write_text(out_axe, encoding="utf-8")
        if rc_axe not in (0, 1):  # axe usa 1 cuando hay violaciones
            print("axe fallo:", err_axe[:400], file=sys.stderr)
        rc_lh, out_lh, err_lh = ejecutar(
            ["lighthouse", url, "--only-categories=accessibility", "--quiet",
             "--output=json", f"--output-path={lh_json}"], env)
        if rc_lh != 0:
            print("lighthouse fallo:", err_lh[:400], file=sys.stderr)

        if not axe_json.exists() or not lh_json.exists():
            raise SystemExit("no se generaron los JSON de las herramientas")

        resumen = {
            "description": "external validation of the rendered demo (reference palette) with axe-core and Lighthouse",
            "demo_url": url,
            "display": args.display,
            "axe": resumen_axe(axe_json),
            "lighthouse": resumen_lighthouse(lh_json),
            "interpretation": "the demo renders the released tokens; a passing axe/Lighthouse colour-contrast check confirms the certified values in a real browser DOM",
        }
        OUT.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")
        print("tool-comparison: escribio", OUT)
        print("  axe:", json.dumps(resumen["axe"], ensure_ascii=False))
        print("  lighthouse:", json.dumps(resumen["lighthouse"], ensure_ascii=False))
        return 0
    finally:
        if servidor is not None:
            servidor.terminate()
            try:
                servidor.wait(timeout=5)
            except subprocess.TimeoutExpired:
                servidor.kill()


if __name__ == "__main__":
    raise SystemExit(main())
