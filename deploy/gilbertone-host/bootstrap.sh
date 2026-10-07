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
# and nothing more. It hardens the box, then builds ONE container ("gilbertone") on the 1 TB data
# disk that holds everything GilbertOne will run, starting with Ollama and the pinned Qwen models,
# and measures how fast they answer. It does not install the assistant service, does not open a
# public port, and does not carry patient data — moving the chat tier here is a production change,
# done later and by hand, once the residency decision is signed.
#
# WHAT IT REFUSES. It stops if it finds a co-tenant's nginx site (it is not on liqzar-server), if
# the OS is not Ubuntu, and it never turns off SSH password login unless a key is already
# installed for the account you logged in with — a hardening step that locks its operator out is
# worse than the gap it closed.
set -euo pipefail

# The models this host is measured with. Tags with a size in them, never a bare "latest": a moving
# tag is a model that changes under the same name, and every answer's audit line must be able to
# say which model wrote it. Both are Apache-2.0 (read on their Hugging Face cards, 6 October 2026).
#   qwen3.8:27b              — the newest Qwen, dense, 27B, ~18 GB. The founder asked for the latest.
#   qwen3.6:35b-a3b-q4_K_M   — mixture-of-experts, 35B total but 3B active per word, ~24 GB. On a
#                              CPU with no GPU it is expected to answer several times faster.
# Both are pulled and timed; which one serves is chosen from the measured speed, not assumed.
QWEN_MODELS="${QWEN_MODELS:-qwen3.8:27b qwen3.6:35b-a3b-q4_K_M}"
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

say "The 1 TB data disk, for models and later the search index"
# The order added a 1 TB SSD beside the 500 GB system disk. Models and indexes live there so the
# system disk keeps room for the OS and its logs. A disk is formatted ONLY when it is blank — no
# partitions, no filesystem signature, not mounted — and only when exactly one such disk of at
# least 900 GB exists. Anything else is reported and left alone: wiping the wrong disk is the one
# mistake this script cannot take back. GILBERTONE_DISK=/dev/xxx names the disk explicitly.
DATA_MOUNT=/srv/gilbertone
data_disk="${GILBERTONE_DISK:-}"
if mountpoint -q "$DATA_MOUNT"; then
  echo "Already mounted: $(findmnt -no SOURCE "$DATA_MOUNT") on ${DATA_MOUNT}."
else
  if [ -z "$data_disk" ]; then
    labelled="$(blkid -L gilbertone-data 2>/dev/null || true)"
    if [ -n "$labelled" ]; then
      data_disk="$labelled"
    else
      blank=""
      while read -r name size type; do
        [ "$type" = "disk" ] || continue
        [ "$size" -ge 900000000000 ] || continue
        [ "$(lsblk -no NAME "$name" | wc -l)" -eq 1 ] || continue   # has partitions
        [ -z "$(lsblk -no MOUNTPOINTS "$name" | tr -d '[:space:]')" ] || continue
        [ -z "$(wipefs -n "$name" 2>/dev/null | tail -n +2)" ] || continue   # has a signature
        blank="${blank}${name} "
      done < <(lsblk -dbpno NAME,SIZE,TYPE)
      set -- $blank
      if [ "$#" -eq 1 ]; then data_disk="$1"; fi
      if [ "$#" -gt 1 ]; then
        echo "WARNING: more than one blank large disk (${blank}). Name one with GILBERTONE_DISK=/dev/... and run again."
      fi
    fi
  fi
  if [ -n "$data_disk" ]; then
    if [ -z "$(blkid -o value -s TYPE "$data_disk" 2>/dev/null)" ]; then
      [ -z "$(wipefs -n "$data_disk" 2>/dev/null | tail -n +2)" ] || die "${data_disk} is not blank. Nothing was formatted."
      echo "Formatting blank disk ${data_disk} ($(lsblk -dno SIZE "$data_disk")) as ext4, label gilbertone-data."
      mkfs.ext4 -q -L gilbertone-data "$data_disk"
    fi
    mkdir -p "$DATA_MOUNT"
    uuid="$(blkid -o value -s UUID "$data_disk")"
    grep -q "$uuid" /etc/fstab || echo "UUID=${uuid} ${DATA_MOUNT} ext4 defaults,noatime,nofail 0 2" >> /etc/fstab
    systemctl daemon-reload
    mount "$DATA_MOUNT"
    echo "Mounted ${data_disk} on ${DATA_MOUNT}: $(df -h --output=avail "$DATA_MOUNT" | tail -1 | tr -d ' ') free."
  else
    echo "WARNING: no separate blank 1 TB disk found, so models go on the system disk."
    echo "         If the host added the 1 TB to the system disk instead, lsblk below shows it;"
    echo "         send that back and the partition can be grown by hand."
    lsblk
  fi
