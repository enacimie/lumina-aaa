#!/usr/bin/env python3
"""Builds the LUMINA-AAA release snapshot for archiving (Zenodo).

Copies the project files into a clean directory, generates a manifest with
sizes and SHA-256 sums, and optionally a ZIP. It scans for secrets before and
after copying.

The record holds the code, the tokens, the reports, the empirical data, the
demo, the specification and the v0.2 archive as evidence. The manuscript is
not part of the archive; it is submitted separately to the journal.

Uso:
    python3 tools/build-release.py
    python3 tools/build-release.py --zip
    python3 tools/build-release.py --simular
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST_DEFAULT = ROOT / "release" / "lumina-aaa-v0.3.0"

# Explicit inclusion: only these paths enter the snapshot.
INCLUIR = [
    "lib",
    "tools",
    "tests",
    "tokens",
    "reports",
    "demo",
    "archive",
    "docs",
    "README.md",
    "package.json",
    "LICENSE",
]

# Exclusions, applied on top of the inclusion list.
EXCLUIR_PATRONES = [
    "__pycache__",
    "*.pyc",
    "*.aux",
    "*.log",
    "*.fls",
    "*.fdb_latexmk",
    "*.out",
    "*.blg",
    "paper.tex",
    "paper-es.tex",
    "paper.pdf",
    "paper-es.pdf",
    "paper.bbl",
    "paper-es.bbl",
    "refs.bib",
    "env.txt",
    ".env",
    "*.token",
]

SECRETOS = ["API_KEY", "SECRET", "PASSWORD", "sshpass", "kaggle.json", "BEGIN PRIVATE KEY"]


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def incluir(ruta: Path) -> bool:
    nombre = ruta.name
    rel = ruta.relative_to(ROOT).as_posix()
    for parte in Path(rel).parts:
        if any(parte == pat or parte.endswith(pat.lstrip("*")) for pat in EXCLUIR_PATRONES if pat.startswith("*")):
            return False
        if parte in EXCLUIR_PATRONES:
            return False
    return not any(pat in rel for pat in EXCLUIR_PATRONES if not pat.startswith("*"))


def recoger() -> list[Path]:
    rutas = []
    for entrada in INCLUIR:
        p = ROOT / entrada
        if p.is_file():
            rutas.append(p)
        elif p.is_dir():
            for r in sorted(p.rglob("*")):
                if r.is_file() and incluir(r):
                    rutas.append(r)
    return rutas


def escanear_secretos(rutas: list[Path]) -> list[str]:
    hallazgos = []
    for r in rutas:
        # El propio escaneer contiene la lista de patrones; no se escanea a si mismo.
        if r.name == "build-release.py":
            continue
        if r.suffix.lower() in {".png", ".pdf", ".zip", ".json"}:
            continue
        try:
            texto = r.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for s in SECRETOS:
            if s in texto:
                hallazgos.append(f"{r.relative_to(ROOT)}: {s}")
    return hallazgos


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", default=str(DEST_DEFAULT))
    ap.add_argument("--zip", action="store_true", help="genera tambien el ZIP de la instantanea")
    ap.add_argument("--simular", action="store_true", help="informa sin escribir")
    args = ap.parse_args(argv)

    dest = Path(args.dest)
    rutas = recoger()
    secretos = escanear_secretos(rutas)
    print(f"ficheros a incluir: {len(rutas)}")
    print(f"secretos detectados: {len(secretos)}")
    for s in secretos[:10]:
        print("  !", s)
    if secretos:
        print("ABORTADO: hay secretos en la instantanea", file=sys.stderr)
        return 1
    total = sum(r.stat().st_size for r in rutas)
    print(f"tamano total: {total / 1048576:.1f} MB")
    if args.simular:
        for r in rutas[:15]:
            print("  ", r.relative_to(ROOT))
        print("[simulacion] no se ha escrito nada")
        return 0

    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for r in rutas:
        destino = dest / r.relative_to(ROOT)
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(r, destino)

    lineas = ["ruta\tbytes\tsha256\tclase"]
    for r in rutas:
        rel = r.relative_to(ROOT).as_posix()
        clase = "codigo" if r.suffix in {".js", ".mjs", ".py"} else "datos" if r.suffix in {".json", ".css"} else "documentacion"
        lineas.append(f"{rel}\t{r.stat().st_size}\t{sha256(r)}\t{clase}")
    (dest / "MANIFEST.tsv").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    sums = [f"{sha256(dest / r.relative_to(ROOT))}  {r.relative_to(ROOT).as_posix()}" for r in rutas]
    (dest / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")

    readme = f"""# LUMINA-AAA v0.3.0: release snapshot

Codigo, tokens, informes y datos del sistema LUMINA-AAA, con la
especificacion normativa y el archivo v0.2 como prueba.

- Codigo: AGPL-3.0-or-later WITH Conditional-Linking-Exception (vease LICENSE).
- Datos y documentacion: CC BY 4.0.
- `MANIFEST.tsv`: ruta, bytes, sha256 y clase de cada fichero.
- `SHA256SUMS`: sumas SHA-256 verificables con `sha256sum -c SHA256SUMS`.

Para reconstruir los artefactos:

    npm install
    npm test
    npm run build

El resumen de referencia es
`8310c587049be4baeddb9c3b5ff84618670b8cfb6bceae45ac5aa0e6262fdcfe`.

El manuscrito no forma parte del archivo; se envia por separado a la revista.
"""
    (dest / "README_RELEASE.md").write_text(readme, encoding="utf-8")

    if args.zip:
        zip_ruta = Path(str(dest) + ".zip")
        shutil.make_archive(str(dest), "zip", root_dir=dest.parent, base_dir=dest.name)
        print(f"ZIP: {zip_ruta} ({zip_ruta.stat().st_size / 1048576:.1f} MB)")

    print(f"instantanea: {dest}")
    print(f"  ficheros: {len(rutas) + 3} (incluye MANIFEST, SHA256SUMS y README_RELEASE)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
