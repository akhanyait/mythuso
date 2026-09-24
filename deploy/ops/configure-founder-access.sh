#!/usr/bin/env bash
# Write the founder's sign-in credential for founder access into /etc/mythuso/founder.env: a password
# typed twice with echo off and kept only as an scrypt hash, and a new authenticator secret shown
# once for the founder's app.
#
# Run as root, on the server, by hand:
#
#   sudo /opt/mythuso/ops/configure-founder-access.sh
#
# It is installed by every deploy with the other ops scripts, and it is the ONLY sanctioned way the
# founder credential reaches this box. It follows configure-assistant-env.sh's discipline exactly:
# root only, umask 077, hidden input, the new file assembled beside the old and moved over it only
# after every check has passed, 0600 root:root, and nothing secret on a command line or in a log.
#
# WHAT IT NEVER DOES. It never writes MYTHUSO_FOUNDER_ACCESS=enabled. Founder access stays dark until
# the founder writes that line by hand — deploy/RUNBOOK.md, "Founder access", has the command — for the
# same reason the production acknowledgement is its own line: typing a credential and switching the
# feature on are two decisions, and a script that took both would make them one command. It keeps any
# such line already in the file exactly as it is, so re-running it to rotate the credential does not
# switch anything off or on.
#
# WHAT IT STORES. The password never touches the disk: it is piped from this shell's memory into
# node's scrypt on stdin — never an argument, so never in `ps` — and only the hash is written. The
# parameters are packages/catalog/founder-access.json's (scripts/check-boundaries.mjs holds these
# lines to that contract, because this box has no copy of it): N = 2^17, r = 8, p = 1, a 64-byte key
# and a 16-byte random salt, written as scrypt:<log2N>:<r>:<p>:<salt>:<key> in base64url. The
# authenticator secret is twenty bytes from node's CSPRNG, base32-encoded; it is stored in the same
# 0600 file, because the service must read it to check a code — and it is printed exactly once, as an
# otpauth:// URI and, when qrencode is installed, as a QR code, for the founder to scan.
#
# The first sign-in is the proof the scan worked. This script does not ask for a code back, because
# checking one here would mean a second TOTP implementation in shell, and the repository keeps one
# (apps/api/src/totp.ts). If the first sign-in fails on the code, run this again: it writes a new
# secret, and the old one stops working the moment the service restarts.
set -euo pipefail
umask 077

ENV_FILE=/etc/mythuso/founder.env

# ── Test mode, for the harness in apps/assistant-api/src/founder-deploy.test.ts ────────────────────
#
# Only when BOTH are set: the file lands at $FOUNDER_ENV_FILE and the root requirement is relaxed to
# match. /etc is never touched by a test. Set neither in production; setting one changes nothing.
if [ "${MYTHUSO_FOUNDER_ENV_TEST:-}" = "1" ] && [ -n "${FOUNDER_ENV_FILE:-}" ]; then
  ENV_FILE=$FOUNDER_ENV_FILE
else
  if [ "$(id -u)" -ne 0 ]; then
    echo "This writes $ENV_FILE, so it must run as root. Try: sudo $0" >&2
    exit 1
  fi
fi

say() { printf '%s\n' "$*"; }
fail() { echo "$1" >&2; exit 1; }

# The numbers packages/catalog/founder-access.json owns, repeated because the box has no catalog.
# scripts/check-boundaries.mjs fails the build when any of these disagrees with the contract.
PASSWORD_MINIMUM=14
SCRYPT_LOG2N=17
SCRYPT_R=8
SCRYPT_P=1
SCRYPT_KEY_BYTES=64
SCRYPT_SALT_BYTES=16
TOTP_SECRET_BYTES=20
TOTP_DIGITS=6
TOTP_PERIOD=30
HASH_VARIABLE=MYTHUSO_FOUNDER_PASSWORD_HASH
SECRET_VARIABLE=MYTHUSO_FOUNDER_TOTP_SECRET

NODE=$(command -v node || true)
[ -n "$NODE" ] || fail "node is not on this box's PATH, and the hash is computed with node's scrypt. Nothing was written."

say "Founder access: the founder's password and a new authenticator secret, written to $ENV_FILE"
say "(0600 root:root) for the assistant-api service to read. The password is kept only as an scrypt"
say "hash. Nothing here switches founder access on. Ctrl-C at any prompt leaves any existing file"
say "untouched."
say ""

