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
# Measured on this server on 8 October 2026, each alone with 10 threads and thinking off: the
# mixture-of-experts answered at 8.9 tokens/second, the dense 27B at 1.3, too slow to chat with. Only
# the one that serves is pulled now; QWEN_MODELS="qwen3.8:27b qwen3.6:35b-a3b-q4_K_M" times both again.
QWEN_MODELS="${QWEN_MODELS:-qwen3.6:35b-a3b-q4_K_M}"
# The one GilbertOne serves, chosen by the founder on 8 October 2026; gilbertone-qwen is built from it.
SERVE_MODEL="${SERVE_MODEL:-qwen3.6:35b-a3b-q4_K_M}"
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
# Incus from Zabbly's stable repository, its maintainers' own build, rather than the distribution's.
# Ubuntu 26.04's Incus 6.0.5 lets the container's AppArmor profile deny signals from a process inside
# the container to its own children (Ollama to its model runner): models cannot be unloaded and the
# service falls into a restart loop. That was the second run on 8 October 2026. The distribution's
# package is kept only where Zabbly publishes nothing for this release, and the script says so.
codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
if curl -fsS -o /dev/null "https://pkgs.zabbly.com/incus/stable/dists/${codename}/Release"; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://pkgs.zabbly.com/key.asc -o /etc/apt/keyrings/zabbly.asc
  cat > /etc/apt/sources.list.d/zabbly-incus-stable.sources <<EOF
Enabled: yes
Types: deb
URIs: https://pkgs.zabbly.com/incus/stable
Suites: ${codename}
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/zabbly.asc
EOF
  apt-get update -q
else
  printf '\nWARNING: Zabbly publishes no Incus for %s; using the distribution package, which may deny signals inside the container.\n' "$codename"
fi
# Stop the container before the package changes under it. A container still running from the old
# Incus has stop hooks that point at files the upgrade removes, so the restart below then stops it and
# never starts it again (the 6.0.5 to 7.5.1 upgrade on 8 October 2026). A fresh server has no container.
restart_after_upgrade=""
if command -v incus >/dev/null && apt-get install -s incus 2>/dev/null | grep -q '^Inst incus ' \
   && [ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ]; then
  incus stop "$BOX"
  restart_after_upgrade=yes
fi
apt-get install -yq incus
[ -z "$restart_after_upgrade" ] || incus start "$BOX"
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
# Two slots, so each of a GilbertOne turn's prompts keeps its own already-read copy. A turn calls the
# model in turn, never at once: the entity pre-read on its short prompt, then the tool loop and the
# answer on the long one (about 2,600 tokens of rules and tools). With one slot the pre-read evicted
# the long prompt every turn and it was read again from scratch, about 40 seconds on this CPU
# (measured 8 October 2026). Two answers at once would still halve each other's speed.
Environment=OLLAMA_NUM_PARALLEL=2
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_KEEP_ALIVE=24h
EOF
in_box systemctl daemon-reload
in_box systemctl enable ollama
# Restart the whole container, not the service. The installer starts Ollama from `incus exec`, which
# runs under a different AppArmor label from the container's own systemd, and the profile denies
# signals across the two: `systemctl restart ollama` then cannot stop the first copy, which keeps the
# port without these settings while the service fails "address already in use" every 3 seconds. That
# is what the first run on the server did on 8 October 2026. A container restart clears every process
# in it and lets systemd start Ollama with the drop-in above.
incus restart "$BOX"
for _ in $(seq 1 60); do in_box curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 2; done
in_box curl -fsS http://127.0.0.1:11434/api/version || die "Ollama did not come up inside the container."
serving="$(in_box pgrep -fc 'ollama serve' || true)"
[ "$serving" = "1" ] || die "expected one 'ollama serve' in the container, found ${serving:-0}. Check: sudo incus exec ${BOX} -- ps aux"
in_box systemctl is-active --quiet ollama || die "Ollama answers, but not as the systemd service. Check: sudo incus exec ${BOX} -- systemctl status ollama"

say "Node.js ${NODE_MAJOR_FLOOR} inside the container, for the assistant runtime later"
# Ubuntu's own nodejs is 18, below what the assistant runtime needs, so the NodeSource repository for
# the floor version is added instead. Its setup script is saved to a file before it runs, as Ollama's is.
box_node_major() { in_box sh -c 'node --version 2>/dev/null | sed -E "s/^v([0-9]+).*/\\1/"' || true; }
major="$(box_node_major)"
if [ "${major:-0}" -lt "$NODE_MAJOR_FLOOR" ]; then
  in_box curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_FLOOR}.x" -o /root/nodesource-setup.sh
  in_box bash /root/nodesource-setup.sh
  in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq nodejs
  major="$(box_node_major)"
