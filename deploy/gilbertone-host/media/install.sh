#!/usr/bin/env bash
# Installs GilbertOne's media studio (drawings, pictures and short videos) inside the gilbertone
# container, behind the test chat's login at /media/. Asked for by the founder on 8 October 2026.
#
# Run on the GilbertOne host with sudo, from a copy of this repository's files (see README.md for the
# one tar-over-ssh line that copies only what it needs). It changes nothing outside the container
# except /etc/mythuso/gilbertone-media.txt, its own summary.
#
# What it refuses to do:
#   - run anywhere the gilbertone container is not already running with Ollama inside (bootstrap.sh
#     made both; this script does not make them);
#   - open a port. The service binds to the container's loopback and Caddy's existing site, behind
#     the existing login, is the only way in. If the test chat is closed, the studio is unreachable
#     too, which is the right default;
#   - keep a second large model in memory beside Qwen. The picture model is loaded only while a
#     picture is being made, after the service has asked Ollama to unload Qwen;
#   - accept a picture-model file that changed since the first install. The first download's SHA-256
#     is recorded; a later run that downloads different bytes under the same name stops.
#
# Options:
#   --no-pictures   install drawings and videos only (no image model, no 10 GB download, no build)
#   --remove        stop and remove the studio; keeps the picture model files unless --models is given
set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo."
BOX=gilbertone
[ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ] || die "the ${BOX} container is not running; run bootstrap.sh first."
in_box() { incus exec "$BOX" -- "$@"; }

APP=/srv/gilbertone-media/app
MODELS=/srv/gilbertone-media/models
BIN=/srv/gilbertone-media/bin
UNIT=/etc/systemd/system/gilbertone-media.service
SNIPPET=/etc/caddy/gilbertone.d/media.caddy
SUMMARY=/etc/mythuso/gilbertone-media.txt

PICTURES=on
REMOVE=no
REMOVE_MODELS=no
for arg in "$@"; do
  case "$arg" in
    --no-pictures) PICTURES=off ;;
    --remove) REMOVE=yes ;;
    --models) REMOVE_MODELS=yes ;;
    *) die "unknown option: $arg" ;;
  esac
done

if [ "$REMOVE" = yes ]; then
  say "Removing the media studio"
  in_box systemctl disable --now gilbertone-media 2>/dev/null || true
  in_box rm -f "$UNIT" "$SNIPPET"
  in_box systemctl daemon-reload
  in_box sh -c 'command -v caddy >/dev/null && systemctl is-active -q caddy && systemctl reload caddy' || true
  in_box rm -rf "$APP" "$BIN" /var/lib/gilbertone-media
  [ "$REMOVE_MODELS" = yes ] && in_box rm -rf "$MODELS"
  rm -f "$SUMMARY"
  echo "Removed. /media/ now answers with the chat's own page, not the studio."
  exit 0
fi

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
need=(
  deploy/gilbertone-host/media/src/server.ts
  deploy/gilbertone-host/media/src/contract.ts
  deploy/gilbertone-host/media/src/guard.ts
  deploy/gilbertone-host/media/src/jobs.ts
  deploy/gilbertone-host/media/src/make.ts
  deploy/gilbertone-host/media/src/ollama.ts
  deploy/gilbertone-host/media/src/svg.ts
  deploy/gilbertone-host/media/studio/index.html
  deploy/gilbertone-host/media/studio/studio.js
  packages/gilbertone/src/escalation.ts
  packages/gilbertone/src/phi.ts
  packages/catalog/gilbertone-media.json
)
for f in "${need[@]}"; do [ -f "$root/$f" ] || die "$f is missing from $root; copy the files README.md lists."; done

say "Checking the box"
in_box curl -fsS http://127.0.0.1:11434/api/version >/dev/null || die "Ollama is not answering inside the container."
node_version="$(in_box node --version 2>/dev/null || true)"
node_major="$(printf '%s' "$node_version" | sed -E 's/^v([0-9]+)\..*/\1/')"
node_minor="$(printf '%s' "$node_version" | sed -E 's/^v[0-9]+\.([0-9]+)\..*/\1/')"
# Node runs the TypeScript directly (type stripping), which arrived in 22.6.
{ [ "${node_major:-0}" -gt 22 ] || { [ "${node_major:-0}" -eq 22 ] && [ "${node_minor:-0}" -ge 6 ]; }; } \
  || die "Node ${node_version:-is missing} inside the container; the studio needs 22.6 or newer (bootstrap.sh installs 22)."

say "Tools inside the container: ffmpeg, librsvg, a font"
in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq ffmpeg librsvg2-bin fonts-dejavu-core curl ca-certificates >/dev/null

say "The service's files"
in_box id gilbertone-media >/dev/null 2>&1 || in_box useradd --system --no-create-home --shell /usr/sbin/nologin gilbertone-media
in_box rm -rf "$APP"
for f in "${need[@]}"; do
  in_box mkdir -p "$APP/$(dirname "$f")"
  incus file push --mode 0644 "$root/$f" "$BOX$APP/$f"
