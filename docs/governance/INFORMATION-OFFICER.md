# Information Officer — appointment and first decisions

> **Draft prepared for review. Not legal advice and not a registration. It has no effect until the
> named person signs.**
>
> Prepared on 15 September 2026 by the Governance documentation lead (Wave 3), from the repository
> as it stood at commit `3294e1a`. Nothing here has been appointed, registered or decided. Section
> numbers are pointers to read, summarised in plain words; the Act, the Regulations and the
> Information Regulator's current guidance are what count.

## Why this is needed before any real person's information is held

- The identity service will not start in production without an Information Officer named in
  `MYTHUSO_INFORMATION_OFFICER`: "a consent is given to a responsible party, and a service that
  records consent without being able to say who is accountable for it has written down one half of
  an agreement" (`apps/api/src/config.ts`).
- The Health Passport does not deploy until, among other things, an Information Officer is
  registered (`docs/PRIVACY-AND-SECURITY.md`, "Health Passport P0, and why it does not deploy";
  `packages/catalog/passport-gateway.json` `_whyDevelopmentOnly`).
- The planning documents put the POPIA programme, the DPIA and the Information Officer's
  registration in the first months (MyThuso Full Scope v1.0, §6 and Engine 7), and make the vetting
  data retention and consent policy the Information Officer's to approve (Full Scope v1.0, Engine 6).
- `packages/catalog/consent.json` `notAdvice` leaves the lawful basis for every purpose to "MyThuso's
  Information Officer and South African counsel".

## 1. Appoint and register

Under POPIA and PAIA the head of a private body is its Information Officer unless the duty is
properly designated, and an Information Officer may take up the duties only once the responsible
party has registered them with the Information Regulator (POPIA section 55(2)). Deputies are
designated under POPIA section 56. Confirm the current registration process on the Information
Regulator's portal; this checklist does not describe it.

| # | Step | Done by | Evidence to keep | Status |
|---|---|---|---|---|
| IO-1 | Confirm which legal entity is the responsible party. The Master Blueprint v4 (Part H, gap 7) proposes that MyThuso operates and is the responsible party while Akhanya owns and licenses; that structure does not exist yet | Founder and attorney | Company registration, IP licence | ☐ |
| IO-2 | Identify the head of the private body | Founder | Board resolution | ☐ |
| IO-3 | Designate the Information Officer, if not the head, in writing | Head of the private body | Signed designation | ☐ |
| IO-4 | Designate any Deputy Information Officers (section 56) | Head of the private body | Signed designations | ☐ |
| IO-5 | Register the Information Officer and deputies with the Information Regulator | Responsible party | Registration confirmation | ☐ |
| IO-6 | Put the registered name into `MYTHUSO_INFORMATION_OFFICER` in production configuration (never into this repository) | Whoever administers production | Deploy record | ☐ |
| IO-7 | Compile the PAIA manual (PAIA section 51) and make it available as the Regulator requires | Information Officer | Published manual | ☐ |

### The appointment

| Field | Entry |
|---|---|
| Responsible party (legal name and registration number) | |
| Head of the private body (name) | |
| Information Officer (name) | |
| Information Officer contact (role address, not a personal one) | |
| Deputy Information Officer(s) (names) | |
| Information Regulator registration reference | |
| Date registered | |
| PAIA manual location and date published | |
| Signed by the head of the private body | |
| Date | |

## 2. The duties, in summary

Read POPIA section 55(1) and regulation 4 of the POPIA Regulations for the actual text. In summary,
the Information Officer:

- encourages compliance with the conditions for lawful processing;
- deals with requests made to MyThuso under POPIA (access, correction, deletion, objection);
- works with the Information Regulator on any investigation, including prior authorisation under
  Chapter 6;
- makes sure a compliance framework exists, is put into practice and is monitored;
- makes sure a personal information impact assessment is done (`DPIA-DRAFT.md` is the draft);
- makes sure a PAIA manual is developed, monitored, maintained and made available;
- makes sure internal measures and adequate systems exist to process requests;
- makes sure awareness sessions are held. Every clinical and partner role on the vetting register
  already carries a POPIA and confidentiality check (`packages/catalog/vetting.json`, the
  `popia-training` check on each role).