fi
box_node="$(in_box node --version 2>/dev/null || echo none)"
[ "${major:-0}" -ge "$NODE_MAJOR_FLOOR" ] || die "Node in the container is ${box_node}; the assistant runtime needs ${NODE_MAJOR_FLOOR} or newer."
echo "Node in the container: ${box_node}"

say "Pulling and timing: ${QWEN_MODELS}"
# A short, harmless, non-clinical prompt, with thinking off so the figure is the speed of an answer
# rather than of a hidden reasoning trace. Tokens per second while answering is what a patient waits
# on; it is measured here, inside the container's CPU cap, rather than taken from a benchmark.
# num_thread is the container's CPU count: llama.cpp otherwise sees the host's 12 cores and starts a
# thread for each, and more threads than cores stalls it (0.2 tokens/second on the first run). Each
# model is unloaded before the next loads, because two of them do not fit in the container's memory
# together and the second is killed for it (the first run's "failed").
unload_all() {
  for loaded in $(in_box curl -fsS http://127.0.0.1:11434/api/ps | jq -r '.models[].name'); do
    in_box curl -fsS http://127.0.0.1:11434/api/generate -d "$(jq -nc --arg m "$loaded" '{model:$m, keep_alive:0}')" >/dev/null || true
  done
  for _ in $(seq 1 60); do
    [ "$(in_box curl -fsS http://127.0.0.1:11434/api/ps | jq '.models | length')" = "0" ] && return 0
    sleep 2
  done
  die "a model would not unload. Check: sudo incus exec ${BOX} -- ollama ps"
}
measured=""
for model in $QWEN_MODELS; do
  in_box ollama pull "$model"
  unload_all
  digest="$(in_box curl -fsS http://127.0.0.1:11434/api/tags | jq -r --arg m "$model" '.models[] | select(.name==$m) | .digest')"
  body="$(jq -nc --arg m "$model" --argjson t "$BOX_CPUS" \
    '{model:$m, stream:false, think:false, prompt:"In two sentences, explain why drinking water matters on a hot day.", options:{num_ctx:4096, num_thread:$t}}')"
  result="$(in_box curl -fsS --max-time 900 http://127.0.0.1:11434/api/generate -d "$body")" || result='{}'
  tps="$(printf '%s' "$result" | jq -r 'if .eval_count then ((.eval_count / (.eval_duration / 1e9)) * 100 | floor / 100) else "failed" end')"
  load_s="$(printf '%s' "$result" | jq -r 'if .load_duration then ((.load_duration / 1e9) * 10 | floor / 10) else "-" end')"
  measured="${measured}model: ${model}
  digest: ${digest}
  speed: ${tps} tokens/second (first load ${load_s}s)
"
done
unload_all
# Models this script no longer names are removed, so a model dropped on a measured decision does not
# sit on the disk (qwen3.8:27b, dropped by the founder on 8 October 2026 for answering at 1.3 tokens a
# second). Naming it in QWEN_MODELS again brings it back. Only Qwen tags are considered: Ollama keeps
# its own converted copy of a model under a "llamacpp:" name, and that copy is the model that serves.
for pulled in $(in_box curl -fsS http://127.0.0.1:11434/api/tags | jq -r '.models[].name | select(startswith("qwen"))'); do
  case " $QWEN_MODELS " in *" $pulled "*) ;; *) echo "Removing ${pulled}, which QWEN_MODELS no longer names."; in_box ollama rm "$pulled" ;; esac
done

# GilbertOne calls the model through Ollama's OpenAI-compatible /v1, which ignores per-request
# `options`, so the thread count timed above never reached it: Ollama's own default of 12 threads on
# a 10-CPU container stalled Qwen at 0.12 tokens a second (8 October 2026). The settings are baked
# into a model of its own instead, gilbertone-qwen, which shares the served model's files and costs
# no disk. OLLAMA_MODEL=gilbertone-qwen is what the assistant service is pointed at when it moves here.
# The window is 8192, not the 4096 timed above: the rules and tools alone are about 2,600 tokens, and
# the tool results and a conversation's history go on top of them.
say "gilbertone-qwen: ${SERVE_MODEL} with ${BOX_CPUS} threads and an 8192-token window"
case " $QWEN_MODELS " in *" $SERVE_MODEL "*) ;; *) die "SERVE_MODEL ${SERVE_MODEL} is not one of QWEN_MODELS." ;; esac
printf 'FROM %s\nPARAMETER num_thread %s\nPARAMETER num_ctx 8192\n' "$SERVE_MODEL" "$BOX_CPUS" \
  | in_box sh -c 'cat > /root/gilbertone-qwen.Modelfile'
in_box ollama create gilbertone-qwen -f /root/gilbertone-qwen.Modelfile

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
