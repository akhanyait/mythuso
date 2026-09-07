#!/usr/bin/env bash
#
# Nightly backup of the MyThuso identity database.
#
# ── Why a file copy is the wrong thing ──────────────────────────────────────────────────────────
#
# BidZA, on this same box, is PostgreSQL and takes a pg_dump. MyThuso's identity service is SQLite
# in WAL mode (apps/api/src/store.ts sets `PRAGMA journal_mode = WAL`), and `cp identity.db` is not
# a backup of it. In WAL mode the committed truth is spread across identity.db and identity.db-wal:
# a copy taken mid-write gets a main file missing every transaction since the last checkpoint, and
# copying the three files one after another gets three files from three different instants — which
# is worse, because the result opens, and reports corruption or silently missing rows only when
# somebody is relying on it.
#
# So the snapshot is taken by SQLite itself with VACUUM INTO. That runs inside a read transaction,
# so it sees one consistent instant of the database including everything in the WAL, it does not
# block the service from writing while it runs, and it writes a single defragmented file with no
# sidecars. `.backup` through the online backup API would also be correct; VACUUM INTO is one
# statement, works through whichever of sqlite3 and node is on the box, and produces a smaller file.
#
# ── What this backup is not ─────────────────────────────────────────────────────────────────────
#
# It is not encrypted. BidZA's are not either, and for tender documents that is a defensible call.
# It is a thinner one here and it is stated rather than glossed:
#
#   The database holds a name, a mobile number and a second-factor secret, and nothing else — no
#   health information, which is the only reason the service exists ahead of the controls in
#   docs/PRIVACY-AND-SECURITY.md. Names and second-factor secrets are sealed in the database itself
#   (apps/api/src/sensitive.ts), so those survive being carried away. Mobile numbers do not: they
#   are the lookup key and they are in this file in the clear. A list of South African mobile
#   numbers is personal information under POPIA even though it is not special personal information.
#
#   What stands in for encryption today is that the file never leaves this machine and only root can
#   read it: the destination is 0700 and every artefact 0600, and this script refuses to run if that
#   is not true. That is thin, and it is sufficient only for as long as the sentence above is true.
#   The day a clinical table appears in this database, an unencrypted nightly copy of it is a POPIA
#   breach waiting for a stolen disk — so this script refuses outright rather than trusting anybody
#   to remember. See the guard below, and deploy/README.md.
#
#   The backup is also on the same disk as the thing it backs up, which protects against a corrupted
#   database and not at all against a lost server. Off-site copies are not set up.
#
#   And a backup is a copy of people the service has been asked to forget. Erasure runs on a seven-
#   day grace and this keeps fourteen days, so somebody erased today is still in the oldest archive
#   here for a fortnight afterwards. That is defensible — POPIA allows a proportionate retention
#   period, and a backup you may not restore is not a backup — but it is a fortnight, not "gone",
#   and nobody should be told otherwise.
#
# ── The key is not in here ──────────────────────────────────────────────────────────────────────
#
# MYTHUSO_ENCRYPTION_KEY lives in /etc/mythuso/api.env, deliberately nowhere near the database it
# protects — which means restoring this file onto a machine without that key gives back a database
# whose sealed values cannot be opened. The key must be backed up somewhere that is not this server,
# and this script cannot do that for you — docs/DATA-PROTECTION.md is the ceremony for that copy.
#
# The converse is checked rather than assumed: before anything is compressed, the fresh snapshot is
# searched for the key's own characters, and a match deletes the snapshot and refuses. A backup that
# contains the key that opens it is a backup with no encryption at all.
#
# Runs as root from a systemd timer. Everything it writes lives under /var/backups/mythuso; it
# touches nothing belonging to the five other sites on this box.
set -euo pipefail

DEST=/var/backups/mythuso
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%d-%H%M%S)

