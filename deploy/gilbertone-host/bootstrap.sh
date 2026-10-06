#!/usr/bin/env bash
# First boot of the GilbertOne host — the dedicated server the assistant's own model runs on.
#
# Run once, as root (or with sudo), ON THE NEW SERVER, from a copy of this file:
#
#   sudo bash bootstrap.sh
#
# WHY A SEPARATE HOST. docs/ROADMAP.md puts Ollama, Qdrant, Whisper, Piper and Medplum on "a new,
# isolated server of their own. Never liqzar-server", and docs/governance/DATA-RESIDENCY-OPTIONS.md
# §2 says why: five unrelated sites share root there. This script is the first step of that server
# and nothing more. It hardens the box, installs Ollama bound to loopback, pulls one pinned Qwen
# model, and measures how fast it answers on this CPU. It does not install the assistant service,
# does not open a public port, and does not carry patient data — moving the chat tier here is a
# production change, done later and by hand, once the residency decision is signed.
#
# WHAT IT REFUSES. It stops if it finds a co-tenant's nginx site (it is not on liqzar-server), if
# the OS is not Ubuntu, and it never turns off SSH password login unless a key is already
# installed for the account you logged in with — a hardening step that locks its operator out is
# worse than the gap it closed.
set -euo pipefail

# The model this host serves. One tag, pinned: a moving tag is a model that changes under the same
# name, and every answer's audit line must be able to say which model wrote it.
QWEN_MODEL="${QWEN_MODEL:-qwen3:8b}"
# The Node floor the assistant runtime is built for (package.json "engines").
NODE_MAJOR_FLOOR=22

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run this as root: sudo bash bootstrap.sh"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "this host is ${PRETTY_NAME:-unknown}; the script is written for Ubuntu."

# Not liqzar-server, and not any box that already serves somebody else's site.
for neighbour in agcafrica artisanza bidza liqzar skillsonwheels; do
  if ls /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -qi "$neighbour"; then
    die "this machine serves ${neighbour}. The GilbertOne host must hold MyThuso alone (DATA-RESIDENCY-OPTIONS.md, R1)."
  fi
done

say "System updates and automatic security patches"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq unattended-upgrades ufw fail2ban curl ca-certificates jq zstd
dpkg-reconfigure -f noninteractive unattended-upgrades

say "Firewall: SSH in, nothing else"
# The model port is never opened. Anything that needs the model reaches it on loopback, or later
# through a tunnel bound to that tunnel alone — never plain HTTP across the internet.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

say "SSH: root login and passwords, only where it is safe"
login_user="${SUDO_USER:-root}"
login_home="$(getent passwd "$login_user" | cut -d: -f6)"
# Logged in as root itself: closing root would close the only door.
root_rule="no"; [ "$login_user" = "root" ] && root_rule="prohibit-password"
mkdir -p /etc/ssh/sshd_config.d
if [ -s "${login_home}/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/10-mythuso.conf <<EOF
PermitRootLogin ${root_rule}
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
  echo "Key found for ${login_user}: root login and password login are now off."
else
  cat > /etc/ssh/sshd_config.d/10-mythuso.conf <<EOF
PermitRootLogin ${root_rule}
EOF
  echo "WARNING: no SSH key installed for ${login_user}, so password login stays ON."
  echo "         Add a key (ssh-copy-id from your own machine), then run this script again."
fi
sshd -t || { rm -f /etc/ssh/sshd_config.d/10-mythuso.conf; die "the SSH settings did not validate; removed them and left SSH as it was."; }
systemctl reload ssh 2>/dev/null || systemctl reload sshd
systemctl enable --now fail2ban

say "Node.js for the assistant runtime"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR_FLOOR" ]; then
  apt-get install -yq nodejs || true
fi
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR_FLOOR" ]; then
  echo "Node $(node --version)"
else
  echo "WARNING: Ubuntu's Node is older than ${NODE_MAJOR_FLOOR}. Not needed yet; needed before the assistant moves here."
fi

say "Ollama, bound to loopback"
if ! command -v ollama >/dev/null; then
  # Downloaded to a file rather than piped into a shell, so what ran is what can be read afterwards.
  curl -fsSL https://ollama.com/install.sh -o /root/ollama-install.sh
  sh /root/ollama-install.sh
fi
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/10-mythuso.conf <<'EOF'
[Service]
# Loopback only: the firewall would refuse it anyway, and two locks are the point.
Environment=OLLAMA_HOST=127.0.0.1:11434
# One answer at a time uses the CPU well; a second would halve both.
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_KEEP_ALIVE=24h
EOF
systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:11434/api/version || die "Ollama did not come up on 127.0.0.1:11434."

say "Pulling ${QWEN_MODEL}"
ollama pull "$QWEN_MODEL"
digest="$(curl -fsS http://127.0.0.1:11434/api/tags | jq -r --arg m "$QWEN_MODEL" '.models[] | select(.name==$m) | .digest')"

say "Measuring speed on this CPU"
# A short, harmless, non-clinical prompt. The number that matters is tokens per second while
# answering, measured here rather than assumed.
result="$(curl -fsS http://127.0.0.1:11434/api/generate -d "$(jq -n --arg m "$QWEN_MODEL" \
  '{model:$m, stream:false, prompt:"In two sentences, explain why drinking water matters on a hot day.", options:{num_ctx:4096}}')")"
tps="$(printf '%s' "$result" | jq -r '(.eval_count / (.eval_duration / 1e9)) * 100 | floor / 100')"
load_s="$(printf '%s' "$result" | jq -r '(.load_duration / 1e9) * 10 | floor / 10')"

mkdir -p /etc/mythuso
cat > /etc/mythuso/gilbertone-host.txt <<EOF
role: GilbertOne model host (no patient data; assistant not installed)
bootstrapped: $(date -u +%Y-%m-%dT%H:%M:%SZ)
os: ${PRETTY_NAME}
cpus: $(nproc)
memory: $(free -g | awk '/^Mem:/ {print $2}') GB
model: ${QWEN_MODEL}
model digest: ${digest}
speed: ${tps} tokens/second (first load ${load_s}s)
nested virtualisation (needed for Lima): $( [ -e /dev/kvm ] && echo available || echo not available )
EOF

say "Done"
cat /etc/mythuso/gilbertone-host.txt
echo
echo "Send the block above back in the thread. Nothing here is public: the model answers on"
echo "127.0.0.1 only, and the firewall allows SSH alone."
