# Key custody — options for a decision

> **Draft prepared for review. Not a signed decision and not legal advice. It has no effect until
> the named person signs.**
>
> Prepared on 15 September 2026 by the Governance documentation lead (Wave 3), from the repository
> as it stood at commit `3294e1a`. Nothing here has been decided.

## Who decides, and why it matters

**Who decides:** the responsible party (the founder), with the Information Officer, and with
whoever will administer production. It is a business decision because each option costs money,
people's time and availability, and it is a governance decision because it decides who can read
every record.

**Why it matters:** everything sealed in MyThuso is only as private as the key that opens it.
Today every key is a value in an environment variable. Anyone who holds that value and the database
can read everything, and for the Passport can also rewrite the audit log. The planning documents
expect the Passport's master key to sit in an HSM-backed key management service (ThusoIQ Master
v3.5, §22 and §27), and `apps/passport` does not deploy until that, among other things, exists
(`docs/PRIVACY-AND-SECURITY.md`, "Health Passport P0, and why it does not deploy").

**What this paper depends on:** `DATA-RESIDENCY-OPTIONS.md`. Which key services exist depends on
where the data lives.

## 1. How keys are handled today

### The identity service (`apps/api`)

| Key | What it protects | Where it is meant to live | Evidence |
|---|---|---|---|
| `MYTHUSO_ENCRYPTION_KEY` | Names and second-factor secrets | `/etc/mythuso/api.env`, `0600 root:root`, on the same server as the database | `apps/api/src/sensitive.ts`; `deploy/README.md` step 5 |
| `MYTHUSO_PROTECTION_KEYS` (versioned root keys) | Vetting documents and every value sealed through the protection module; also keys the audit chain | The same file | `apps/api/src/protection/crypto.ts`, `apps/api/src/protection/audit.ts` |
| `MYTHUSO_AUTH_PEPPER` | Makes stored one-time codes and session tokens useless without it | The same file | `apps/api/src/config.ts` |

What is built around them:

- **Envelope encryption:** a data key per record, wrapped under a key derived from the root, with
  the record's identity bound in so a ciphertext cannot be moved between people
  (`apps/api/src/protection/crypto.ts`).
- **Rotation that re-wraps:** `npm run rotate -w @mythuso/api` walks sealed values onto a new key
  version, and is a dry run unless committed (`apps/api/src/protection/rotation.ts`). **Rotation is
  not re-encryption.** A data key exposed through a compromised root still opens its record, and
  nothing re-encrypts after a compromise (`docs/DATA-PROTECTION.md`, "What is not built").
