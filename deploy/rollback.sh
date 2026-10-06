#!/usr/bin/env bash
# Move the live site back to an earlier release.
#
# The publish in deploy.sh is a symlink swap, so rolling back is one too: no build, no rsync, no
# nginx reload, and nothing else on the box is touched. The releases it can roll back to are the
# ones the last few deploys kept under /opt/mythuso/releases (KEEP_RELEASES in deploy/deploy.sh,
# five by default), plus the tree that was live before the release layout existed, which the first
# deploy under that layout preserved as migrated-*.
#
#   ./deploy/rollback.sh                 # list the releases and say which one is live
#   ./deploy/rollback.sh <release>       # move the live symlink onto it and verify
#
# What this does NOT roll back: the assistant runtime, the ops scripts, the nginx site file and the
# systemd units. Each has its own mechanism — deploy.sh keeps the runtime's previous bundle at
# /opt/mythuso/assistant/server.mjs.prev beside the live one, and the site file's previous version at
# /etc/nginx/sites-available/.mythuso.conf.prev — and pretending one symlink covers them would be a
# rollback that reports more than it did. Neither copy is moved back by this script. The site file's
# belongs to the deploy that wrote it: it is put back by roll_back_site whenever nginx -t refuses and
# deleted once a reload has succeeded, so there is never a window where it is this script's business.
# The runtime's is an operator's, because restoring it means a restart of a service that answers
# patients and a restart is a person's act here, never a script's. deploy/RUNBOOK.md, "Rolling back a
# bad release", is that sequence.
set -euo pipefail

TARGET="${TARGET:-liqzar-server}"
HOST="${HOST:-mythuso.co.za}"
ROOT=/var/www/mythuso
RELEASES=/opt/mythuso/releases
chosen="${1:-}"

list() {
  ssh "$TARGET" "live=\$(basename \$(readlink -f $ROOT) 2>/dev/null || echo none)
    cd $RELEASES 2>/dev/null || { echo 'no releases directory yet — nothing has deployed under this layout'; exit 0; }
    for d in */; do d=\${d%/}
      if [ \"\$d\" = \"\$live\" ]; then echo \"  \$d   (live)\"; else echo \"  \$d\"; fi
    done"
}

if [ -z "$chosen" ]; then
  echo "Releases on $TARGET:"
  list
  echo
  echo "Roll one back with: ./deploy/rollback.sh <release>"
  exit 0
fi

# The name is used in remote shell commands as root on a box that serves five other people's
# websites, so it is held to what a release directory can actually be called before it is
# interpolated anywhere — the same reason deploy.sh validates $HOST.
if ! printf '%s' "$chosen" | grep -qE '^[A-Za-z0-9._-]+$'; then
  echo "!! '$chosen' is not a release name (letters, digits, dot, dash, underscore only)"; exit 1
fi
if ! ssh "$TARGET" "[ -d $RELEASES/$chosen ]"; then
  echo "!! no such release: $RELEASES/$chosen"
  echo "The releases that exist:"
  list
  exit 1
fi

echo "Rolling $HOST back to $chosen"
# Same atomic pattern as the deploy: link beside, rename over. The site is never without a root.
ssh "$TARGET" "ln -s $RELEASES/$chosen $ROOT.new && mv -Tf $ROOT.new $ROOT"

# Verify the way deploy.sh does — by Host header over the box's own loopback, so this works before
# DNS does, and against the entry's own chunk marker so a 200 from the wrong page is not a pass.
marker=$(ssh "$TARGET" "grep -o 'assets/[A-Za-z0-9._-]*\.js' $RELEASES/$chosen/index.html 2>/dev/null | head -1")
if [ -z "$marker" ]; then
  echo "!! the rolled-back release has no entry chunk in its index.html — it may not be a real build."
  echo "   The symlink now points at it. Check by hand: ssh $TARGET 'curl -sI http://$HOST/app/'"
  exit 1
fi
ssh "$TARGET" "body=\$(curl -sfL --resolve '$HOST:443:127.0.0.1' --resolve '$HOST:80:127.0.0.1' http://$HOST/app/) || { echo 'the app entry did not answer after the rollback'; exit 1; }
  case \"\$body\" in
    *$marker*) echo 'verified: /app/ serves the rolled-back release' ;;
    *) echo '!! /app/ answered but is not serving $chosen — something else is answering for this host'; exit 1 ;;
  esac"
echo "Rolled back to $chosen."
