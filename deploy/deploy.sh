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
# MyThuso's own domain is the home for MyThuso's marketing. It defaulted to a liqzar subdomain
# only because mythuso.co.za was pointing at the registrar's parking page when this was written,
# which was a reason to move it rather than a reason to settle for somewhere else.
HOST="${HOST:-mythuso.co.za}"
# Extra names the same site answers to. server_name gets these as well; every Host-header check
# below stays on $HOST alone, because a Host header carries one name.
ALIASES="${ALIASES:-www.mythuso.co.za}"
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
if grep -rslI -e 'MYTHUSO_AUTH_PEPPER' -e 'MYTHUSO_ENCRYPTION_KEY' -e 'MYTHUSO_PROTECTION_KEYS' -e 'MYTHUSO_IDENTITY_API_KEY' -e 'BEGIN .*PRIVATE KEY' apps/web/dist 2>/dev/null | head -1 | grep -q .; then
  echo "the build output mentions a secret by name — refusing to publish it"; exit 1
fi

say "Checking $TARGET before touching it"
ssh "$TARGET" "test -d /etc/nginx/sites-enabled && command -v nginx >/dev/null" \
  || { echo "nginx not found on $TARGET"; exit 1; }
# A site file for this host that we did not write is a collision, not a redeploy.
for name in $HOST $ALIASES; do
  ssh "$TARGET" "! grep -rlE 'server_name[^;]*[ ]${name}[ ;]' /etc/nginx/sites-enabled/ 2>/dev/null | grep -qv mythuso.conf" \
    || { echo "another nginx site already claims $name — stopping rather than guessing"; exit 1; }
done

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
sed "s/__HOST__/$HOST${ALIASES:+ $ALIASES}/g" deploy/nginx/mythuso.conf \
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

# ── The keys have to exist before the service does ─────────────────────────────────────────────
#
# Two different secrets live in /etc/mythuso/api.env and they are not interchangeable:
#
#   MYTHUSO_ENCRYPTION_KEY   apps/api/src/sensitive.ts — the identity service's own key, sealing a
#                            name and a second-factor secret. One key, no versions.
#   MYTHUSO_PROTECTION_KEYS  apps/api/src/protection/crypto.ts — the root keys of the data
#                            protection module, as "1:<key>,2:<key>". More than one is normal: a
#                            rotation needs the old version present or the old records do not open.
#
# apps/api/src/config.ts refuses to start on a malformed encryption key, and the protection module
# refuses outright if its keys are missing — but a *missing* encryption key is not a refusal: the
# service starts, answers /health, and turns every sealed write into a 503 that reads like a bug in
# the application. That is a failure found days later by the first person enrolling a second factor.
# Better to find it here, while somebody is still looking at output.
#
# Nothing below prints a key or passes one as an argument to anything: patterns go in over stdin so
# they never appear in the server's process list, and only counts, verdicts and truncated
# fingerprints come back over ssh. A fingerprint is not secret — it is how two people confirm over a
# phone call that they hold the same key, and docs/DATA-PROTECTION.md computes it the same way.
#
# It runs with the whole remote script on stdin rather than as a "ssh host '...'" string, because
# nothing in it needs a value from this side and quoting a key-handling script through two shells is
# how a key-handling script acquires a bug.
#
# The result is remembered rather than acted on: a failure here must not skip the co-tenant re-check
# below, which is the reason this script exists at all.
say "Checking the service's key material, without reading it"
key_failed=0
ssh "$TARGET" bash -s <<'REMOTE' || key_failed=1
set -uo pipefail
env_file=/etc/mythuso/api.env
recorded=/etc/mythuso/key.fingerprint
problems=0

# Until step 4 of deploy/README.md the correct state of this service is "not running", and a deploy
# that failed on keys nobody has generated yet would be a deploy nobody finishes.
if ! systemctl is-enabled --quiet mythuso-api.service 2>/dev/null; then
  echo "keys      not checked — the identity service is not enabled (deploy/README.md)"
  exit 0
fi

[ -f "$env_file" ] || {
  echo "!! $env_file does not exist and mythuso-api is enabled — the service has no configuration at all"
  exit 1
}

# A key in a file anybody on this box can read is a key five other sites can read. The remedy is not
# only chmod: a key that has been readable has to be treated as one that was read.
owner_mode=$(stat -c '%a %U:%G' "$env_file" 2>/dev/null || echo 'unknown')
case "$owner_mode" in
  '600 root:root'|'400 root:root') : ;;
  *)
    echo "!! $env_file is $owner_mode — it must be 0600 root:root."
    echo "   chmod 0600 && chown root:root, and then rotate every key in it: on a box shared with"
    echo "   five other sites a readable key file is a disclosed key. docs/DATA-PROTECTION.md."
    exit 1 ;;
esac

