#!/usr/bin/env bash
# Opens the GilbertOne host's test chat to the web, behind a login and TLS, so the founder can try the
# self-hosted Qwen in a browser (asked for on 8 October 2026). It is the first inbound opening on this
# server, so it is as narrow as it can be:
#   - Caddy runs inside the gilbertone container, not on the host, and the host forwards only ports
#     80 and 443 into it. The host itself still serves nothing.
#   - Every request needs the login. The password is made here, stored root-only on the server and
#     printed once on this terminal; it is never written into the repository or a chat.
#   - Only POST /api/chat reaches Ollama. Its other routes (pull, delete, copy, create) stay on the
#     container's loopback, so the login cannot be used to change which models the server holds.
#   - The address is <ip>.sslip.io until a GilbertOne domain exists: sslip.io answers any such name
#     with the IP in it, which lets Let's Encrypt issue a certificate today. GILBERTONE_HOSTNAME
#     points it at a real domain later.
# It is a test page, not GilbertOne: no safety checks, no audit, and it says so on the page. Nothing
# about a patient goes through it. `--close` takes the opening away again.
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
# The page and the GilbertOne logo files beside it, each readable by Caddy.
for f in "$here"/test-chat/*; do
  incus file push --mode 0644 "$f" "$BOX/srv/test-chat/$(basename "$f")"
done
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
	# The one Ollama route let through. Ollama refuses browser origins it does not know, so the
	# request reaches it as if from its own loopback; the login above is what guards it.
	@chat {
		method POST
		path /api/chat
	}
	# Anything else GilbertOne serves behind this login, each in its own file (the media studio:
	# media/install.sh). A glob that matches nothing is allowed, so the chat runs without them.
	import /etc/caddy/gilbertone.d/*.caddy
	handle @chat {
		reverse_proxy 127.0.0.1:11434 {
			header_up Host 127.0.0.1:11434
			header_up -Origin
			flush_interval -1
		}
	}
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

say "Open"
echo "Address:  https://${HOSTNAME_WEB}/"
echo "User:     ${LOGIN_USER}"
echo "Password: ${password}"
echo
echo "The password is kept, root-only, in ${LOGIN_FILE}. Give it to the founder directly, not in a chat."
echo "To close it again: sudo bash $0 --close"
