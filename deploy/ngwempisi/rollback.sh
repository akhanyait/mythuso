#!/usr/bin/env bash
# deploy/rollback.sh, pointed at 102.202.45.201: the live symlink there is /opt/mythuso/current and the
# login is not root. Same use: no argument lists the releases, one argument moves the symlink onto it
# and verifies /app/ through the gateway. Nothing is rebuilt, nothing is reloaded, no container restarts.
set -euo pipefail
export TARGET="${TARGET:-wtgbyasz@102.202.45.201}"
export SSH_OPTS="${SSH_OPTS:--i $HOME/.ssh/qwen-102-202-45-201 -o BatchMode=yes}"
export ROOT=/opt/mythuso/current
export SUDO="sudo -n"
exec "$(dirname "$0")/../rollback.sh" "$@"