# ── Helpers. None of them print key material. ─────────────────────────────────────────────────
value_of() { # <NAME> -> the value, whitespace and surrounding quotes removed
  local v; v=$(sed -n "s/^$1=//p" "$env_file" | tail -1 | tr -d '[:space:]')
  v=${v%\"}; v=${v#\"}; v=${v%\'}; v=${v#\'}
  printf '%s' "$v"
}
key_bytes() { # material on stdin -> byte count
  local m; m=$(cat)
  if printf '%s' "$m" | grep -qE '^[0-9a-fA-F]{64}$'; then echo 32
  else printf '%s' "$m" | base64 -d 2>/dev/null | wc -c | tr -d ' '; fi
}
fingerprint_of() { printf '%s' "$1" | sha256sum | cut -c1-16; }
leaked() { # material -> true if it appears where it must never be
  printf '%s\n' "$1" | grep -rqaFf - /var/www/mythuso /var/backups/mythuso 2>/dev/null
}
note_fingerprint() { # <name> <fingerprint>
  local was; was=$(sed -n "s/^$1 //p" "$recorded" 2>/dev/null | tail -1)
  if [ -z "$was" ]; then
    printf '%s %s\n' "$1" "$2" >> "$recorded"; chmod 0644 "$recorded"
  elif [ "$was" != "$2" ]; then
    # Not a failure: a rotation changes this legitimately, and a deploy that refused after every
    # rotation would teach everybody to delete the file. A change nobody performed is the finding.
    echo "!! $1 has CHANGED on this host since the last deploy ($was -> $2)."
    echo "   If you rotated it, update the line in $recorded. If you did not, this is the suspicion"
    echo "   case in docs/DATA-PROTECTION.md — stop and investigate before deploying again."
  fi
}

# ── The identity service's own key ────────────────────────────────────────────────────────────
key=$(value_of MYTHUSO_ENCRYPTION_KEY)
if [ -z "$key" ]; then
  echo "!! MYTHUSO_ENCRYPTION_KEY is not set in $env_file."
  echo "   The service will start, answer /health, and refuse every write that needs sealing —"
  echo "   which looks like an application bug rather than a missing key. Generate one by the"
  echo "   ceremony in docs/DATA-PROTECTION.md, with a second copy, before enabling the service."
  problems=$((problems + 1))
else
  case "$key" in
    '<'*|changeme*|REPLACE*|xxx*)
      echo "!! MYTHUSO_ENCRYPTION_KEY is still the placeholder text from deploy/README.md"
      problems=$((problems + 1)) ;;
    *)
      bytes=$(printf '%s' "$key" | key_bytes)
      if [ "${bytes:-0}" != "32" ]; then
        echo "!! MYTHUSO_ENCRYPTION_KEY is not 32 bytes — it decodes to ${bytes:-0}. The service will not start."
        echo "   Generate one with: openssl rand -hex 32"
        problems=$((problems + 1))
      elif leaked "$key"; then
        echo "!! MYTHUSO_ENCRYPTION_KEY appears in a file under /var/www/mythuso or /var/backups/mythuso."
        echo "   The web root is served to the public internet and the backups are the database this"
        echo "   key opens. Treat it as disclosed and rotate, then find what put it there."
        problems=$((problems + 1))
      else
        # Two secrets that protect different things and are rotated on different occasions.
        # Rotating the pepper signs everybody out; rotating this re-seals records.
        pepper=$(value_of MYTHUSO_AUTH_PEPPER)
        if [ -n "$pepper" ] && [ "$pepper" = "$key" ]; then
          echo "!! MYTHUSO_AUTH_PEPPER and MYTHUSO_ENCRYPTION_KEY are the same value — they must not be"
          problems=$((problems + 1))
        fi
        echo "identity  key present, 32 bytes, fingerprint $(fingerprint_of "$key")"
        note_fingerprint encryption "$(fingerprint_of "$key")"
      fi ;;
  esac
fi

# ── The data protection module's root keys ────────────────────────────────────────────────────
#
# Required only when the code actually on this box reads them. The module is being written and is
# not wired into config.ts yet; a deploy that demanded keys for a module nobody has enabled would be
# a deploy that gets worked around. The trigger is the deployed source, not a date in a document.
protection=$(value_of MYTHUSO_PROTECTION_KEYS)
if grep -rqs 'MYTHUSO_PROTECTION_KEYS' /opt/mythuso/api/src 2>/dev/null; then wanted=1; else wanted=0; fi

if [ -z "$protection" ] && [ "$wanted" = 0 ]; then
  echo "protection  no MYTHUSO_PROTECTION_KEYS, and nothing deployed reads them yet"
