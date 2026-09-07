#!/usr/bin/env bash
#
# Is MyThuso actually answering?
#
# systemd's Restart= covers a process that dies. It does not cover the cases that take a site down
# quietly: a process alive but wedged, a database refusing connections, nginx serving a stale
# upstream, or TLS about to expire. Those all leave every unit "active" while the person trying to
# book a nurse sees nothing.
#
# So this asks the same question a patient's browser asks, from the box, and alerts when the answer
# is wrong. It deliberately does not alert on the first failure — a single timed-out curl at 3am is
# a blip, and an alert that cries wolf is one nobody reads.
#
# It only asks about what is actually turned on. MyThuso is deployed in stages on purpose — the
# landing page first, TLS after DNS, the identity service last and only once there is an SMS
# provider — and a health check that complained every five minutes about a service nobody has
# enabled yet would be switched off within a day, taking the checks that matter with it.
#
# Runs as root from a systemd timer. It reads; it changes nothing outside /var/lib/mythuso/health.
set -uo pipefail

STATE=/var/lib/mythuso/health
FAILS_BEFORE_ALERT=2
CERT_WARN_DAYS=14
DISK_WARN_PERCENT=90

# The host the deploy last published to. Written by deploy.sh on every deploy, because a host that
# has moved must not leave this watching the old name and reporting green.
# shellcheck source=/dev/null
[ -r /etc/mythuso/host.env ] && . /etc/mythuso/host.env
HOST="${MYTHUSO_HOST:-mythuso.liqzar.co.za}"

mkdir -p "$STATE"
problems=()
notes=()

# ── The public page, as a person outside actually reaches it ────────────────
#
# Over https when there is a certificate, and over the loopback with a Host: header when there is
# not — the same trick the deploy uses to verify itself before DNS points anywhere. Checking https
# on a host that has never had certbot run against it would report a failure that is simply the
# next step on the list.
if [ -d "/etc/letsencrypt/live/$HOST" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://$HOST/" 2>/dev/null || echo 000)
  if [ "$code" != "200" ]; then problems+=("https://$HOST/ returned $code"); fi
  app=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://$HOST/app/" 2>/dev/null || echo 000)
  if [ "$app" != "200" ]; then problems+=("https://$HOST/app/ returned $app"); fi

  # Certificate expiry, read off the wire rather than off the disk — what certbot renewed and what
  # nginx is actually presenting are two different facts, and it is the second one a browser sees.
  # Certbot renews on a timer; this notices when it has not.
  #
  # Each step is checked separately because the arithmetic will otherwise invent an answer: an
  # unparseable date makes `date -d` produce nothing, and nothing in $(( )) is zero, which reads as
  # a certificate that expired fifty-six years ago. An alert like that is how a check gets ignored.
  expires_on=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$expires_on" ]; then
    problems+=("could not read the TLS certificate $HOST is serving")
  else
    expires_at=$(date -d "$expires_on" +%s 2>/dev/null || true)
    if ! printf '%s' "$expires_at" | grep -qE '^[0-9]+$'; then
      problems+=("the TLS certificate for $HOST has an expiry this cannot read: $expires_on")
    else
      days=$(( (expires_at - $(date +%s)) / 86400 ))
      if [ "$days" -lt "$CERT_WARN_DAYS" ]; then
        problems+=("TLS certificate for $HOST expires in $days days ($expires_on)")
      fi
    fi
  fi
else
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Host: $HOST" http://127.0.0.1/ 2>/dev/null || echo 000)
  if [ "$code" != "200" ]; then problems+=("http://127.0.0.1/ with Host: $HOST returned $code"); fi
  notes+=("no certificate for $HOST yet — checked over the loopback, and TLS expiry is not checked")
fi

# ── The identity service, if it has been turned on ──────────────────────────
#
# /health is the service's own endpoint and it answers only once the store has opened, so this is
# also the check that the SQLite database is readable. Asked only when the unit is enabled: until
# the fourth step of deploy/README.md the correct state of this service is "not running".
if systemctl is-enabled --quiet mythuso-api.service 2>/dev/null; then
  port=8787
  # shellcheck source=/dev/null
  [ -r /etc/mythuso/api.env ] && port=$(grep -E '^MYTHUSO_PORT=' /etc/mythuso/api.env | tail -1 | cut -d= -f2 | tr -dc '0-9')
  [ -n "$port" ] || port=8787
  api=$(curl -s --max-time 20 "http://127.0.0.1:$port/health" 2>/dev/null || true)
  if ! printf '%s' "$api" | grep -q '"ok":true'; then
    problems+=("identity service health: ${api:-no response on 127.0.0.1:$port}")
  fi
  # The service refuses to start in production without an SMS provider, so a service reporting
  # development on a public host is a misconfiguration that hands out one-time codes in responses.
  if printf '%s' "$api" | grep -q '"environment":"development"'; then
    problems+=("identity service is running in development mode — it returns one-time codes in responses")
  fi

  # ── The audit chain ─────────────────────────────────────────────────────────
  #
  # The access log is append-only by grant, which means a person with database access can rewrite
  # it. What makes that discoverable is the hash chain: every entry carries the hash of the one
  # before it, so an edited or deleted row breaks the chain from that point and verify() names the
  # first entry that no longer follows. A broken chain is precisely the thing somebody needs to be
  # woken for — it is either corruption or somebody editing the record of who read what — and it
  # will never be noticed by a person reading rows.
  #
  # Asked over the loopback of the service's own endpoint rather than run as a CLI against the
  # database, deliberately: root opening a WAL database creates root-owned sidecar files that the
  # unprivileged service then cannot write, which is how a health check causes the outage it was
  # installed to catch. The backup script learned that one and hands the files back; this one simply
  # never opens the database.
  #
  # A 404 is "not built yet", not a failure. The gate is being written and this must be safe to
  # install before the endpoint exists — a check that alerted every five minutes about a module
  # nobody has merged would be switched off, taking the rest of this file with it.
  audit=$(curl -s --max-time 20 -w '\n%{http_code}' "http://127.0.0.1:$port/health/audit" 2>/dev/null || printf '\n000')
  audit_code=$(printf '%s' "$audit" | tail -1)
  audit_body=$(printf '%s' "$audit" | sed '$d')
  case "$audit_code" in
    404)
      notes+=("the identity service has no /health/audit yet — audit chain integrity is not being checked") ;;
    200)
      if printf '%s' "$audit_body" | grep -q '"intact":true'; then
        length=$(printf '%s' "$audit_body" | sed -n 's/.*"length":\([0-9]*\).*/\1/p')
        head_hash=$(printf '%s' "$audit_body" | sed -n 's/.*"head":"\([^"]*\)".*/\1/p')
        # A chain can verify perfectly and still have been tampered with: somebody with the key and
        # write access can delete entries and recompute every hash forward from there. What that
        # cannot do is make the log longer again. So the length is ratcheted — remembered between
        # runs, and never allowed to go down. It catches the operator who did not think of it, and
        # not the one who edits this file too; that limit is written up in docs/DATA-PROTECTION.md
        # rather than papered over. A deliberate archive of old entries needs this file removed by
        # hand: rm /var/lib/mythuso/health/audit-length
        seen=$(cat "$STATE/audit-length" 2>/dev/null || echo 0)
        if printf '%s' "$length" | grep -qE '^[0-9]+$'; then
          if [ "$length" -lt "${seen:-0}" ]; then
            problems+=("the audit chain verifies but has SHRUNK from $seen entries to $length — entries were removed and the chain recomputed")
          else
            echo "$length" > "$STATE/audit-length"
            echo "audit chain intact: $length entries, head ${head_hash:0:16}"
          fi
        else
          problems+=("the audit chain reports intact but no entry count this can read: $audit_body")
        fi
      else
        broken=$(printf '%s' "$audit_body" | sed -n 's/.*"brokenAt":"\([^"]*\)".*/\1/p')
        problems+=("THE AUDIT CHAIN DOES NOT VERIFY — the first entry that does not follow is ${broken:-not named}. Do not clear it: preserve the database and read docs/DATA-PROTECTION.md")
      fi ;;
    000)
      problems+=("the audit chain could not be checked — no response from /health/audit on 127.0.0.1:$port") ;;
    *)
      problems+=("the audit chain could not be checked — /health/audit returned $audit_code") ;;
  esac
