#!/usr/bin/env bash
# Publish the MyThuso landing page and app preview to a server.
#
# Adds only: /var/www/mythuso, one nginx site file, /opt/mythuso/ops (the scheduled jobs),
# /opt/mythuso/releases (the published trees, of which /var/www/mythuso is a symlink to one),
# /opt/mythuso/assistant (the assistant runtime — one self-contained JavaScript file, built by
# scripts/build-assistant.mjs, no node_modules and nothing installed on the box), and (optionally)
# the identity service under /opt/mythuso. It never edits another site's
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
# What nginx's `root` names, and since the atomic publish below it is a symlink to the release that
# is live rather than a directory of files. nginx resolves it per request, so deploy/nginx/mythuso.conf
# needed no change for this and still says `root /var/www/mythuso` — which is the point: a migration
# that also has to edit and reload the site file on a box serving five other people's websites has
# two things to get wrong at once instead of one.
#
# The releases themselves live outside the web root, for the same reason $ASSISTANT does. Under
# $ROOT they would be publicly servable: nginx's root is a directory and nothing in it is secret, so
# every superseded build — and anything accidentally left inside one — would be reachable at
# /releases/<stamp>/. Outside it they are files on the box and nothing else.
RELEASES=/opt/mythuso/releases
# How many superseded releases to keep. Each is a full copy of dist, and a directory of them that
# nobody prunes is a disk that fills up quietly on a box five other sites depend on. Five is enough
# to go back through a bad week; the one that is live plus its predecessor are what a rollback needs.
KEEP_RELEASES="${KEEP_RELEASES:-5}"
OPS=/opt/mythuso/ops
# The assistant runtime's home — outside $ROOT on purpose: the web root is served to the public
# internet and is replaced wholesale on every deploy, and a service's code is neither disposable
# per-deploy nor public. The bundle lives here (server.mjs), owned by root, read by a systemd
# DynamicUser that exists only while the service runs, and beside it the previous generation
# (server.mjs.prev) that the publish below keeps so this file can be rolled back without a build.
ASSISTANT=/opt/mythuso/assistant
IGNORE="$(dirname "$0")/.deployignore"

# The list is BidZA's, which is the other project on this box and keeps it current, plus BidZA's own
# host. Taken from BidFlow/App/scripts/deploy.sh and BidFlow/App/ops/nginx/bidza.conf rather than
# from memory: a co-tenant left off this list is a co-tenant nothing is watching.
OTHERS=(liqzar.co.za artisanza.co.za skillsonwheels.co.za agcafrica.com bidza.co.za)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ── $HOST and $ALIASES are not just text ───────────────────────────────────────────────────────
#
# They are interpolated into three different languages below: a command a remote login shell runs as
# root, an nginx directive, and a sed replacement. Each of those is a place where a character that
# is not part of a host name stops being data.
#
# Both were reproduced against a sandbox rather than reasoned about. A single quote in $HOST closes
# the quoting in `ssh "$TARGET" "... 'Host: $HOST' ..."` and everything after it runs as root on a
# box that serves five other people's websites. A `;` and a `}` survive the sed into the site file,
# and nginx accepts the result — `listen 80 default_server;` included, which is how MyThuso would
# quietly start answering for every name on this machine that nobody else claimed. A space smuggles
# a second name into server_name.
#
# So the names are checked once, here, against what a host name may actually contain, and nothing
# downstream has to be careful. A label is 1 to 63 of [A-Za-z0-9-] and may not start or end with a
# hyphen; the whole name is at most 253. $HOST is exactly one name, because a Host header carries
# one; $ALIASES is a space-separated list of them.
valid_hostname() {
  case "$1" in ''|*[!A-Za-z0-9.-]*|.*|*.|*..*) return 1 ;; esac
  [ "${#1}" -le 253 ] || return 1
  local label
  for label in $(printf '%s' "$1" | tr '.' ' '); do
    case "$label" in ''|-*|*-) return 1 ;; esac
    [ "${#label}" -le 63 ] || return 1
  done
  return 0
}
valid_hostname "$HOST" || {
  echo "HOST is not a host name: <<$HOST>>"
  echo "Refusing. It would reach a root shell on $TARGET and an nginx directive exactly as typed."
  exit 1
}
for name in $ALIASES; do
  valid_hostname "$name" || { echo "ALIASES contains something that is not a host name: <<$name>>. Refusing."; exit 1; }
done
# ssh reads a leading dash as an option, so a TARGET of "-oProxyCommand=..." is a command this
# script would run. It is a name of a host in ~/.ssh/config, and those do not begin with a dash.
case "$TARGET" in -*) echo "TARGET may not begin with a dash: <<$TARGET>>. Refusing."; exit 1 ;; esac

