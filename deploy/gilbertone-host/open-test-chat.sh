#!/usr/bin/env bash
# Opens the GilbertOne host's test chat to the web, behind a login and TLS, so the founder can try the
# self-hosted Qwen in a browser (asked for on 8 October 2026). It is the first inbound opening on this
# server, so it is as narrow as it can be:
#   - Caddy runs inside the gilbertone container, not on the host, and the host forwards only ports
#     80 and 443 into it. The host itself still serves nothing.
#   - Every request needs the login. The password is made here, stored root-only on the server and
#     printed once on this terminal; it is never written into the repository or a chat.
#   - Only one chat route is open. Until the assistant is installed in the box, that is POST /api/chat
#     to Ollama, and the page says the model is on its own. Once it is installed, that route is closed
#     and POST /assistant/v1/turn is the only way in, and the page says the safety checks are on.
#     Ollama's other routes (pull, delete, copy, create) stay on the container's loopback either way.
#   - The address is <ip>.sslip.io until a GilbertOne domain exists: sslip.io answers any such name
#     with the IP in it, which lets Let's Encrypt issue a certificate today. GILBERTONE_HOSTNAME
#     points it at a real domain later.
# Nothing about a patient goes through it. `--close` takes the opening away again.
set -euo pipefail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nREFUSED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo."
BOX=gilbertone
[ "$(incus list "$BOX" -c s -f csv 2>/dev/null)" = "RUNNING" ] || die "the ${BOX} container is not running; run bootstrap.sh first."
in_box() { incus exec "$BOX" -- "$@"; }

if [ "${1:-}" = "--close" ]; then
  say "Closing the test chat"
  incus config device remove "$BOX" web-http 2>/dev/null || true
  incus config device remove "$BOX" web-https 2>/dev/null || true
  ufw delete allow 80/tcp 2>/dev/null || true
  ufw delete allow 443/tcp 2>/dev/null || true
  in_box systemctl disable --now caddy 2>/dev/null || true
  echo "Closed: nothing inbound but SSH."
  exit 0
fi

public_ip="$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<NF;i++) if ($i=="src") print $(i+1)}')"
[ -n "$public_ip" ] || die "could not find this server's public IPv4 address."
HOSTNAME_WEB="${GILBERTONE_HOSTNAME:-${public_ip//./-}.sslip.io}"
LOGIN_USER=gilbert
LOGIN_FILE=/root/gilbertone-test-chat-login.txt
here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/test-chat/index.html" ] || die "test-chat/index.html is missing beside this script."
[ -f "$here/test-chat/qwen.html" ] || die "test-chat/qwen.html is missing beside this script."

say "Caddy inside the container"
in_box env DEBIAN_FRONTEND=noninteractive apt-get install -yq caddy

# The password is made once and kept, so re-running this script does not lock the founder out.
# The umask is held to a subshell: left in force, it also made the pushed page unreadable to Caddy,
# which answered 403 on the first run (8 October 2026).
if [ ! -s "$LOGIN_FILE" ]; then
  ( umask 077; printf '%s\n' "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)" > "$LOGIN_FILE" )
fi
password="$(cat "$LOGIN_FILE")"
hash="$(in_box caddy hash-password --plaintext "$password")"

in_box mkdir -p /srv/test-chat /etc/caddy/gilbertone.d
# Where the page's questions go is decided before any page is pushed. On 10 October 2026 the new
# GilbertOne page was pushed while the assistant was not in the box: it said the safety checks were
# on and posted to /assistant/v1/turn, which answered 404, while Qwen was still listening on /api/chat.
# The page a person reads has to be the route that is open.
if in_box test -s /opt/mythuso/assistant/server.mjs; then
  ROUTE_MODE=gilbertone
  page="$here/test-chat/index.html"
  grep -q "with its safety checks" "$page" || die "the GilbertOne page no longer says the safety checks are on."
  grep -q "/assistant/v1/turn" "$page" || die "the GilbertOne page no longer posts to /assistant/v1/turn."
  routes="$(cat <<'ROUTES'
	# GilbertOne's turn route and its health line, and nothing else of the service: the founder routes,
	# the speech routes and the rest stay on the container's loopback. The browser's Origin is passed
	# through, because the service's own origin policy is what answers it.
	@gilbertone {
		path /assistant/v1/turn /assistant/health
	}
	handle @gilbertone {
		reverse_proxy 127.0.0.1:8791 {
			flush_interval -1
		}
	}