# The database path lives with the service, not in this script.
DB=/var/lib/mythuso/identity.db
if [ -r /etc/mythuso/api.env ]; then
  from_env=$(grep -E '^MYTHUSO_DB=' /etc/mythuso/api.env | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')
  [ -n "$from_env" ] && DB="$from_env"
fi

fail() {
  echo "backup FAILED: $*" >&2
  printf '%s FAILED %s\n' "$(date -u +%FT%TZ)" "$*" >> "$DEST/backup.log" 2>/dev/null || true
  exit 1
}

[ -f "$DB" ] || fail "no database at $DB — is the identity service installed?"

mkdir -p "$DEST"
chmod 700 "$DEST"

# ── Whichever SQLite this box has ───────────────────────────────────────────────────────────────
#
# sqlite3 is not installed everywhere and the identity service brings no dependencies with it, so
# node's own node:sqlite is the fallback — the same module the service uses, so if the service can
# open this database so can this. The --experimental-sqlite flag is accepted on every Node that has
# the module and required on the older ones, so it is always passed.
SQLITE3=$(command -v sqlite3 || true)
NODE=$(command -v node || true)
[ -n "$SQLITE3" ] || [ -n "$NODE" ] || fail "neither sqlite3 nor node on this host — nothing can read a SQLite file"

sqlite_exec() { # <db> <sql>
  if [ -n "$SQLITE3" ]; then "$SQLITE3" "$1" "$2" >/dev/null
  else "$NODE" --experimental-sqlite -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);d.exec(process.argv[2]);d.close();' "$1" "$2" 2>/dev/null
  fi
}
sqlite_query() { # <db> <sql> — one line per row
  if [ -n "$SQLITE3" ]; then "$SQLITE3" "$1" "$2"
  else "$NODE" --experimental-sqlite -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);for(const r of d.prepare(process.argv[2]).all())console.log(Object.values(r).join("|"));d.close();' "$1" "$2" 2>/dev/null
  fi
}

# ── The guard that keeps the paragraph above honest ─────────────────────────────────────────────
#
# `npm run check` fails if a clinical table appears in the identity service's schema. That check
# runs on a developer's machine against source; this one runs on the server against what the
# database actually holds, which is the thing that would end up in an unencrypted file here. The
# same word list, deliberately: two checks that disagree about what "clinical" means are one check.
CLINICAL='observation|diagnos|prescription|medication|clinical|patient_record|vital|symptom|allerg'
tables=$(sqlite_query "$DB" "SELECT name FROM sqlite_master WHERE type='table'" 2>/dev/null || true)
[ -n "$tables" ] || fail "cannot read the schema of $DB — refusing to back up a database this cannot open"
grown=$(printf '%s\n' "$tables" | grep -Ei "$CLINICAL" || true)
if [ -n "$grown" ]; then
  /opt/mythuso/ops/mythuso-alert.sh "backup refused — clinical data" \
    "$(printf 'The identity database has grown a clinical table: %s\n\nThis script writes an unencrypted copy and will not do that with health information in it. Health data is special personal information; work through docs/PRIVACY-AND-SECURITY.md and give this script an encrypted destination before re-enabling it.\n' "$(echo "$grown" | tr '\n' ' ')")" || true
  fail "the identity database has grown a clinical table ($(echo "$grown" | tr '\n' ' ')) — refusing to write an unencrypted backup of health information"
fi

# ── The snapshot ────────────────────────────────────────────────────────────────────────────────
SNAP="$DEST/identity-$STAMP.db"
rm -f "$SNAP"

# Root opening a WAL database can create identity.db-wal and identity.db-shm owned by root, and the
# service that has to write them runs as the unprivileged mythuso user. Handing them back is the
# difference between a backup and an outage at the next sign-in, so the owner is captured first.
OWNER=$(stat -c '%U:%G' "$DB" 2>/dev/null || echo '')

sqlite_exec "$DB" "VACUUM INTO '$SNAP'" || fail "VACUUM INTO failed — the snapshot was not taken"

if [ -n "$OWNER" ]; then
  for sidecar in "$DB" "$DB-wal" "$DB-shm"; do
    [ -e "$sidecar" ] && chown "$OWNER" "$sidecar" 2>/dev/null || true
  done
fi

[ -s "$SNAP" ] || fail "the snapshot is empty"

