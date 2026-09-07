#!/usr/bin/env bash
# Publish the MyThuso landing page and app preview to a server.
#
# Adds only: /var/www/mythuso, one nginx site file, /opt/mythuso/ops (the scheduled jobs), and
# (optionally) the identity service under /opt/mythuso. It never edits another site's
# configuration, and it refuses to reload nginx unless `nginx -t` passes first.
#
# That box is shared. agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and
# skillsonwheels.co.za are all served from it, and none of them are ours to break. So this records
# what each of them answers before it touches anything and asks them again at the end: a deploy that
# breaks a neighbour should be caught by the deploy, not by that neighbour's owner.
#
#   ./deploy/deploy.sh                       # defaults to the host and target below
#   HOST=mythuso.example.com ./deploy/deploy.sh
# Every ssh command below deliberately expands $HOST, $ROOT and $OPS on this side: the server has no
# idea what host we are publishing, and that is the point of passing it. shellcheck's note about it
# is correct and not a finding here.
# shellcheck disable=SC2029
set -euo pipefail

TARGET="${TARGET:-liqzar-server}"
HOST="${HOST:-mythuso.liqzar.co.za}"
ROOT=/var/www/mythuso
OPS=/opt/mythuso/ops
IGNORE="$(dirname "$0")/.deployignore"

# The list is BidZA's, which is the other project on this box and keeps it current, plus BidZA's own
# host. Taken from BidFlow/App/scripts/deploy.sh and BidFlow/App/ops/nginx/bidza.conf rather than
# from memory: a co-tenant left off this list is a co-tenant nothing is watching.
OTHERS=(liqzar.co.za artisanza.co.za skillsonwheels.co.za agcafrica.com bidza.co.za)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Asked from here rather than from the server, because this is the path a person actually takes —
# DNS, the public internet, TLS, and Cloudflare in front of bidza.co.za. Checking from the box would
# skip most of what can break. Both the baseline and the re-check run from the same place, so a
# problem with this machine's own network shows up in both and produces no false alarm.
statuses() {
  for d in "${OTHERS[@]}"; do
    printf '%s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$d" || echo 000)"
  done
}

for d in "${OTHERS[@]}"; do
  if [ "$HOST" = "$d" ]; then
    echo "HOST is $HOST, which is one of the co-tenant sites. Refusing."; exit 1
  fi
done
[ -r "$IGNORE" ] || { echo "deploy/.deployignore is missing — refusing to rsync without it"; exit 1; }

say "Baseline: the sites on this box that must not change"
before=$(statuses)
echo "$before"
# A neighbour that was already down stays already down, and this script must not claim to have
# broken it. The comparison at the end is against this baseline, never against 200 — but say so, so
# nobody reads a clean finish as "all five sites are healthy".
if echo "$before" | grep -qv ' 200$'; then
  echo "(one of these is not 200 already — the check at the end compares against this, not against 200)"
fi

say "Building the site"
npm run build --silent

