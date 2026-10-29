#!/usr/bin/env bash
# Publish mythuso.co.za to 102.202.45.201 (Ngwempisi), where it runs as two containers behind the
# shared gateway. deploy/ngwempisi/README.md says why the box is shaped the way it is; this file is the
# order, and every step that could reach another site on the gateway is checked before and after.
#
#   ./deploy/ngwempisi/deploy.sh
#   CERT_DIR=migrated/mythuso.co.za ./deploy/ngwempisi/deploy.sh   # the certificate copied from liqzar
#
# What it adds on the box, and nothing else: /opt/mythuso (releases, the `current` symlink, the
# assistant bundle, the site file, the compose file, the ops scripts), /var/lib/mythuso-assistant (the
# assistant's state), /etc/mythuso/host.env, the health-check units, the two containers, and one file
# in the gateway, conf.d/mythuso.conf. It never edits another file in the gateway, never restarts or
# recreates the gateway, and reloads it only after `nginx -t` passes.
#
# The assistant is never started or restarted by this script except on the very first deploy, when
# the container does not exist yet. That is the same rule as deploy/deploy.sh: publishing a runtime does
# not change a running process, and a restart is a person's act (`docker restart mythuso-assistant`).
# shellcheck disable=SC2029
set -euo pipefail
cd "$(dirname "$0")/../.."

TARGET="${TARGET:-wtgbyasz@102.202.45.201}"
KEY="${KEY:-$HOME/.ssh/qwen-102-202-45-201}"
remote() { ssh -i "$KEY" -o BatchMode=yes "$TARGET" "$@"; }
RSYNC_SSH="ssh -i $KEY -o BatchMode=yes"

HOST=mythuso.co.za
ALIASES="www.mythuso.co.za"
BASE=/opt/mythuso
RELEASES=$BASE/releases
CURRENT=$BASE/current
ASSISTANT=$BASE/assistant
NGINX=$BASE/nginx
OPS=$BASE/ops
STATE=/var/lib/mythuso-assistant
ASSISTANT_UID=61791
GATEWAY=lima-gateway-1
GATEWAY_NET=lima_lima-net
GATEWAY_FILE=/etc/nginx/conf.d/mythuso.conf
# Which certificate the gateway presents. live/ is certbot's own, issued on this box once DNS points
# here; migrated/ is the copy brought from liqzar-server so the switch has no gap (README.md).
CERT_DIR="${CERT_DIR:-live/mythuso.co.za}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
IGNORE=deploy/.deployignore

# Every other site this gateway serves. Asked from here, over the public internet, before and after,
# and compared against what they answered before rather than against 200.
NEIGHBOURS=(mpumiworks.co.za work.g1.mythuso.co.za/health golima.co.za g1.mythuso.co.za ci.mpumiworks.co.za)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
statuses() {
  for d in "${NEIGHBOURS[@]}"; do
    printf '%s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$d" || echo 000)"
  done
}

printf '%s' "$CERT_DIR" | grep -qE '^(live|migrated)/[a-z0-9.-]+$' \
  || { echo "CERT_DIR must be live/<name> or migrated/<name>, not '$CERT_DIR'"; exit 1; }
[ -r "$IGNORE" ] || { echo "$IGNORE is missing — refusing to rsync without it"; exit 1; }

say "Baseline: the other sites on this gateway"
before=$(statuses)
echo "$before"

# The same build and the same refusals as liqzar-server's deploy, from the one place they are written.
say "Building and checking, through deploy/deploy.sh"
MYTHUSO_BUILD_ONLY=1 ./deploy/deploy.sh
assistant_bundle=apps/assistant-api/dist/server.mjs
[ -f "$assistant_bundle" ] || { echo "$assistant_bundle was not built — refusing"; exit 1; }

say "Checking $TARGET before touching it"
remote "docker inspect -f '{{.State.Running}}' $GATEWAY" | grep -qx true \
  || { echo "$GATEWAY is not running — refusing"; exit 1; }
remote "docker network inspect $GATEWAY_NET >/dev/null" \
  || { echo "network $GATEWAY_NET not found — refusing"; exit 1; }