else
  notes+=("identity service not enabled — not checked (see deploy/README.md for the order)")
fi

# ── Disk ────────────────────────────────────────────────────────────────────
#
# This box also serves agcafrica, artisanza, bidza, liqzar and skillsonwheels, and BidZA's document
# store and its backups sit on the same 99GB. A full disk takes all of them down at once, so this is
# a neighbourly check as much as ours.
used=$(df -P / | awk 'NR==2{print $5}' | tr -dc '0-9')
if [ -n "$used" ] && [ "$used" -ge "$DISK_WARN_PERCENT" ]; then
  problems+=("Disk is ${used}% full")
fi

# ── Last night's backup actually happened ───────────────────────────────────
#
# Only once the backup timer has been enabled. A backup that quietly stopped running looks exactly
# like one that ran, which is the whole reason this line exists rather than trusting the timer.
if systemctl is-enabled --quiet mythuso-backup.timer 2>/dev/null; then
  newest=$(find /var/backups/mythuso -name 'identity-*.db.gz' -mtime -2 2>/dev/null | head -1)
  if [ -z "$newest" ]; then problems+=("No identity database backup in the last 48 hours"); fi
else
  notes+=("backup timer not enabled — backup freshness not checked")
fi

for n in ${notes+"${notes[@]}"}; do echo "note: $n"; done

COUNT_FILE="$STATE/consecutive-failures"
if [ ${#problems[@]} -eq 0 ]; then
  # Recovered — say so, once, if it had been alerting.
  if [ -f "$STATE/alerted" ]; then
    /opt/mythuso/ops/mythuso-alert.sh "recovered" "MyThuso is answering again as of $(date -u +%FT%TZ)." || true
    rm -f "$STATE/alerted"
  fi
  echo 0 > "$COUNT_FILE"
  echo "ok"
  exit 0
fi

n=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$COUNT_FILE"
printf 'unhealthy (%s consecutive): %s\n' "$n" "${problems[*]}"

# Alert on the second consecutive failure, and once — not every five minutes. The marker is removed
# by the recovery branch above, so the next real outage alerts again.
if [ "$n" -ge "$FAILS_BEFORE_ALERT" ] && [ ! -f "$STATE/alerted" ]; then
  if /opt/mythuso/ops/mythuso-alert.sh "unhealthy" "$(printf '%s\n' "${problems[@]}")"; then
    touch "$STATE/alerted"
  fi
fi
exit 1
