#!/usr/bin/env bash
# Type Azure OpenAI credentials into /etc/mythuso/assistant.env with the key never on screen.
#
# Run as root, on the server, by hand:
#
#   sudo /opt/mythuso/ops/configure-assistant-env.sh
#
# It is installed by every deploy with the other ops scripts, and it is the ONLY sanctioned way
# these credentials reach this box. The alternatives are each a disclosure with a step in between:
# a key pasted into chat is a key in a chat provider's logs; a key in Git is a key in every clone
# and every backup of the clone; a key on a shell command line is a key in the shell history file
# and in `ps` output for as long as the command runs; a key in a build output is a key served to
# the public internet. This script keeps the key in three places only — the terminal input buffer
# while it is typed (echo off), this shell's memory, and the 0600 root:root file it writes. It is
# never echoed, never an argument, never logged.
#
# On failure it leaves any previous assistant.env exactly as it was: the new file is assembled
# beside the old one and moved over it only after every check has passed, so an interrupted run
# cannot leave a half-written configuration behind.
set -euo pipefail
# Everything this script creates — the temp file above all — is created 0600, so a key that lands
# on disk on the error path is already a key nobody else can read.
umask 077

ENV_FILE=/etc/mythuso/assistant.env

# ── Test mode, for the harness in apps/assistant-api/src/deploy.test.ts ────────────────────────
#
# Only when BOTH of these are set does anything change: the file lands at $ASSISTANT_ENV_FILE and
# the root requirement is relaxed to match — writes are confined to the sandbox path, /etc is never
# touched. It exists so the script's own behaviour (rejection of a bad endpoint, the 0600 file, the
# key never in the output) is tested rather than trusted. Set neither in production; setting only
# one changes nothing.
if [ "${MYTHUSO_ASSISTANT_ENV_TEST:-}" = "1" ] && [ -n "${ASSISTANT_ENV_FILE:-}" ]; then
  ENV_FILE=$ASSISTANT_ENV_FILE
else
  if [ "$(id -u)" -ne 0 ]; then
    echo "This writes $ENV_FILE, so it must run as root. Try: sudo $0" >&2
    exit 1
  fi
fi

say() { printf '%s\n' "$*"; }

valid_hostname() {
  case "$1" in ''|*[!a-z0-9.-]*|.*|*.|*..*) return 1 ;; esac
  [ "${#1}" -le 253 ] || return 1
  local label
  for label in $(printf '%s' "$1" | tr '.' ' '); do
    case "$label" in ''|-*|*-) return 1 ;; esac
    [ "${#label}" -le 63 ] || return 1
  done
  return 0
}

fail() { echo "$1" >&2; exit 1; }

# ── The prompts ───────────────────────────────────────────────────────────────────────────────
#
# The endpoint is not a secret — it is in DNS-adjacent Azure documentation of its own resource and
# appears in no response this service gives — so it is typed with echo on: the person can see the
# typo they are about to save. The key is typed with echo off (`read -s`), which is the whole point
# of this script existing.

say "Azure OpenAI credentials for GilbertOne's second tier."
say "Nothing you type here is sent anywhere; it is written to $ENV_FILE (0600 root:root) for the"
say "assistant-api service to read. Ctrl-C at any prompt leaves any existing file untouched."
say ""

printf 'Azure OpenAI endpoint (https://<resource-name>.openai.azure.com): '
read -r endpoint
endpoint=$(printf '%s' "$endpoint" | tr '[:upper:]' '[:lower:]' | sed 's:/*$::')
case "$endpoint" in
  https://*) host=${endpoint#https://} ;;
  *) fail "The endpoint must start with https:// — a key sent to an http:// address is a key sent in the clear. Nothing was written." ;;
esac
valid_hostname "$host" || fail "That endpoint is not a bare https host name (no path, no query, no trailing slash). Nothing was written."

printf 'Azure OpenAI API key (input hidden): '
read -rs key
printf '\n'
[ -n "$key" ] || fail "The key was empty. Nothing was written."
# Azure keys are alphanumeric; the window is wider than 32 characters in case the format grows, and
# narrower than anything a person pastes by mistake — a URL, a sentence, a connection string with a
# semicolon in it. Every character it rejects is a character that could not have been a key.
if printf '%s' "$key" | grep -qvE '^[A-Za-z0-9_-]{20,200}$'; then
  fail "That does not look like an Azure key (unexpected characters or length). Nothing was written — and if what was pasted really was a key, it is now in this shell's memory only, which dies with it."
fi

