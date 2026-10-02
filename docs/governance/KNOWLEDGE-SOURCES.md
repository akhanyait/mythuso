# Knowledge sources — assessment and sign-off

> **Draft prepared for review. Not legal advice, not a clinical review, and not a licence.** Written
> 1 October 2026, after the founder asked for more first-aid, skin and consumer-health sources for
> GilbertOne's photo skin-check and first-aid answers. **No source is switched on.** Every source below
> ships `"active": false` in `packages/catalog/knowledge/federation.json`, and both signatures on every
> one are blank because neither signatory has been appointed.
>
> **Since 2 October 2026 eight of them answer for demonstration.** The founder's demonstration override
> (`packages/catalog/demonstration-override.json`, explained in
> [`DEMONSTRATION-OVERRIDE.md`](DEMONSTRATION-OVERRIDE.md)) opens every source whose licence permits a
> commercial service's use, without the two signatures, which stay blank; every flag stays `false`. The six
> that need their owner's written permission stay off for their licences. Switching the override off
> restores everything this page describes.

The contract is the authority: each source's licence, verdict, hosting, audience, languages, use and
non-use are in `federation.json` and are not restated here beyond the table. Governance · Knowledge
sources in the Control Tower (`/app/?role=back-office&category=governance&tab=knowledge-sources`)
draws the same record and lets the founder paste a link to propose another source. A pasted link is a
**proposed source**, held on that screen only, never fetched or kept; it becomes a source only when
someone writes it into the contract in a reviewed commit.

## How the facts were gathered

Licences were read on the owners' own pages on 1 October 2026; each source's `licensing.verifiedFrom`
in the contract names the page. Where a page blocked automated reading (LOINC, the NHS developer pages,
Cochrane, WHO IRIS, IFRC), an archived copy or the owner's search excerpt was read instead, and the
contract says so. Hosting locations come from DNS and address-registry lookups. That is evidence of where
a server is, not proof of where data is held. The Information Officer confirms both before signing.

## The assessment

**Verdicts.** These are `licenceVerdicts` in the contract:

- **Reuse permitted.** Commercial use and adaptation are allowed.
- **With conditions.** Allowed, provided recorded conditions are met.
- **Permission required.** The owner's written permission must be on file before use.
- **Non-commercial only.** Never switched on.
- **No reuse.** Never switched on.
- **Outside scope.** The licence excludes MyThuso by territory, purpose or membership. Never switched on.

### Listed sources

All fourteen ship dark and wait on both signatures.

| Source | Licence and verdict | Residency (POPIA s72) | Recommended use | Status |
|---|---|---|---|---|
| NDoH PHC Standard Treatment Guidelines and EML (8th ed., 2024) | © NDoH. Free reproduction and adaptation only "not for profit". **Permission required** | South Africa. A local copy involves no transfer | The South African line beside every clinical answer, for nurses and doctors | Dark. Written NDoH permission needed |
| SAHPRA register and Online Medicines Directory | © SAHPRA, all rights reserved. Leaflet text is likely the registration holder's. **Permission required** | South Africa | Link to the regulator's own PIL by registration number (OTC medicines only) | Dark. Linking needs no permission |
| WHO ICD-11 API | CC BY-ND 3.0 IGO plus the WHO software licence (commercial apps allowed). **With conditions**: no derivatives, no translation without WHO | Abroad (WHO; Netherlands-registered addresses). Local Docker deployment possible | Terminology behind the catalogue's codes | Dark. Adapter exists |
| openFDA drug labels | CC0 / US public domain. **Reuse permitted** | United States | Clinician check of interaction wording, always beside the SA guideline | Dark. Adapter exists |
| Europe PMC | Per-record (EMBL-EBI terms). **With conditions**: only CC BY or CC0 text may be shown or reworded | United Kingdom | Clinician evidence by checkable identifier | Dark. Adapter exists |
| MedlinePlus health topics (NLM) | US public domain, except A.D.A.M. and ASHP content, which may only be linked. **With conditions** | United States. Daily XML allows a local copy | Plain-language background for patients, in English, after SA review | Dark. No adapter |
| CDC Content Services API | US public domain, with exceptions. No substantive edits, no logo. **With conditions** | United States | Unchanged public-health background (hygiene, vaccination) | Dark. No adapter |
| SNOMED CT (SA national licence) | Affiliate Licence, no charge; SA a member since 14 May 2026. **With conditions**: register with the SA National Release Centre | Held locally | Codes and synonyms behind the catalogue | Dark. Release centre still being set up |
| LOINC | LOINC licence: free, notice required, content unchanged. **With conditions** | United States (FHIR server). A local release is possible | Laboratory and observation codes | Dark. Licence to be read in full |
| Wikidata | CC0. **Reuse permitted** | Abroad (Wikimedia) | isiZulu, Afrikaans and Sesotho labels and cross-references, each checked by a first-language reviewer | Dark. Never a clinical authority |
| Western Cape Government health pages | © WCG. Commercial use by written request. **Permission required** | SA publisher; site on US-registered address | SA patient pages, and the best route found to Afrikaans and isiXhosa | Dark. Request to WCG |
| IFRC First Aid, Resuscitation and Education Guidelines 2025 | © IFRC. Non-commercial copies only; commercial use by request. **Permission required** | Abroad. A local copy involves no transfer | The evidence behind the catalogue's first-aid entries | Dark. Ask IFRC with SA Red Cross |
| South African Red Cross Society first aid | All rights reserved. **Permission required** (licence or partnership) | South Africa | SA patient first-aid wording under licence | Dark. Preferred first-aid partner |
| St John South Africa first aid | All rights reserved. **Permission required** | SA publisher; host in the UK | SA patient first-aid wording under licence | Dark. Second partner |

