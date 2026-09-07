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
| Rotation as an operation somebody performs | **Built.** `apps/api/src/protection/rotation.ts` and `npm run rotate -w @mythuso/api`: a `key_version` column beside each sealed blob, indexed, so "how much is left" selects rather than scans; batches in their own transactions; a dry run that decodes every envelope it would rewrite and writes none of them; and `--limit` so stopping is a decision. There is no cursor and nothing is remembered between runs, which is what makes it resumable and idempotent |
| Sealed values for it to rotate | **Built.** `apps/api/src/vetting/` holds the workforce evidence — certificates, clearances, identity documents — every one of them sealed through the gate and registered with the rotation by the module that owns the table |
| Offline capture, and where its ciphertext lives | **Built, and it holds none.** `apps/api/src/capture` seals every queued entry through the gate and hands the envelope straight back to the device with the receipt; the ledger keeps a SHA-256 of those bytes, their length and the key version, and no blob. So it registers no sealed column with the rotation — there is nothing to re-wrap — and the split is deliberate: **this service holds the key ring and not the ciphertext**, which is what makes "it cannot read a reading" a fact about what is on disk rather than a claim about what the code does |
| The protection module wired into the service | **Built.** `apps/api/src/config.ts` reads and validates `MYTHUSO_PROTECTION_KEYS`, `apps/api/src/server.ts` constructs the module, the gate decides every read of vetting evidence and the subject-access route, and `GET /health/audit` answers with `verify()`'s own shape |
| A second copy of a key | **Not built and nothing can build it for you.** It is a ceremony: [the key ceremony](#the-key-ceremony) |
| The first two reviewers, and who cleared them | **Made small rather than closed.** `apps/api/src/vetting` still has a bootstrap, because somebody has to clear the first reviewer. It now takes a signed, single-use, fifteen-minute authorisation minted at a console, it names the parties and the two people deciding, every step of it is a distinct entry in the audit chain, and every check it decided is marked as standing on it until a real reviewer decides it again. What it is not is closed: see [the bootstrap ceremony](#the-bootstrap-ceremony) |
| The keys checked at deploy time | **Built.** `deploy/deploy.sh` refuses to finish if the service is enabled and a key is missing, malformed, placeholder text, duplicated, shared between the two secrets, or present under the web root or the backups — and it never prints one. [deploy/README.md](../deploy/README.md#what-the-deploy-checks-about-the-keys) lists what it asks |
| Audit chain integrity watched | **Built on this side** — `deploy/ops/mythuso-healthcheck.sh` asks every five minutes. It needs an endpoint the service does not have yet; see [what this assumes](#what-this-assumes-about-code-that-is-not-merged-yet) |

Every step of the rotation procedure below now has something to run. Where a command exists it is
shown as a command.

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

There are two secrets in one file, and they are not interchangeable — with a third variable beside
them that is a secret of a different kind. `MYTHUSO_IDENTITY_API_KEY` is the accredited identity
provider's partner key, and nothing in this document protects anything with it: it is presented to
somebody else's server. It belongs on the list below all the same, for the ordinary reason — leaking
it lets somebody open verification sessions billed to MyThuso and, worse, forge the callbacks that
answer them. It is not held today, because no provider has been contracted. It arrives with four
plain settings that are not secret — `MYTHUSO_IDENTITY_PROVIDER`, `MYTHUSO_IDENTITY_PARTNER_ID`,
`MYTHUSO_IDENTITY_SANDBOX` and `MYTHUSO_IDENTITY_CALLBACK_URL` — and `apps/api/src/config.ts` refuses
to start a production service where the provider is named with no key behind it, or where the sandbox
is switched on. `deploy/deploy.sh` scans the built web bundle for this name alongside the other
three, so a partner key that ever reached the client would stop the deploy — added before a provider
was contracted rather than on the day one is, which is the only order that helps.

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

## The bootstrap ceremony

The vetting rule is that a high-risk check is not verified until two different people say so. Somebody
has to clear the first of those people, and there is nobody to do it. No arrangement of code closes
that circle — the first trust has to come from outside the system — so MyThuso has a bootstrap: a way
to seed the first two parties and decide their own checks outside the gate. This section is where
that trust comes from, what it costs, and what is written down about it.

It is **not** a key ceremony and it touches no key material: nothing is generated, printed or read.
It is a separate act on a separate day, and it takes about twenty minutes. What it has in common with
the key ceremony is the shape — two people, one register entry, and a written procedure so that the
one thing nobody reviews is at least the same thing every time.

**Who is present.** The same two as the key ceremony: whoever administers the server, and the
Information Officer named in [Privacy and security](PRIVACY-AND-SECURITY.md) — or a second director
where those are one person. Their names are not decoration. Both go into the hash-chained audit
against every check they decide, as the decider and the second, and they stay there.

**What they need with them.** Each party's own certificates, as files on the machine — identity
document, police clearance, references, the role letter, the POPIA undertaking. A bootstrap may skip
the reviewer; it may not skip the evidence, and the command refuses a check with nothing on file.

**1. Mint the authorisation, both present.**

```sh
cd /opt/mythuso/api
npm run bootstrap -- authorise --party admin-1:admin --party admin-2:admin \
  --decided-by 'G. Makinana' --seconded-by 'N. Dlamini'
```

It prints a fingerprint and a token. The token is signed from the key ring, names those two parties
and those two people, is good for fifteen minutes and can be spent exactly once. Copy it; do not
retype it. Write the **fingerprint** in the register entry and never the token — a token in a
register is a spare key in a filing cabinet, even after it has expired.

Two parties and not one, for the reason the whole module keeps returning to: a register seeded with
one person is a register one person can clear everybody in.

**2. Seed the pair.** A dry run first, which spends nothing:

```sh
npm run bootstrap -- seed --authorisation "$TOKEN"
npm run bootstrap -- seed --authorisation "$TOKEN" --commit
```

**3. Put the certificates in.** These are ordinary submissions — through the gate, sealed, audited,
each person about their own file — and they need no authorisation at all, because subject access
needs no vetting standing. That is deliberate: it is what lets the first two people, who are cleared
for nothing, put their own documents in.

```sh
cat police-clearance.pdf | npm run bootstrap -- submit --party admin-1 \
  --check police-clearance --filename police-clearance.pdf --issued-on 2026-01-14 --commit
```

**4. Mint a second authorisation, and decide.** A second one, because the first was spent in step 2
and the certificates arrive in between — sometimes weeks in between, which is the honest shape of it.

```sh
npm run bootstrap -- authorise --party admin-1:admin --party admin-2:admin \
  --decided-by 'G. Makinana' --seconded-by 'N. Dlamini'
npm run bootstrap -- decide --authorisation "$SECOND"            # what it would verify
npm run bootstrap -- decide --authorisation "$SECOND" --commit
```

Both people read each certificate before this line is run. What the platform records is that they
said they did; it has no way to know whether they looked.

**5. Write the register entry.** Date, which server, both names, the **fingerprint of each
authorisation**, which parties were seeded, which checks were decided, and the audit chain head the
command prints at the end. Keep it with the company's minutes, beside the key ceremony's entry. The
head hash is the part that makes it evidence: it pins the log to what it said that evening, and
comparing it later is the only way to notice a log that was recomputed.

**6. Prove it, and see what it left behind.**

```sh
npm run bootstrap -- standing
curl -s http://127.0.0.1:8787/health/audit
/opt/mythuso/ops/mythuso-healthcheck.sh
```

`standing` lists every check that is still resting on the bootstrap, who decided it and when.
`/health/audit` reports the same in numbers — how many ceremonies this register has ever seen, when
the last one was, and how many checks stand on one — with no name in it.

**7. Converge, and put a date on it.** Every check decided in step 4 was decided by nobody the
platform had checked. As soon as there are two more reviewers who were enrolled through the gate,
they should decide those founding checks again — an ordinary `decide()`, against their own current
standing — and each one that is re-reviewed drops off the `standing` list. **Set the date when you
write the register entry.** A bootstrap nobody ever went back to is the escape hatch quietly becoming
the normal case, and the list exists so that "we meant to" is a question somebody can actually ask.

### What an auditor should ask for

- The register entry, with both authorisation fingerprints and the chain head from that evening.
- `npm run bootstrap -- standing`: what is still standing on a decision nobody reviewed, and since when.
- The audit rows. Every bootstrap is a `vetting.bootstrap.*` entry — `opened`, `enrolled`, `verified`,
  `closed`, and `refused` for every attempt that was turned away — so the whole ceremony is one grep,
  and each verification says in words that nobody reviewed it.
- That the chain verifies from its origin, and that its head still follows from the one in the register.
- The certificates themselves, opened through the gate, which leaves its own audit rows naming the
  person who asked.
- For each founding check: the date it was re-reviewed, or the reason it has not been.

### What remains a matter of trust

This is the part the code does not reach, and it should not be read as smaller than it is.

- **That those two people are who the register says, and both were actually there.** Nothing in the
  software knows. The signature across the envelope flap is the model: it is evidence, not security.
- **That they read the certificates.** The platform records a claim, and the claim is theirs.
- **That whoever minted the authorisation was one of them.** The signing key is derived from the same
  ring the running service holds, so anybody who can read `/etc/mythuso/api.env`, or execute code
  inside the service, can mint one — which is true of every key on this machine and is written up in
  [the threat model](#the-threat-model). A second, independent signer would change that, and there is
  no second machine to hold one.
- **That the first trust comes from outside the system at all.** It does. What the authorisation buys
  is that a bootstrap cannot happen by accident, cannot happen from a web request, cannot happen twice
  on one authorisation, cannot happen quietly, and cannot be mistaken afterwards for an ordinary
  verification. That is a hole made small, visible and accountable. It is not a hole that has been
  closed, and nothing in this repository should be read as saying it has.

## Rotation

Rotating `MYTHUSO_ENCRYPTION_KEY` is **not built**: the identity service has one key and no
re-sealing migration, exactly as `docs/PRIVACY-AND-SECURITY.md` says. Everything below is about
`MYTHUSO_PROTECTION_KEYS`, where the key ring, the versions, `rotateSealedBytes`, the pass that walks
the tables and the count of rows still on the old version all exist. The procedure was written before
the tooling, on purpose — a rotation designed during an incident is a rotation performed badly — and
the tooling was then built to fit the procedure rather than the other way round.

One thing the procedure did not know about itself, found by building step 5 and watching step 6 fail:
the audit chain used to be keyed under whichever version was *current*, so step 4 — one reversible
line, meant to change nothing — made every entry ever written stop verifying, and the health check
that asks every five minutes would have reported a tampered log on the evening of a routine
rotation. An audit entry can never be re-chained, because rewriting the log under a new key is
exactly the operation the chain exists to make impossible. The audit key is therefore pinned to the
oldest version in the ring, the way the blind index already was and for the same reason. That is a
second, independent argument for step 7's rule that a retired key is never actually deleted.

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
5. **Re-wrap.** The pass walks every table holding sealed values, rewrites sixty bytes per value and
   leaves the ciphertext alone. Rehearse it first; it writes nothing without `--commit`.

   ```sh
   cd /opt/mythuso/api
   npm run rotate                                  # what it would do, and how much is left
   npm run rotate -- --commit --batch 100          # do it
   npm run rotate -- --commit --limit 2000         # or do a measured amount of it
   ```

   It is interruptible, resumable and idempotent, and it holds no cursor: each batch asks the
   database which values are not yet on the current version, so stopping loses nothing and running it
   again picks up exactly what was missed. `--limit` exists so that stopping is a decision rather
   than an interruption. It never opens a payload, so the person running it at two in the morning is
   not a person who could read a record while they were there.
6. **Verify.** Three things, in this order.

   ```sh
   npm run rotate     # "still on an old key: 0", and the audit chain's own verdict beneath it
   ```

   The dry run answers the first two: no value is still wrapped under version 1, and the audit chain
   verifies from its origin. The third is not a command — a person opens one record of each record
   type by hand and reads it — and it is the one that catches a re-wrap that "worked" against an
   empty table, which is why the pass reports how many values it saw as well as how many it changed.
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
module stops none of it. That now includes minting a bootstrap authorisation and seeding themselves a
reviewer: the signing key is derived from the same ring. It would be one `vetting.bootstrap.opened`
entry in the chain and one line on the health check, which is the difference between an attack that
is noticed and one that is not — and it is the whole of the difference, so it is not overstated here. What limits the exposure is not cryptographic: the service has **no
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
| A second, independent signer for a bootstrap authorisation | **Would matter, and there is nothing to hold one.** The authorisation that opens the founding ceremony is signed from the key ring the service itself holds, so root can mint one. A signer on a second machine — or a printed one-time value held by the Information Officer alone — would make a bootstrap need two people who cannot be the same person, which is the rule the platform enforces on everybody else. Revisit alongside the HSM question, not before |
| An as-at history of a party's vetting standing | **Matters for one thing, and that thing is now built on top of it.** `vetting_evidence` is updated in place, so a party's standing at a past moment can only be *reconstructed* — today's rows re-resolved against that date. Offline capture needs exactly that question answered for the nurse whose clearance lapsed between capture and sync, and it says in the conflict's own words that the answer is a reconstruction. It is right where only the calendar changed and wrong where a document was resubmitted or a decision retaken since. A history table, or an append-only decision log the standing is replayed from, is the fix; neither exists |
| Logging of reads of the key file | Nothing records who read `/etc/mythuso/api.env`. `auditd` would, cheaply. Not built, and worth doing before there are two people with root |
| Publishing the audit head hash off the machine | The change that would make the audit chain evidence against a determined operator. Not built; see the threat model |
| Encrypted, off-site backups | Not built, deliberately and visibly, and the clinical-table refusal is what holds the position together. See [backups](#backups-and-the-refusal-that-keeps-them-honest) |
| Re-encryption after a compromise | **Matters, and is the gap most likely to be mistaken for covered.** Rotation re-wraps data keys; it does not replace them. A data key recovered from a disclosed root key opens its record for ever, so a compromise needs every affected value opened and sealed again. Nothing does that |
| Re-enrolment of second factors after a compromise | No mechanism exists. Today it would be done by hand, account by account |
| **Any confirmation of any credential by the body that issued it** | **Matters more than anything else on this list, and is the one most likely to be mistaken for covered.** The vault, the lifecycle, the second-reviewer rule and now the verification layer are all built; not one credential on this platform has been confirmed by SANC, HPCSA, SAPS, Home Affairs or anybody else. All twelve authorities report `not-integrated`. Eleven of them need an agreement, an accreditation or a customer account MyThuso does not hold; see [Privacy and security](PRIVACY-AND-SECURITY.md#verified-by-a-reviewer-confirmed-by-nobody) for what each one needs |
| A contracted identity verification provider | The adapter is built end to end — signed request, signature-verified idempotent callback, replay window, sandbox without secrets, production refusing to sandbox — and it has never spoken to a provider. **What is missing is a contract and a key**, which is the only honest thing left to be missing on that one |
| Automatic withdrawal on a contradicted credential | **Deliberately absent, and a stated cost.** Where an authority contradicts a reviewer, it is in the chain, in `contradictions()` and in the sweep's report, and the party keeps their capabilities until a reviewer suspends them by name. Automatic withdrawal would let a register that was briefly wrong, or a misread response, strike nurses off the roster at 03:00 — and that route would be the one an attacker reached for. Between the answer and the reviewer reading it, the party is still dispatchable |
| Publishing what the verification layer actually reaches | `GET /health/verification` counts the adapters that exist rather than trusting a document, and `deploy/ops/mythuso-healthcheck.sh` does not read it yet. One line is owed there: note when `integrated` goes *up*, because that is somebody claiming a register has been connected |

## What this assumes about code that is not merged yet

Nothing, any more. All three assumptions this section carried have landed, and what replaces them is
description:

- **`GET /health/audit`** exists in `apps/api/src/server.ts` and answers with `AuditChain.verify()`'s
  own shape — `{"configured":true,"intact":true,"length":N,"head":"…"}` or
  `{"configured":true,"intact":false,"brokenAt":"…","length":N}` — and with no record content in it.
  With no keys configured it answers `{"configured":false}` rather than pretending to a verdict.
  `deploy/ops/mythuso-healthcheck.sh` reads it as written. It now also carries
  `"bootstrap":{"ceremonies":N,"lastCeremonyAt":"…","restingOnBootstrap":N}` — counts and a date,
  never a name — which the health check does not read yet.
- **`apps/api/src/config.ts` reads `MYTHUSO_PROTECTION_KEYS`** and hands it to `parseRootKeys` at
  start-up, so a malformed key ring is a service that refuses to start rather than one that turns out
  hours later to hold nothing it can read. The deploy decides whether to *require* the keys by
  grepping the deployed source for the variable name, so it now requires them.
- **The rotation pass and the count of values still on an old version** are
  `apps/api/src/protection/rotation.ts`, run by `npm run rotate`. Steps 5 and 6 of
  [rotation](#rotation) both have commands, and the count is an indexed `key_version` column rather
  than a scan.

**What the health check should be taught to ask, and has not been.** `/health/audit` now answers with
the bootstrap counts, and `deploy/ops/mythuso-healthcheck.sh` ignores them. Two lines are owed there,
both of them the same shape as the audit-length ratchet already in that file:

- **Ratchet `ceremonies`.** Remember it in `/var/lib/mythuso/health/bootstrap-ceremonies` and alert
  when it goes *up* on a running server. The founding ceremonies happen once, during installation; a
  new one appearing afterwards is either an operator seeding a reviewer without telling anybody, or
  somebody who reached the key ring. It deserves the same paging as a broken chain.
- **Note `restingOnBootstrap` when it is not zero,** as a note rather than an alert — it is a normal
  state for a new platform and an abnormal one for a platform a year old. A note is what keeps the
  question in front of somebody without training them to ignore the file.

Neither is written here, because `deploy/` was not this change's to edit.

One assumption is worth adding in their place, because it is the shape of the next disagreement:
**every module that owns a table of sealed values registers it with the rotation.** The vetting
module does — `SEALED_COLUMNS` in `apps/api/src/vetting/store.ts`, handed to `createProtectionModule`
at composition. A module that seals something and forgets to register it is a table the rotation
silently skips, and the way that is discovered is on the day somebody destroys an old key. There is
no check for it yet, and there should be.

## Verified, and not

Everything in `deploy/` here parses under `bash -n` and is clean under `shellcheck`, and every
branch of the deploy's key check and the health check's audit-chain check was exercised against
fixtures on a workstation — a stand-in `api.env` for each fault, and a local HTTP server returning
each `verify()` shape.

The rotation was exercised end to end on a workstation rather than only in tests: a database seeded
with real sealed documents, a second key added and made current, a dry run, a limited commit leaving
the table on two versions at once, every document still opening in that state, a resumed run
finishing it, and the audit chain verifying before and after. That is where the audit-key defect
described in [rotation](#rotation) was found — it passed every unit test and failed the first time a
person read the command's output.

The bootstrap was exercised end to end on a workstation, against a real key ring and a real database:
an authorisation minted, a dry run that spent nothing, two parties seeded, ten certificates submitted
through the gate, ten checks decided, the same authorisation refused when it was presented a second
time, and `standing` listing exactly the ten checks that were left resting on it. The refusals — an
unsigned token, a token from another server's ring, an expired one, one presented once the register
holds real reviewers — are covered by `apps/api/test/vetting.test.ts` rather than by hand.

The credential verification layer was exercised end to end on a workstation as well as in tests: a
real key ring, a real database, a bootstrap seeding two reviewers, a nurse enrolled and cleared
through the gate, a dry run listing all eighteen checks as never asked, a committed run under a named
reviewer recording eighteen answers of `not-integrated`, a second dry run reporting nothing owed, and
eighteen `vetting.authority.answered` entries in the hash chain with the chain still verifying. The
sweep's refusal to commit without `--as` was exercised at the console; **no live provider call has
ever been made**, because there is no provider and no key, and the live path is covered only by tests
driving an injected transport.

None of it has been run against the server, and **the bootstrap ceremony has not been performed** —
that is a decision for two people at a console, not for a commit. No deploy was performed, no key was generated on the
box, no unit was installed or reloaded, `systemd-analyze verify` was not available to check the unit
file, and `/health/audit` has been called only on a workstation. The systemd directives
added to `mythuso-api.service` are therefore unverified in place: they will take effect only after a
deploy installs the unit and somebody runs `systemctl restart mythuso-api`, which the deploy says
out loud when the unit has changed under a running service. And the key ceremony has not been
performed — that is a decision for two people and an envelope, not for a commit.
