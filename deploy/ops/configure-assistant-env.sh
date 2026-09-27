#!/usr/bin/env bash
# Type Azure OpenAI credentials — and, optionally, the Azure Speech credential the natural cloud
# voice needs — into /etc/mythuso/assistant.env, with every key never on screen.
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

say "Azure OpenAI credentials for GilbertOne's second tier, and the Azure Speech credential its"
say "natural cloud voice reads. Nothing you type here is sent anywhere; it is written to $ENV_FILE"
say "(0600 root:root) for the assistant-api service to read. Ctrl-C at any prompt leaves any"
say "existing file untouched."
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

# ── Azure Speech, for the natural cloud voice ─────────────────────────────────────────────────
#
# POST /assistant/v1/speak reads AZURE_SPEECH_REGION and AZURE_SPEECH_KEY (apps/assistant-api/src/
# lib/speech.ts): both present means the cloud voice is configured, either missing means the routes
# answer speech-not-configured and the panel falls back to the browser's robotic voice — the exact
# fault this provisioning path exists to end. It is a separate Azure resource from the OpenAI pair
# above, so it gets its own region and key.
#
# Both are optional HERE so an operator configuring only the language model can skip them (leave the
# region blank), but a half-entered pair is refused: a region with no key, or a key with no region,
# would write a credential that can never work and silently leave the voice robotic. Skipping leaves
# any AZURE_SPEECH_ lines already in the file exactly as they were.
#
# The region is not a secret — it is the resource's own location and appears in no response — so it
# is typed with echo on, like the endpoint. The key is typed with echo off (`read -s`), like the
# OpenAI key. `|| true` keeps `read` from tripping `set -e` when stdin ends at the optional prompt.
#
# Since 24 September 2026 the service uses the cloud voice only in southafricanorth — the region the
# Watchful DPIA assessed — and treats any other region as no region at all (speech.ts
# SPEECH_REGIONS). The script still writes what it is given, so that it stays a credential writer
# and not a second policy, but says so before the key is typed; it never echoes the region back.
printf 'Azure Speech region (AZURE_SPEECH_REGION; only southafricanorth is used) [blank to skip]: '
read -r speech_region || true
speech_region=$(printf '%s' "$speech_region" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
speech_key=""
if [ -n "$speech_region" ]; then
  printf '%s' "$speech_region" | grep -qE '^[a-z0-9-]{3,64}$' \
    || fail "A Speech region is lowercase letters, digits and hyphens (e.g. southafricanorth). Nothing was written."
  [ "$speech_region" = "southafricanorth" ] \
    || printf 'That is not southafricanorth. It will be written, but the service will treat the cloud voice as not configured and send no audio to it.\n'
  printf 'Azure Speech key (AZURE_SPEECH_KEY, input hidden): '
  read -rs speech_key || true
  printf '\n'
  [ -n "$speech_key" ] || fail "A Speech region was given but the Speech key was empty — that pair could never work. Nothing was written."
  # The same shape the service accepts (apps/assistant-api/src/lib/speech.ts PLAUSIBLE_SPEECH_KEY):
  # letters and digits, 32 to 128 of them. A key the script writes and the service then refuses is a
  # voice that is silently off, which is what production had until 24 September 2026.
  if printf '%s' "$speech_key" | grep -qvE '^[A-Za-z0-9]{32,128}$'; then
    fail "That does not look like an Azure Speech key (unexpected characters or length). Nothing was written — and if what was pasted really was a key, it is now in this shell's memory only, which dies with it."
  fi
fi

# ── OpenAI Whisper (hosted) and Alibaba Qwen: the other two built speech providers ─────────────
#
# Added 28 September 2026. apps/assistant-api/src/lib/providers holds an adapter for each, built and
# configured nowhere. Both sections are optional here exactly as Azure Speech is — blank to skip —
# and a skipped section leaves any OPENAI_ or DASHSCOPE_ lines already in the file exactly as they
# were, so a run that refreshes one credential cannot drop another. Each key is typed with echo off
# and never echoed, argued or logged; each gets a fingerprint for the register and nothing else.
#
# This script writes credentials only. WHICH provider the service listens or speaks through is
# MYTHUSO_STT_PROVIDER and MYTHUSO_TTS_PROVIDER (card ids from packages/catalog/api-registry.json),
# written by hand — deploy/RUNBOOK.md, "Choosing a speech provider" — for the same reason the
# acknowledgement line is: where a patient's voice goes is a decision, not a side effect of typing a
# key. And in production the service refuses either of these providers for patient audio while
# docs/governance/DATA-RESIDENCY-OPTIONS.md §7 is unsigned: neither has a South African region. It
# says so at start-up, in the registry's words, and carries on with Azure Speech. Configuring one
# here does not change that, and there is no line that would.
printf 'OpenAI API key for hosted Whisper (OPENAI_API_KEY, input hidden) [blank to skip]: '
read -rs openai_key || true
printf '\n'
openai_model=""
if [ -n "$openai_key" ]; then
  # The service accepts a bearer key of printable characters with no whitespace, 20 to 256 of them
  # (providers/seam.ts PLAUSIBLE_BEARER_KEY); the same window here, so a key the script writes is a
  # key the service will read as configured.
  if printf '%s' "$openai_key" | grep -qvE '^[A-Za-z0-9._-]{20,256}$'; then
    fail "That does not look like an OpenAI key (unexpected characters or length). Nothing was written — and if what was pasted really was a key, it is now in this shell's memory only, which dies with it."
  fi
  printf 'Transcription model (OPENAI_TRANSCRIBE_MODEL) [whisper-1]: '
  read -r openai_model || true
  openai_model=$(printf '%s' "$openai_model" | tr -d '[:space:]')
  openai_model=${openai_model:-whisper-1}
  printf '%s' "$openai_model" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' \
    || fail "A model name is letters, digits, dots, hyphens and underscores. Nothing was written."
fi

printf 'DashScope region for Alibaba Qwen (DASHSCOPE_REGION; singapore or beijing) [blank to skip]: '
read -r dashscope_region || true
dashscope_region=$(printf '%s' "$dashscope_region" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
dashscope_key=""
if [ -n "$dashscope_region" ]; then
  case "$dashscope_region" in
    singapore|beijing) : ;;
    *) fail "DashScope serves from singapore or beijing and nowhere else; the service reads no other region. Nothing was written." ;;
  esac
  printf 'DashScope API key (DASHSCOPE_API_KEY, input hidden): '
  read -rs dashscope_key || true
  printf '\n'
  [ -n "$dashscope_key" ] || fail "A DashScope region was given but the key was empty — that pair could never work. Nothing was written."
  if printf '%s' "$dashscope_key" | grep -qvE '^[A-Za-z0-9._-]{20,256}$'; then
    fail "That does not look like a DashScope key (unexpected characters or length). Nothing was written — and if what was pasted really was a key, it is now in this shell's memory only, which dies with it."
  fi