### Assessed and not admitted

These twelve are recorded in `assessedNotAdmitted` with their reasons. Pasting one of their links in the Control Tower is refused with its reason.

| Source | Licence and verdict | Why not |
|---|---|---|
| NHS website content API | Online Connection Agreement. **Outside scope** | Licensed only for users in the UK, under English law, for England's direct care. South African patients are outside it |
| WHO fact sheets and IRIS | CC BY-NC-SA 3.0 IGO and WHO website terms. **Non-commercial only** | Commercial use needs WHO's written permission. The content is population-level, not first-aid steps |
| DermNet (NZ) | Text by permission. Images CC BY-NC-ND or a paid licence. **Non-commercial only** | No harvesting, and **no AI training or testing on its images**. Never near the photo skin-check |
| Dermnet.com | All rights reserved. **No reuse** | No licence. A different site from DermNet NZ |
| American Academy of Dermatology | All rights reserved. **No reuse** | Commercial reuse and unattributed AI use prohibited. A paid licence exists |
| Cochrane plain language summaries | Wiley, all rights reserved, including text and data mining and AI. **No reuse** | Paid RightsLink reuse only. Clinicians may cite it behind MyThuso's own text |
| gov.za (GCIS) | Non-commercial only. **Non-commercial only** | Needs GCIS permission, and holds little that NDoH does not |
| Health-e News | Not free for commercial use. **No reuse** | Journalism, not guidance. No app syndication |
| Hesperian Health Guides | Free for not-for-profit use. **Non-commercial only** | Has isiZulu material, so a permission request may be worth making later |
| Healthdirect Australia | **No reuse** | No derivatives or commercial use |
| Mayo Clinic | **No reuse** | Personal use only. Content is sold under licence |
| Merck Manuals (consumer) | **No reuse** | Written permission needed. Intended for US residents only |

**What this means for first aid and skin:**

- No openly licensed, clinically authoritative first-aid or skin text exists that a commercial South African service may draw on as published.
- None of the sources assessed offers patient content in isiZulu, Afrikaans or Sesotho under an open licence.
- The open sources that are licence-clear are US-written: MedlinePlus and CDC. They need a South African layer before a patient sees them.

Three routes lead to strong first-aid and local-language content, all through permission:

- **SA Red Cross Society**, with the IFRC guidelines behind it.
- **NDoH**: the STGs/EML, and MomConnect's maternal messages in all eleven official languages. MomConnect has no published licence and is not in the contract until NDoH answers.
- **Western Cape Government.**