fi

say "The container: Qwen and GilbertOne in one box of their own"
# Everything GilbertOne runs lives in ONE Incus system container named "gilbertone": the model,
# later the assistant service, its search index and its database. Nothing of it is installed on the
# host itself, so it cannot mix with anything else this server ever carries, and the whole of it can
# be capped, snapshotted, backed up or deleted as one thing. A system container rather than a VM
# because it needs no nested virtualisation (which this VPS may not offer) and costs no RAM of its
# own; rather than Docker because one box holding a full Ubuntu with systemd is what "one container
# for Qwen and GilbertOne" means, and the services inside keep talking to each other over loopback.
#
# The container is capped below the host so the host can always be reached and patched: 10 of the
# 12 CPUs and 40 GB of the 48. Its disk is a storage pool on the 1 TB data disk when it is mounted.
# It has outbound network for updates and model downloads, and NO inbound port: nothing on the
# internet reaches it until a later, deliberate change maps one through nginx on this host.
BOX=gilbertone
BOX_IMAGE="${BOX_IMAGE:-images:ubuntu/24.04}"
BOX_CPUS="${BOX_CPUS:-10}"
BOX_MEMORY="${BOX_MEMORY:-40GiB}"
apt-get install -yq incus
if mountpoint -q "$DATA_MOUNT"; then pool_dir="${DATA_MOUNT}/incus"; else pool_dir=""; fi
if ! incus storage show gilbertone >/dev/null 2>&1; then
  if [ -n "$pool_dir" ]; then mkdir -p "$pool_dir"; pool_config="source: ${pool_dir}"; else pool_config="{}"; fi
  incus admin init --preseed <<EOF
networks:
- name: incusbr0
  type: bridge
  config:
    ipv4.address: auto
    ipv4.nat: "true"
    ipv6.address: none
storage_pools:
- name: gilbertone
  driver: dir
  config: ${pool_config}
profiles:
- name: default
  devices:
    root: {path: /, pool: gilbertone, type: disk}
    eth0: {name: eth0, network: incusbr0, type: nic}
EOF
fi
# ufw's "deny incoming" also blocks the container's DHCP and DNS from the host and its forwarded
# traffic out. These rules open the bridge to the host and outward only; the internet still has no
# way in.
ufw allow in on incusbr0
ufw route allow in on incusbr0
ufw route allow out on incusbr0
if ! incus info "$BOX" >/dev/null 2>&1; then
  incus launch "$BOX_IMAGE" "$BOX" -c limits.cpu="$BOX_CPUS" -c limits.memory="$BOX_MEMORY" \
    -c security.nesting=false -c boot.autostart=true
fi
in_box() { incus exec "$BOX" -- "$@"; }
for _ in $(seq 1 60); do in_box getent hosts ollama.com >/dev/null 2>&1 && break; sleep 2; done
in_box getent hosts ollama.com >/dev/null || die "the container has no network. Check: incus list; ufw status."
in_box env DEBIAN_FRONTEND=noninteractive apt-get update -q
in_box env DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq
in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq unattended-upgrades curl ca-certificates jq zstd

