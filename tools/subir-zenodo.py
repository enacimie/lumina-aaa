#!/usr/bin/env python3
"""Uploads the LUMINA-AAA release snapshot to a Zenodo draft.

Creates the deposit if needed, uploads the files with verification by size
and MD5, patches the metadata, and prereserves the DOI. It never publishes:
publishing requires explicit author approval.

Uso:
    python3 tools/subir-zenodo.py --deposito <id>
    python3 tools/subir-zenodo.py --deposito <id> --simular
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://zenodo.org/api"
RUTA_TOKEN = Path.home() / ".config" / "zenodo" / "token"
RAIZ = Path(__file__).resolve().parent.parent
SNAPSHOT = RAIZ / "release" / "lumina-aaa-v0.3.0"
METADATOS = RAIZ / "release" / "zenodo-metadata.json"


def token() -> str:
    t = os.environ.get("ZENODO_TOKEN")
    if not t and RUTA_TOKEN.exists():
        t = RUTA_TOKEN.read_text(encoding="utf-8").strip()
    if not t:
        sys.exit("no hay token de Zenodo (ni $ZENODO_TOKEN ni ~/.config/zenodo/token)")
    return t.strip()


def peticion(url: str, tok: str, metodo: str = "GET", datos: bytes | None = None,
             cabeceras: dict | None = None, reintentos: int = 4):
    ult = None
    for intento in range(reintentos):
        req = urllib.request.Request(url, data=datos, method=metodo)
        req.add_header("Authorization", f"Bearer {tok}")
        for k, v in (cabeceras or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            cuerpo = e.read()
            if 400 <= e.code < 500 and e.code != 429:
                return e.code, cuerpo
            ult = f"HTTP {e.code}: {cuerpo[:200]!r}"
        except Exception as e:  # red, timeout
            ult = f"{type(e).__name__}: {e}"
        time.sleep(min(2 ** intento, 30))
    raise SystemExit(f"fallo persistente en {url}: {ult}")


def md5(ruta: Path) -> str:
    x = hashlib.md5()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            x.update(b)
    return x.hexdigest()


def multipart(nombre: str, ruta: Path) -> tuple[bytes, str]:
    borde = "----zenodo" + hashlib.sha1(str(ruta).encode()).hexdigest()[:16]
    mime = mimetypes.guess_type(ruta.name)[0] or "application/octet-stream"
    pre = (
        f"--{borde}\r\n"
        f'Content-Disposition: form-data; name="name"\r\n\r\n{nombre}\r\n'
        f"--{borde}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{ruta.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    post = f"\r\n--{borde}--\r\n".encode()
    return pre + ruta.read_bytes() + post, f"multipart/form-data; boundary={borde}"


def listar(tok: str, dep: str) -> list[dict]:
    code, cuerpo = peticion(f"{API}/deposit/depositions/{dep}/files", tok)
    if code != 200:
        raise SystemExit(f"no se pudo listar el borrador {dep}: HTTP {code} {cuerpo[:200]!r}")
    return json.loads(cuerpo)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--deposito", required=True)
    ap.add_argument("--simular", action="store_true")
    args = ap.parse_args(argv)
    tok = token()

    deseados = {str(p.relative_to(SNAPSHOT)): p for p in sorted(SNAPSHOT.rglob("*")) if p.is_file()}
    print(f"instantanea: {SNAPSHOT}")
    print(f"ficheros a subir: {len(deseados)} ({sum(p.stat().st_size for p in deseados.values()) / 1048576:.1f} MB)")

    remotos = listar(tok, args.deposito)
    rmap = {(f.get("filename") or ""): f for f in remotos}
    print(f"borrador {args.deposito}: {len(remotos)} ficheros ya presentes")

    faltan = []
    for nombre, ruta in deseados.items():
        r = rmap.get(nombre)
        if r is None:
            faltan.append((nombre, ruta, "ausente"))
        elif int(r.get("filesize") or -1) != ruta.stat().st_size:
            faltan.append((nombre, ruta, "tamano distinto"))
    print(f"por subir o repetir: {len(faltan)}")
    if args.simular:
        for n, _, mot in faltan[:15]:
            print(f"    [subir] {n} ({mot})")
        print("[simulacion] no se ha escrito nada")
        return 0

    mal = 0
    for i, (nombre, ruta, mot) in enumerate(faltan, 1):
        if nombre in rmap:
            code, _ = peticion(f"{API}/deposit/depositions/{args.deposito}/files/{rmap[nombre]['id']}", tok, metodo="DELETE")
            print(f"  [sustituir] {nombre}: borrado HTTP {code}", flush=True)
        cuerpo, ctype = multipart(nombre, ruta)
        code, resp = peticion(
            f"{API}/deposit/depositions/{args.deposito}/files", tok, metodo="POST",
            datos=cuerpo, cabeceras={"Content-Type": ctype})
        if code not in (200, 201):
            mal += 1
            print(f"  [{i}/{len(faltan)}] FALLO {nombre}: HTTP {code} {resp[:200]!r}")
            continue
        r = json.loads(resp)
        ok_tam = int(r.get("filesize") or -1) == ruta.stat().st_size
        remota = str(r.get("checksum") or "")
        ok_md5 = remota.split(":")[-1] == md5(ruta) if remota else False
        if not (ok_tam and ok_md5):
            mal += 1
            print(f"  [{i}/{len(faltan)}] FALLO {nombre}: tam_ok={ok_tam} md5_ok={ok_md5}")
        elif i % 20 == 0 or i == len(faltan):
            print(f"  [{i}/{len(faltan)}] verificados (tamano y MD5)", flush=True)

    # Metadatos
    meta = json.loads(METADATOS.read_text(encoding="utf-8"))
    code, resp = peticion(f"{API}/deposit/depositions/{args.deposito}", tok, metodo="PUT",
                          datos=json.dumps(meta).encode(), cabeceras={"Content-Type": "application/json"})
    print(f"metadatos: HTTP {code}")
    if code != 200:
        print(f"  respuesta: {resp[:300]!r}")

    # Prerreserva del DOI
    code, resp = peticion(f"{API}/deposit/depositions/{args.deposito}/actions/preredeservedoi", tok, metodo="POST")
    doi = None
    if code == 200:
        doi = json.loads(resp).get("doi")
        print(f"DOI prerreservado: {doi}")
    else:
        print(f"prerreserva DOI: HTTP {code} {resp[:200]!r}")

    final = listar(tok, args.deposito)
    fmap = {(f.get("filename") or ""): f for f in final}
    ausentes = [n for n in deseados if n not in fmap]
    distintos = [n for n in deseados if n in fmap and int(fmap[n].get("filesize") or -1) != deseados[n].stat().st_size]
    print(f"\nborrador tras la subida: {len(final)} ficheros")
    print(f"  ausentes: {len(ausentes)} | tamano distinto: {len(distintos)} | fallos: {mal}")
    bien = not ausentes and not distintos and mal == 0
    print("VEREDICTO:", "[COMPLETO]" if bien else "[INCOMPLETO]")
    print(f"  depositos: https://zenodo.org/deposit/{args.deposito}")
    return 0 if bien else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