## 3. What the code already gives the Information Officer

**None of this is running anywhere.** The identity service is switched off (`deploy/README.md`) and
the Passport runs only on a developer's machine with synthetic data. These are the tools that would
exist on the day they are switched on, and where they are.

| Need | What exists | Where |
|---|---|---|
| **An inventory of what is held and why** | A holdings register naming every identity-service table, whether it is erased, anonymised or retained, and the retention basis for each, written in words a data subject reads | `apps/api/src/personalData.ts`; `GET /account/data` |
| **Proof of consent** | Consent to a *version* of a purpose, stored as the SHA-256 of the exact words shown; withdrawal as its own entry; required and optional purposes separated | `apps/api/src/consent/`; `GET /consent/contract`, `GET /consent`, `POST /consent/give`, `POST /consent/withdraw`; purposes and wording in `packages/catalog/consent.json` |
| **Who opened whose record** | A record access log separate from the sign-in log, hash-chained, with its head sealed into the audit chain, readable by the person it is about | `apps/api/src/consent/`, `apps/api/src/protection/seal.ts`; `GET /consent/access-log` |
| **Verifying the audit chain** | `verify()` names the first entry that no longer follows; loopback-only verification routes; a witness statement that can be printed and later checked | `apps/api/src/protection/audit.ts`, `apps/api/src/protection/witness.ts`; `GET /health/audit`, `GET /health/access-log`, `POST /health/witness` |
| **The patient reading their own Passport audit** | Every access, granted or refused, in a hash chain the patient reads | `apps/passport/src/audit.ts`; `GET /audit/mine` in `apps/passport/src/server.ts` |
| **Consent grants to the Passport** | Signed grants per recipient role, purpose and scope, each with an expiry held to the role's ceiling | `apps/passport/src/gateway.ts`; `/consent/grant`, `/consent/revoke`, `/consent/check`; ceilings in `packages/catalog/consent.json` `grants` |
| **Break-glass review** | Break-glass opens the emergency summary only and flags a review; the reason enters the patient-visible chain | `apps/passport/src/gateway.ts`, `/breakglass`; `packages/catalog/passport-gateway.json` |
| **Access requests** | A scoped export of the person's own information, behind a step-up where one is enrolled, with three declared exclusions | `apps/api/src/subjectExport.ts`; `POST /account/export` |
| **Correction** (section 24) | A separate right from deletion, with three refusals written out | `apps/api/src/subjectRequests.ts`; `POST /account/correction`, `GET /account/correction` |
| **Deletion** (section 24) | Erasure with a grace period, an immediate sign-out, and an answer that names what could not be erased and why | `apps/api/src/erasure.ts`; `POST /account/erasure`, `POST /account/erasure/cancel` |
| **A queue with a clock** | Corrections and erasures together, with the date each is due and how many are late, and an append-only proof of each response | `GET /operator/requests`, `POST /operator/requests/respond` in `apps/api/src/server.ts` |
| **A breach register** (section 22) | A compromise register that cannot close until both the Regulator and the affected people are recorded as told, and holds no names | `apps/api/src/incidents.ts`; `GET /incidents/kinds`, `POST /incidents`, `/incidents/contain`, `/incidents/notified`, `/incidents/close`, `GET /incidents` |
| **Retention carried out** | A sweep that is a dry run unless committed | `apps/api/src/retention.ts`; `npm run sweep -w @mythuso/api` |
| **A list of future operators** | Eleven suppliers, each recording that it becomes an operator under section 21 on signature and that its section 72 question is undetermined | `packages/catalog/feeds.json` |