For skin, the published references (DermNet, AAD) are closed to commercial and AI use. GilbertOne's skin answers should therefore stand on the catalogue's own reviewed entries and the NDoH guideline, with MedlinePlus for background.

## What each signatory must sign, per source

**Activation order.** No source is switched on until all of these are recorded:

1. The Information Officer's signature.
2. The clinical reviewer's signature.
3. The owner's written permission, where the verdict asks for it (`licensing.permissionRef`).
4. An adapter, reviewed like production code, where the source has none.
5. One commit setting that source's `active` to true.

The build refuses a signature recorded before its signatory is appointed. It also refuses activation of any source whose verdict never permits it.

**What each signature covers.** The two signatures are defined in `governance.signatures`, word for word:

- **Clinical reviewer** (appointment: `docs/governance/CLINICAL-REVIEW-PROCESS.md`) signs that:
  - the source is a named authority and current;
  - it is fit for exactly its `useFor`;
  - it agrees with the NDoH guideline where both speak, or the difference is recorded;
  - `notFor` is complete;
  - anything a patient reads is written for a patient and reads true in South Africa.
- **Information Officer** (appointment: `docs/governance/INFORMATION-OFFICER.md`) signs that:
  - the licence verdict is right and its conditions are met;
  - the POPIA s72 position for the source's hosting is assessed and recorded;
  - no patient identifier or patient wording can ride a lookup;
  - credentials live only in the deployment environment.

### Per-source questions

| Source | Clinical reviewer confirms | Information Officer confirms |
|---|---|---|
| NDoH STG/EML | Edition and chapters cited match the current one (8th ed., 2024). Clinician-only use | NDoH's written permission for commercial use on file. No Knowledge Hub scraping |
| SAHPRA | Link-out wording for OTC leaflets. No dose answers | SAHPRA's (and, for leaflet text, the holder's) permission before anything beyond a link |
| ICD-11 | Codes map to the catalogue entries they claim | Attribution text. No translation or crosswalk without a WHO agreement. s72 for WHO hosting, or the local deployment chosen |
| openFDA | US label wording never shown as SA guidance. The NDoH line always beside it | CC0 terms. No endorsement implied. s72 for US hosting |
| Europe PMC | A hit is never evidence by itself | Only CC BY or CC0 text shown or reworded. Attribution. s72 for UK hosting |
| MedlinePlus | An SA adaptation layer (numbers, medicines, services) before patients see it | Only health-topic summaries. A.D.A.M. and ASHP excluded. Attribution. s72, or the local XML copy |
| CDC | Items placed beside the SA guidance that applies | Each item CDC's own public-domain work. No logo, no substantive edit, disclaimer present. s72 |
| SNOMED CT | Synonyms used for matching only | Use registered with the SA National Release Centre. Affiliate Licence clauses read |
| LOINC | Codes match the observations they name | Full licence read. Notice carried. Credentials in the environment. s72, or a local release |
| Wikidata | Every SA-language label checked by a first-language clinician (`docs/governance/GOLDEN-SETS.md`) | CC0 structured data only. User-Agent policy met. s72, or a local dump |
| Western Cape health pages | Pages read true outside the Western Cape, or are scoped to it | WCG's written commercial permission on file. Third-party material excluded |
| IFRC guidelines 2025 | Each first-aid entry checked against its recommendation | IFRC's written permission for commercial reproduction on file |
| SA Red Cross Society | Wording matches IFRC 2025 and SA emergency numbers | A content licence or partnership agreement on file |
| St John South Africa | As for the Red Cross Society | A content licence on file. s72 for its UK host if looked up live |

## What needs the founder

1. **Appoint the two signatories.** Until then nothing in this document can move.
2. **Send the permission requests.** These are the only route to authoritative South African first aid and to local-language patient text:
   - NDoH Essential Drugs Programme, for the STGs/EML;
   - NDoH, for MomConnect content;
   - SA Red Cross Society, together with IFRC;
   - Western Cape Government.
3. **Decide whether to license dermatology content commercially** (AAD's paid patient education, or DermNet's paid images). DermNet forbids AI use of its images, so it cannot serve the photo skin-check under any licence offered today.