done
# The service's own files are ES modules; this says so without bringing the whole repository's
# package.json (and its workspaces) into the box.
in_box sh -c "printf '{\"type\":\"module\",\"private\":true}\n' > $APP/package.json"
in_box install -d -o gilbertone-media -g gilbertone-media -m 0700 /var/lib/gilbertone-media /var/lib/gilbertone-media/out

sd_bin=""
picture_seconds=""
if [ "$PICTURES" = on ]; then
  say "The picture model: stable-diffusion.cpp, built here"
  in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq build-essential cmake git >/dev/null
  free_gb="$(in_box df -BG --output=avail /srv | tail -1 | tr -dc 0-9)"
  [ "${free_gb:-0}" -ge 15 ] || die "only ${free_gb} GB free under /srv in the container; the picture model needs about 11. Re-run with --no-pictures, or free space."
  ref="${SDCPP_REF:-$(in_box curl -fsS https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)}"
  [ -n "$ref" ] || die "could not find stable-diffusion.cpp's latest release; set SDCPP_REF to a tag."
  in_box rm -rf /srv/gilbertone-media/src-sdcpp
  in_box git clone --quiet --depth 1 --recursive --branch "$ref" https://github.com/leejet/stable-diffusion.cpp /srv/gilbertone-media/src-sdcpp
  commit="$(in_box git -C /srv/gilbertone-media/src-sdcpp rev-parse HEAD)"
  in_box sh -c "cd /srv/gilbertone-media/src-sdcpp && cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=ON >/dev/null && cmake --build build -j\$(nproc) --config Release >/dev/null"
  built="$(in_box sh -c "find /srv/gilbertone-media/src-sdcpp/build -type f -perm -u+x \( -name sd -o -name sd-cli \) | head -1")"
  [ -n "$built" ] || die "stable-diffusion.cpp built, but no sd or sd-cli program came out of it."
  in_box install -D -m 0755 "$built" "$BIN/sd"
  sd_bin="$BIN/sd"

  say "The picture model's files (about 10 GB; FLUX.1 schnell, Apache-2.0)"
  in_box install -d -m 0755 "$MODELS"
  files="$(in_box node -e "const c=JSON.parse(require('fs').readFileSync('$APP/packages/catalog/gilbertone-media.json','utf8'));for(const f of c.models.find(m=>m.id==='flux1-schnell-q4').files)console.log(f.name+' '+f.url)")"
  while read -r name url; do
    [ -n "$name" ] || continue
    if in_box test -s "$MODELS/$name"; then echo "  have $name"; continue; fi
    echo "  fetching $name"
    in_box curl -fL --retry 3 -C - -o "$MODELS/$name.part" "$url" || die "could not download $name from $url"
    in_box mv "$MODELS/$name.part" "$MODELS/$name"
  done <<<"$files"
  # Trust on first use, then hold: the first install records what it fetched, and every later run
  # proves the files are still those bytes.
  if in_box test -s "$MODELS/SHA256SUMS"; then
    in_box sh -c "cd $MODELS && sha256sum --quiet -c SHA256SUMS" || die "a picture-model file no longer matches the SHA-256 recorded at first install. Nothing was switched on."
  else
    in_box sh -c "cd $MODELS && sha256sum *.gguf *.safetensors > SHA256SUMS"
  fi

  say "One small test picture, with Qwen asked to step out first"
  in_box curl -fsS http://127.0.0.1:11434/api/generate -d '{"model":"gilbertone-qwen","keep_alive":0}' >/dev/null || true
  sleep 5
  flags="$(in_box node -e "const c=JSON.parse(require('fs').readFileSync('$APP/packages/catalog/gilbertone-media.json','utf8'));console.log(c.models.find(m=>m.id==='flux1-schnell-q4').files.map(f=>f.flag+' $MODELS/'+f.name).join(' '))")"
  start=$(date +%s)
  if in_box sh -c "$sd_bin $flags -p 'a teal house with a lime door, flat illustration' --cfg-scale 1.0 --sampling-method euler --steps 4 -W 512 -H 512 -t \$(nproc) -o /tmp/gilbertone-media-test.png >/tmp/gilbertone-media-test.log 2>&1"; then
    picture_seconds=$(( $(date +%s) - start ))
    in_box rm -f /tmp/gilbertone-media-test.png
    echo "  a 512 × 512 picture took ${picture_seconds} s on this CPU"
  else
    echo "  the test picture failed; pictures stay off. Last lines:"
    in_box tail -5 /tmp/gilbertone-media-test.log || true
    sd_bin=""
  fi
fi

say "The service"
threads="$(in_box nproc)"
in_box sh -c "cat > $UNIT" <<EOF
[Unit]
Description=GilbertOne media studio (private preview)
After=network.target ollama.service

