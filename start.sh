#!/usr/bin/env bash
# Startar OVK-protokollet lokalt i webbläsaren. Ingen serverlogik – bara statiska filer.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${OVK_PORT:-8777}"

# Om porten redan används, anta att appen körs och öppna bara webbläsaren.
if curl -s "http://localhost:${PORT}/index.html" >/dev/null 2>&1; then
  xdg-open "http://localhost:${PORT}/" >/dev/null 2>&1 || true
  exit 0
fi

cd "$DIR"
( python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/ovk-webb.log 2>&1 & ) 
sleep 0.6
xdg-open "http://localhost:${PORT}/" >/dev/null 2>&1 || true
echo "OVK-protokollet körs på http://localhost:${PORT}/  (stäng med: pkill -f 'http.server ${PORT}')"
