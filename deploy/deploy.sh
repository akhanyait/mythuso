#!/usr/bin/env bash
# Publish the MyThuso landing page and app preview to a server.
#
# Adds only: /var/www/mythuso, one nginx site file, and (optionally) the identity service under
# /opt/mythuso. It never edits another site's configuration, and it refuses to reload nginx unless
# `nginx -t` passes first.
#
#   ./deploy/deploy.sh                       # defaults to the host and target below
#   HOST=mythuso.example.com ./deploy/deploy.sh
set -euo pipefail

TARGET="${TARGET:-liqzar-server}"
HOST="${HOST:-mythuso.liqzar.co.za}"
ROOT=/var/www/mythuso

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Building the site"
npm run build --silent

say "Checking $TARGET before touching it"
ssh "$TARGET" "test -d /etc/nginx/sites-enabled && command -v nginx >/dev/null" \
  || { echo "nginx not found on $TARGET"; exit 1; }
# A site file for this host that we did not write is a collision, not a redeploy.
ssh "$TARGET" "! grep -rlF ' $HOST;' /etc/nginx/sites-enabled/ 2>/dev/null | grep -qv mythuso.conf" \
  || { echo "another nginx site already claims $HOST — stopping rather than guessing"; exit 1; }

say "Publishing to $ROOT"
ssh "$TARGET" "mkdir -p $ROOT"
rsync -az --delete apps/web/dist/ "$TARGET:$ROOT/"
ssh "$TARGET" "find $ROOT -type d -exec chmod 755 {} + && find $ROOT -type f -exec chmod 644 {} +"

say "Installing the nginx site for $HOST"
sed "s/__HOST__/$HOST/g" deploy/nginx/mythuso.conf \
  | ssh "$TARGET" "cat > /etc/nginx/sites-available/mythuso.conf && ln -sfn /etc/nginx/sites-available/mythuso.conf /etc/nginx/sites-enabled/mythuso.conf"

say "Testing the whole nginx configuration"
ssh "$TARGET" "nginx -t" || { echo "nginx config test failed — nothing reloaded"; exit 1; }

say "Reloading nginx (graceful; existing sites keep serving)"
ssh "$TARGET" "systemctl reload nginx"

say "Verifying by Host header, so this works before DNS does"
ssh "$TARGET" "curl -sf -H 'Host: $HOST' http://127.0.0.1/ -o /dev/null -w 'landing  %{http_code}\n'"
ssh "$TARGET" "curl -sf -H 'Host: $HOST' http://127.0.0.1/app/ -o /dev/null -w 'app      %{http_code}\n'"

cat <<NOTE

Published to $HOST on $TARGET.

Still yours to do:
  1. DNS: point $HOST at this server's address (an A record).
  2. TLS: ssh $TARGET "certbot --nginx -d $HOST"
  3. Only then the identity service — see deploy/README.md. It must not be reachable over http.
NOTE