# Two server blocks claiming one name pass `nginx -t` and nginx silently serves one of them. On this
# gateway the loser would be somebody else's site, or ours with somebody else's certificate.
for name in $HOST $ALIASES; do
  claims=$(remote "docker exec $GATEWAY grep -rlE 'server_name[^;]*[ ]${name//./\\.}[ ;]' /etc/nginx/conf.d/" | grep -vx "$GATEWAY_FILE" || true)
  [ -z "$claims" ] || { echo "$claims already claims $name in the gateway — stopping rather than guessing"; exit 1; }
done
remote "docker exec $GATEWAY test -s /etc/nginx/certs/$CERT_DIR/fullchain.pem -a -s /etc/nginx/certs/$CERT_DIR/privkey.pem" \
  || { echo "no certificate at certs/$CERT_DIR in the gateway — refusing (README.md, 'The certificate')"; exit 1; }

say "Publishing the release"
remote "sudo -n mkdir -p $RELEASES $ASSISTANT $NGINX $OPS /etc/mythuso /var/log/mythuso /var/lib/mythuso $STATE
  sudo -n chmod 755 $BASE $RELEASES
  sudo -n chown $ASSISTANT_UID:$ASSISTANT_UID $STATE && sudo -n chmod 700 $STATE"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE="$RELEASES/$STAMP"
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" --exclude-from="$IGNORE" apps/web/dist/ "$TARGET:$RELEASE/"
remote "sudo -n chown -R root:root $RELEASE
  sudo -n find $RELEASE -type d -exec chmod 755 {} +
  sudo -n find $RELEASE -type f -exec chmod 644 {} +"
previous=$(remote "readlink -f $CURRENT 2>/dev/null || true")
# One rename(2): either the old tree answers or the new one does (deploy/deploy.sh, "The publish is a swap").
remote "sudo -n ln -sfn $RELEASE $CURRENT.new && sudo -n mv -Tf $CURRENT.new $CURRENT"
echo "live release  $STAMP  (was ${previous:-none})"

say "Publishing the assistant runtime"
local_digest=$( { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } < "$assistant_bundle" | cut -d' ' -f1)
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" "$assistant_bundle" "$TARGET:$ASSISTANT/server.mjs.next"
remote_digest=$(remote "sudo -n sha256sum $ASSISTANT/server.mjs.next" | cut -d' ' -f1) || remote_digest=""
if [ "$local_digest" != "$remote_digest" ]; then
  remote "sudo -n rm -f $ASSISTANT/server.mjs.next"
  echo "!! the assistant runtime arrived altered (sha256 ${remote_digest:-none}, expected $local_digest) — nothing published"; exit 1
fi
previous_digest=$(remote "[ -f $ASSISTANT/server.mjs ] && sudo -n sha256sum $ASSISTANT/server.mjs || true" | cut -d' ' -f1)
# Copy, then rename over: the live path is never missing and never half-written (deploy/deploy.sh).
remote "set -e
  if [ -f $ASSISTANT/server.mjs ]; then sudo -n cp -p $ASSISTANT/server.mjs $ASSISTANT/server.mjs.prev; fi
  sudo -n chown root:root $ASSISTANT/server.mjs.next && sudo -n chmod 0644 $ASSISTANT/server.mjs.next
  sudo -n mv -f $ASSISTANT/server.mjs.next $ASSISTANT/server.mjs"
echo "assistant runtime  $ASSISTANT/server.mjs  sha256 ${local_digest:0:16}…"
if [ -n "$previous_digest" ] && [ "$previous_digest" != "$local_digest" ]; then
  echo "   the running assistant is BEHIND this bundle until a person runs: docker restart mythuso-assistant"
fi