printf 'Deployment name (AZURE_OPENAI_MODEL) [gpt-4.1-mini]: '
read -r model
model=$(printf '%s' "$model" | tr -d '[:space:]')
model=${model:-gpt-4.1-mini}
printf '%s' "$model" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' \
  || fail "A deployment name is letters, digits, dots, hyphens and underscores. Nothing was written."

# ── The fingerprint: how two people compare keys without disclosing them ───────────────────────
#
# Sixteen characters of the key's SHA-256, the same ceremony /etc/mythuso/key.fingerprint uses for
# the identity service's keys. printf is a shell builtin, so the key is piped from the shell's own
# memory and never appears in a process argument or a `ps` listing. shasum is the fallback because
# macOS has no sha256sum; the server does, and the digest is the same either way.
fingerprint=$(printf '%s' "$key" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)

# ── Write it, atomically ───────────────────────────────────────────────────────────────────────
#
# The new file is assembled beside the old one and moved over it only at the end, so any failure
# above — and any interruption — leaves the previous configuration exactly as it was. mktemp under
# umask 077 gives 0600 before the key is ever written into it.
mkdir -p "$(dirname "$ENV_FILE")"
tmp=$(mktemp "${ENV_FILE}.new.XXXXXX")
trap 'rm -f "$tmp"' EXIT

# Preserve anything else an operator put in this file by hand — QDRANT_URL, an OLLAMA_MODEL — and
# replace only the three Azure lines. A script that silently dropped the rest of the file would be
# the BidZA .env lesson learned again: the server's configuration is the server's.
if [ -f "$ENV_FILE" ]; then
  grep -v '^AZURE_OPENAI_' "$ENV_FILE" > "$tmp" || true
  # A file that was readable by others has to be treated as a key that was read — the same rule
  # deploy.sh applies to the identity service's env file. The new file below fixes the mode; this
  # note is the part that cannot be fixed by chmod.
  prev_mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo '?')
  case "$prev_mode" in
    600|400) : ;;
    *) say "Note: the previous $ENV_FILE was mode $prev_mode rather than 600. If it held a real"
       say "key, that key has to be treated as disclosed — rotate it in the Azure portal." ;;
  esac
fi
printf 'AZURE_OPENAI_ENDPOINT=%s\nAZURE_OPENAI_KEY=%s\nAZURE_OPENAI_MODEL=%s\n' \
  "$endpoint" "$key" "$model" >> "$tmp"

chmod 0600 "$tmp"
chown root:root "$tmp" 2>/dev/null || true
mv -f "$tmp" "$ENV_FILE"
trap - EXIT

# ── Clean up and say what to do next — and nothing else ────────────────────────────────────────
#
# The fingerprint is printed before anything is unset: it identifies the key without being the key.
# The key itself leaves this shell's memory before the script returns; the file keeps the only
# copy. The next steps name commands that print no secrets either: the health route answers with
# booleans, never the endpoint or the key.
#
# The acknowledgement is named here and deliberately not written here. A configured key must not
# be able to switch the public model on by itself — that is the production decision, and it is
# taken once, by hand, as its own act: MYTHUSO_ASSISTANT_PRODUCTION, set to the acknowledged value
# in the same file. The exact command is in deploy/RUNBOOK.md, "Activating the assistant service",
# and the service refuses to start until the line is there. A script that appended it would make
# one command out of two decisions, which is the thing the gate exists to prevent.
say ""
say "Wrote $ENV_FILE — 0600 root:root, the Azure key and nothing else beside it."
say "Key fingerprint: $fingerprint (sixteen characters that identify the key without"
say "disclosing it — the thing to write in the register, not the key itself)."
unset endpoint key model fingerprint
say ""
if systemctl is-enabled --quiet assistant-api.service 2>/dev/null; then
  say "To put the new credentials to work:"
  say "  systemctl restart assistant-api.service     # already enabled; it picks up the new env"
else
  say "To put it to work, in this order — the first start needs one more line, added by hand:"
  say "  1. the production acknowledgement — MYTHUSO_ASSISTANT_PRODUCTION, set to acknowledged —"
  say "     in $ENV_FILE. This script deliberately does not write it: typing a key and taking"
  say "     the production decision are two separate acts. deploy/RUNBOOK.md, \"Activating the"
  say "     assistant service\", has the exact printf — and the service will not start without it."
  say "  2. systemctl enable --now assistant-api.service   # first activation"
fi
say "Then check it, from the box, with commands that reveal no secrets:"
say "  curl -s http://127.0.0.1:8791/assistant/health        # expect \"azure\":true and \"activated\":true"
say "  curl -s https://mythuso.co.za/assistant/health        # the same, through nginx"
say ""
say "If the service will not be enabled, the file can wait: the unit reads it only at start."
