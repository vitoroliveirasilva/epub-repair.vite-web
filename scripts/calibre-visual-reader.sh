#!/usr/bin/env bash
set -euo pipefail

fixtures="${1:?diretório de EPUBs necessário}"
out="${2:?diretório de resultados necessário}"
mkdir -p "$out"
export QTWEBENGINE_DISABLE_SANDBOX=1
export QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu"
export QT_QUICK_BACKEND=software
export QT_X11_NO_MITSHM=1
export LIBGL_ALWAYS_SOFTWARE=1

# Um WM X11 fornece foco de teclado ao QtWebEngine (no Xvfb sem WM,
# xdotool key era enviado à root e a tela de boas-vindas não avançava).
openbox >"$out/openbox.log" 2>&1 &
wm_pid=$!
trap 'kill "$wm_pid" 2>/dev/null || true' EXIT
sleep 2

for mode in reflowable fixed-layout; do
  source="$fixtures/visual-$mode.epub"
  logfile="$out/visual-$mode.viewer.log"
  screenshot="$out/visual-$mode.png"
  test -s "$source"
  echo "Abrindo ebook-viewer real: $source"
  ebook-viewer --new-instance "$source" >"$logfile" 2>&1 &
  viewer_pid=$!
  sleep 8
  # Calibre 7 abre tela de boas-vindas "Press any key to continue".
  # Avançar para o capítulo antes de verificar os pixels da ilustração.
  echo "X11 active window: $(xdotool getactivewindow 2>&1 || true)" >>"$logfile"
  xdotool mousemove 240 180 click 1 || true
  focused="$(xdotool search --onlyvisible --pid "$viewer_pid" | tail -n 1 || true)"
  if [ -n "$focused" ]; then
    xdotool windowactivate --sync "$focused" || true
    xdotool key --window "$focused" Return || true
  fi
  xdotool key --clearmodifiers Return || true
  xdotool key --clearmodifiers Right || true
  sleep 8
  if ! kill -0 "$viewer_pid" 2>/dev/null; then
    echo "Falha ao iniciar o visualizador Calibre: $mode"
    cat "$logfile"
    exit 1
  fi
  import -window root "$screenshot"
  test -s "$screenshot"
  # Verificação do desenho real: a imagem SVG tem regiões sólidas de cor.
  # Não depende de OCR; os títulos e EPUBCheck são testados separadamente.
  /usr/bin/python3 - "$screenshot" "$mode" <<'PY'
import sys
from PIL import Image
path, mode = sys.argv[1:]
img = Image.open(path).convert("RGB")
target = (16, 180, 201) if mode == "reflowable" else (173, 57, 186)
pixels = sum(1 for r,g,b in img.getdata()
             if abs(r-target[0])<35
             and abs(g-target[1])<35
             and abs(b-target[2])<35)
if pixels < 2000:
    raise SystemExit(
        f"Calibre abriu mas não renderizou imagem/layout {mode}: "
        f"{pixels} pixels detectados")
print(f"PASS E-076 Calibre ebook-viewer {mode} screenshot: "
      f"{pixels} pixels da ilustração, {img.size}")
PY
  kill "$viewer_pid" 2>/dev/null || true
  wait "$viewer_pid" 2>/dev/null || true
done