fi

# ── The fingerprint: how two people compare keys without disclosing them ───────────────────────
#
# Sixteen characters of the key's SHA-256, the same ceremony /etc/mythuso/key.fingerprint uses for
# the identity service's keys. printf is a shell builtin, so the key is piped from the shell's own
# memory and never appears in a process argument or a `ps` listing. shasum is the fallback because
# macOS has no sha256sum; the server does, and the digest is the same either way.
fingerprint=$(printf '%s' "$key" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)
# The Speech key gets the same treatment when one was entered: a fingerprint for the register, the
# value nowhere. Empty when the operator skipped Speech, so the summary below can say so honestly.
speech_fingerprint=""
if [ -n "$speech_key" ]; then
  speech_fingerprint=$(printf '%s' "$speech_key" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)
fi
# And the two hosted speech keys, the same way, when they were entered.
openai_fingerprint=""
if [ -n "$openai_key" ]; then
  openai_fingerprint=$(printf '%s' "$openai_key" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)
fi
dashscope_fingerprint=""
if [ -n "$dashscope_key" ]; then
  dashscope_fingerprint=$(printf '%s' "$dashscope_key" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -c1-16)
fi

# ── Write it, atomically ───────────────────────────────────────────────────────────────────────
#
# The new file is assembled beside the old one and moved over it only at the end, so any failure
# above — and any interruption — leaves the previous configuration exactly as it was. mktemp under
# umask 077 gives 0600 before the key is ever written into it.
mkdir -p "$(dirname "$ENV_FILE")"
tmp=$(mktemp "${ENV_FILE}.new.XXXXXX")
trap 'rm -f "$tmp"' EXIT

