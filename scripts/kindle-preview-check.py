#!/usr/bin/env python3
"""Smoke com Kindle Previewer oficial. Não confunde conversor com aparelho."""
import os
import pathlib
import shutil
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)

candidates = [
    shutil.which("kindlepreviewer"),
    "/usr/local/bin/kindlepreviewer",
    "/opt/homebrew/bin/kindlepreviewer",
]
candidates += [
    str(p)
    for app in pathlib.Path("/Applications").glob("*Kindle*Previewer*.app")
    for p in app.glob("Contents/MacOS/*")
    if "kindle" in p.name.lower()
]
binary = next((item for item in candidates if item and
               pathlib.Path(item).is_file() and os.access(item, os.X_OK)), None)
if not binary:
    print("Candidatos encontrados:", candidates)
    raise SystemExit("Kindle Previewer instalado mas CLI não localizada.")
print("CLI Kindle Previewer:", binary)

for stem in ["repaired-valid", "repaired-valid-epub2",
             "repaired-valid-ncx-hierarchy"]:
    book = root / (stem + ".epub")
    assert book.is_file() and book.stat().st_size > 0, stem
    folder = output / stem
    folder.mkdir(exist_ok=True)
    cmd = [binary, str(book), "--convert", "--output", str(folder)]
    print("Kindle Previewer CLI", stem, flush=True)
    try:
        result = subprocess.run(cmd, text=True, timeout=180,
                                capture_output=True, check=False)
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(f"Timeout Amazon Kindle Previewer: {stem}") from exc
    (folder / "console.txt").write_text(
        result.stdout + "\nSTDERR:\n" + result.stderr, encoding="utf-8")
    if result.returncode:
        raise SystemExit(
            f"Kindle Previewer falhou {stem}: status {result.returncode}: "
            f"{result.stderr[:1200]}")
    generated = [item for item in folder.rglob("*")
                 if item.is_file() and item.suffix.lower() in (".kpf", ".mobi")]
    if not generated:
        raise SystemExit(
            f"Kindle Previewer não produziu KPF/MOBI para {stem}. "
            "Inspecione console.txt e compatibilidade da versão CLI.")
    print("PASS E-090 Kindle Previewer", stem, generated[0].name)
