#!/usr/bin/env bash
# Installs GilbertOne itself in the gilbertone container, beside the Qwen bootstrap.sh put there, so the
# test chat is answered by the service and not by the model alone. Asked for by the founder on 8 October
# 2026: "start wiring gilbertone to qwen and all the modules and knowledge bases be attached to him".
#
# WHAT IT PUTS IN THE BOX, all on the container's own loopback, nothing on the host:
#   - the assistant service (the one-file bundle `npm run assistant-runtime` builds) on 127.0.0.1:8791,
#     pointed at gilbertone-qwen through Ollama, with a 60-second budget for a CPU-only Qwen;
#   - Qdrant on 127.0.0.1:6333, filled with the 261 entries of packages/catalog/knowledge, so the
#     knowledge search finds an entry by meaning as well as by shared words;
#   - bge-m3 in Ollama, the embedder for that search, and llama-guard3:1b, the second reader of every
#     answer Qwen writes. Both are named in the service's environment, which is what switches them on.
#
# WHAT IT LEAVES OFF, on purpose:
#   - Production mode. NODE_ENV is not set, so this is the service in test mode: the production
#     acknowledgement is not needed and is not written, and nothing here makes the box a second live
#     GilbertOne. Moving mythuso.co.za's /assistant/ here waits for the residency decision, the host
#     agreement, off-box backups and the DPIA (README.md, "What has to be true before the assistant
#     moves here").
#   - Azure. No key is written: the box answers from Qwen or from the classifier, and spends nothing.
#   - The outside knowledge sources. packages/catalog/knowledge/federation.json keeps all 14 dark, and
#     this script does not touch it.
#   - Founder access. No founder.env is written, so every founder route answers that it is switched off;
#     Caddy does not route to them either.
#
# Run as root on the server, after bootstrap.sh, with the two built files beside this script in dist/:
#   sudo bash open-gilbertone.sh
# install-from-mac.sh builds them and runs this through install.sh. Running it again is safe: it replaces
# the service's code, keeps the models and the index, and re-fills the index from the catalogue.
set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo."
BOX=gilbertone
[ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ] || die "the ${BOX} container is not running; run bootstrap.sh first."
in_box() { incus exec "$BOX" -- "$@"; }
here="$(cd "$(dirname "$0")" && pwd)"
for f in server.mjs ingest.mjs; do
  [ -s "$here/dist/$f" ] || die "dist/$f is missing beside this script. Build it with install-from-mac.sh (npm run assistant-runtime)."
done
in_box curl -fsS http://127.0.0.1:11434/api/version >/dev/null || die "Ollama is not answering inside the container; run bootstrap.sh first."
in_box ollama show gilbertone-qwen >/dev/null 2>&1 || die "gilbertone-qwen is missing; bootstrap.sh builds it."

# Pinned tags, never "latest", for the reason bootstrap.sh gives: every answer must be traceable to the
# model that wrote or checked it.
EMBED_MODEL="bge-m3:567m"
GUARD_MODEL="llama-guard3:1b"
# Qdrant's own static Linux build, pinned by version and by the checksum read off this release on
# 8 October 2026. A download that does not match is refused rather than run.
QDRANT_VERSION="v1.15.5"
QDRANT_SHA256="a6d36c60efda2872494f44b727796c811c3e9f307a2dd9c0054ee43d995d14ad"
# The addresses the browser may call from. The test chat's own name, and the one chosen for it on
# 8 October 2026 so the switch to it needs no change here.
public_ip="$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<NF;i++) if ($i=="src") print $(i+1)}')"
HOSTNAME_WEB="${GILBERTONE_HOSTNAME:-${public_ip//./-}.sslip.io}"
ORIGINS="https://${HOSTNAME_WEB},https://${public_ip//./-}.sslip.io,https://gilbertone.mythuso.co.za"

say "The embedder and the safety checker in Ollama"
in_box ollama pull "$EMBED_MODEL"
in_box ollama pull "$GUARD_MODEL"

say "Qdrant ${QDRANT_VERSION} on the container's loopback"
if [ "$(in_box sh -c '/usr/local/bin/qdrant --version 2>/dev/null' || true)" != "qdrant ${QDRANT_VERSION#v}" ]; then
  in_box curl -fsSL -o /root/qdrant.tgz \
    "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-musl.tar.gz"
  echo "${QDRANT_SHA256}  /root/qdrant.tgz" | in_box sha256sum -c - || die "the Qdrant download does not match its pinned checksum."
  in_box tar -xzf /root/qdrant.tgz -C /usr/local/bin qdrant
  in_box rm -f /root/qdrant.tgz
fi
in_box sh -c 'cat > /etc/systemd/system/qdrant.service' <<'EOF'
[Unit]
Description=Qdrant, GilbertOne's knowledge index (container loopback only)
After=network.target