elif [ -z "$protection" ]; then
  echo "!! the deployed service reads MYTHUSO_PROTECTION_KEYS and $env_file does not set it."
  echo "   Everything that module protects is special personal information and it has no fallback:"
  echo "   it will refuse rather than store anything in the clear. Generate the first version by the"
  echo '   ceremony in docs/DATA-PROTECTION.md, which appends it without ever printing it.'
  problems=$((problems + 1))
else
  # "1:<key>,2:<key>", and a bare key means version 1. The module refuses to start on every fault
  # below; these are checked here anyway, because the module's refusal happens at the next restart
  # and this happens while a person is watching.
  versions=''
  materials=''
  bad=0
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "$entry" in
      *:*) v=${entry%%:*}; m=${entry#*:} ;;
      *)   v=1;            m=$entry ;;
    esac
    if ! printf '%s' "$v" | grep -qE '^[0-9]+$' || [ "$v" -lt 1 ] || [ "$v" -gt 65535 ]; then
      echo "!! MYTHUSO_PROTECTION_KEYS has a key numbered '$v' — versions are whole numbers 1 to 65535"
      bad=1; continue
    fi
    case " $versions " in *" $v "*)
      echo "!! MYTHUSO_PROTECTION_KEYS lists version $v twice — which one seals is not left to ordering"
      bad=1; continue ;;
    esac
    b=$(printf '%s' "$m" | key_bytes)
    if [ "${b:-0}" != "32" ]; then
      echo "!! the protection key for version $v is not 32 bytes — it decodes to ${b:-0}"
      bad=1; continue
    fi
    f=$(fingerprint_of "$m")
    case " $materials " in *" $f "*)
      echo "!! two protection key versions hold the same material — rotating to the same secret rotates nothing"
      bad=1; continue ;;
    esac
    if [ -n "$key" ] && [ "$m" = "$key" ]; then
      echo "!! protection key version $v is the same value as MYTHUSO_ENCRYPTION_KEY. They protect"
      echo "   different things and one of them is rotated by re-wrapping records; sharing a secret"
      echo "   means neither can be rotated without the other's consequences."
      bad=1; continue
    fi
    if leaked "$m"; then
      echo "!! protection key version $v appears under /var/www/mythuso or /var/backups/mythuso —"
      echo "   treat it as disclosed and read the compromise section of docs/DATA-PROTECTION.md"
      bad=1; continue
    fi
    versions="$versions $v"
    materials="$materials $f"
    note_fingerprint "protection.v$v" "$f"
    echo "protection  version $v present, 32 bytes, fingerprint $f"
  done <<EOF
$(printf '%s' "$protection" | tr ',' '\n')
EOF

  # Both of these are answered from the versions the loop above accepted, so a version whose key was
  # malformed is not also reported as "not configured" — one fault, one sentence.
  have_version() { case " $versions " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
  count=$(printf '%s' "$versions" | wc -w | tr -d ' ')

  # Blind indexes are computed under one version and default to the LOWEST configured — so retiring
  # the oldest key silently moves them and every existing index stops matching. Pinning the version
  # explicitly is what makes that a decision rather than a side effect of a rotation.
  index_version=$(value_of MYTHUSO_PROTECTION_INDEX_VERSION)
  if [ -n "$index_version" ]; then
    if ! have_version "$index_version"; then
      echo "!! MYTHUSO_PROTECTION_INDEX_VERSION is $index_version and no key of that version is"
      echo "   configured. Every existing blind index would stop matching."
      bad=1
    fi
  elif [ "${count:-0}" -gt 1 ]; then
    echo "!! more than one protection key version and no MYTHUSO_PROTECTION_INDEX_VERSION."
    echo "   Blind indexes default to the lowest version configured, so retiring the oldest key will"
    echo "   silently move them and every index will stop matching. Pin it before retiring anything."
  fi

  current=$(value_of MYTHUSO_PROTECTION_KEY_CURRENT)
  if [ -n "$current" ] && ! have_version "$current"; then
    echo "!! MYTHUSO_PROTECTION_KEY_CURRENT is $current and no key of that version is configured."
    echo "   New writes would be sealed under a key this server does not hold. That is a rotation"
    echo "   made current before its key was added — docs/DATA-PROTECTION.md has the abort."
    bad=1
  fi

  [ "$bad" = 0 ] || problems=$((problems + 1))
fi

[ "$problems" = 0 ] || exit 1
REMOTE

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

# Held back until the co-tenant re-check above had run, because that check is the point of this
# script and a key problem of ours is no reason to skip it.
if [ "$key_failed" = 1 ]; then
  echo; echo "!! The identity service's key material did not pass. Nothing above was rolled back —" >&2
  echo "   the site is published and the neighbours are unchanged — but the service is running" >&2
  echo "   without a key it can seal with. See docs/DATA-PROTECTION.md." >&2
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
     Its keys are their own step, each with a second copy, before the service is enabled:
     docs/DATA-PROTECTION.md. Once the unit is enabled this deploy checks them on every run.
NOTE
