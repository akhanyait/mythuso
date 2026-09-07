#!/usr/bin/env bash
#
# Tell somebody when a MyThuso background job fails.
#
# systemd restarts the identity service on its own, so a process dying is handled. What is not
# handled is a job that fails and stays failed — the nightly backup, the health check. Those write
# to the journal, and nobody reads the journal.
#
# Invoked by OnFailure= on each unit, which passes the failed unit's name, and directly by the
# health check with a subject and a body.
#
# BidZA's equivalent borrows nodemailer and the SMTP settings out of its API's .env, so that mail is
# configured in one place. There is nothing to borrow here: the identity service has no dependencies
# at all — node:http, node:crypto and node:sqlite — and that is the reason it has no supply chain to
# audit. So this uses whatever the box already has, and if the box has nothing it says so in the
# journal rather than exiting quietly and leaving somebody believing they are being alerted.
set -uo pipefail

SUBJECT="${1:-unknown}"
BODY="${2:-}"

# The address is an operational decision, so the deploy never writes it — a deploy that overwrote
# this file would silence every alert and look like a successful deploy while doing it.
# shellcheck source=/dev/null
[ -r /etc/mythuso/ops.env ] && . /etc/mythuso/ops.env
TO="${MYTHUSO_ALERT_TO:-root}"

HOST=$(hostname -f 2>/dev/null || hostname)
WHEN=$(date -u +%FT%TZ)

# When called by OnFailure= the argument is a unit name and there is no body; the last of the
# journal is what a person actually needs to see.
if [ -z "$BODY" ]; then
  BODY=$(printf '%s failed on %s at %s.\n\nLast 25 journal lines:\n\n%s\n' \
    "$SUBJECT" "$HOST" "$WHEN" "$(journalctl -u "$SUBJECT" -n 25 --no-pager 2>/dev/null | tail -25)")
  SUBJECT="$SUBJECT failed"
fi

MESSAGE=$(printf 'MyThuso: %s\nHost: %s\nAt:   %s\n\n%s\n' "$SUBJECT" "$HOST" "$WHEN" "$BODY")

# Always to the journal first. Mail can be unconfigured, throttled or refused; the journal cannot,
# and an alert that only ever existed in an email nobody received is worse than no alert at all.
printf '%s\n' "$MESSAGE" | systemd-cat -t mythuso-alert -p warning 2>/dev/null \
  || printf '%s\n' "$MESSAGE" >&2

mkdir -p /var/log/mythuso 2>/dev/null || true
printf '%s\n\n' "$MESSAGE" >> /var/log/mythuso/alerts.log 2>/dev/null || true

if command -v mail >/dev/null 2>&1; then
  printf '%s\n' "$MESSAGE" | mail -s "MyThuso: $SUBJECT on $HOST" "$TO" && exit 0
elif command -v sendmail >/dev/null 2>&1; then
  printf 'To: %s\nSubject: MyThuso: %s on %s\n\n%s\n' "$TO" "$SUBJECT" "$HOST" "$MESSAGE" \
    | sendmail -t && exit 0
fi

echo "mythuso-alert: no mail command on this host — the alert above went to the journal and to /var/log/mythuso/alerts.log only" >&2
exit 1