# ── Nothing shaped like a credential, and nothing from Documentation/ ───────────────────────────
#
# Only apps/web/dist is published, and .deployignore is passed to every rsync below — but the ignore
# file only helps with files it can name. This looks at what is actually about to be sent. The
# proposal in Documentation/ is confidential and no publication is authorised; an env file in a
# build output is how BidZA once baked a localhost URL into a production bundle.
say "Checking the build output carries nothing it should not"
if found=$(find apps/web/dist \
     \( -name '.env*' -o -name '*.env' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' \
        -o -name 'id_rsa*' -o -name '*.db' -o -iname '*proposal*' -o -iname '*funding*' \) -print -quit) \
   && [ -n "$found" ]; then
  echo "the build output contains $found — refusing to publish it"; exit 1
fi
if grep -rslI -e 'MYTHUSO_AUTH_PEPPER' -e 'MYTHUSO_ENCRYPTION_KEY' -e 'BEGIN .*PRIVATE KEY' apps/web/dist 2>/dev/null | head -1 | grep -q .; then
  echo "the build output mentions a secret by name — refusing to publish it"; exit 1
fi

say "Checking $TARGET before touching it"
ssh "$TARGET" "test -d /etc/nginx/sites-enabled && command -v nginx >/dev/null" \
  || { echo "nginx not found on $TARGET"; exit 1; }
# A site file for this host that we did not write is a collision, not a redeploy.
ssh "$TARGET" "! grep -rlF ' $HOST;' /etc/nginx/sites-enabled/ 2>/dev/null | grep -qv mythuso.conf" \
  || { echo "another nginx site already claims $HOST — stopping rather than guessing"; exit 1; }

say "Publishing to $ROOT"
# The directories the scheduled jobs are confined to. They are made here rather than by the scripts
# themselves because ProtectSystem=strict makes /var read-only inside those units — a script that
# tried to create its own destination would fail in a way that reads as a permissions bug.
# /var/lib/mythuso is handed to the service user when there is one; before then it is only the
# health check's state directory.
ssh "$TARGET" "mkdir -p $ROOT $OPS /etc/mythuso /var/log/mythuso /var/lib/mythuso /var/backups/mythuso
  chmod 700 /var/backups/mythuso
  id -u mythuso >/dev/null 2>&1 && chown mythuso:mythuso /var/lib/mythuso || true"
rsync -az --delete --exclude-from="$IGNORE" apps/web/dist/ "$TARGET:$ROOT/"
ssh "$TARGET" "find $ROOT -type d -exec chmod 755 {} + && find $ROOT -type f -exec chmod 644 {} +"

# ── The scheduled jobs, on every deploy ────────────────────────────────────────────────────────
#
# BidZA's timers run scripts that live outside the directory its deploy syncs, and they quietly
# drifted from the repository: a change to the backup's ledger was committed, and the file on the
# box was the older one without it. Nobody noticed, because a script that is not running the code
# you think it is looks exactly like one that is.
#
# So ops/ is installed every time, unit files included, and the repository is the truth about what
# the scheduled jobs do. Installing a unit does not start it — the timers still have to be enabled
# by hand, once, as deploy/README.md sets out — but it does mean an enabled timer is running what is
# committed. The scripts are parsed on the server before any unit that calls them is installed.
say "Installing the scheduled jobs to $OPS"
rsync -az --delete --exclude-from="$IGNORE" deploy/ops/ "$TARGET:$OPS/"
ssh "$TARGET" "set -e
  chmod 0755 $OPS/*.sh && chown root:root $OPS/*.sh
  for f in $OPS/*.sh; do bash -n \"\$f\" || { echo \"\$f does not parse — no units installed\"; exit 1; }; done
  before=\$(md5sum /etc/systemd/system/mythuso-api.service 2>/dev/null | cut -d' ' -f1 || true)
  install -o root -g root -m 0644 $OPS/*.service $OPS/*.timer /etc/systemd/system/
  systemctl daemon-reload
  after=\$(md5sum /etc/systemd/system/mythuso-api.service | cut -d' ' -f1)
  # daemon-reload makes systemd read the new unit; it does not apply it to a process already
  # running under the old one. Saying so is the difference between a hardening change that landed
  # and one that everybody believes landed.
  if [ -n \"\$before\" ] && [ \"\$before\" != \"\$after\" ] && systemctl is-active --quiet mythuso-api; then
    echo '!! mythuso-api.service changed and the service is running — systemctl restart mythuso-api to apply it'
  fi"

# The health check has to know which host to ask about, and a host that has moved must not leave it
# watching the old name and reporting green. Written by the deploy, every time, for that reason.
# The alert address is not written here: /etc/mythuso/ops.env is hand-managed, because a deploy that
# overwrote MYTHUSO_ALERT_TO would silence every alert and look successful doing it.
ssh "$TARGET" "printf 'MYTHUSO_HOST=%s\n' '$HOST' > /etc/mythuso/host.env && chmod 0644 /etc/mythuso/host.env"

say "Installing the nginx site for $HOST"
sed "s/__HOST__/$HOST/g" deploy/nginx/mythuso.conf \
  | ssh "$TARGET" "cat > /etc/nginx/sites-available/mythuso.conf && ln -sfn /etc/nginx/sites-available/mythuso.conf /etc/nginx/sites-enabled/mythuso.conf"

say "Testing the whole nginx configuration"
ssh "$TARGET" "nginx -t" || { echo "nginx config test failed — nothing reloaded"; exit 1; }

say "Reloading nginx (graceful; existing sites keep serving)"
ssh "$TARGET" "systemctl reload nginx"

say "Verifying by Host header, so this works before DNS does"
ssh "$TARGET" "curl -sf -H 'Host: $HOST' http://127.0.0.1/ -o /dev/null -w 'landing  %{http_code}\n'"
ssh "$TARGET" "curl -sf -H 'Host: $HOST' http://127.0.0.1/app/ -o /dev/null -w 'app      %{http_code}\n'"

# Only when it has been turned on. Until step four of deploy/README.md the correct state of the
# identity service is "not running", and a deploy that reported that as a failure would teach
# everybody to ignore the last line of its own output.
ssh "$TARGET" "if systemctl is-enabled --quiet mythuso-api.service 2>/dev/null; then
    curl -sf --max-time 15 http://127.0.0.1:8787/health && echo
  else echo 'identity  not enabled (see deploy/README.md)'; fi"

say "Re-checking the sites that must not change"
after=$(statuses)
echo "$after"
if [ "$before" != "$after" ]; then
  # One retry, of the whole list, after a pause. A site behind Cloudflare can return a single 5xx
  # for reasons that have nothing to do with us, and a deploy that cries wolf is a deploy somebody
  # starts finishing by hand. Anything we actually broke is still broken twenty seconds later.
  echo "a difference — looking again in 20 seconds before calling it"
  sleep 20
  after=$(statuses)
  echo "$after"
fi
if [ "$before" != "$after" ]; then
  echo; echo "!! A co-hosted site changed status. Investigate before walking away." >&2
  diff <(echo "$before") <(echo "$after") >&2 || true
  exit 1
fi

cat <<NOTE

Published to $HOST on $TARGET. Co-hosted sites unchanged.

Still yours to do:
  1. DNS: point $HOST at this server's address (an A record).
  2. TLS: ssh $TARGET "certbot --nginx -d $HOST"
  3. The timers, once: ssh $TARGET "systemctl enable --now mythuso-healthcheck.timer"
     (the backup timer waits for the identity service — it has nothing to back up before then)
  4. Only then the identity service — see deploy/README.md. It must not be reachable over http.
NOTE
