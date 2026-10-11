#!/usr/bin/env bash
# Replaces the GilbertOne test-chat login with a password you choose. The previous password
# stops working. Run this on the GilbertOne server, not on a laptop:
#   sudo bash set-login.sh
# Type the password at the prompt. It is not printed back and it is not stored in this repository.
set -euo pipefail

BOX=gilbertone
LOGIN_USER=gilbert
LOGIN_FILE=/root/gilbertone-test-chat-login.txt
PUBLIC_URL="${GILBERTONE_URL:-https://gilbertone.mythuso.co.za/}"

die() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo on the GilbertOne server."
command -v incus >/dev/null || die "incus is not on this machine. This script runs on the server, beside the container."
[ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ] || die "the ${BOX} container is not running."

if [ -n "${GILBERTONE_PASSWORD:-}" ]; then
  password="$GILBERTONE_PASSWORD"
else
  read -rs -p "New password: " password
  printf '\n'
  read -rs -p "Type it again: " again
  printf '\n'
  [ "$password" = "$again" ] || die "the two entries did not match."
fi
[ "${#password}" -ge 8 ] || die "use at least 8 characters."

( umask 077; printf '%s\n' "$password" > "$LOGIN_FILE" )
hash="$(incus exec "$BOX" -- caddy hash-password --plaintext "$password")"
[ -n "$hash" ] || die "Caddy did not hash the password."

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
incus file pull "$BOX/etc/caddy/Caddyfile" "$tmp"
awk -v user="$LOGIN_USER" -v hash="$hash" '
  $1 == user { print "\t" user " " hash; replaced = 1; next }
  { print }
  END { if (!replaced) exit 2 }
' "$tmp" > "${tmp}.new" || die "the Caddyfile has no login line for ${LOGIN_USER}."
mv "${tmp}.new" "$tmp"
incus file push "$tmp" "$BOX/etc/caddy/Caddyfile"
incus exec "$BOX" -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
incus exec "$BOX" -- systemctl reload caddy

unset password again hash
password="$(cat "$LOGIN_FILE")"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -u "${LOGIN_USER}:${password}" "$PUBLIC_URL" || true)"
[ "$code" != "401" ] || die "the new password was refused at ${PUBLIC_URL}."

printf 'Login updated.\nUser: %s\nAddress: %s\nThe password is the one you just typed. It is also in %s on this server.\n' \
  "$LOGIN_USER" "$PUBLIC_URL" "$LOGIN_FILE"