say "Writing the site file from deploy/nginx/mythuso.conf"
# The liqzar file, changed only where a container behind a gateway differs. Each substitution must
# land exactly once: a pattern that silently matched nothing would ship liqzar's paths here.
site=$(mktemp)
python3 -I - "deploy/nginx/mythuso.conf" "$site" "$HOST $ALIASES" "$CURRENT" <<'PY'
import sys
src, out, names, root = sys.argv[1:5]
s = open(src).read()
subs = [
  ("server_name __HOST__;",
   "server_name " + names + ";\n\n"
   "    # Behind lima-gateway-1: the visitor's address arrives in X-Real-IP, trusted from the gateway's\n"
   "    # network only, so the /assistant/ rate limit counts people and not the gateway.\n"
   "    set_real_ip_from 172.18.0.0/16;\n"
   "    real_ip_header X-Real-IP;"),
  ("root /var/www/mythuso;", "root " + root + ";"),
  ("access_log /var/log/nginx/mythuso.access.log;", "access_log /dev/stdout;"),
  ("error_log  /var/log/nginx/mythuso.error.log;", "error_log  /dev/stderr;"),
  ("    listen [::]:80;\n", ""),
]
for old, new in subs:
    n = s.count(old)
    if n != 1:
        sys.exit("deploy/nginx/mythuso.conf: expected exactly one %r, found %d — refusing" % (old, n))
    s = s.replace(old, new)
open(out, "w").write(s)
PY
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" "$site" "$TARGET:$NGINX/site.conf.next"
rm -f "$site"
remote "sudo -n chmod 644 $NGINX/site.conf.next"

if remote "docker inspect mythuso-site >/dev/null 2>&1"; then
  # The container exists: put the file in place and reload, never recreate (compose.yaml says why).
  remote "set -e
    [ -f $NGINX/site.conf ] && sudo -n cp -p $NGINX/site.conf $NGINX/site.conf.prev || true
    sudo -n mv -f $NGINX/site.conf.next $NGINX/site.conf
    if docker exec mythuso-site nginx -t 2>&1; then docker exec mythuso-site nginx -s reload
    else
      echo '!! the site file failed nginx -t inside mythuso-site — putting the previous one back'
      [ -f $NGINX/site.conf.prev ] && sudo -n mv -f $NGINX/site.conf.prev $NGINX/site.conf
      exit 1
    fi"
else
  say "First deploy on this box: creating the two containers"
  rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" deploy/ngwempisi/compose.yaml "$TARGET:$BASE/compose.yaml"
  remote "set -e
    sudo -n mv -f $NGINX/site.conf.next $NGINX/site.conf
    docker compose -f $BASE/compose.yaml up -d
    sleep 3
    docker exec mythuso-site nginx -t"
fi

say "Installing the gateway file for $HOST"
gw=$(mktemp)
sed "s#__CERT_DIR__#$CERT_DIR#g" deploy/ngwempisi/gateway.conf > "$gw"
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" "$gw" "$TARGET:$BASE/gateway-mythuso.conf"
rm -f "$gw"
# mktemp makes the file 0600 and rsync keeps that, but `docker cp` reads it as the login user, not
# root: unreadable, it copies an empty file into the gateway (29 October 2026, first run).
remote "sudo -n chmod 644 $BASE/gateway-mythuso.conf && test -s $BASE/gateway-mythuso.conf"
# The previous copy is taken from inside the gateway, so a failed test puts back exactly what was there.
remote "set -e
  had=0
  if docker exec $GATEWAY test -f $GATEWAY_FILE; then docker cp $GATEWAY:$GATEWAY_FILE /tmp/mythuso-gateway.prev; had=1; fi
  docker cp $BASE/gateway-mythuso.conf $GATEWAY:$GATEWAY_FILE
  if docker exec $GATEWAY nginx -t 2>&1; then
    docker exec $GATEWAY nginx -s reload
  else
    echo '!! nginx -t failed in the gateway — putting it back as it was'
    if [ \$had = 1 ]; then docker cp /tmp/mythuso-gateway.prev $GATEWAY:$GATEWAY_FILE; else docker exec $GATEWAY rm -f $GATEWAY_FILE; fi
    docker exec $GATEWAY nginx -t && docker exec $GATEWAY nginx -s reload
    exit 1
  fi
  rm -f /tmp/mythuso-gateway.prev
  docker exec $GATEWAY nginx -T 2>/dev/null | grep -E '^# configuration file /etc/nginx/conf.d/' | head -3"

