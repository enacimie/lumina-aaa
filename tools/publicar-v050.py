#!/usr/bin/env python3
"""Publishes LUMINA-AAA v0.5.0 to Zenodo as a NEW VERSION of the v0.4.0 deposit,
under the same concept DOI (10.5281/zenodo.24248310). Uploads the single release
ZIP (matching how v0.4.0 was deposited), patches the metadata, prereserves the
DOI. It NEVER publishes unless --publicar is passed explicitly.

Uso:
    python3 tools/publicar-v050.py            # crea borrador + sube (no publica)
    python3 tools/publicar-v050.py --simular  # informa sin escribir
    python3 tools/publicar-v050.py --publicar # publica el borrador (paso publico)
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
ZIP = RAIZ / "release" / "lumina-aaa-v0.5.0.zip"
METADATOS = RAIZ / "release" / "zenodo-metadata.json"
BASE_ID = "24248311"  # deposito publicado v0.4.0 (concept DOI 24248310)


def token() -> str:
    t = os.environ.get("ZENODO_TOKEN")
    if not t and RUTA_TOKEN.exists():
        t = RUTA_TOKEN.read_text(encoding="utf-8").strip()
    if not t:
        sys.exit("no hay token de Zenodo (ni $ZENODO_TOKEN ni ~/.config/zenodo/token)")
    return t.strip()


def peticion(url, tok, metodo="GET", datos=None, cabeceras=None, reintentos=4):
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
        except Exception as e:
            ult = f"{type(e).__name__}: {e}"
        time.sleep(min(2 ** intento, 30))
    raise SystemExit(f"fallo persistente en {url}: {ult}")


def md5(ruta):
    x = hashlib.md5()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            x.update(b)
    return x.hexdigest()


def multipart(nombre, ruta):
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


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publicar", action="store_true", help="publica el borrador (paso publico irreversible)")
    ap.add_argument("--simular", action="store_true")
    ap.add_argument("--borrador", help="reutiliza un borrador ya creado (id)")
    args = ap.parse_args(argv)
    tok = token()

    if not ZIP.exists():
        sys.exit(f"no existe {ZIP}; ejecuta antes tools/build-release.py --zip")
    print(f"ZIP: {ZIP.name} ({ZIP.stat().st_size} bytes, md5 {md5(ZIP)})")

    if args.simular:
        print(f"[simulacion] nueva version desde {BASE_ID}, sube {ZIP.name}, metadata {METADATOS.name}")
        print("[simulacion] no se ha escrito nada")
        return 0

    # 1. Nueva version (o reutilizar borrador)
    if args.borrador:
        dep = args.borrador
        print(f"reutilizando borrador {dep}")
    else:
        code, resp = peticion(f"{API}/deposit/depositions/{BASE_ID}/actions/newversion", tok, metodo="POST")
        if code not in (200, 201):
            sys.exit(f"newversion fallo: HTTP {code} {resp[:300]!r}")
        j = json.loads(resp)
        dep = str(j.get("id"))
        print(f"nueva version borrador: {dep} (concepto {j.get('conceptdoi', '?')})")

    # 2. Quitar el zip v0.4.0 copiado por la nueva version
    code, resp = peticion(f"{API}/deposit/depositions/{dep}/files", tok)
    if code != 200:
        sys.exit(f"listar ficheros fallo: HTTP {code} {resp[:200]!r}")
    for f in json.loads(resp):
        fid = f.get("id")
        code, _ = peticion(f"{API}/deposit/depositions/{dep}/files/{fid}", tok, metodo="DELETE")
        print(f"  [borrar previo] {f.get('filename')}: HTTP {code}")

    # 3. Subir el zip v0.5.0
    cuerpo, ctype = multipart(ZIP.name, ZIP)
    code, resp = peticion(f"{API}/deposit/depositions/{dep}/files", tok, metodo="POST",
                          datos=cuerpo, cabeceras={"Content-Type": ctype})
    if code not in (200, 201):
        sys.exit(f"subida fallo: HTTP {code} {resp[:300]!r}")
    r = json.loads(resp)
    ok_tam = int(r.get("filesize") or -1) == ZIP.stat().st_size
    ok_md5 = str(r.get("checksum") or "").split(":")[-1] == md5(ZIP)
    print(f"subido {ZIP.name}: tam_ok={ok_tam} md5_ok={ok_md5}")
    if not (ok_tam and ok_md5):
        sys.exit("verificacion del zip fallida")

    # 4. Metadatos
    meta = json.loads(METADATOS.read_text(encoding="utf-8"))
    code, resp = peticion(f"{API}/deposit/depositions/{dep}", tok, metodo="PUT",
                          datos=json.dumps(meta).encode(), cabeceras={"Content-Type": "application/json"})
    print(f"metadatos: HTTP {code} (version {meta['metadata']['version']})")
    if code != 200:
        print(f"  respuesta: {resp[:300]!r}")

    # 5. El DOI de version se asigna al publicar; el concepto ya esta enlazado.

    print(f"\nBORRADOR listo (NO publicado): https://zenodo.org/deposit/{dep}")
    print(f"  vista previa: https://zenodo.org/records/{dep}?preview=1")

    # 6. Publicar solo con flag explicito
    if args.publicar:
        code, resp = peticion(f"{API}/deposit/depositions/{dep}/actions/publish", tok, metodo="POST")
        if code in (200, 201, 202):
            j = json.loads(resp)
            print(f"\nPUBLICADO: doi {j.get('doi')} | concepto {j.get('conceptdoi')}")
            print(f"  https://zenodo.org/records/{j.get('id')}")
        else:
            sys.exit(f"publicacion fallo: HTTP {code} {resp[:300]!r}")
    else:
        print("\nNo publicado. Revisa el borrador y publica con --publicar (o --borrador <id> --publicar).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
