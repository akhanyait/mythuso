# Governance packs

> **Drafts prepared for review. Not a clinical review, not a signed DPIA and not legal advice. None
> of them has any effect until the named person signs.**

MyThuso cannot treat a real patient until named, accountable people have reviewed, decided and
signed some things that no code and no AI can do for them. This folder prepares that work so that
their job is to read, decide and sign, not to search the repository.

**Nothing in this folder is reviewed, decided, registered or signed.** Every sign-off field is blank.

## The documents

| Document | What it is for | Who must act | How it is kept current |
|---|---|---|---|
| [`CLINICAL-REVIEW-PACK.md`](CLINICAL-REVIEW-PACK.md) | Every clinical default, draft protocol, emergency term list, clinical scope and clinical proposal in the contracts, each with a question and blank sign-off fields | A **Clinical Governance Lead**: a registered doctor (HPCSA) or nurse (SANC) with governance authority. Protocols go on to the clinical governance board | **Generated** by `scripts/emit-clinical-review-pack.mjs` (`npm run review-pack`). `npm run check` fails if it is stale |
| [`DATA-RESIDENCY-OPTIONS.md`](DATA-RESIDENCY-OPTIONS.md) | Where information may be held, three kinds of hosting with their trade-offs, and conditions any option must meet | The **founder**, as the responsible party, with the Information Officer and counsel | Hand-written; refers to contracts rather than restating numbers |
| [`KEY-CUSTODY-OPTIONS.md`](KEY-CUSTODY-OPTIONS.md) | How encryption keys are held today, the options (cloud KMS, HSM, split-knowledge ceremony) and proposed minimum controls | The **founder**, with the Information Officer and whoever administers production | Hand-written |
| [`DPIA-DRAFT.md`](DPIA-DRAFT.md) | A POPIA-oriented Data Protection Impact Assessment: inventory, purposes, flows, third parties, retention, rights, security, risks and measures | The **responsible party** signs; the **Information Officer** signs; counsel advises | Hand-written |
| [`INFORMATION-OFFICER.md`](INFORMATION-OFFICER.md) | Appointing and registering the Information Officer and deputies, the PAIA manual, what the code already provides, and the decisions due before real patients | The **head of the private body** appoints; the **Information Officer** decides | Hand-written |
| [`ADMIN-PORTAL-SCOPE.md`](ADMIN-PORTAL-SCOPE.md) | The admin portal that controls every role's access to everything: what it administers, what it reads rather than restates, the four tiers of "dynamic", and the identity dependency that decides its sequence | The **founder** decides the sequence, who the admin office is, and whether route enablement exists at all | Hand-written; refers to contracts rather than restating numbers |

## The order

```
   DATA-RESIDENCY-OPTIONS ──┐
                            ├──► DPIA-DRAFT ──► INFORMATION-OFFICER signs off with the responsible party
   KEY-CUSTODY-OPTIONS ─────┘

   CLINICAL-REVIEW-PACK  (in parallel, by the Clinical Governance Lead)
```

1. **Residency and key custody first.** The DPIA cannot rate the risks of hosting, backups,
   cross-border transfer or key compromise until these are decided. Key custody depends on which key
   services exist where the data will live.
2. **The DPIA next.** It relies on both decisions and records them in its sign-off.
3. **The Information Officer.** Registration should start as early as possible, because the
   Information Officer is consulted on the residency decision and signs the DPIA. The decisions in
   `INFORMATION-OFFICER.md` (lawful basis, breach procedure, operator agreements, retention, prior
   authorisation) complete the privacy work.
4. **The clinical review runs in parallel.** It does not depend on the privacy decisions, and they
   do not depend on it.

## What the app refuses until each is done

| Blocked until | What is refused today | Where the refusal lives |
|---|---|---|
| A signed DPIA, a registered Information Officer, a residency decision and KMS or HSM custody | The Passport refuses to start without the development flag, in any production environment, or on a non-loopback host; the build fails if anything under `deploy/` names it | `apps/passport/src/config.ts`; `scripts/check-boundaries.mjs` (HEALTH PASSPORT P0 block); `docs/PRIVACY-AND-SECURITY.md` |
| A registered Information Officer | The identity service refuses to start in production without `MYTHUSO_INFORMATION_OFFICER` | `apps/api/src/config.ts` |
| An SMS provider, DNS, TLS and keys | The identity service stays switched off, and refuses to start in production without an SMS provider | `deploy/README.md`; `apps/api/src/config.ts` |
| A clinical review of each setting that needs one | The setting is in force and shown as "not clinically reviewed" wherever it matters | `packages/catalog/settings.json`; `apps/web/src/features/SettingReviews.tsx`; `scripts/settings-defaults.mjs` |
| Ratification by the clinical governance board | A protocol stays a draft with no content, and nothing may claim to follow it | `packages/catalog/protocols.json` `refusals` |
| A clinical reviewer for GilbertOne's emergency terms | The list is a proposed starting configuration and says so | `packages/catalog/gilbert-emergency-terms.json` `clinicalReview` |
| A clinician who reads the language | Clinical wording stays in English in every locale | `packages/catalog/locales.json` `clinicalRule` |
| A clinical review of visit-thread photos, and somewhere proper to keep one | The thread carries words only | `packages/catalog/booking.json` setting `visit-thread-photos` |
| An operator agreement and a section 72 determination per supplier | Every supplier feed refuses every payload | `packages/catalog/feeds.json`; `apps/api/src/feeds/` |
| Proven guardian authority | No guardian route exists, and a consent given by a guardian is refused | `docs/PRIVACY-AND-SECURITY.md` "Family care" and "Who wrote the consent down" |
| A contract with each credentialing authority | Every authority answers `not-integrated` | `apps/api/src/vetting/authority.ts` |
| Every capability's own conditions | No capability is connected, and every screen that could be mistaken for the real thing says so | `packages/catalog/capabilities.json` |

## What changes when somebody signs

Signing a document here changes no code. Each decision takes effect through the process its own
contract describes, and `CLINICAL-REVIEW-PACK.md` sets those out for the clinical items. The check
that keeps the Passport out of `deploy/` is changed deliberately, in a commit that cites the signed
DPIA, the residency decision and the key custody decision (`docs/PRIVACY-AND-SECURITY.md`, "Health
Passport P0, and why it does not deploy").