# ── The one value that must never be in this file ───────────────────────────────────────────────
#
# The whole argument for an unencrypted archive rests on the key living somewhere else. A key that
# has found its way into a table — configuration written to the database "for now", a debug row, a
# migration that copied the environment — turns every archive on this disk into plaintext, and it
# does so silently, because the database still works perfectly. So the snapshot is searched for the
# key's own characters before anything is compressed or kept.
#
# What this catches and what it does not: it finds the key stored as the text in api.env (the hex or
# base64 form), which is how it would actually get there. It would not find the raw 32 bytes, or a
# re-encoded copy. It is a guard against an accident, not a proof — and the accident is the case
# that happens. The pattern goes in over stdin so the key is never in this machine's process list,
# and nothing below prints it: the alert and the log line name the mistake, never the value.
if [ -r /etc/mythuso/api.env ]; then
  # Both secrets, and every protection key version: "1:<key>,2:<key>" is split on the commas and the
  # version prefix dropped, so each version's material is searched for on its own.
  keys=$(
    sed -n 's/^MYTHUSO_ENCRYPTION_KEY=//p' /etc/mythuso/api.env | tail -1
    sed -n 's/^MYTHUSO_PROTECTION_KEYS=//p' /etc/mythuso/api.env | tail -1 | tr ',' '\n' \
      | sed -e 's/^[[:space:]]*//' -e 's/^[0-9]\{1,5\}://'
  )
  found=''
  while IFS= read -r material; do
    material=$(printf '%s' "$material" | tr -d '[:space:]')
    material=${material%\"}; material=${material#\"}
    material=${material%\'}; material=${material#\'}
    [ ${#material} -ge 32 ] || continue
    if printf '%s\n' "$material" | grep -qaFf - "$SNAP" 2>/dev/null; then found=yes; fi
  done <<EOF
$keys
EOF
  unset keys material
  if [ -n "$found" ]; then
    rm -f "$SNAP"
    /opt/mythuso/ops/mythuso-alert.sh "backup refused — a key is in the database" \
      "$(printf 'A key from /etc/mythuso/api.env appears inside the identity database.\n\nEvery archive under %s is then plaintext, and so is this one, so it has been deleted rather than kept. Find what wrote the key into a table, remove it, and treat that key as disclosed: rotate it by the procedure in docs/DATA-PROTECTION.md.\n' "$DEST")" || true
    fail "a key from api.env appears inside the database — the snapshot was deleted rather than kept"
  fi
fi

gzip -9 -f "$SNAP"
ARCHIVE="$SNAP.gz"
chmod 600 "$ARCHIVE"
SIZE=$(stat -c%s "$ARCHIVE")

# ── Restore-tested, not merely readable ─────────────────────────────────────────────────────────
#
# A backup nobody has restored is a belief, not a backup. So the artefact that would actually be
# restored — the compressed file, not the snapshot it was made from — is decompressed into a
# scratch directory and opened, checked page by page, and queried for the rows that matter. A
# truncated write, a half-flushed gzip or a snapshot taken of an already-corrupt database are all
# things that show up here tonight rather than on the morning somebody needs the file.
WORK=$(mktemp -d "$DEST/restore-test.XXXXXX")
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

gzip -t "$ARCHIVE" || fail "the compressed backup does not pass gzip -t"
gunzip -c "$ARCHIVE" > "$WORK/restored.db" || fail "the backup could not be decompressed"

# `|| true` on each of these: a database too damaged to open makes sqlite exit non-zero, and under
# `set -e` that would end the script on sqlite's exit code instead of on the sentence below. The
# backup still fails either way; the difference is whether whoever reads the alert is told why.
integrity=$(sqlite_query "$WORK/restored.db" "PRAGMA integrity_check" 2>/dev/null | head -1 || true)
[ "$integrity" = "ok" ] || fail "the restored database fails integrity_check: ${integrity:-it could not be opened at all}"

# The tables without which a restored file signs nobody in. Deliberately the core of the schema
# rather than all of it: the identity service is still growing tables, and a test that had to be
# edited every time one was added is a test somebody eventually deletes.
for table in people challenges sessions audit starts; do
  found=$(sqlite_query "$WORK/restored.db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='$table'" 2>/dev/null || true)
  [ "$found" = "1" ] || fail "the restored database has no '$table' table"
done

PEOPLE=$(sqlite_query "$WORK/restored.db" "SELECT count(*) FROM people" 2>/dev/null || true)
SESSIONS=$(sqlite_query "$WORK/restored.db" "SELECT count(*) FROM sessions" 2>/dev/null || true)
[ -n "$PEOPLE" ] || fail "the restored database cannot be queried"

rm -rf "$WORK"
trap - EXIT

# ── Retention ───────────────────────────────────────────────────────────────────────────────────
find "$DEST" -maxdepth 1 -name 'identity-*.db.gz' -mtime +$KEEP_DAYS -delete
# A scratch directory left behind by a run that was killed mid-restore-test.
find "$DEST" -maxdepth 1 -name 'restore-test.*' -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true

# ── Say what happened, in a form a human can read ───────────────────────────────────────────────
#
# The backup is the one scheduled job with nothing else recording it. BidZA writes a row to its
# job_run table for exactly this reason; there is no such table here and adding one would mean
# adding a table to a database that is meant to hold identity and nothing else. This log, and the
# health check's 48-hour freshness test that reads the same directory, do the same work from
# outside: a backup that quietly stopped running stops looking identical to one that ran.
HELD=$(find "$DEST" -maxdepth 1 -name 'identity-*.db.gz' | wc -l | tr -d ' ')
{
  printf '%s ok  archive=%s people=%s sessions=%s held=%s free=%s\n' \
    "$(date -u +%FT%TZ)" "$(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")" \
    "$PEOPLE" "$SESSIONS" "$HELD" "$(df -h "$DEST" | awk 'NR==2{print $4}')"
} >> "$DEST/backup.log"
chmod 600 "$DEST/backup.log"

echo "backup ok: $ARCHIVE ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")), restore-tested, $PEOPLE people / $SESSIONS sessions"