[Service]
User=gilbertone-media
Group=gilbertone-media
WorkingDirectory=$APP
Environment=MYTHUSO_GILBERTONE_MEDIA=private-preview
Environment=MEDIA_HOST=127.0.0.1
Environment=MEDIA_PORT=8792
Environment=MEDIA_OUT_DIR=/var/lib/gilbertone-media/out
Environment=MEDIA_MODELS_DIR=$MODELS
Environment=MEDIA_THREADS=$threads
Environment=MEDIA_SD_BIN=$sd_bin
Environment=MEDIA_PICTURES=$([ -n "$sd_bin" ] && echo on || echo off)
Environment=OLLAMA_URL=http://127.0.0.1:11434
Environment=MEDIA_QWEN_MODEL=gilbertone-qwen
ExecStart=/usr/bin/env node --experimental-strip-types --disable-warning=ExperimentalWarning $APP/deploy/gilbertone-host/media/src/server.ts
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/gilbertone-media
MemoryMax=16G

[Install]
WantedBy=multi-user.target
EOF
in_box systemctl daemon-reload
in_box systemctl enable --now gilbertone-media >/dev/null
in_box systemctl restart gilbertone-media
ok=""
for _ in $(seq 1 20); do
  if in_box curl -fsS http://127.0.0.1:8792/media/health >/dev/null 2>&1; then ok=yes; break; fi
  sleep 1
done
[ -n "$ok" ] || { in_box journalctl -u gilbertone-media -n 30 --no-pager || true; die "the studio did not start."; }

say "Behind the test chat's login, at /media/"
address=""
if in_box sh -c 'command -v caddy >/dev/null && test -f /etc/caddy/Caddyfile'; then
  in_box mkdir -p /etc/caddy/gilbertone.d
  in_box sh -c "cat > $SNIPPET" <<'EOF'
# GilbertOne media studio, written by deploy/gilbertone-host/media/install.sh. Inside the site block,
# so the site's basicauth covers it. The service strips /media itself.
redir /media /media/
handle /media/* {
	reverse_proxy 127.0.0.1:8792 {
		flush_interval -1
	}
}
EOF
  # The test chat's Caddyfile imports this folder from now on (open-test-chat.sh); one written by an
  # older copy of that script gets the line here, just above its catch-all.
  if ! in_box grep -q 'import /etc/caddy/gilbertone.d/\*.caddy' /etc/caddy/Caddyfile; then
    in_box sed -i '0,/^\thandle {$/s//\timport \/etc\/caddy\/gilbertone.d\/*.caddy\n&/' /etc/caddy/Caddyfile
  fi
  in_box caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  in_box systemctl reload caddy
  site="$(in_box sed -n 's/^\([^[:space:]#][^[:space:]]*\) {$/\1/p' /etc/caddy/Caddyfile | head -1)"
  address="https://${site}/media/"
  login_file=/root/gilbertone-test-chat-login.txt
  if [ -s "$login_file" ] && [ -n "$site" ]; then
    sleep 2
    health="$(curl -s -o /dev/null -w '%{http_code}' -u "gilbert:$(cat "$login_file")" "https://${site}/media/health" || true)"
    anon="$(curl -s -o /dev/null -w '%{http_code}' "https://${site}/media/health" || true)"
    probe="$(curl -s -o /dev/null -w '%{http_code}' -u "gilbert:$(cat "$login_file")" -H 'content-type: application/json' -d '{"kind":"drawing","words":"a sick note for work"}' "https://${site}/media/jobs" || true)"
    [ "$health" = 200 ] || die "${address} answered ${health} with the login; expected 200."
    [ "$anon" = 401 ] || die "${address} answered ${anon} without the login; expected 401."
    [ "$probe" = 422 ] || die "a forged-sick-note request answered ${probe}; expected the 422 refusal."
    echo "  with the login: 200 · without it: 401 · a sick-note request: refused (422)"
  fi
else
  echo "  The test chat is not open (no Caddy in the box), so the studio is installed but unreachable."
  echo "  It appears at /media/ the next time open-test-chat.sh runs."
fi

mkdir -p /etc/mythuso
{
  echo "GilbertOne media studio, installed $(date -u +%FT%TZ)"
  echo "contract: packages/catalog/gilbertone-media.json version $(in_box node -e "console.log(JSON.parse(require('fs').readFileSync('$APP/packages/catalog/gilbertone-media.json','utf8')).version)")"
  echo "address: ${address:-not reachable (test chat closed)}"
  echo "drawings and videos: on, using gilbertone-qwen"
  if [ -n "$sd_bin" ]; then
    echo "pictures: on, FLUX.1 schnell Q4 via stable-diffusion.cpp ${ref:-} (${commit:-}), ${picture_seconds}s for 512x512 in the install test"
  else
    echo "pictures: off"
  fi
} > "$SUMMARY"

say "Done"
cat "$SUMMARY"