- **Fingerprints:** `/etc/mythuso/key.fingerprint` holds one `name fingerprint` line per key the host
  holds. It is not secret; it makes a key that changed without anybody rotating it visible, and the
  deploy reports a changed fingerprint loudly (`deploy/README.md`, "What is deployed" and "What the
  deploy checks about the keys").
- **Deploy checks:** the key file's permissions, each key's length, no reused material, no key the
  same as the pepper, and no key material under the web root or in backups (`deploy/README.md`).
- **A written ceremony:** two people, generation on the server without printing, paper copies read
  back and verified by fingerprint, a sealed envelope signed across the flap, a register entry
  (`docs/DATA-PROTECTION.md`, "The key ceremony"). It has never been performed, because the service
  has never been turned on.

### The Health Passport P0 (`apps/passport`)

| Fact | Evidence |
|---|---|
| One master key, `MYTHUSO_PASSPORT_MASTER_KEY`, read from the environment of the process that holds the data | `apps/passport/src/keys.ts` (header), `packages/catalog/passport-gateway.json` `service.masterKeyVariable` |
| From it, by HKDF: a wrapping key, a grant-signing key, a patient-session signing key, an operator-credential signing key, the audit-chain key and a blind-index key | `apps/passport/src/keys.ts` |
| Each person has a random data key, and a separate key per sealed category and per private category, all stored only in wrapped form and bound to the person and scope | `apps/passport/src/keys.ts`, table `data_keys` in `apps/passport/src/store.ts` |
| The service refuses to start if its master key equals, or is obviously derived from, any identity-service key | `apps/passport/src/config.ts` |
| Break-glass takes the operator's identity from a credential minted at the console and signed under a key derived from the master key | `apps/passport/src/operator.ts` |
| **No rotation, no ceremony, no split custody, no HSM or KMS.** Moving the master key into a KMS is designed to change only `wrap` and `unwrap` | `apps/passport/src/keys.ts`, "What it is not" |
| **The audit key is derived from the master key**, so whoever holds the master key and the database file can rewrite the audit chain | `apps/passport/src/audit.ts` |
| Not deployed anywhere, and no Passport key has a fingerprint line, because nothing under `deploy/` may name the service | `scripts/check-boundaries.mjs` (HEALTH PASSPORT P0 block) |

### Positions already written down

- `docs/DATA-PROTECTION.md`, "What is not built": an HSM or managed KMS **matters** and should be
  reconsidered before the first clinical record; split-knowledge or quorum custody was judged
  "theatre at this size" because it needs two reachable people at night; per-patient key derivation
  matters because destroying a person's key would make erasure reach backups too.
- `docs/PRIVACY-AND-SECURITY.md`, the HSM/KMS row: split-knowledge custody was considered on
  10 September 2026 and rejected **on a single box**, because every share would be read by one
  process on one machine. It becomes worth building once shares can genuinely be held apart.

This paper does not overturn either position. It asks the decision-maker to settle them.

## 2. The options

No prices are given. Cost is a class relative to the other options.

### Option 1 — a managed cloud key management service (KMS)

The master key is created inside the provider's service and never leaves it. The application asks
the service to wrap and unwrap data keys.

| Aspect | What it would mean |
|---|---|
| Who holds what | The provider holds the key material. MyThuso holds permission to *use* it, granted to the service's identity. Separate people hold permission to *administer* it (create, disable, schedule deletion, change policy) |
| Rotation | Usually automatic for new wraps, with old versions kept for unwrapping. Needs a decision on cadence |
| Revocation | Disable the key or remove the application's permission. Every read stops at once, which is also an outage |
| Break-glass | A second administrator role, used by two people together, with every use logged by the provider |
| Backup of wrapped keys | Wrapped data keys live in the database and are backed up with it. The master key cannot be exported, so losing the provider account means losing the data unless the provider's own recovery or a documented export arrangement exists |
| POPIA section 72 | Only safe if the key service runs in the same South African region and its administration does not transfer data abroad. Confirm with the provider |
| Cost class | Low to medium for software-protected keys; higher for HSM-protected keys in the same service |
| Operational burden | Low. Availability now depends on the provider |
| Code change | `wrap` and `unwrap` in `apps/passport/src/keys.ts`; the root-key handling in `apps/api/src/protection/crypto.ts`. The derived signing and audit keys need a separate decision (question 3 below) |

### Option 2 — a hardware security module (HSM), cloud-dedicated or on-premises

A tamper-resistant device holds the master key. It can be rented as a dedicated HSM in a cloud
region, or bought and installed in a facility MyThuso controls.

| Aspect | What it would mean |
|---|---|
| Who holds what | The HSM holds the key. Named people hold HSM administrator credentials, often split so that no single person can act alone (M of N) |
| Rotation | Manual or scripted by MyThuso. Needs a written procedure and a cadence |
| Revocation | Delete or disable the key on the device; zeroise the device on compromise |
| Break-glass | M-of-N administrator cards or credentials held by different people |
| Backup of wrapped keys | The HSM's own encrypted backup to a second HSM or backup token, kept in a second South African location |
| POPIA section 72 | Simple if both HSMs are in South Africa |
| Cost class | High, particularly for on-premises devices and for a second device |
| Operational burden | High. Firmware, backups, availability and a second device are MyThuso's responsibility |
| Code change | As Option 1, through the HSM's client library, which would be MyThuso's first runtime dependency in a service built on zero dependencies (`CLAUDE.md`) |

### Option 3 — split knowledge and dual control, as a ceremony

The master key is generated in a ceremony, split into shares (for example 2 of 3), and each share
is held by a different person somewhere different. The key is reassembled only at start-up or for
recovery.

| Aspect | What it would mean |
|---|---|
| Who holds what | Named individuals each hold one share; nobody holds the whole key at rest |
| Rotation | A new ceremony each time, with the old key kept until every value is re-wrapped (`npm run rotate -w @mythuso/api` shows the pattern for the identity service) |
| Revocation | Generate a new key in a new ceremony and re-wrap; destroy old shares with a witness |
| Break-glass | Any threshold of share holders together. It is slow by design |
| Backup of wrapped keys | The shares are the backup of the master key; wrapped data keys stay in the database backups |
| POPIA section 72 | No provider involved |
| Cost class | Low in money; high in people's time and availability |
| Operational burden | High. **On a single machine it protects almost nothing at runtime**, because once reassembled the key is in one process's memory (`docs/PRIVACY-AND-SECURITY.md`). Its real value is protecting the key *at rest* and during recovery, and as the way key material is imported into an HSM |
| Code change | A share-reassembly step at start-up. Not built, deliberately |

### Combining them

These are not exclusive. A common arrangement is Option 1 or 2 for everyday use, with Option 3 as
the ceremony that governs who may administer the key, recover it or import it. The decision block
allows for a combination.

## 3. Recommended minimum controls

These are the Governance documentation lead's proposal, written so the decision-maker can accept,
change or reject each one. None is in force.

| # | Control | Why |
|---|---|---|
| K1 | **No production master key in an environment file.** The Passport's master key lives in a KMS or HSM before any real record exists | ThusoIQ Master v3.5, §22; `apps/passport/src/keys.ts` "What it is not" |
| K2 | **Two key hierarchies, two sets of custodians.** The identity service's keys and the Passport's keys sit in different key rings or devices, with different administrators | `apps/passport/src/config.ts` already refuses the same key; custody is the real separation, as that file says |
| K3 | **Using a key is not administering it.** The application's identity can wrap and unwrap only. Creating, disabling, deleting or changing policy needs a different person | Stops one compromised server from also destroying or exporting the key |
| K4 | **Dual control on every administrative action**, with at least two named people | `docs/DATA-PROTECTION.md`, "The key ceremony" already requires two people |
| K5 | **Key use is logged where the application administrator cannot edit it**, and the Information Officer can read that log | `docs/DATA-PROTECTION.md` "What is not built" (no logging of reads of the key file) |
| K6 | **The audit key is not simply derived from the data master key**, or the risk is written into the DPIA | `apps/passport/src/audit.ts`: holding the master key and the file lets somebody rewrite the chain |
| K7 | **Wrapped-key backups stay in South Africa**, are restored on a schedule, and never contain the key that opens them | The identity backup already refuses a snapshot containing its keys (`deploy/README.md`) |
| K8 | **A fingerprint register** for every key version, with the date, the custodians and where any recovery material is held | `/etc/mythuso/key.fingerprint` and the ceremony's register entry (`docs/DATA-PROTECTION.md`) |
| K9 | **A written compromise plan** that includes re-encryption, not only rotation | Re-encryption after a compromise is not built (`docs/DATA-PROTECTION.md`) |
| K10 | **A decision on per-person keys**, so that erasing one person can mean destroying one key | `docs/DATA-PROTECTION.md`, "What is not built" |

## 4. Questions only the decision-maker or the Information Officer can answer

1. Which option, or combination, is chosen, and in which location (from `DATA-RESIDENCY-OPTIONS.md`)?
2. Who are the named key custodians and administrators, by role, and how many are needed to act?
3. Should the Passport's grant-signing, session, operator and audit keys stay derived from the
   master key, or become separate keys with separate custodians?
4. What rotation cadence is required, and who approves a rotation?
5. What happens at night if a key must be recovered, and who is reachable?
6. Is the reasoning in `docs/DATA-PROTECTION.md` that split custody is "theatre at this size" still
   accepted once there is a hosting arrangement where shares can be held apart?
7. Is per-person key derivation required before real patients?

## 5. Decision

> Leave blank until decided. Filling this in does not change the code.

| Field | Entry |
|---|---|
| Option chosen (1, 2, 3 or a combination) | |
| Provider or device, and location | |
| Identity service keys: custody arrangement | |
| Passport master key: custody arrangement | |
| Derived signing and audit keys: kept derived, or separated | |
| Key administrators (roles) and how many must act together | |
| Rotation cadence and approver | |
| Break-glass procedure and who holds it | |
| Where backups of key material or wrapped keys are held | |
| Controls K1–K10 accepted, amended or rejected | |
| Decided by (name and role for the responsible party) | |
| Information Officer consulted (name) | |
| Signature | |
| Date | |