say "Ollama inside the container, bound to its loopback"
if ! in_box sh -c 'command -v ollama' >/dev/null; then
  # Downloaded to a file rather than piped into a shell, so what ran is what can be read afterwards.
  in_box curl -fsSL https://ollama.com/install.sh -o /root/ollama-install.sh
  in_box sh /root/ollama-install.sh
fi
in_box mkdir -p /etc/systemd/system/ollama.service.d
in_box sh -c 'cat > /etc/systemd/system/ollama.service.d/10-mythuso.conf' <<'EOF'
[Service]
# Loopback of the container only: GilbertOne's service will sit beside it in the same box.
Environment=OLLAMA_HOST=127.0.0.1:11434
# One answer at a time uses the CPU well; a second would halve both.
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_KEEP_ALIVE=24h
EOF
in_box systemctl daemon-reload
in_box systemctl enable --now ollama
in_box systemctl restart ollama
for _ in $(seq 1 30); do in_box curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 1; done
in_box curl -fsS http://127.0.0.1:11434/api/version || die "Ollama did not come up inside the container."

say "Node.js inside the container, for the assistant runtime later"
in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq nodejs || true
box_node="$(in_box sh -c 'command -v node >/dev/null && node --version' || echo none)"
echo "Node in the container: ${box_node} (the assistant runtime needs ${NODE_MAJOR_FLOOR} or newer before it moves here)."

say "Pulling and timing: ${QWEN_MODELS}"
# A short, harmless, non-clinical prompt, with thinking off so the figure is the speed of an answer
# rather than of a hidden reasoning trace. Tokens per second while answering is what a patient waits
# on; it is measured here, inside the container's CPU cap, rather than taken from a benchmark.
measured=""
for model in $QWEN_MODELS; do
  in_box ollama pull "$model"
  digest="$(in_box curl -fsS http://127.0.0.1:11434/api/tags | jq -r --arg m "$model" '.models[] | select(.name==$m) | .digest')"
  body="$(jq -nc --arg m "$model" \
    '{model:$m, stream:false, think:false, prompt:"In two sentences, explain why drinking water matters on a hot day.", options:{num_ctx:4096}}')"
  result="$(in_box curl -fsS --max-time 900 http://127.0.0.1:11434/api/generate -d "$body")" || result='{}'
  tps="$(printf '%s' "$result" | jq -r 'if .eval_count then ((.eval_count / (.eval_duration / 1e9)) * 100 | floor / 100) else "failed" end')"
  load_s="$(printf '%s' "$result" | jq -r 'if .load_duration then ((.load_duration / 1e9) * 10 | floor / 10) else "-" end')"
  measured="${measured}model: ${model}
  digest: ${digest}
  speed: ${tps} tokens/second (first load ${load_s}s)
"
done

mkdir -p /etc/mythuso
cat > /etc/mythuso/gilbertone-host.txt <<EOF
role: GilbertOne host (no patient data; assistant not installed)
bootstrapped: $(date -u +%Y-%m-%dT%H:%M:%SZ)
os: ${PRETTY_NAME}
cpus: $(nproc)
memory: $(free -g | awk '/^Mem:/ {print $2}') GB
container: ${BOX} ($(incus list "$BOX" -c s -f csv)), ${BOX_CPUS} CPUs, ${BOX_MEMORY}, node ${box_node}
container disk: ${pool_dir:-system disk} ($(df -h --output=avail "${pool_dir:-/var/lib/incus}" | tail -1 | tr -d ' ') free)
${measured}nested virtualisation (needed for Lima): $( [ -e /dev/kvm ] && echo available || echo not available )
EOF

say "Done"
cat /etc/mythuso/gilbertone-host.txt
echo
echo "Send the block above back in the thread. Nothing here is public: the model answers on the"
echo "container's own 127.0.0.1, the container has no inbound port, and the firewall allows SSH alone."
echo "To get a shell inside the box: sudo incus exec ${BOX} -- bash"