# Compares two dotted version numbers the way a person expects, in pure bash: `sort -V` is a GNU
# extension and this script runs from whatever machine the founder is on, not only from ones that
# ship GNU coreutils. 22.12.0 is the floor, 22.13.1 clears it, 23.0.0 clears it, 22.11.9 does not.
version_ge() { # <installed> <floor> — true when installed is at least the floor
  local i a b have want
  IFS='.' read -r -a a <<< "$1"
  IFS='.' read -r -a b <<< "$2"
  for i in 0 1 2; do
    have=$((10#${a[i]:-0})); want=$((10#${b[i]:-0}))
    if [ "$have" -gt "$want" ]; then return 0; fi
    if [ "$have" -lt "$want" ]; then return 1; fi
  done
  return 0
}

# Every name in server_name has to be in the certificate. A certificate for the apex alone is a
# browser warning on the first link anybody clicks who typed www, and the fix is a reissue rather
# than an edit. Built from $ALIASES here so the two cannot drift apart.
certbot_names="-d $HOST"
for name in $ALIASES; do certbot_names="$certbot_names -d $name"; done

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
# The staff workspaces ship in this build, and that is a decision about what is public rather than a
# build detail.
#
# VITE_MYTHUSO_STAFF_PREVIEW gates apps/web/src/Doorway.tsx's two lazy imports of the clinical shells
# and the Control Tower. Until 6 October 2026 it was set in exactly one place in the repository —
# playwright.config.ts's webServer command — so the suite exercised a build this script never produced.
# In the flagless build Rollup tree-shakes the whole subtree out: nothing under apps/web/dist/assets
# carries the clinician console's strings at all. The failure is silent, not an error page, because
# Doorway resolves the role to 'patient' and setRole to a no-op when the flag is off. A presenter
# walking step (d) of docs/qa/DEMO-CLICKTHROUGH.md against mythuso.co.za would have got the patient
# application at /app/?role=doctor, and a role switcher that did nothing when he pressed it.
#
# What this makes publicly reachable, said out loud rather than left to be discovered. Anyone holding
# the address gets the three clinical workspaces — Nurse, Doctor and Pharmacy partner, at
# /app/?role=nurse, =doctor and =partner — with nothing in front of them, and the screens, their copy
# and their simulated caseload are on the public internet. The other two roles are a door rather than
# an exposure: /app/?role=control-tower and =back-office draw the founder's two-factor sign-in first,
# because shells/FounderGate.tsx holds on import.meta.env.PROD and fails closed when the service is
# dark or silent — which is the state the box is in, since MYTHUSO_FOUNDER_ACCESS is written by hand
# and no deploy sets it. That is packages/catalog/founder-access.json#door and the account in
# docs/governance/FOUNDER-ACCESS.md, and both were verified against a production build of this very
# change rather than read and assumed.
#
# deploy/nginx/mythuso.conf's "choosing a role grants nothing" stays exactly true: the identity
# service is off, there is no account to sign in to, and the three workspaces above read the contracts
# in packages/catalog and in-memory demo fixtures. But that is a statement about permission, not about
# visibility, and the difference is what this changes. A visitor can also address GilbertOne as a
# member of staff, since a workspace passes its own audience to the panel.
#
# What it costs the patient, measured rather than assumed, because this is the part that is not
# obvious and is the one a later session would otherwise have to rediscover. The shells stay behind
# Doorway.tsx's dynamic imports and a patient at her own address fetches neither of them — the same
# nineteen asset files load at /app/ with the flag set and unset, and StaffShell's and PortalShell's
# own chunks are not among them. But the first view is not unchanged. With the subtree in the graph
# Rollup re-splits what it shares and moves vendor code the staff screens also use into chunks the
# entry already loads, so she downloads code she never runs: 241.88 kB to 254.06 kB gzipped at level
# 9 by scripts/check-bundle-budget.mjs, +12.18 kB against the 282.16 kB ceiling, which leaves 28.10
# kB. sos carries +7.64 of it, revamp +3.01, Workspace +1.19 and DemoLogin +0.35; no file was added
# to or dropped from the entry. Both builds were measured in a worktree, on 6 October 2026, at
# fc8d7a21 and at this change. The growth is invisible to a check that counts files, which is why the
# budget script runs after the build below and not as an optional extra.
#
# The founder's decision of 6 October 2026, taken for the funder demo of 7 October, and his to
# reverse: drop the variable below and the subtree stops shipping again, and the patient's entry goes
# back to 241.88 kB.
#
# Inline on the command rather than exported, so it reaches this build and nothing else. An export
# here would also be set for the assistant-runtime build below and for every ssh and rsync after it.
VITE_MYTHUSO_STAFF_PREVIEW=true npm run build --silent

# Built before anything on the server is touched, deliberately. The assistant bundle is one file
# with no install step on the far side, but it is still half of what this deploy publishes, and a
# deploy that shipped the web entries and then failed to build the assistant runtime would be a
# deploy that left the box half-way through a build — so both builds run above the first ssh
# below, and a failure in either one is a failure that mutated nothing.
say "Building the assistant runtime"
npm run assistant-runtime --silent

# The Node floor the bundle is transpiled for, read out of package.json's engines rather than
# typed here — a minimum written in two files is a minimum the two drift on. The publish step
# below asks the server to prove it; a server that cannot run the bundle is a server the bundle
# is not published to.
node_floor=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).engines.node.replace(/[^0-9.]/g,'')")
[ -n "$node_floor" ] || { echo "cannot read the Node floor out of package.json — refusing to publish anything"; exit 1; }

# ── Nothing shaped like a credential, and nothing from Documentation/ ───────────────────────────
#
# Only apps/web/dist is published, and .deployignore is passed to every rsync below — but the ignore
# file only helps with files it can name. This looks at what is actually about to be sent. The
# proposal in Documentation/ is confidential and no publication is authorised; an env file in a
# build output is how BidZA once baked a localhost URL into a production bundle.
say "Checking the build output carries nothing it should not"
if found=$(find apps/web/dist apps/assistant-api/dist \
     \( -name '.env*' -o -name '*.env' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' \
        -o -name 'id_rsa*' -o -name '*.db' -o -iname '*proposal*' -o -iname '*funding*' \) -print -quit) \
   && [ -n "$found" ]; then
  echo "the build output contains $found — refusing to publish it"; exit 1
fi
if grep -rslI -e 'MYTHUSO_AUTH_PEPPER' -e 'MYTHUSO_ENCRYPTION_KEY' -e 'MYTHUSO_PROTECTION_KEYS' -e 'MYTHUSO_IDENTITY_API_KEY' -e 'BEGIN .*PRIVATE KEY' apps/web/dist 2>/dev/null | head -1 | grep -q .; then
  echo "the build output mentions a secret by name — refusing to publish it"; exit 1
fi
# The assistant bundle names its provider's variables — process.env.AZURE_OPENAI_KEY and friends —
# because reading them from /etc/mythuso/assistant.env at runtime is what it is for. What it must
# never carry is a value, and the two shapes below are the ones a value takes when somebody has
# pasted one in: a concrete *.openai.azure.com endpoint (the LangChain tree's URL templates
# interpolate "${...}" where a real resource name would sit, so only a typed endpoint matches), or
# an env-file line — NAME=<twenty-plus credential characters> — baked into the artifact.
# scripts/build-assistant.mjs refused to produce such a bundle in the first place; this is the
# independent look at what is about to leave this machine.
assistant_bundle=apps/assistant-api/dist/server.mjs
[ -f "$assistant_bundle" ] || { echo "$assistant_bundle was not built — refusing"; exit 1; }
if grep -qE 'https://[a-z0-9][a-z0-9-]+\.openai\.azure\.com' "$assistant_bundle"; then
  echo "the assistant runtime names a concrete Azure endpoint — refusing to publish it"; exit 1
fi
if grep -qE '(AZURE_OPENAI_KEY|AZURE_OPENAI_API_KEY|OLLAMA_URL|ELEVENLABS_API_KEY)=[A-Za-z0-9_-]{20,}' "$assistant_bundle"; then
  echo "the assistant runtime carries what looks like a provider credential — refusing to publish it"; exit 1
fi

say "Checking $TARGET before touching it"
ssh "$TARGET" "test -d /etc/nginx/sites-enabled && command -v nginx >/dev/null" \
  || { echo "nginx not found on $TARGET"; exit 1; }
# A site file for this host that we did not write is a collision, not a redeploy.
#
# Both directories, because sites-enabled is not the only one nginx.conf includes: Debian's ships
# `include /etc/nginx/conf.d/*.conf` as well, and a co-tenant configured there was invisible to this
# check. Two server blocks claiming one name is not an error and does not fail `nginx -t` — nginx
# prints "conflicting server name", exits 0, and silently serves one of the two. On this box the one
# that loses would be somebody else's website, and every check we run would still be green.
for name in $HOST $ALIASES; do
  ssh "$TARGET" "! grep -rlE 'server_name[^;]*[ ]${name}[ ;]' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -qv mythuso.conf" \
    || { echo "another nginx site already claims $name — stopping rather than guessing"; exit 1; }
done

say "Publishing to $ROOT"
# The directories the scheduled jobs are confined to. They are made here rather than by the scripts
# themselves because ProtectSystem=strict makes /var read-only inside those units — a script that
# tried to create its own destination would fail in a way that reads as a permissions bug.
# /var/lib/mythuso is handed to the service user when there is one; before then it is only the
# health check's state directory.
ssh "$TARGET" "mkdir -p $RELEASES $OPS /etc/mythuso /var/log/mythuso /var/lib/mythuso /var/backups/mythuso
  chmod 700 /var/backups/mythuso
  id -u mythuso >/dev/null 2>&1 && chown mythuso:mythuso /var/lib/mythuso || true
  # nginx reads the live release as www-data, so every directory between / and the files has to be
  # traversable by it. The release directories themselves get 755 in the chmod below, but their
  # parents are made here by mkdir -p and inherit the umask — and a 750 on /opt/mythuso would make
  # the whole site 403 after the swap, at which point the symlink is already moved and the site is
  # already live. x and not r: nginx needs to walk through these to reach a file it was told the
  # name of, and listing what releases exist is not something a web server should be able to do.
  chmod o+x /opt/mythuso /opt/mythuso/releases"

# ── The publish is a swap, not a copy over the top ─────────────────────────────────────────────
#
# This used to be `rsync -az --delete apps/web/dist/ "$TARGET:$ROOT/"`, straight into the directory
# nginx serves. That is not atomic, and the failure it produces is invisible to this script:
# rsync --delete removes files that are no longer in the source, and every asset here has a content
# hash in its name, so a deploy replaces essentially the whole tree. A patient who refreshes in the
# middle of it can be served the new index.html before the assets it names have arrived, or the old
# index.html after --delete has already removed the chunk it points at. Either way she gets a page
# that does not run, the deploy reports success, and every check in this file passes — because the
# checks run afterwards, against the finished tree.
#
# So the tree is staged in a directory nothing serves, and $ROOT becomes a symlink moved onto it in
# one rename(2). Either the old tree answers or the new one does; there is no moment where half of
# each is on screen.
#
# This is also what makes a rollback possible at all. --delete destroyed the previous version as it
# wrote the new one, so the only way back was to build and publish again from an older commit — on a
# box that serves five other people's websites, while the site is broken. Now the previous releases
# are still on disk, and going back to one is a symlink move: deploy/rollback.sh.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE="$RELEASES/$STAMP"
ssh "$TARGET" "mkdir -p $RELEASE"
rsync -az --exclude-from="$IGNORE" apps/web/dist/ "$TARGET:$RELEASE/"
# Permissions are set on the staged directory before anything serves it, so the swap cannot expose a
# file that is momentarily unreadable by nginx.
ssh "$TARGET" "find $RELEASE -type d -exec chmod 755 {} + && find $RELEASE -type f -exec chmod 644 {} +"

# What is live now, so a failed verification can be undone by hand even if nothing automatic runs.
previous=$(ssh "$TARGET" "readlink -f $ROOT 2>/dev/null || true")

# ── The one-time migration, and why its order is what it is ────────────────────────────────────
#
# On the box today $ROOT is a real directory full of files, because that is what the rsync above
# used to write into. It has to become a symlink, and there is no way to replace a directory with a
# symlink in one syscall — so there is a window, and the whole job here is making it as short as a
# rename and as harmless as an identical tree.
#
# What is not done, because it would be downtime: copying $ROOT to $RELEASES and then linking. That
# copy crosses filesystems (/var and /opt are not necessarily one), so it is a read-and-write of the
# whole tree, and any arrangement that points $ROOT at the moving tree serves a half-written one.
# Relocating the old directory is slow too — and it is done, but strictly after the new release is
# live and nothing references it any more.
#
# So: rename the directory beside itself inside /var/www (one rename(2), same filesystem, instant)
# and immediately symlink $ROOT onto the renamed tree. The window is between those two, the content
# on both sides of it is byte-identical, and nginx resolves `root` per request so it follows the
# link without a reload. The atomic swap below then moves that symlink onto the new release, and
# only afterwards is the old tree relocated into $RELEASES to become the oldest release — which is
# also what keeps the rollback list from starting empty under this scheme.
migrated_from=""
if ssh "$TARGET" "[ -d $ROOT ] && [ ! -L $ROOT ]"; then
  echo "   $ROOT is a directory — migrating it to the release layout"
  migrated_from="$ROOT.old-$STAMP"
  # A directory cannot become a symlink in one syscall, so this is two, and the second can fail
  # while the first has already succeeded — which is the only way this migration can leave the box
  # worse than it found it: $ROOT gone, the site serving nothing, the deploy stopped under set -e,
  # and the tree named only in a timestamped directory beside it.
  #
  # So the postcondition is checked rather than the exit code, because ln's exit code does not mean
  # what it looks like it means. Both were reproduced rather than reasoned about: `ln -s X Y` exits
  # 0 when X does not exist, leaving a dangling link that nginx answers with 404s; and it exits 0
  # when Y is a directory, creating the link *inside* it, leaving $ROOT an empty directory with a
  # stray symlink in it. An `|| mv` guard catches neither, since neither fails — the first version of
  # this line had exactly that guard and testing it is what showed it did nothing.
  #
  # What is checked is the thing that actually has to be true afterwards: $ROOT is a symlink, and a
  # request through it reaches a file. On failure the tree is put back by name and the deploy stops,
  # because continuing would publish onto a path that is not serving what it was a moment ago.
  ssh "$TARGET" "set -e
    mv $ROOT $migrated_from
    ln -s $migrated_from $ROOT
    if [ ! -L $ROOT ] || [ ! -f $ROOT/index.html ]; then
      rm -f $ROOT 2>/dev/null || rm -rf $ROOT
      mv $migrated_from $ROOT
      echo '!! the symlink did not land — $ROOT is back the way it was, nothing published'
      exit 1
    fi"
  previous=$(ssh "$TARGET" "readlink -f $ROOT 2>/dev/null || true")
fi

# ln -sfn is not atomic — it unlinks and relinks, with a window where the path is missing. Creating
# the link beside the target and renaming over it is one syscall, and rename is atomic on the same
# filesystem, which both are by construction. -T so a trailing $ROOT that is already a directory
# does not swallow the new link inside itself.
ssh "$TARGET" "ln -s $RELEASE $ROOT.new && mv -Tf $ROOT.new $ROOT" \
  || { echo "!! the swap failed — the site is still serving ${previous:-what it was}"; exit 1; }

echo "   release $STAMP is live (previous: ${previous:-none recorded})"

# The migrated tree becomes the oldest release. This is the slow part of the migration — a copy
# across filesystems when /var and /opt are not one — and it runs here rather than before the swap
# precisely because the new release is already live: nothing is serving this directory any more, so
# being slow costs nothing and being interrupted leaves a stale tree beside the web root rather than
# a site that serves half a file.
#
# If the deploy dies before this line, $ROOT.old-$STAMP stays where it is. It is a sibling of the web
# root and not under it, so nginx cannot serve it — nothing is exposed, and it is still there to
# recover from or to move by hand:
#   ssh $TARGET "mv $ROOT.old-<stamp> $RELEASES/migrated-<stamp>"
if [ -n "$migrated_from" ]; then
  echo "   relocating the migrated tree into $RELEASES (the slow copy, off the critical path)"
  ssh "$TARGET" "mv $migrated_from $RELEASES/$STAMP-migrated"
  # $previous named the tree where the migration left it, and that path no longer exists. Point it at
  # where the tree went, so the line printed below and anything reading it after a failed verification
  # names a directory that is really there.
  #
  # The stamp comes first because the prune below orders these names lexicographically. A name
  # starting with "migrated-" would sort above every timestamp — 'm' is above every digit — and the
  # tree that was live before the release layout existed would then outlive every genuine release and
  # never be pruned at all. Stamped, it sits exactly where it belongs: just before the release that
  # replaced it, which is what it is.
  previous="$RELEASES/$STAMP-migrated"
fi

# Keep enough to go back through, and no more: each release is a full copy of dist, and a directory
# of them that nobody prunes is a disk that fills up quietly on a box five other sites depend on.
# The live release is excluded by name rather than trusted to sort newest-first, because a prune
# that can delete the tree nginx is serving is a prune that eventually will — the day a clock is
# wrong or an mtime is touched.
ssh "$TARGET" "cd $RELEASES && live=\$(basename \$(readlink -f $ROOT))
  for d in */; do d=\${d%/}
    [ \"\$d\" = \"\$live\" ] && continue
    echo \"\$d\"
  done | sort -r | tail -n +$KEEP_RELEASES | xargs -r rm -rf"


# ── The assistant runtime, under its own roof ──────────────────────────────────────────────────
#
# One JavaScript file that carries the whole service — the LangChain tree, the knowledge catalogs,
# everything — built by scripts/build-assistant.mjs before this script touched the server. It is
# published only when the server's Node can actually run it: the bundle is transpiled for the
# floor in package.json's engines, and handing it to an older binary would not be a slower
# service but a startup SyntaxError wearing a deploy's success message. A server too old (or
# without Node at all) is skipped loudly rather than failed over — the web deploy does not depend
# on the assistant runtime, and refusing it entirely over a Node version would leave the public
# site unpublishable for a reason nobody was in a position to notice.
say "Publishing the assistant runtime to $ASSISTANT"
server_node=$(ssh "$TARGET" "node --version 2>/dev/null || true")
server_node=${server_node#v}
if [ -z "$server_node" ] || ! version_ge "$server_node" "$node_floor"; then
  echo "!! not publishing the assistant runtime: $TARGET reports ${server_node:-no Node at all},"
  echo "   and the bundle is built for >= $node_floor. The rest of this deploy is unaffected."
  echo "   The unit this deploy installs names $ASSISTANT/server.mjs, so assistant-api.service"
  echo "   will not start until Node is upgraded and this deploy is run again — and it stays dark"
  echo "   until then, which is the state it was in anyway."
else
  # The digest is computed on both sides of the wire and compared before anything is moved into
  # place, so the file the unit's ExecStart names is never a half-transferred one and a failed
  # publish leaves the previous runtime exactly where it was.
  local_digest=$( { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } < "$assistant_bundle" | cut -d' ' -f1)
  ssh "$TARGET" "mkdir -p $ASSISTANT"
  rsync -az "$assistant_bundle" "$TARGET:$ASSISTANT/server.mjs.next"
  # The remote digest is asked for the same portable way as the local one: GNU coreutils calls the
  # tool sha256sum, the BSD userland calls it shasum -a 256, and whichever the server carries
  # answers. A server with neither — or an ssh that fails — must not abort the deploy mid-publish:
  # the `|| remote_digest=""` sends that failure into the mismatch branch below, which removes
  # server.mjs.next and exits 1, so no half-published artifact is ever left beside the running one.
  remote_digest=$(ssh "$TARGET" "if command -v sha256sum >/dev/null 2>&1; then sha256sum $ASSISTANT/server.mjs.next; else shasum -a 256 $ASSISTANT/server.mjs.next; fi" | cut -d' ' -f1) || remote_digest=""
  if [ "$local_digest" != "$remote_digest" ]; then
    ssh "$TARGET" "rm -f $ASSISTANT/server.mjs.next"
    echo "!! the assistant runtime arrived altered (sha256 ${remote_digest:-none}, expected $local_digest) — nothing published"
    exit 1
  fi
  # The digest of the file being replaced, read before the move, so the deploy can tell a running
  # service it is now behind. On 24 September 2026 a deploy published a new runtime to a service
  # that had been live since 21 September, printed success, and left the old code answering patients
  # until somebody noticed /assistant/health lacked a field the new code reports. Publishing a file
  # does not change a running process; saying so, loudly, is the difference between a fix that
  # landed and one everybody believes landed. The restart itself stays a person's act, as the
  # activation sequence in deploy/RUNBOOK.md is: this deploy never starts or restarts the model tier.
  previous_digest=$(ssh "$TARGET" "if [ -f $ASSISTANT/server.mjs ]; then if command -v sha256sum >/dev/null 2>&1; then sha256sum $ASSISTANT/server.mjs; else shasum -a 256 $ASSISTANT/server.mjs; fi; fi" | cut -d' ' -f1) || previous_digest=""
  # The one copy that makes a rollback of this file possible at all, taken before the move that
  # would destroy it. Until now `mv -f` overwrote the previous bundle outright, which left
  # deploy/rollback.sh and deploy/RUNBOOK.md both describing a server.mjs.prev that nothing in the
  # tree created — a documented way back for the one service that has answered patients since
  # 21 September 2026, pointing at a file that did not exist.
  #
  # The branch shape is the site file's own (see .mythuso.conf.prev below), and so is the reason: a
  # first deploy has no previous bundle, so there is nothing to copy, and a stale .prev left beside
  # it would be an offer to roll back to code this box never ran. The lifetimes differ, deliberately.
  # The site file's copy is deleted once `nginx -t` has an opinion, because the reload either applies
  # it or the deploy rolls it back before finishing — nothing later needs it. This copy is kept
  # across deploys, because the act that needs it is a restart, and a restart is a person's decision
  # taken after the deploy has reported success and gone: a copy that only survived until the deploy
  # ended would not be there for the one moment it exists for.
  #
  # A copy of the live file rather than a rename of it, because a rename leaves a moment where
  # $ASSISTANT/server.mjs does not exist at all — and the unit carries Restart=on-failure with a
  # five-second retry, so a start landing in that window fails on a path that was there a moment
  # before. Copying never removes the live path, and the running process is untouched either way:
  # node holds the inode it opened at start. The rename below still lands the new bundle in one
  # step, as it always did. The mode and owner are stated again after `cp -p` because the service
  # reads this directory as a systemd DynamicUser — a .prev that only root can read is a file, not
  # a rollback. It is exactly one generation deep: the bundle this box ran before this publish and
  # no further back, which is what deploy/RUNBOOK.md says rather than implying a history that is
  # not on the box.
  ssh "$TARGET" "set -e
    chmod 0755 $ASSISTANT
    chmod 0644 $ASSISTANT/server.mjs.next && chown root:root $ASSISTANT/server.mjs.next
    if [ -f $ASSISTANT/server.mjs ]; then
      cp -p $ASSISTANT/server.mjs $ASSISTANT/server.mjs.prev
      chmod 0644 $ASSISTANT/server.mjs.prev && chown root:root $ASSISTANT/server.mjs.prev
    else
      rm -f $ASSISTANT/server.mjs.prev
    fi
    mv -f $ASSISTANT/server.mjs.next $ASSISTANT/server.mjs"
  echo "assistant runtime  $ASSISTANT/server.mjs  sha256 ${local_digest:0:16}…"
  # Say which generation was kept, and with the digest read from the live bundle before the copy —
  # so the line names the bytes the copy holds rather than a second guess at them, and the person
  # deciding whether to go back can compare it with the previous deploy's own output. That read can
  # only have failed if the box lost its hashing tool between the two ssh calls, and a line that
  # printed "sha256 …" with nothing before it would look like a digest of unknown value rather than
  # an absent one — so the absent case is named instead of truncated into silence.
  if ssh "$TARGET" "[ -f $ASSISTANT/server.mjs.prev ]"; then
    kept_digest="${previous_digest:+${previous_digest:0:16}…}"
    echo "   previous bundle kept at $ASSISTANT/server.mjs.prev  sha256 ${kept_digest:-not read}"
  else
    echo "   no previous bundle on the box yet — nothing to roll this file back to"
  fi
  if [ "$previous_digest" != "$local_digest" ] && ssh "$TARGET" "systemctl is-active --quiet assistant-api.service"; then
    assistant_behind=1
    echo "!! assistant-api.service is RUNNING THE PREVIOUS RUNTIME. Its code changed in this deploy and the"
    echo "   process has not been restarted, so patients are still answered by the old code. To apply it:"
    echo "     ssh $TARGET \"systemctl restart assistant-api.service\""
    echo "     ssh $TARGET \"curl -s http://127.0.0.1:8791/assistant/health\""
  fi
fi

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
  before2=\$(md5sum /etc/systemd/system/assistant-api.service 2>/dev/null | cut -d' ' -f1 || true)
  install -o root -g root -m 0644 $OPS/*.service $OPS/*.timer /etc/systemd/system/
  systemctl daemon-reload
  after=\$(md5sum /etc/systemd/system/mythuso-api.service | cut -d' ' -f1)
  after2=\$(md5sum /etc/systemd/system/assistant-api.service | cut -d' ' -f1)
  # daemon-reload makes systemd read the new unit; it does not apply it to a process already
  # running under the old one. Saying so is the difference between a hardening change that landed
  # and one that everybody believes landed.
  if [ -n \"\$before\" ] && [ \"\$before\" != \"\$after\" ] && systemctl is-active --quiet mythuso-api; then
    echo '!! mythuso-api.service changed and the service is running — systemctl restart mythuso-api to apply it'
  fi
  if [ -n \"\$before2\" ] && [ \"\$before2\" != \"\$after2\" ] && systemctl is-active --quiet assistant-api; then
    echo '!! assistant-api.service changed and the service is running — systemctl restart assistant-api to apply it'
  fi"

# The health check has to know which host to ask about, and a host that has moved must not leave it
# watching the old name and reporting green. Written by the deploy, every time, for that reason.
# The alert address is not written here: /etc/mythuso/ops.env is hand-managed, because a deploy that
# overwrote MYTHUSO_ALERT_TO would silence every alert and look successful doing it.
ssh "$TARGET" "printf 'MYTHUSO_HOST=%s\n' '$HOST' > /etc/mythuso/host.env && chmod 0644 /etc/mythuso/host.env"

say "Installing the nginx site for $HOST"
# The file it replaces is kept beside it for exactly as long as it takes nginx -t to have an opinion.
# Without that, a site file that fails the test stays in sites-enabled: the running nginx carries on
# with the configuration it already loaded, so nothing looks wrong today, and the next time nginx is
# *started* rather than reloaded — a reboot, a package upgrade, somebody else's deploy — it refuses
# to start at all and takes agcafrica, artisanza, bidza, liqzar and skillsonwheels down with us,
# hours later, for a reason nobody will connect to this. A failed deploy of ours has to leave this
# box exactly as it found it.
sed "s/__HOST__/$HOST${ALIASES:+ $ALIASES}/g" deploy/nginx/mythuso.conf \
  | ssh "$TARGET" "set -e
      cd /etc/nginx/sites-available
      if [ -f mythuso.conf ]; then cp -p mythuso.conf .mythuso.conf.prev; else rm -f .mythuso.conf.prev; fi
      cat > mythuso.conf
      ln -sfn /etc/nginx/sites-available/mythuso.conf /etc/nginx/sites-enabled/mythuso.conf"

# Puts the box back the way it was, then says whether that was enough. If nginx -t still fails after
# our file is gone, the fault was already there and is somebody else's — which is worth saying out
# loud, because the person reading this at night will otherwise assume it was them.
roll_back_site() {
  ssh "$TARGET" "cd /etc/nginx/sites-available
    if [ -f .mythuso.conf.prev ]; then mv .mythuso.conf.prev mythuso.conf
    else rm -f mythuso.conf /etc/nginx/sites-enabled/mythuso.conf; fi
    nginx -t" >/dev/null 2>&1 \
    && echo "rolled our site file back; nginx -t passes again on $TARGET, nothing was reloaded" \
    || echo "!! ROLLED BACK AND nginx -t STILL FAILS. That fault was already on this box and is not
   ours. Do not restart nginx — a reload keeps the five co-tenants serving, a restart will not.
   Find it with: ssh $TARGET nginx -t"
}

# ── Putting TLS back, because the line above just overwrote it ─────────────────────────────────
#
# certbot --nginx does not write a file of its own. It edits ours, in place, adding the 443
# listener, the certificate paths and the http-to-https redirect — so the `cat >` above replaces all
# of that with the template. Without this step the *second* deploy after TLS quietly returns the
# site to plain http: the certificate is still on disk, still renewing, and nothing is serving it.
# The health check notices within ten minutes, which is ten minutes of a health service answering
# on http and no obvious reason why.
#
# `certbot install` re-applies the installer to a certificate that already exists. It asks Let's
# Encrypt for nothing and cannot be rate-limited, which is what makes it safe on every deploy.
say "Restoring TLS to the site file, if there is a certificate"
ssh "$TARGET" "set -e
  [ -d /etc/letsencrypt/live/$HOST ] || { echo 'tls       no certificate for $HOST yet — http only, see deploy/RUNBOOK.md'; exit 0; }
  command -v certbot >/dev/null || { echo '!! $HOST has a certificate but this box has no certbot to put it back into the site file'; exit 1; }
  certbot install --nginx --cert-name $HOST --redirect --non-interactive >/dev/null 2>&1 \
    || { echo '!! certbot could not re-apply the certificate. The file this deploy wrote serves plain http only.'; exit 1; }
  echo 'tls       certificate re-applied to the site file'" || {
  echo "TLS could not be restored — rolling back rather than publishing an http-only health service"
  roll_back_site
  exit 1
}

say "Testing the whole nginx configuration"
# Two different failures, only one of which nginx calls an error.
#
# `nginx -t` refusing is the loud one. "conflicting server name" is the quiet one: it is a warning,
# nginx -t still exits 0, and what it means is that two server blocks claim the same name and nginx
# has picked one of them. On a box with five co-tenants the block that loses could be theirs, and
# every other check in this script would still pass. So the output is read, not just its status.
if ! nginx_out=$(ssh "$TARGET" "nginx -t" 2>&1); then
  echo "$nginx_out"
  echo "nginx config test failed — nothing reloaded"
  roll_back_site
  exit 1
fi
echo "$nginx_out"
# Whose conflict is it? The first real run of this script refused on thirty warnings, every one of
# them naming bidza.co.za — two of that site's own files claim it, and have since before MyThuso
# existed. Refusing on somebody else's pre-existing conflict is a deploy that can never run, on a
# fault we are not allowed to fix: another site's config is not ours to edit.
#
# So the test is whether a name *we* claim is claimed twice. If it is, that is ours and we stop. If
# it is not, we say so loudly — a co-tenant is silently losing a server block and somebody should
# know — and carry on.
# `|| true` because a clean configuration is the case this must survive: grep finds nothing, exits 1,
# and under `set -euo pipefail` that ended the deploy after publishing and before verifying. It only
# ever passed while a co-tenant's own conflict gave grep something to find.
conflicts=$(printf '%s\n' "$nginx_out" | { grep -o 'conflicting server name "[^"]*"' || true; } | sed 's/.*"\(.*\)"/\1/' | sort -u)
if [ -n "$conflicts" ]; then
  ours=""
  for name in $HOST $ALIASES; do
    printf '%s\n' "$conflicts" | grep -qx "$name" && ours="$ours $name"
  done
  if [ -n "$ours" ]; then
    echo "!! a name this deploy claims is claimed twice:$ours"
    echo "   One of those blocks is being ignored and it may be a co-tenant's. Not reloading."
    roll_back_site
    exit 1
  fi
  echo "!! nginx reports server names claimed twice, none of them ours:"
  # deliberately unquoted: one line per name, and these are host names by construction
  # shellcheck disable=SC2086
  printf '     %s\n' $conflicts
  echo "   Those blocks belong to co-tenants and predate this deploy. One of each pair is being"
  echo "   silently ignored — worth telling whoever owns them. Not ours to edit, so carrying on."
fi

say "Reloading nginx (graceful; existing sites keep serving)"
ssh "$TARGET" "systemctl reload nginx"
ssh "$TARGET" "rm -f /etc/nginx/sites-available/.mythuso.conf.prev"

say "Verifying by Host header, so this works before DNS does"
# Five audiences, five entries, five things that can be published broken — the five inputs in
# apps/web/vite.config.ts. A deploy that only checks the page it was written for is a deploy that
# finds out about the others from a user, and that is exactly what happened to /status: the entry
# was built, published and unreachable, and the four checks here all passed.
#
# Adding a sixth entry means adding a location to deploy/nginx/mythuso.conf and a line here. There
# is no check that makes you: read the `input` block in apps/web/vite.config.ts against this list.
#
# A status code is not enough, and the reason is the same fault as /status: every one of these paths
# falls through to the catch-all if its location block is missing, and the catch-all answers with
# the landing page and a 200. Four of these five checks passed for a day while /status was a build
# nobody could open. So each entry is asked to prove it is itself.
#
# The proof is the entry's own rollup chunk, whose name is the first asset its HTML references and
# is different for every entry. Read out of the build rather than written down here, so it cannot
# be a thing that says "staff" while the file says otherwise.
verify_entry() { # <label> <path> <the built html this path must serve>
  local marker
  marker=$(grep -o 'assets/[A-Za-z0-9._-]*\.js' "apps/web/dist/$3" | head -1)
  [ -n "$marker" ] || { echo "$1: apps/web/dist/$3 references no entry chunk — is this a build?"; exit 1; }
  # -L and --resolve, because certbot redirects http to https the moment a certificate exists. Without
  # following, this reads nginx's 301 page, finds no chunk in it, and reports a site that is serving
  # perfectly well as broken — which it did, on the first deploy after TLS. --resolve rather than a
  # Host header on https, so the certificate's name matches and the check is not made to ignore an
  # invalid one: a verification that skips certificate errors would pass on the day TLS is wrong.
  ssh "$TARGET" "body=\$(curl -sfL --resolve '$HOST:443:127.0.0.1' --resolve '$HOST:80:127.0.0.1' http://$HOST$2) || { echo '$1: $2 did not answer'; exit 1; }
    case \"\$body\" in
      *$marker*) echo '$(printf '%-8s' "$1") 200  $3' ;;
      *) echo '!! $1: $2 answered 200 but did not serve $3 — it is falling through to another entry'; exit 1 ;;
    esac"
}
verify_entry landing /        landing.html
verify_entry app     /app/    index.html
verify_entry status  /status/ status.html
verify_entry shop    /shop/   shop.html

# And the form a person actually types. /status without the trailing slash used to fall through to
# the catch-all and answer with the landing page and a 200 — a wrong page wearing a right page's
# status code, which no check that only looks at the number can see.
ssh "$TARGET" "code=\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: $HOST' http://127.0.0.1/status)
  echo \"/status  \$code (expected 301 to /status/)\"
  [ \"\$code\" = 301 ] || { echo '!! /status is not redirecting — it is falling through to the landing page'; exit 1; }"

# Only when it has been turned on. Until step four of deploy/README.md the correct state of the
# identity service is "not running", and a deploy that reported that as a failure would teach
# everybody to ignore the last line of its own output.
ssh "$TARGET" "if systemctl is-enabled --quiet mythuso-api.service 2>/dev/null; then
    curl -sf --max-time 15 http://127.0.0.1:8787/health && echo
  else echo 'identity  not enabled (see deploy/README.md)'; fi"

# The assistant service, the same way: dark until credentials exist and somebody has followed the
# activation sequence in deploy/RUNBOOK.md, and a deploy that reported "not enabled" as a failure
# would be a deploy nobody trusts on the day it matters. When it IS enabled, both halves are
# proven: the service on the loopback (did the bundle start, did it find its credentials) and the
# nginx location in front of it (does /assistant/ reach the service, with the security headers
# the location redeclares). The health route answers with booleans only — never the endpoint,
# never the key.
ssh "$TARGET" "if systemctl is-enabled --quiet assistant-api.service 2>/dev/null; then
    curl -sf --max-time 15 http://127.0.0.1:8791/assistant/health && echo
    curl -sfL --max-time 15 --resolve '$HOST:443:127.0.0.1' --resolve '$HOST:80:127.0.0.1' http://$HOST/assistant/health && echo
  else echo 'assistant not enabled (see deploy/RUNBOOK.md — activate it only after the credentials ceremony)'; fi"

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
  # /var/www/mythuso is a symlink since the atomic publish, and `grep -r` does not follow a symlink
  # named on the command line — it was verified to skip it rather than assumed to descend into it.
  # Left as it was, this check would have quietly stopped covering the live release the first time
  # the migration ran, and a leak check that goes blind in the same deploy that moves the files is
  # the worst version of the bug: it still exits 0.
  #
  # So the path is resolved to the directory it points at before it is scanned, which is also what
  # makes the answer independent of which grep is installed. $RELEASES is scanned as a directory in
  # its own right: it holds up to KEEP_RELEASES superseded builds, and a key that reached the bundle
  # reached every one of them. They are not served any more, but "it was public while it was live" is
  # precisely what this check exists to raise.
  #
  # readlink -f of a missing path yields nothing, so a root that does not exist yet is dropped from
  # the argument list rather than handed to grep as an empty name.
  local web; web=$(readlink -f /var/www/mythuso 2>/dev/null || true)
  printf '%s\n' "$1" | grep -rqaFf - ${web:+"$web"} /opt/mythuso/releases /var/backups/mythuso 2>/dev/null
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
        echo "!! MYTHUSO_ENCRYPTION_KEY appears in a published file — under the web root, in a kept"
        echo "   release, or in /var/backups/mythuso."
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
      echo "!! protection key version $v appears in a published file — under the web root, in a kept"
      echo "   release, or in /var/backups/mythuso —"
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

if [ "${assistant_behind:-0}" = 1 ]; then
  echo
  echo "!! Published, but assistant-api.service is still running the previous runtime — see the"
  echo "   warning under 'Publishing the assistant runtime'. Restart it, then read /assistant/health."
fi

cat <<NOTE

Published to $HOST on $TARGET. Co-hosted sites unchanged.

Still yours to do — deploy/RUNBOOK.md is this list with the failures written out:
  1. DNS: point $HOST at this server's address (an A record).
  2. TLS: ssh $TARGET "certbot --nginx $certbot_names"
     Every name in server_name is in that list. One missing is a browser warning, not a 404.
  3. The timers, once: ssh $TARGET "systemctl enable --now mythuso-healthcheck.timer"
     (the backup timer waits for the identity service — it has nothing to back up before then)
  4. Only then the identity service — see deploy/README.md. It must not be reachable over http.
     Its keys are their own step, each with a second copy, before the service is enabled:
     docs/DATA-PROTECTION.md. Once the unit is enabled this deploy checks them on every run.
  5. GilbertOne's second tier, when an Azure OpenAI resource exists — the assistant service is
     installed but dark, and it is activated by hand, in this order (deploy/RUNBOOK.md, "Activating
     the assistant service", has the whole sequence with the rollbacks):
       ssh $TARGET                     # then, on the box:
       sudo /opt/mythuso/ops/configure-assistant-env.sh   # types the endpoint, the key (masked), the deployment name
       sudo sh -c "printf 'MYTHUSO_ASSISTANT_PRODUCTION=acknowledged\n' >> /etc/mythuso/assistant.env"
                                                          # the production decision, its own act — a configured key alone must never start a public model
       sudo systemctl enable --now assistant-api.service
       curl -s http://127.0.0.1:8791/assistant/health     # expect "azure":true and "activated":true — booleans only, no secrets
     The key is typed into that script and nowhere else — never into chat, Git, a shell command
     line or a log, each of which is a copy with a different owner.
NOTE
