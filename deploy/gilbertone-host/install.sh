#!/usr/bin/env bash
# Everything the GilbertOne host needs, in the order it needs it, as one command run on the server:
#   1. bootstrap.sh       — the box, Ollama and gilbertone-qwen, with the speed fix (two slots, cached
#                           instructions) and room for three loaded models;
#   2. open-gilbertone.sh — GilbertOne itself in the box: the service, the knowledge index, the embedder
#                           and the second safety check, in test mode;
#   3. open-test-chat.sh  — the test chat, now pointed at GilbertOne, with plain Qwen closed.
# Each step stops the run if it fails, and says why. Written so the founder's morning go of 9 October
# 2026 is one line, not three, and so the order cannot be got wrong: the test chat routes to GilbertOne
# only when it finds GilbertOne installed. Run by install-from-mac.sh, or by hand as root:
#   sudo bash install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "REFUSED: run with sudo." >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
log=/root/gilbertone-install.log
exec > >(tee -a "$log") 2>&1
echo "== install.sh started $(date -u +%Y-%m-%dT%H:%MZ); log: $log"
bash "$here/bootstrap.sh"
bash "$here/open-gilbertone.sh"
bash "$here/open-test-chat.sh"
echo "== install.sh finished $(date -u +%Y-%m-%dT%H:%MZ)"
