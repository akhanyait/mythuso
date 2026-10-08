#!/usr/bin/env bash
# The founder's one line, from his Mac: builds GilbertOne for the box, copies this folder to the GilbertOne
# server and runs install.sh there. It changes nothing on liqzar-server or mythuso.co.za, and nothing on
# this Mac but two build files under dist/ (ignored by git).
#
# Run from a checkout of this branch, at the repository's root:
#   bash deploy/gilbertone-host/install-from-mac.sh
# GILBERTONE_SSH names the server (default: the Sive Host box as the founder logs in to it) and
# GILBERTONE_KEY the key (default ~/.ssh/gilbertone). sudo on the server asks for its password once.
set -euo pipefail
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

SSH_TARGET="${GILBERTONE_SSH:-dnkmstzd@102.202.44.202}"
KEY="${GILBERTONE_KEY:-$HOME/.ssh/gilbertone}"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run this from inside the mythuso checkout."
cd "$root"
host_dir=deploy/gilbertone-host
[ -f "$host_dir/install.sh" ] || die "$host_dir/install.sh is missing; check out the branch that carries it."
[ -f "$KEY" ] || die "no SSH key at $KEY (set GILBERTONE_KEY)."

echo "== Building GilbertOne for the box"
# Dependencies only when they are missing: this Mac has little disk, and the checkout that runs deploy.sh
# already carries them.
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund
npm run assistant-runtime
mkdir -p "$host_dir/dist"
cp apps/assistant-api/dist/server.mjs "$host_dir/dist/server.mjs"
# The knowledge ingestion script, bundled the same way, so the box needs Node and nothing else.
npx esbuild scripts/ingest-knowledge-embeddings.mjs --bundle --platform=node --format=esm --target=node22 \
  --outfile="$host_dir/dist/ingest.mjs" --log-level=warning

echo "== Copying to ${SSH_TARGET}"
remote_dir=gilbertone-host
ssh -i "$KEY" "$SSH_TARGET" "rm -rf ~/${remote_dir} && mkdir -p ~/${remote_dir}"
scp -i "$KEY" -r "$host_dir"/. "${SSH_TARGET}:${remote_dir}/"

echo "== Installing on the server (log: /root/gilbertone-install.log)"
ssh -t -i "$KEY" "$SSH_TARGET" "sudo bash ~/${remote_dir}/install.sh"