# ── The password, twice, with echo off ──────────────────────────────────────────────────────────
printf 'Founder password (at least %s characters, input hidden): ' "$PASSWORD_MINIMUM"
read -rs password || true
printf '\n'
printf 'The same password again (input hidden): '
read -rs again || true
printf '\n'
[ "$password" = "$again" ] || { unset password again; fail "The two passwords were not the same. Nothing was written."; }
unset again
[ "${#password}" -ge "$PASSWORD_MINIMUM" ] || { unset password; fail "The password is shorter than $PASSWORD_MINIMUM characters. Nothing was written."; }

# ── The hash: scrypt in node, the password on stdin ──────────────────────────────────────────────
# printf is a shell builtin, so the password goes from this shell's memory down the pipe and never
# appears as a process argument. The JavaScript is an argument, and holds nothing secret.
HASH_JS="
const { scryptSync, randomBytes } = require('node:crypto');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const N = 2 ** ${SCRYPT_LOG2N};
  const salt = randomBytes(${SCRYPT_SALT_BYTES});
  const key = scryptSync(input.normalize('NFC'), salt, ${SCRYPT_KEY_BYTES}, { N, r: ${SCRYPT_R}, p: ${SCRYPT_P}, maxmem: 256 * N * ${SCRYPT_R} });
  process.stdout.write(['scrypt', ${SCRYPT_LOG2N}, ${SCRYPT_R}, ${SCRYPT_P}, salt.toString('base64url'), key.toString('base64url')].join(':'));
});"
hash=$(printf '%s' "$password" | "$NODE" -e "$HASH_JS")
unset password
printf '%s' "$hash" | grep -qE "^scrypt:${SCRYPT_LOG2N}:${SCRYPT_R}:${SCRYPT_P}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\$" \
  || fail "The hash did not come out in the expected shape. Nothing was written."

# ── The authenticator secret: twenty bytes from the CSPRNG, base32 ───────────────────────────────
SECRET_JS="
const bytes = require('node:crypto').randomBytes(${TOTP_SECRET_BYTES});
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = 0, value = 0, out = '';
for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
process.stdout.write(out);"
secret=$("$NODE" -e "$SECRET_JS")
printf '%s' "$secret" | grep -qE '^[A-Z2-7]{32}$' || fail "The authenticator secret did not come out in the expected shape. Nothing was written."

# ── Write it, atomically ─────────────────────────────────────────────────────────────────────────
# Every line this script does not own is kept — the enable line above all, so a rotation neither
# switches founder access on nor off.
mkdir -p "$(dirname "$ENV_FILE")"
tmp=$(mktemp "${ENV_FILE}.new.XXXXXX")
trap 'rm -f "$tmp"' EXIT
if [ -f "$ENV_FILE" ]; then
  grep -vE "^(${HASH_VARIABLE}|${SECRET_VARIABLE})=" "$ENV_FILE" > "$tmp" || true
  prev_mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo '?')
  case "$prev_mode" in
    600|400) : ;;
    *) say "Note: the previous $ENV_FILE was mode $prev_mode rather than 600. The credential it held"
       say "has to be treated as disclosed; this run replaces it." ;;
  esac
fi
printf '%s=%s\n%s=%s\n' "$HASH_VARIABLE" "$hash" "$SECRET_VARIABLE" "$secret" >> "$tmp"
chmod 0600 "$tmp"
chown root:root "$tmp" 2>/dev/null || true
mv -f "$tmp" "$ENV_FILE"
trap - EXIT

# ── The one time the secret is shown ─────────────────────────────────────────────────────────────
uri="otpauth://totp/MyThuso:founder?secret=${secret}&issuer=MyThuso&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}"
fingerprint=$(printf '%s' "$hash" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)
say ""
say "Wrote $ENV_FILE — 0600 root:root, the password hash and the authenticator secret."
say "Credential fingerprint: $fingerprint (identifies this credential in the register; it is not"
say "the password and cannot be turned back into it)."
say ""
say "Add this to the founder's authenticator app NOW. It is shown once and never again:"
say ""
say "  $uri"
say ""
if command -v qrencode >/dev/null 2>&1; then
  printf '%s' "$uri" | qrencode -t ANSIUTF8
  say ""
fi
say "Then clear this terminal's scrollback — the line above is the secret."
unset hash secret uri fingerprint
say ""
if grep -qE '^MYTHUSO_FOUNDER_ACCESS=' "$ENV_FILE"; then
  say "The enable line is already in $ENV_FILE and was left as it was. Restart the service to use"
  say "the new credential:  systemctl restart assistant-api.service"
else
  say "Founder access is still switched OFF. This script does not switch it on. To switch it on,"
  say "follow deploy/RUNBOOK.md, \"Founder access\": the enable line is written by hand, then the"
  say "service is restarted."
fi