[Service]
DynamicUser=yes
StateDirectory=qdrant
WorkingDirectory=/var/lib/qdrant
ExecStart=/usr/local/bin/qdrant
Environment=QDRANT__SERVICE__HOST=127.0.0.1
Environment=QDRANT__STORAGE__STORAGE_PATH=/var/lib/qdrant/storage
Environment=QDRANT__STORAGE__SNAPSHOTS_PATH=/var/lib/qdrant/snapshots
Environment=QDRANT__TELEMETRY_DISABLED=true
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
in_box systemctl daemon-reload
in_box systemctl enable qdrant
in_box systemctl restart qdrant
for _ in $(seq 1 30); do in_box curl -fsS http://127.0.0.1:6333/readyz >/dev/null 2>&1 && break; sleep 1; done
in_box curl -fsS http://127.0.0.1:6333/readyz >/dev/null || die "Qdrant did not come up. Check: sudo incus exec ${BOX} -- journalctl -u qdrant -n 50"

say "The assistant service"
in_box mkdir -p /opt/mythuso/assistant /etc/mythuso
incus file push --mode 0644 "$here/dist/server.mjs" "$BOX/opt/mythuso/assistant/server.mjs"
incus file push --mode 0644 "$here/dist/ingest.mjs" "$BOX/opt/mythuso/assistant/ingest.mjs"
# The service's whole configuration, in the box only and root-only. No key: nothing here is a secret,
# and the file is kept 0600 anyway because a later key would land in it.
in_box sh -c 'umask 077; cat > /etc/mythuso/assistant.env' <<EOF
# Written by deploy/gilbertone-host/open-gilbertone.sh. Test mode: NODE_ENV is deliberately unset.
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gilbertone-qwen
OLLAMA_EMBEDDING_MODEL=${EMBED_MODEL}
LLAMA_GUARD_MODEL=${GUARD_MODEL}
QDRANT_URL=http://127.0.0.1:6333
GILBERTONE_ORCHESTRATOR_TIMEOUT_MS=60000
MYTHUSO_ASSISTANT_DEV_ORIGINS=${ORIGINS}
EOF
in_box sh -c 'cat > /etc/systemd/system/gilbertone-assistant.service' <<'EOF'
# The assistant service in test mode, on the container's loopback. deploy/ops/assistant-api.service is
# its production twin on liqzar-server; this one differs in exactly one line: it does not set
# NODE_ENV=production, because this box is not a live service.
[Unit]
Description=GilbertOne assistant service (test mode, synthetic data only)
After=network.target ollama.service qdrant.service
Wants=ollama.service qdrant.service

[Service]
Type=simple
DynamicUser=yes
WorkingDirectory=/opt/mythuso/assistant
ExecStart=/usr/bin/node server.mjs
EnvironmentFile=/etc/mythuso/assistant.env
StateDirectory=mythuso-assistant
StateDirectoryMode=0700
Environment=MYTHUSO_ASSISTANT_STATE_DIR=%S/mythuso-assistant
UMask=0077
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
in_box systemctl daemon-reload
in_box systemctl enable gilbertone-assistant
in_box systemctl restart gilbertone-assistant
for _ in $(seq 1 30); do in_box curl -fsS http://127.0.0.1:8791/assistant/health >/dev/null 2>&1 && break; sleep 1; done
in_box curl -fsS http://127.0.0.1:8791/assistant/health >/dev/null \
  || die "the assistant service did not answer. Check: sudo incus exec ${BOX} -- journalctl -u gilbertone-assistant -n 50"

say "Filling the knowledge index from the catalogue"
# The same script the service's code ships with, bundled, reading the same environment, so the index is
# embedded by the model that will embed every question asked of it.
in_box sh -c 'set -a; . /etc/mythuso/assistant.env; set +a; cd /opt/mythuso/assistant && node ingest.mjs'

say "Warming Qwen, the embedder and the checker"
# One harmless question through the whole chain, so the founder's first message does not pay for loading
# three models. An emergency word would never reach Qwen, so this one is deliberately ordinary.
warm="$(in_box curl -sS -m 180 -X POST http://127.0.0.1:8791/assistant/v1/turn \
  -H 'content-type: application/json' \
  -d '{"text":"What does a MyThuso nurse bring to a home visit?","audience":"patient","userConsent":true}' || true)"
printf '%s\n' "$warm" | jq -r '"source: \(.source // "none") · route: \(.route // "none")"' 2>/dev/null || echo "warm-up answered: ${warm:0:200}"

cat >> /etc/mythuso/gilbertone-host.txt <<EOF

GilbertOne installed by open-gilbertone.sh on $(date -u +%Y-%m-%dT%H:%MZ): test mode, synthetic data only.
  service: gilbertone-assistant on the container's 127.0.0.1:8791, OLLAMA_MODEL=gilbertone-qwen
  knowledge: Qdrant ${QDRANT_VERSION} on 127.0.0.1:6333, embedder ${EMBED_MODEL}
  second safety check: ${GUARD_MODEL}
  browser origins: ${ORIGINS}
EOF
say "GilbertOne is installed in the box"
echo "Run open-test-chat.sh next (install.sh does) so the test chat talks to it."