# Preserve anything else an operator put in this file by hand — QDRANT_URL, an OLLAMA_MODEL, the
# MYTHUSO_STT_PROVIDER and MYTHUSO_TTS_PROVIDER selection lines — and replace only the lines this
# script owns. When a Speech credential is being written its old lines go too; when Speech is skipped
# any AZURE_SPEECH_ lines already here are left untouched, so a run that only refreshes the OpenAI
# pair cannot silently drop a working voice; the OPENAI_ and DASHSCOPE_ lines are kept or replaced by
# the same rule, section by section. A script that dropped the rest of the file would be the BidZA
# .env lesson learned again: the server's configuration is the server's.
if [ -f "$ENV_FILE" ]; then
  owned='^AZURE_OPENAI_'
  [ -n "$speech_key" ] && owned="$owned|^AZURE_SPEECH_"
  [ -n "$openai_key" ] && owned="$owned|^OPENAI_"
  [ -n "$dashscope_key" ] && owned="$owned|^DASHSCOPE_"
  grep -vE "$owned" "$ENV_FILE" > "$tmp" || true
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
# The Speech pair, only when it was entered — appended after the OpenAI lines so the file reads in the
# order the service was configured: the language model first, then the voice it speaks with.
if [ -n "$speech_key" ]; then
  printf 'AZURE_SPEECH_REGION=%s\nAZURE_SPEECH_KEY=%s\n' \
    "$speech_region" "$speech_key" >> "$tmp"
fi
# The two hosted speech providers, each only when it was entered, after the voice they stand beside.
if [ -n "$openai_key" ]; then
  printf 'OPENAI_API_KEY=%s\nOPENAI_TRANSCRIBE_MODEL=%s\n' \
    "$openai_key" "$openai_model" >> "$tmp"
fi
if [ -n "$dashscope_key" ]; then
  printf 'DASHSCOPE_REGION=%s\nDASHSCOPE_API_KEY=%s\n' \
    "$dashscope_region" "$dashscope_key" >> "$tmp"
fi

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
say "Wrote $ENV_FILE — 0600 root:root, the Azure credentials and nothing else beside them."
say "OpenAI key fingerprint: $fingerprint (sixteen characters that identify the key without"
say "disclosing it — the thing to write in the register, not the key itself)."
if [ -n "$speech_fingerprint" ]; then
  say "Speech region: $speech_region"
  say "Speech key fingerprint: $speech_fingerprint — the same discipline: the register records the"
  say "fingerprint, never the key."
  if [ "$speech_region" = "southafricanorth" ]; then
    say "The cloud voice is now configured; /assistant/health answers \"speech\":true once the"
    say "service restarts."
  else
    say "That region is not southafricanorth, so the service will treat the cloud voice as not"
    say "configured and /assistant/health will answer \"speech\":false. Re-run with southafricanorth."
  fi
else
  say "No Azure Speech credential was entered, so the cloud voice stays unconfigured and the panel"
  say "keeps the browser's own voice. Re-run and enter a region and key to switch the natural voice on."
fi
if [ -n "$openai_fingerprint" ]; then
  say "OpenAI Whisper key fingerprint: $openai_fingerprint (model $openai_model). The service reads it"
  say "only where MYTHUSO_STT_PROVIDER=openai-whisper is in $ENV_FILE, written by hand; and in"
  say "production it refuses that selection for patient audio until the residency decision is"
  say "signed (docs/governance/DATA-RESIDENCY-OPTIONS.md §7), carrying on with Azure Speech."
fi
if [ -n "$dashscope_fingerprint" ]; then
  say "DashScope region: $dashscope_region"
  say "DashScope key fingerprint: $dashscope_fingerprint. The service reads it only where"
  say "MYTHUSO_STT_PROVIDER=alibaba-qwen-asr or MYTHUSO_TTS_PROVIDER=alibaba-qwen-tts is in"
  say "$ENV_FILE, written by hand; and in production it refuses either for patient audio until the"
  say "residency decision is signed (docs/governance/DATA-RESIDENCY-OPTIONS.md §7)."
fi
unset endpoint key model fingerprint speech_region speech_key speech_fingerprint \
  openai_key openai_model openai_fingerprint dashscope_region dashscope_key dashscope_fingerprint
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
say "  curl -s http://127.0.0.1:8791/assistant/health        # expect \"azure\":true, \"activated\":true, \"speech\":true"
say "  curl -s https://mythuso.co.za/assistant/health        # the same, through nginx"
say ""
say "If the service will not be enabled, the file can wait: the unit reads it only at start."