say "Installing the health check (not enabled here: README.md, 'After the switch')"
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" \
  deploy/ops/mythuso-healthcheck.sh deploy/ops/mythuso-alert.sh "$TARGET:$OPS/"
rsync -az -e "$RSYNC_SSH" --rsync-path="sudo -n rsync" \
  deploy/ops/mythuso-healthcheck.service deploy/ops/mythuso-healthcheck.timer deploy/ops/mythuso-alert@.service \
  "$TARGET:/etc/systemd/system/"
remote "set -e
  sudo -n chown root:root $OPS/*.sh && sudo -n chmod 755 $OPS/*.sh
  printf 'MYTHUSO_HOST=%s\nMYTHUSO_TLS=gateway\n' '$HOST' | sudo -n tee /etc/mythuso/host.env >/dev/null
  sudo -n systemctl daemon-reload"

say "Verifying through the gateway, by name, with the certificate checked"
# --resolve rather than a Host header, so the certificate must match the name: a check that skipped
# certificate errors would pass on the day TLS is wrong. Each entry must serve its own build.
verify_entry() { # <label> <path> <built html>
  local marker
  marker=$(grep -o 'assets/[A-Za-z0-9._-]*\.js' "apps/web/dist/$3" | head -1)
  [ -n "$marker" ] || { echo "$1: apps/web/dist/$3 references no entry chunk"; exit 1; }
  remote "body=\$(curl -sf --resolve '$HOST:443:127.0.0.1' https://$HOST$2) || { echo '!! $1: $2 did not answer'; exit 1; }
    case \"\$body\" in *$marker*) echo '$(printf '%-8s' "$1") 200  $3' ;; *) echo '!! $1: $2 did not serve $3'; exit 1 ;; esac"
}
verify_entry landing /        landing.html
verify_entry app     /app/    index.html
verify_entry status  /status/ status.html
verify_entry shop    /shop/   shop.html
remote "for p in /status /staff/ /admin/; do printf '%-8s %s\n' \$p \$(curl -s -o /dev/null -w '%{http_code}' --resolve '$HOST:443:127.0.0.1' https://$HOST\$p); done
  code=\$(curl -s -o /dev/null -w '%{http_code}' --resolve '$HOST:80:127.0.0.1' http://$HOST/)
  echo \"http     \$code (expected 301 to https)\"
  hsts=\$(curl -sI --resolve '$HOST:443:127.0.0.1' https://$HOST/ | grep -ci '^strict-transport-security')
  echo \"headers  strict-transport-security x\$hsts (expected 1)\""
remote "if docker inspect -f '{{.State.Running}}' mythuso-assistant 2>/dev/null | grep -qx true; then
    curl -s --max-time 15 --resolve '$HOST:443:127.0.0.1' https://$HOST/assistant/health; echo
  else echo 'assistant not running'; fi"

say "Re-checking the other sites on this gateway"
after=$(statuses)
echo "$after"
if [ "$before" != "$after" ]; then
  sleep 20
  after=$(statuses)
  if [ "$before" != "$after" ]; then
    echo "!! a neighbour changed. Before:"; echo "$before"; echo "After:"; echo "$after"
    echo "   Take ours out first: docker exec $GATEWAY rm -f $GATEWAY_FILE && docker exec $GATEWAY nginx -t && docker exec $GATEWAY nginx -s reload"
    exit 1
  fi
fi

# Keep enough to go back through; never the live one (deploy/deploy.sh, the prune).
remote "cd $RELEASES && live=\$(basename \$(readlink -f $CURRENT))
  for d in */; do d=\${d%/}; [ \"\$d\" = \"\$live\" ] && continue; echo \"\$d\"; done \
  | sort -r | tail -n +$KEEP_RELEASES | xargs -r sudo -n rm -rf"

echo
echo "Published $HOST to $TARGET behind $GATEWAY (certificate: $CERT_DIR). Other sites on the gateway unchanged."