ROUTES
)"
else
  ROUTE_MODE=qwen
  page="$here/test-chat/qwen.html"
  grep -q "without the safety checks" "$page" || die "the model-only page no longer says the safety checks are absent."
  grep -q "/api/chat" "$page" || die "the model-only page no longer posts to /api/chat."
  if grep -q "with its safety checks" "$page"; then
    die "the model-only page claims the safety checks are on."
  fi
  routes="$(cat <<'ROUTES'
	# The one Ollama route let through. Ollama refuses browser origins it does not know, so the
	# request reaches it as if from its own loopback; the login above is what guards it.
	@chat {
		method POST
		path /api/chat
	}
	handle @chat {
		reverse_proxy 127.0.0.1:11434 {
			header_up Host 127.0.0.1:11434
			header_up -Origin
			flush_interval -1
		}
	}
ROUTES
)"
fi
# Logos and icons, never either page: the chosen page is pushed under the name the browser asks for,
# and the other page is not put where a person could open it.
for f in "$here"/test-chat/*; do
  base="$(basename "$f")"
  case "$base" in
    index.html|qwen.html) continue ;;
  esac
  incus file push --mode 0644 "$f" "$BOX/srv/test-chat/$base"
done
incus file push --mode 0644 "$page" "$BOX/srv/test-chat/index.html"
in_box sh -c 'cat > /etc/caddy/Caddyfile' <<EOF
${HOSTNAME_WEB} {
	basicauth {
		${LOGIN_USER} ${hash}
	}
	header {
		Strict-Transport-Security "max-age=300"
		X-Robots-Tag "noindex, nofollow"
		Referrer-Policy "no-referrer"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
	}
${routes}
	# Anything else GilbertOne serves behind this login, each in its own file (the media studio:
	# media/install.sh). A glob that matches nothing is allowed, so the chat runs without them.
	import /etc/caddy/gilbertone.d/*.caddy
	handle {
		root * /srv/test-chat
		file_server
	}
}
EOF
in_box caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
in_box systemctl enable caddy
in_box systemctl restart caddy

say "Forwarding ports 80 and 443 into the container"
incus config device show "$BOX" | grep -q '^web-http:' \
  || incus config device add "$BOX" web-http proxy listen=tcp:0.0.0.0:80 connect=tcp:127.0.0.1:80
incus config device show "$BOX" | grep -q '^web-https:' \
  || incus config device add "$BOX" web-https proxy listen=tcp:0.0.0.0:443 connect=tcp:127.0.0.1:443
ufw allow 80/tcp
ufw allow 443/tcp

say "Waiting for the certificate"
code=""
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://${HOSTNAME_WEB}/" || true)"
  [ "$code" = "401" ] && break
  sleep 5
done
[ "$code" = "401" ] || die "https://${HOSTNAME_WEB}/ answered '${code}' instead of asking for the login. Check: sudo incus exec ${BOX} -- journalctl -u caddy -n 50"
chat_code="$(curl -s -o /dev/null -w '%{http_code}' -u "${LOGIN_USER}:${password}" -X POST "https://${HOSTNAME_WEB}/api/pull" -d '{}' || true)"
[ "$chat_code" != "200" ] || die "/api/pull answered 200 through the login; only /api/chat may reach Ollama."
if [ "$ROUTE_MODE" = gilbertone ]; then
  plain_code="$(curl -s -o /dev/null -w '%{http_code}' -u "${LOGIN_USER}:${password}" -X POST "https://${HOSTNAME_WEB}/api/chat" -d '{}' || true)"
  [ "$plain_code" != "200" ] || die "/api/chat still reaches Qwen directly; with GilbertOne installed, only its turn route may answer."
  health_code="$(curl -s -o /dev/null -w '%{http_code}' -u "${LOGIN_USER}:${password}" "https://${HOSTNAME_WEB}/assistant/health" || true)"
  [ "$health_code" = "200" ] || die "GilbertOne's health line answered '${health_code}' through the login. Check: sudo incus exec ${BOX} -- journalctl -u gilbertone-assistant -n 50"
  echo "The test chat talks to GilbertOne; plain Qwen is closed."
else
  echo "The test chat is the model on its own. The safety checks are not on this page."
fi

say "Open"
echo "Address:  https://${HOSTNAME_WEB}/"
echo "User:     ${LOGIN_USER}"
echo "Password: ${password}"
echo
echo "The password is kept, root-only, in ${LOGIN_FILE}. Give it to the founder directly, not in a chat."
echo "To close it again: sudo bash $0 --close"
