# Data protection: the keys, and what happens to them

This is the operator's half of the data protection module. `apps/api/src/protection/contract.ts`
describes how information is sealed; this describes what happens to the key that seals it, which is
the half that decides whether any of the rest survives contact with an ordinary Tuesday. A correct
cipher and a key nobody can account for is not encryption, it is a delay.

Read [Privacy and security](PRIVACY-AND-SECURITY.md) first. It separates what is built from what is
designed from what is not built, and never lets the three blur; this document holds to the same
rule. Nothing below is a claim that MyThuso is POPIA-compliant, and several of the most important
paragraphs are about things that are deliberately not built. If you are reading this to decide
whether to trust the platform with health information, the section you want is
[the threat model](#the-threat-model), and after it [what is not built](#what-is-not-built).

## What exists today, and what this document describes

| | Now |
|---|---|
| The identity service's own key, sealing a name and a second-factor secret | **Built.** `apps/api/src/sensitive.ts`: AES-256-GCM, a random IV per value, an `MT1\0` envelope so values written before it existed still read back, `MYTHUSO_ENCRYPTION_KEY` validated at start-up, and a production write refused rather than stored in the clear. One key, no versions |
| The protection module's key hierarchy: root keys, HKDF per purpose and version, a data key per value | **Built.** `apps/api/src/protection/crypto.ts`: `MYTHUSO_PROTECTION_KEYS`, an `MT2\0` envelope, and refusals for a missing key, a duplicate version, two versions holding the same material, a wrong length, and a current version this server does not hold |
| Envelope encryption and re-wrapping | **Built.** `rotateSealedBytes` unwraps and re-wraps a data key and never touches a ciphertext |
| Rotation as an operation somebody performs | **Not built as tooling.** The primitive exists; the pass that walks the tables, the counter that says how many rows are still on the old version, and the command that runs it do not. The procedure below is written against the primitive, and where it says "run the re-wrap pass" there is nothing yet to run |
| The protection module wired into the service | **Not yet.** `apps/api/src/config.ts` does not read `MYTHUSO_PROTECTION_KEYS` and `apps/api/src/server.ts` exposes nothing from the module. Until it does, none of these keys are in use by anything |
| A second copy of a key | **Not built and nothing can build it for you.** It is a ceremony: [the key ceremony](#the-key-ceremony) |
| The keys checked at deploy time | **Built.** `deploy/deploy.sh` refuses to finish if the service is enabled and a key is missing, malformed, placeholder text, duplicated, shared between the two secrets, or present under the web root or the backups — and it never prints one. [deploy/README.md](../deploy/README.md#what-the-deploy-checks-about-the-keys) lists what it asks |
| Audit chain integrity watched | **Built on this side** — `deploy/ops/mythuso-healthcheck.sh` asks every five minutes. It needs an endpoint the service does not have yet; see [what this assumes](#what-this-assumes-about-code-that-is-not-merged-yet) |

Everywhere below, a paragraph about a rotation *pass* is describing an operation with no tooling
yet. Where a command exists today it is shown as a command.

## The key hierarchy

One root key. It is never used to encrypt anything.

From it, HKDF-SHA256 derives a separate key for each job the module does: `record` seals field
values, `index` generates blind indexes, `audit` chains the audit log, `share` seals anything handed
to a third party. Deriving rather than reusing means a compromise of one purpose does not hand over
the others — the key that generates the index which finds a record cannot open the record, so an
index leak is an equality oracle and not a disclosure. Each derived key is versioned, because a
rotation that cannot be described is a rotation nobody performs.

Under the record key, every record gets its own random data key, and only that data key is wrapped
under the derived record key. The field value is encrypted with the data key; the wrapped data key
travels beside the ciphertext.

That indirection is what makes rotation affordable, and affordability is the whole argument. Without
it, changing the root key means decrypting and re-encrypting every sealed value in the database — an
operation whose cost grows with the record store, which needs the whole store writable for its
duration, which is not resumable in any obvious way, and which therefore never happens. With it, a
rotation re-wraps data keys: a few hundred bytes per record, row by row, resumable, and the
ciphertext itself is never touched. The difference between the two is the difference between a
rotation that occurs annually and a rotation that stays in a document like this one being read as
aspiration.

The envelope carries associated data — record type, record identifier, field and subject — and all
of it is authenticated. Nothing in it is secret. It exists so that lifting one patient's sealed
diagnosis into another patient's row produces a value that fails to open rather than one that opens
as somebody else's.

## Where the keys live, and where they must never live

There are two secrets, in one file, and they are not interchangeable.

`MYTHUSO_ENCRYPTION_KEY` is the identity service's own key — one key, no versions, sealing a name
and a second-factor secret in `apps/api/src/sensitive.ts`. `MYTHUSO_PROTECTION_KEYS` is the root of
everything in this document: the data protection module's keys, written as `1:<key>,2:<key>`, hex or
base64, thirty-two bytes each, with a bare key read as version 1 so that a first deployment does not
have to understand rotation in order to happen. More than one version is the normal state during a
rotation, not an exception. Two more variables go beside it: `MYTHUSO_PROTECTION_KEY_CURRENT`, the
version new writes are sealed under (defaulting to the highest present), and
`MYTHUSO_PROTECTION_INDEX_VERSION`, the version blind indexes are computed under — which is separate
for a reason worth reading twice in [rotation](#rotation).

Both live in `/etc/mythuso/api.env`, owned by root, mode `0600`, read by systemd's
`EnvironmentFile=`. They must never be the same value: they protect different things, they are
rotated on different occasions and by different means, and a shared secret means neither can be
rotated without the other's consequences. The deploy refuses if they are.

Where a key must never be:

- **Not in the repository.** `deploy/.deployignore` excludes every env file from every rsync, and
  that pattern is not to be narrowed; it was widened to this after a `.env.local` reached production
  on this same box.
- **Not in the database it protects,** and not in a backup of that database. A key stored beside its
  own ciphertext is a longer ciphertext. `deploy/ops/mythuso-backup.sh` searches each fresh snapshot
  for the key's own characters before compressing it, and deletes the snapshot rather than keeping
  it if they are there.
- **Not in the web bundle.** `deploy/deploy.sh` scans the built output for both variable names and
  for anything shaped like a private key, and refuses to publish if it finds one. It also searches
  the published web root and the backup directory for each key's actual material, which catches the
  case the name-scan cannot: a value that arrived without its label.
- **Not in a log.** Not in the journal, not in `/var/log/mythuso/alerts.log`, not in an alert email,
  not in a core dump — `deploy/ops/mythuso-api.service` sets `LimitCORE=0` so a crashing process
  cannot write its own memory to disk. Nothing in `deploy/` prints a key; the checks that need to
  know a key is correct compute a fingerprint instead.
- **Not in a chat message, an email, a screenshot or a shared terminal recording.** This is the way
  keys actually leak. Every other item on this list is enforced by something; this one is not, and
  cannot be.

A fingerprint is the thing you may write down freely — sixteen characters of a SHA-256 of the key
material, which identifies *which* key is in play without disclosing any of it. Not enough to attack
a 256-bit key; enough for two people to confirm over a phone call that they hold the same one, and
enough to tell after a restore whether the key on the box is the one the archive was sealed under:

```sh
# the identity service's key
sed -n 's/^MYTHUSO_ENCRYPTION_KEY=//p' /etc/mythuso/api.env | tail -1 | tr -d "\"' \n" \
  | sha256sum | cut -c1-16

# every protection key version, one line each, no material printed
sed -n 's/^MYTHUSO_PROTECTION_KEYS=//p' /etc/mythuso/api.env | tail -1 | tr -d "\"' " \
  | tr ',' '\n' | while IFS= read -r entry; do
      case "$entry" in *:*) v=${entry%%:*}; m=${entry#*:} ;; *) v=1; m=$entry ;; esac
      printf 'version %s  %s\n' "$v" "$(printf '%s' "$m" | sha256sum | cut -c1-16)"
    done
```

The deploy computes these the same way and remembers them in `/etc/mythuso/key.fingerprint`, one
`name fingerprint` line each. That file is not secret and is deliberately not the key: it exists so
that a key which changed without anybody rotating it is something the next deploy says out loud.

## The key ceremony

This is written for a company of a handful of people with one shared VPS, because that is what
MyThuso is. A procedure written for a bank is a procedure that will be skipped on the night it
matters, and a skipped procedure protects nothing. What follows takes about forty minutes and needs
two people and one envelope, and it is the same ceremony for either key.

**Who is present.** Two people: whoever administers the server, and the Information Officer named in
[Privacy and security](PRIVACY-AND-SECURITY.md) — or, if those are the same person, a second
director. The point of the second person is not distrust. It is that a key held by exactly one
person is a key that leaves the company when that person is unreachable, and that a witness makes
the register entry a record rather than a claim.

**In the room, not on a call.** No screen share, no recorded meeting, no photograph. A key that has
been on a video call is on somebody's cloud recording.

**1. Generate it on the server, into the file, without it ever being printed.**

```sh
ssh <target>
umask 077
touch /etc/mythuso/api.env && chown root:root /etc/mythuso/api.env && chmod 0600 /etc/mythuso/api.env

# the identity service's own key
printf 'MYTHUSO_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> /etc/mythuso/api.env

# the data protection module's first root key, version 1
printf 'MYTHUSO_PROTECTION_KEYS=1:%s\n' "$(openssl rand -hex 32)" >> /etc/mythuso/api.env
```

Command substitution means neither key is ever typed and neither appears in shell history — the
history records the command, not its output. `openssl rand` reads the kernel's random source; do not
substitute a passphrase, a UUID, or anything a person chose. Thirty-two bytes of key material is
thirty-two bytes of key material, and everything else is a shorter key wearing a disguise. Generate
the two separately, from separate calls: one value used for both is refused by the deploy, and
rightly.

**2. Record the fingerprints** with the commands in the section above, and read them aloud so both
people have seen the same characters.

**3. Make the second copies, on paper.** One lost laptop, one dead disk or one person leaving must
not be the end of the platform, and there is no second copy unless somebody makes one.

```sh
sed -n 's/^MYTHUSO_ENCRYPTION_KEY=//p' /etc/mythuso/api.env | tr -dc '0-9a-fA-F' | fold -w4 | paste -sd' ' -
```

Sixty-four hex characters in sixteen groups of four. One person writes; the other reads back. Then
verify what was written rather than trusting the transcription — type the paper copy back in and
compare its fingerprint:

```sh
read -rs -p 'from the paper: ' copy; printf '%s' "${copy// /}" | sha256sum | cut -c1-16; unset copy
```

`read -rs` does not echo and does not enter history. If those sixteen characters do not match the
ones from step 2, the paper is wrong; burn it and write it again. Do the same for each protection
key version — write the version number beside it, because a key with no version number is a key
nobody can put back. Then clear the screen and close the session.

**4. Protect the paper copies.** Fold them, seal them in a tamper-evident envelope, and both people
sign across the flap and date it. A signature across a flap is not security; it is evidence, which
is the part you can actually get for free. Then put the envelope somewhere that is not the office
and not either person's laptop bag. In practical order of preference for a small South African
company:

- A bank safe custody box. A few hundred rand a year, two named signatories, and the bank's problem
  to guard. This is the recommendation.
- A fire-rated domestic safe at a director's home, in a different building from the office, with the
  safe's own key or code held by the other person. Cheaper, and it survives an office burglary and
  an office fire, which are the two realistic events.
- The company's existing password manager, in a vault only two named people can open. This is a
  legitimate choice and it is worth being clear about what it costs: the keys now depend on that
  vendor's security and on two people's master passwords, and they are now recoverable by anybody
  who compromises either. It is also the only option on this list that is available at 02:00 from a
  phone, which is a real operational argument in its favour.

What is *not* an acceptable second copy: an email to yourself, a note in a chat, a file in a Drive
folder "just for now", a photograph of the screen, or a second file on the same server. Each of
these has the property that the copy fails at the same moment as the original or leaks without
anybody noticing.

**5. Write the register entry.** Date, both names, which server, the fingerprint of each key and its
version, where the sealed envelope went, and who can open it. Keep it with the company's minutes.
Never the key itself.

**6. Prove it before you walk away.** Restart the service, sign in once with a test account, confirm
that a sealed value opens, and confirm the health check goes green:

```sh
systemctl restart mythuso-api && /opt/mythuso/ops/mythuso-healthcheck.sh
```

A ceremony that ends before a sealed value has been opened is a ceremony that may have written a
typo into the only copy of a key.

## Rotation

Rotating `MYTHUSO_ENCRYPTION_KEY` is **not built**: the identity service has one key and no
re-sealing migration, exactly as `docs/PRIVACY-AND-SECURITY.md` says. Everything below is about
`MYTHUSO_PROTECTION_KEYS`, where the key ring, the versions and `rotateSealedBytes` do exist — and
where the pass that walks the tables, and the count of rows still on the old version, **do not**.
Step 4 below is currently a step with nothing to run. The procedure is written first on purpose: a
rotation designed during an incident is a rotation performed badly.

**When, on a schedule.** Once a year, in the first working week of March, because that is beside the
financial year end and therefore on a calendar somebody already reads. A rotation date that lives
only in a document is a rotation that happens in year one.

**When, on suspicion.** Immediately, and without waiting to be certain:

- Anybody with root on the server, or with access to the safe or the vault, leaves the company or
  changes role.
- A laptop, phone or password-manager account belonging to anybody in the paragraph above is lost,
  stolen or compromised.
- `/etc/mythuso/api.env` is found with the wrong mode or the wrong owner, or the deploy's key check
  refuses, or a fingerprint changed that nobody changed.
- A backup archive is found anywhere it was not put deliberately.
- The hosting provider reports a compromise, a snapshot taken by anyone else, or a migration you did
  not ask for.
- Anybody cannot account for where a copy of a key is. Not knowing is the same as knowing badly.

Suspicion is a low bar deliberately. Rotation costs an evening; the alternative costs a section 22
notification.

**Read this before step 1.** Rotation re-wraps data keys; it does not re-encrypt ciphertexts. A data
key that has leaked stays good for its own record for ever, so a *compromise* is a re-encryption and
not a rotation — see [the compromise section](#what-happens-when-a-key-is-compromised). Rotation
limits what a future disclosure of the root key reaches. It does not undo a past one.

**The steps.** Every one is run with two people present, exactly as the ceremony is, and none of
them ever displays a key.

1. **Verify and snapshot first.** Check the audit chain, then take a backup by hand
   (`/opt/mythuso/ops/mythuso-backup.sh`). If the backup does not restore, do not rotate. Rotating on
   top of a database you cannot restore turns one bad evening into a lost platform.
2. **Pin the blind-index version before anything else changes.** This is the step that is easy to
   skip and expensive to skip. Blind indexes are computed under one key version, and when
   `MYTHUSO_PROTECTION_INDEX_VERSION` is unset the module uses the **lowest** version configured. So
   the moment you eventually retire version 1, every existing index silently starts being computed
   under version 2 and stops matching anything already stored — a search that quietly returns
   nothing, which is the worst failure mode a clinical system has. Pin it now, while the answer is
   still obvious:

   ```sh
   printf 'MYTHUSO_PROTECTION_INDEX_VERSION=1\n' >> /etc/mythuso/api.env
   ```

   Indexes are then rotated as their own project — rebuild them under a new version deliberately,
   with the old version still configured so that both can be searched — and never as a side effect
   of retiring a key. The deploy warns whenever there is more than one version and no pin.
3. **Add the new version beside the old one, without making it current.** One line, edited by the
   machine so that no key is displayed:

   ```sh
   umask 077
   old=$(sed -n 's/^MYTHUSO_PROTECTION_KEYS=//p' /etc/mythuso/api.env | tail -1 | tr -d "\"' ")
   sed -i '/^MYTHUSO_PROTECTION_KEYS=/d' /etc/mythuso/api.env
   printf 'MYTHUSO_PROTECTION_KEYS=%s,2:%s\n' "$old" "$(openssl rand -hex 32)" >> /etc/mythuso/api.env
   printf 'MYTHUSO_PROTECTION_KEY_CURRENT=1\n' >> /etc/mythuso/api.env
   unset old
   grep -c '^MYTHUSO_PROTECTION_KEYS=' /etc/mythuso/api.env    # must print exactly 1
   ```

   The awkward shape has a reason: `printf` is a shell builtin, so neither the old keys nor the new
   one ever appear on a command line, and on a box shared with five other sites a command line is
   readable by anybody who can run `ps`. Never assemble a key with `sed -i "s/…/$key/"`.

   Pinning `CURRENT=1` explicitly is what makes this step change nothing: without it, "current"
   defaults to the highest version present, and merely adding a key would start sealing under it.
   Take the new version's fingerprint, make its paper copy, put it in the envelope, write the
   register entry. It is a new key and it acquires every obligation the first one had.
4. **Make it current.**

   ```sh
   sed -i 's/^MYTHUSO_PROTECTION_KEY_CURRENT=.*/MYTHUSO_PROTECTION_KEY_CURRENT=2/' /etc/mythuso/api.env
   grep -c '^MYTHUSO_PROTECTION_KEY_CURRENT=' /etc/mythuso/api.env    # must print exactly 1
   systemctl restart mythuso-api
   ```

   New writes seal under version 2. Everything already written still opens, because version 1 is
   still in the ring. This is reversible in one line.
5. **Re-wrap.** Run the re-wrap pass over each table holding sealed values. It rewrites sixty bytes
   per value and leaves the ciphertext alone, so it is interruptible and resumable and can be run in
   batches over several evenings against a live service. **This tooling does not exist yet** —
   `rotateSealedBytes` is the primitive it would be built on.
6. **Verify.** Three things, in this order: no value is still wrapped under version 1; the audit
   chain still verifies from its origin; and a person opens one record of each record type by hand
   and reads it. The third is what catches a re-wrap that "worked" against an empty table.
7. **Wait, then retire version 1.** It must stay in `MYTHUSO_PROTECTION_KEYS` until every backup
   archive sealed under it has aged out — the archives keep fourteen days and erasure runs on a
   seven-day grace, so **at least twenty-one days**, and there is no hurry at all. An archive whose
   key has been deleted is not a backup. Before removing it, confirm
   `MYTHUSO_PROTECTION_INDEX_VERSION` does not still name it; if it does, the indexes have to be
   rebuilt under a version that survives, first. Then, again without a key on a command line:

   ```sh
   old=$(sed -n 's/^MYTHUSO_PROTECTION_KEYS=//p' /etc/mythuso/api.env | tail -1 | tr -d "\"' ")
   kept=$(printf '%s' "$old" | tr ',' '\n' | grep -v '^1:' | paste -sd, -)
   sed -i '/^MYTHUSO_PROTECTION_KEYS=/d' /etc/mythuso/api.env
   printf 'MYTHUSO_PROTECTION_KEYS=%s\n' "$kept" >> /etc/mythuso/api.env
   unset old kept
   systemctl restart mythuso-api
   ```

   and only then destroy that envelope, both people present.
8. **Record it.** The new fingerprint, the date, who was present, and the date the old key may be
   destroyed. Update `/etc/mythuso/key.fingerprint` on the server too, or the next deploy will report
   the change as one nobody performed — which is exactly what it is for.

**How to abort halfway.** Aborting is *stopping*, not reverting. After step 4 both versions are in
the ring and both work: values under version 1 open, values under version 2 open, and new writes go
to version 2. An interrupted re-wrap is not a broken state — it is a rotation that is partly done,
and it can be finished next week from wherever it stopped. Do not "tidy up" by deleting a key.

The one case that needs an actual reversal is a new key that is itself suspect — a witness who
should not have been there, a screen that was being shared. Then set the current version back and
**leave the suspect key in the ring**, so that values already sealed under it still open:

```sh
sed -i 's/^MYTHUSO_PROTECTION_KEY_CURRENT=.*/MYTHUSO_PROTECTION_KEY_CURRENT=1/' /etc/mythuso/api.env
systemctl restart mythuso-api
```

Version 1 is current again, version 2 is still readable, nothing is lost, and the file is left in an
unusual but correct state: the current version is lower than a version still in the ring. Leave it
that way, write it in the register, and let the next rotation go to version 3. Renumbering to make
it look tidy is how a key that still opens records gets deleted. And a suspect key that sealed
records is a compromise, so the next section applies.

The one irreversible action in the whole procedure is removing a key from `api.env`. So the rule,
which is worth more than the rest of this section: **never remove a key on the same day you add
one.** If you find yourself deleting a key to fix a problem, stop — the problem is somewhere else.

Several of the half-finished states refuse the deploy rather than sitting there: a version whose key
is not thirty-two bytes, a version listed twice, two versions holding the same material, a current
or index version naming a key this server does not hold, and either key appearing under the web root
or the backups.

## What happens when a key is lost

Plainly, so that nobody has to infer it: **every value sealed under a lost key is gone.** Not
difficult to recover, not recoverable at cost, not recoverable by us because we wrote the software.
Gone. AES-256-GCM with an unknown key has no back door and we did not build one; that is the same
property that makes it worth using.

What that means today, for the identity service: names and second-factor secrets become
unreadable. Mobile numbers stay — they are the lookup key and are stored in the clear — so accounts
still exist, people can still sign in with a one-time code, and what they lose is their name on the
screen and their authenticator enrolment, which they can redo. Unpleasant and survivable. This is
one of the several reasons the identity service was allowed to exist ahead of the rest of the
controls.

What it would mean for a patient record: a sealed observation, diagnosis, result or prescription
with no key is a record that cannot be read and, under South African clinical record-retention
duties, still must be kept. That is both a loss of the person's care history at the moment a
clinician needs it and a failure of the retention duty, at the same time, permanently. **Do not put
clinical records behind a single key with no second copy.** If the ceremony above has not been
performed, the correct answer to "may we store a clinical record now" is no.

The honest alternatives, with what each costs:

- **An escrowed second copy** — the paper in the envelope. This is what this document recommends.
  What it costs you: the key now exists in two places, and the safe and its holders become part of
  the attack surface. Anybody who can open that envelope can open every record ever sealed. You have
  traded "unrecoverable" for "two people and a safe", and that is a trade, not a free improvement.
  It is the right trade for health data, because unrecoverable health data harms the patient.
- **No escrow at all.** Genuinely stronger against disclosure — there is nothing to steal but the
  live server — and it means a single accident ends the platform. Defensible for a service holding
  disposable data. Not defensible for a health record.
- **A managed KMS.** The key stops being a file on a box. What it costs you: the provider holds it
  and can be compelled to use it, cross-border processing and section 72 come into scope, there is a
  monthly bill, and the service acquires an availability dependency — no KMS, no sign-ins. Worth
  reconsidering before the first clinical record, and named again in [what is not
  built](#what-is-not-built).
- **Splitting the key into shares** (Shamir, two of three). Removes the single envelope. What it
  costs you: a recovery that needs two of three people reachable simultaneously, which at two in the
  morning during an outage is a platform that stays down. Considered and declined at this size,
  rather than never thought of; revisit when there are enough staff for two to be reachable.

## What happens when a key is compromised

Rotation does not un-read what has already been read. This is the sentence people skip.

If a root key has been disclosed — a copy taken, an envelope found open, a password-manager account
compromised, a memory snapshot taken by the hosting provider — then assume **everything ever sealed
under it is disclosed**, including every value inside every backup archive still on disk, because
those archives are sealed under the same key. Rotating limits what is exposed from that moment
forward. It does nothing about what was already exposed, and treating a completed rotation as having
handled the incident is the most common way an organisation reports a breach late.

There is a second, sharper reason a rotation is not a remedy here, and it is a property of envelope
encryption rather than a shortcoming of this implementation. Rotation re-wraps data keys; it does
not re-encrypt ciphertexts. So a data key that was recovered from a disclosed root key stays good
for its own record for ever, whatever the root key is afterwards. **A compromise is a re-encryption,
not a rotation** — every affected value has to be opened and sealed again under a fresh data key —
and that tooling does not exist either. Until it does, the honest answer after a root-key compromise
is that the exposure is permanent for everything already written, and the response is the section 22
process rather than a technical fix.

**What to do, in order.**

1. **Verify the audit chain before touching anything**, and write the head hash down outside the
   machine. A compromise plus a rewritten audit log is the case that cannot be investigated at all.
2. **Preserve, then act.** Copy the current backup archives and the alert log somewhere the
   suspected route cannot reach. Do not clean up.
3. **Rotate**, by the procedure above, but knowing what it does and does not achieve.
4. **Rotate `MYTHUSO_AUTH_PEPPER` as well**, which signs everybody out. Sessions and codes are
   peppered rather than sealed under this key, but an attacker who reached the environment file
   reached both.
5. **Force re-enrolment of every second factor.** A disclosed TOTP secret lets somebody mint valid
   codes for that account for ever, and re-sealing the same secret under a new key changes nothing
   at all. Rotation does not fix this; re-enrolment does. Nothing in the codebase does this yet.
6. **Run the POPIA section 22 process.** The Information Officer named in
   [Privacy and security](PRIVACY-AND-SECURITY.md) owns it: notify the Information Regulator and
   every affected data subject in writing as soon as reasonably possible after there are reasonable
   grounds to believe unauthorised access occurred, with enough detail for the person to protect
   themselves — what was accessed, the likely consequences, what has been done about it, what they
   should do, and who the responsible party is. A delay is permissible only where a public body
   determines it would impede a criminal investigation, and that is a determination somebody else
   makes, not a judgement call made internally. Take counsel; do not draft the notification alone.
7. **Write the incident up**, including how the key was reachable, and change that.

## Backups, and the refusal that keeps them honest

`deploy/ops/mythuso-backup.sh` says without hedging that its archives are not encrypted, and
[deploy/README.md](../deploy/README.md) repeats it. That is a defensible position today only because
of a single sentence: the identity database holds a name, a mobile number and a second-factor
secret, and no health information. Names and second-factor secrets are sealed inside the database
itself and survive being carried away; mobile numbers are the lookup key and are in the archive in
the clear, and a list of South African mobile numbers is personal information under POPIA.

**The refusal is what keeps that sentence true rather than merely believed.** The script reads the
schema of the live database on the server and refuses to run at all if a table appears whose name
looks clinical, using the same word list `scripts/check-boundaries.mjs` applies to the source. It
does not warn, and it does not encrypt-on-the-fly; it stops, alerts, and exits non-zero. The reason
it is written that way is that the argument for unencrypted backups is entirely contingent on the
contents, so the honest control is not "protect health data better in the backup", it is "refuse to
have a backup at all once there is health data in it". A control that degrades gracefully here would
be a control that lets the contingent argument outlive its condition.

There is now a second refusal beside it: before compressing, the script searches the fresh snapshot
for the root key's own characters and, if it finds them, deletes the snapshot and fails rather than
keeping it. A backup that contains the key that opens it is a backup with no encryption at all, and
that mistake is made by writing configuration into a table, which is exactly the sort of thing that
gets done at four in the afternoon. It finds the key in the text form it has in `api.env`, which is
how it would actually get there; it would not find the raw bytes or a re-encoded copy, so it is a
guard against the accident rather than a proof.

**What must change before the clinical-table refusal may be lifted.** All five, not some:

1. **An encrypted destination, under a key that is not the root key and cannot be read on the
   server.** The right shape is asymmetric: `age` or `gpg` to a recipient public key whose private
   half lives with the escrowed paper copy and never touches the VPS. Then the server can write
   backups and cannot read old ones, which means a compromise of the server does not hand over the
   archive history. A symmetric backup passphrase stored on the same box gives none of that.
2. **Off-site.** The archives are currently on the same disk as the database, which protects against
   corruption and not at all against losing the server. With clinical data in them, off-site also
   means a location assessed under section 72 if it is outside South Africa.
3. **Restore-tested through the encryption.** The script's existing discipline — decompress, open,
   `integrity_check`, query the tables and rows that matter, every night — must survive the change
   rather than being replaced by "the file exists and is large". The restore test must decrypt with
   the real recipient key, which means the private half has to be reachable by whoever runs the test,
   which is itself a decision to write down.
4. **A retention answer for clinical records,** which is a different question from the identity
   service's. Fourteen days of archives means somebody erased today is present in the oldest archive
   for a fortnight; for clinical records the countervailing duty is a legally required retention
   period, and `docs/PRIVACY-AND-SECURITY.md` lists that as required and not built.
5. **The backup key in the register,** with its own ceremony entry, its own fingerprint and its own
   rotation date.

And even when all five are true, the change to make is to narrow the refusal — refuse if a clinical
table appears *and* the destination is not an encrypted, off-site, restore-tested one — not to
delete it.

## The threat model

Specific to what MyThuso actually is, in September 2026: one virtual private server that also serves
agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za; a SQLite file on
that machine's local disk; one person with root; no hardware security module and no managed key
service; and third parties for SMS and mail, some of them not in South Africa.

For each threat: what the module stops, what it makes *discoverable* rather than impossible, and
what it does not touch at all. The third column is the important one.

| Threat | Stopped | Made discoverable | Untouched |
|---|---|---|---|
| Stolen disk, or a stolen backup archive | Sealed field values are ciphertext | Nothing — theft of a disk is silent | Mobile numbers, metadata, row counts, timestamps, schema, blind-index equality. And the key itself if the whole machine was taken |
| Database read without the key | The sealed values. This is the case the module is genuinely good at | Reads that went through the gate; a direct file read leaves no trace | Which people exist, who saw whom and when, and — through the blind index — which sealed values are probably equal to each other |
| A compromised application process | **Nothing.** The process holds the key in memory by necessity | Only what the intruder chose to do through the gate | Everything. Code execution in the service is equivalent to holding the key |
| An insider with legitimate access | Nothing, by design — they are permitted to read | Every reveal: who, which capability, which purpose, whose record, when. Break-glass is loud | What they do afterwards: a screenshot, a photograph, a memory |
| A malicious operator with database write access | Nothing. Root can read the key file and write any row | An edited or deleted audit row breaks the hash chain, and the health check now also catches a chain that was recomputed shorter | A determined operator who recomputes the chain forward and has the key |
| A lost or leaked root key | Nothing | Nothing, unless the leak is noticed by other means | Everything sealed under it, in the database and in every archive |
| A neighbouring site on the same box | File permissions, not the module | Nothing | A neighbour compromise that escalates to root |
| The hosting provider | Nothing | Nothing | The disk, the hypervisor, and a snapshot of running memory containing the key |

Four of those need their own paragraph, because the table understates them.

**The application process holds the key.** For as long as the service runs, the root key is in the
memory of a Node process — every version of it, because the old ones have to be there for the old
records to open — since there is no other way to open a sealed value on demand. Anybody
who can execute code inside that process — remote code execution, a poisoned dependency, a debugger
attached as root, `/proc/<pid>/mem`, a core dump — has the key and everything it opens, and the
module stops none of it. What limits the exposure is not cryptographic: the service has **no
dependencies at all**, only `node:http`, `node:crypto` and `node:sqlite`, so there is no supply chain
to poison, which is a real mitigation and the main one; it runs as an unprivileged user under a unit
with `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices` and a
restricted address family; and `LimitCORE=0` now stops a crash writing that memory to disk. What is
*not* done: the key is not zeroed after use, because Node's garbage collector makes that unreliable
and claiming it would be theatre; and the key is in the process environment, so anybody who is
already root can read it out of `/proc/<pid>/environ` without touching the file.

**The insider is where the module earns its place.** A vetted nurse, a dispatcher, an administrator —
encryption does nothing about any of them, because their whole role is to be able to read. What the
gate adds is that reading is not a boolean: it asks the purpose as well as the identity, so a
dispatcher reaching for a diagnosis is refused rather than merely recorded, and every reveal and
every refusal is a row naming who, what, why and when. Break-glass exists, is allowed, and is loud.
None of that survives the screen itself: a photograph of a monitor is outside every control in this
codebase, and the answer there is the vetting register, the contract the person signed, and their
knowing that the trail has their name on it.

**The malicious operator is the honest limit of a single database.** One person has root. That
person can read `/etc/mythuso/api.env`, restart the service, and write any row. The audit hash chain
does not prevent that; it makes it *discoverable*, because an edited or deleted entry breaks the
chain and `verify()` names the first entry that does not follow. But somebody with the key and write
access can also recompute the chain forward from the point they altered, and then it verifies
cleanly. Two things narrow that, and both are honest about being partial: the health check now keeps
a monotonic record of the chain's length, so a chain that verifies but has become *shorter* is
caught even when it was recomputed — and the operator can edit that file too, so it catches
carelessness, not determination. The real fix is publishing the head hash off the machine on a
schedule, to an address the operator does not control, so that yesterday's head can be compared
against today's chain. That is **not built**, it is about ten lines, and it is the single change that
would turn the audit chain from evidence against accident into evidence against intent.

**The hosting provider owns the machine.** No key held on a computer you do not own is safe from the
person who owns it: a hypervisor snapshot of running memory contains the root key, and the disk
contains everything else. Nothing in this module changes that, and no amount of key hygiene does.
The mitigations are contractual and jurisdictional rather than technical — an operator agreement
under POPIA section 21, and hosting in South Africa so that section 72 and the question of who may
compel a disclosure have simple answers. Alongside that: the SMS provider sees every mobile number
and every one-time code, and the mail relay sees the body of every alert, which is why nothing in
`deploy/ops/` ever puts a key or a record value in an alert.

## What is not built

| Not built | Does it matter, here, now |
|---|---|
| An HSM or a managed KMS | **Matters.** It is the only thing on this list that removes "the root key is a file on a machine somebody else owns". Deferred for cost, for the availability dependency, and because a cross-border KMS raises section 72 questions that a startup cannot answer casually. Reconsider before the first clinical record, not after |
| Split-knowledge or quorum key custody | **Theatre at this size.** A two-of-three recovery needing two reachable people at 02:00 is a platform that stays down. Revisit when there are enough staff for that to be realistic |
| Per-patient key derivation | **Matters more than it looks.** There is already a data key per value, but they are all wrapped under one derived record key; wrapping a patient's under a key of their own would make erasure a matter of destroying that key — the one erasure that also reaches the backup archives, because a destroyed key un-reads the archives too. The current erasure deletes rows and leaves a tombstone, and an archive still holds the person for a fortnight |
| Forward secrecy for data at rest | **Nearly meaningless here.** A clinical record must be readable next year by definition; there is no session to protect. Named only because it appears on checklists and its absence is not a finding |
| Automated rotation | **Correctly absent.** An unwatched rotation against a key with one escrow copy is a way of losing everything on a schedule. Rotation should stay a decision a person makes on a morning, with a second person present |
| Logging of reads of the key file | Nothing records who read `/etc/mythuso/api.env`. `auditd` would, cheaply. Not built, and worth doing before there are two people with root |
| Publishing the audit head hash off the machine | The change that would make the audit chain evidence against a determined operator. Not built; see the threat model |
| Encrypted, off-site backups | Not built, deliberately and visibly, and the clinical-table refusal is what holds the position together. See [backups](#backups-and-the-refusal-that-keeps-them-honest) |
| Re-encryption after a compromise | **Matters, and is the gap most likely to be mistaken for covered.** Rotation re-wraps data keys; it does not replace them. A data key recovered from a disclosed root key opens its record for ever, so a compromise needs every affected value opened and sealed again. Nothing does that |
| Re-enrolment of second factors after a compromise | No mechanism exists. Today it would be done by hand, account by account |

## What this assumes about code that is not merged yet

The module landed while this was being written, so most of it is now description rather than
assumption. Three things are still assumptions, and each is a place where the code and this document
could disagree:

- **The audit chain's `verify()` becomes reachable from the loopback as `GET /health/audit`,**
  answering with the shape `AuditChain.verify()` already returns — `{"intact":true,"length":N,"head":"…"}`
  or `{"intact":false,"brokenAt":"…","length":N}` — and with no record content in it.
  `apps/api/src/server.ts` has no such route today. `deploy/ops/mythuso-healthcheck.sh` treats a 404
  as "not built yet" and reports it as a note, so it is safe to install before the route exists; when
  the route appears under a different path or shape, that one `curl` line is what needs changing.
- **`apps/api/src/config.ts` will read `MYTHUSO_PROTECTION_KEYS`** and hand it to
  `parseRootKeys`, so that a malformed key ring is a service that refuses to start. It does not read
  it yet, and until it does the deploy's check is the only thing on the server that looks at those
  keys at all. The deploy decides whether to *require* them by grepping the deployed source for the
  variable name, so it starts requiring them on the deploy after that wiring lands, with nothing to
  remember.
- **The rotation pass, and the count of values still on an old version,** get built. The primitive
  (`rotateSealedBytes`) exists; the operation does not. Step 5 of [rotation](#rotation) is a step
  with nothing to run, and step 6's first check has nothing to answer it.

## Verified, and not

Everything in `deploy/` here parses under `bash -n` and is clean under `shellcheck`, and every
branch of the deploy's key check and the health check's audit-chain check was exercised against
fixtures on a workstation — a stand-in `api.env` for each fault, and a local HTTP server returning
each `verify()` shape.

None of it has been run against the server. No deploy was performed, no key was generated on the
box, no unit was installed or reloaded, `systemd-analyze verify` was not available to check the unit
file, and `/health/audit` has not been called because it does not exist yet. The systemd directives
added to `mythuso-api.service` are therefore unverified in place: they will take effect only after a
deploy installs the unit and somebody runs `systemctl restart mythuso-api`, which the deploy says
out loud when the unit has changed under a running service. And the key ceremony has not been
performed — that is a decision for two people and an envelope, not for a commit.
