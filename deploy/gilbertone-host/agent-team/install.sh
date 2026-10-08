#!/usr/bin/env bash
# Puts the founder's four-agent team into the gilbertone container, beside the Qwen it runs on.
# Run on the GilbertOne host, from this folder, after bootstrap.sh:
#
#   sudo bash install.sh                 the team, with an empty work folder
#   sudo bash install.sh ~/mythuso       the team, with a copy of that folder to read
#
# The repository is public, so the server can fetch this folder and the code itself, with nothing
# copied from anyone's laptop:
#   curl -fsSL https://codeload.github.com/akhanyait/mythuso/tar.gz/refs/heads/<branch> | tar -xz
#
# It opens nothing: the team is a command you run inside the container, and it talks to Ollama over
# the container's own loopback. A copy of the code is given rather than a live checkout, so nothing
# the team does can change the founder's working tree, and drafts come back through the outbox.
set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo."
BOX=gilbertone
[ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ] || die "the ${BOX} container is not running; run bootstrap.sh first."
here="$(cd "$(dirname "$0")" && pwd)"
in_box() { incus exec "$BOX" -- "$@"; }

# gilbertone-qwen when bootstrap.sh has built it; otherwise the served Qwen, with the container's
# thread count sent on each call. Either way nothing about Ollama or its models is changed here.
SERVED="${SERVE_MODEL:-qwen3.6:35b-a3b-q4_K_M}"
tags="$(in_box curl -fsS http://127.0.0.1:11434/api/tags)"
if grep -q '"gilbertone-qwen' <<<"$tags"; then
  local_json='{"model":"gilbertone-qwen"}'
elif grep -q "\"${SERVED}\"" <<<"$tags"; then
  local_json="{\"model\":\"${SERVED}\",\"numThread\":$(in_box nproc),\"numCtx\":4096}"
  echo "gilbertone-qwen is not built here yet; the team will use ${SERVED} with $(in_box nproc) threads."
else
  die "neither gilbertone-qwen nor ${SERVED} is in the container's Ollama; run bootstrap.sh first."
fi

say "The team, at /srv/agent-team in the container"
in_box mkdir -p /srv/agent-team/work /srv/agent-team/outbox
for f in agents.mjs team.mjs roles.json README.md; do
  incus file push "$here/$f" "$BOX/srv/agent-team/$f"
done
printf '%s\n' "$local_json" | in_box sh -c 'cat > /srv/agent-team/local.json'

if [ -n "${1:-}" ]; then
  [ -d "$1" ] || die "$1 is not a folder."
  say "A copy of $1 as the team's work folder"
  # Without .git and node_modules: the team reads code, it does not need history or packages.
  tar -C "$1" --exclude=.git --exclude=node_modules -cf - . | in_box tar -C /srv/agent-team/work -xf -
fi

say "Checking Qwen answers"
in_box sh -c 'cd /srv/agent-team && node team.mjs check'

cat <<EOF

Ready. To use the team:
  sudo incus exec ${BOX} -- bash
  cd /srv/agent-team
  node team.mjs ask "your ask"
EOF