What it does **not** give: detection of a breach, paging anybody, or delivering a notification
(`apps/api/src/incidents.ts` says so); guardian authority (`docs/PRIVACY-AND-SECURITY.md`, "Family
care"); recording a consent a nurse read aloud (refused until the nurse's authority can be proven);
and publishing the audit chain head somewhere MyThuso does not control.

## 4. What the Information Officer must decide before real patients

| # | Decision | Section | What the repository already says | Decision and date |
|---|---|---|---|---|
| D-1 | **Lawful basis for each purpose.** Confirm or change the basis `consent.json` names for each purpose, and the health-information authorisation clinicians work under | POPIA 11, 26, 27, 32 | `packages/catalog/consent.json` `purposes[].lawfulBasis` and `lawfulBases`; marked not advice | |
| D-2 | **Is a police clearance certificate special personal information?** Section 26 lists criminal behaviour. `docs/PRIVACY-AND-SECURITY.md` ("What the service does and does not hold") currently treats vetting evidence as outside the special category | POPIA 26, 33 | `packages/catalog/vetting.json` (the `police-clearance` check on most roles); `apps/api/src/vetting/` | |
| D-3 | **Is a face match at shift start biometric information?** | POPIA 26 | `packages/catalog/events.json` `trust.shift_start.matched@1` never carries `faceTemplate` | |
| D-4 | **Breach notification procedure.** Who decides that a compromise reached personal information, who tells the Regulator and the people affected, how, and how fast. The Act says "as soon as reasonably possible" and names no period | POPIA 22 | `apps/api/src/incidents.ts` counts days and refuses to invent a deadline. The ThusoIQ Master v3.5 (§22) expects a breach runbook and exercises | |
| D-5 | **Operator agreements** for hosting, SMS, payments, payouts and every other supplier, before any is signed | POPIA 20, 21 | `packages/catalog/feeds.json` (every feed's `operator`); hosting in `DATA-RESIDENCY-OPTIONS.md` | |
| D-6 | **Cross-border transfers.** For each operator, whether information leaves South Africa and on what basis | POPIA 72 | `packages/catalog/feeds.json` `operator.section72`, undetermined on every feed | |
| D-7 | **Prior authorisation.** Whether any processing needs the Regulator's authorisation before it starts — for example linking unique identifiers across responsible parties (identity numbers through a verification provider, medical aid numbers), processing criminal records for others, or sending special personal information or children's information to a country without adequate protection | POPIA 57, 58 | Not considered anywhere in the repository | |
| D-8 | **Retention schedule.** Confirm or change every period `apps/api/src/personalData.ts` marks as "MyThuso's own setting", confirm the periods taken from statute, and decide the access log's retention, which nothing carries out today | POPIA 14 | `apps/api/src/personalData.ts`; `packages/catalog/consent.json` `accessLog.retention`; `docs/PRIVACY-AND-SECURITY.md` "Retention against erasure" | |
| D-9 | **The notice given when information is collected** | POPIA 18 | `packages/catalog/consent.json`, the `processing-notice` purpose, recorded as an acknowledgement and not as consent | |
| D-10 | **Children and guardians.** Who may act for a child, what proves it, and how a child's own protected categories stay the child's | POPIA 34, 35 | `packages/catalog/vetting.json` `guardian` role; `packages/catalog/records.json` (a child's protected categories are the child's); no guardian code exists | |
| D-11 | **Direct marketing** | POPIA 69 | `packages/catalog/consent.json`, the `product-updates` purpose; a marketing consent can never open a record (`ACCESS_BASES` in `apps/api/src/consent/contract.ts`) | |
| D-12 | **De-identified service improvement.** Whether it is de-identified in law, and on what basis | POPIA 6, 11 | `packages/catalog/consent.json`, the `service-improvement` purpose | |
| D-13 | **Security safeguards sign-off**, informed by the residency and key custody decisions | POPIA 19 | `DATA-RESIDENCY-OPTIONS.md`, `KEY-CUSTODY-OPTIONS.md` | |
| D-14 | **The DPIA** | Regulation 4 | `DPIA-DRAFT.md` | |

## 5. Sign-off

| Field | Entry |
|---|---|
| Information Officer (name) | |
| Registration reference | |
| Checklist sections 1–4 reviewed | |
| Decisions D-1 to D-14 recorded above, or deferred with a reason | |
| Counsel consulted (name and firm) | |
| Signature | |
| Date | |
