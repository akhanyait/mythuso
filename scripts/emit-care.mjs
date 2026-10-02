/* The Care engine's contract, written out for two native apps by a machine.

   packages/catalog/care.json holds the rules a nurse's offer and visit are computed from, and points at
   packages/catalog/apis/care.json, vetting.json and protocols.json for the sentences those rules are
   refused with rather than repeating them. A phone cannot read JSON at runtime, so this resolves every
   pointer and emits the sentence it lands on, word for word, into CareData.swift and CareData.kt — the
   copy is generated, so the day a route rewords a refusal both apps say the new words or the build
   fails.

   WHAT THIS GENERATOR REFUSES TO EMIT. A checklist step, a threshold or anything else from a protocol:
   it writes a service's protocol ids and nothing about what they say, and it throws if a protocol a
   service names is not in the register. And a decision that is not one: the offer expiry was decided by
   the founder on 15 September 2026, it is written with who decided it and when, and the generator throws
   if the contract drops either or goes back to waiting on somebody.

   Escaping: Swift needs backslash and quote escaped; Kotlin needs backslash, quote and dollar, because a
   lone $ starts a template. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settingDefault } from './settings-defaults.mjs';

const SOURCE = 'packages/catalog/care.json';

const swift = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;

export function emitCare(root = '') {
 const read = file => JSON.parse(readFileSync(root + file, 'utf8'));
 const contract = read(SOURCE);
 const api = read('packages/catalog/apis/care.json');
 const vetting = read('packages/catalog/vetting.json');
 const protocols = read('packages/catalog/protocols.json');

 const routeRefusal = (path, id) => {
  /* The live version: a withdrawn one keeps the words it was frozen with, and the phones say what a route answers now. */
  const route = api.routes.filter(r => r.method === 'POST' && r.path === path && !r.withdrawn).sort((a, b) => b.version - a.version)[0];
  const found = route?.refusals.find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/care.json has no refusal "${id}" on the live POST ${path}.`);
  return found.statement;
 };
 const engineRefusal = id => {
  const found = api.refusals.find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/care.json has lost the engine refusal "${id}".`);
  return found.statement;
 };
 /* What the patient is told about a visit asked of a nurse by name, with {nurse} and {soonest} left for the screen to fill. */
 const toldSentence = id => {
  const found = contract.offers.namedFallback?.told.find(t => t.id === id);
  if (!found) throw new Error(`${SOURCE} offers.namedFallback has no sentence for "${id}".`);
  return found.sentence;
 };
 const nurse = vetting.roles.find(r => r.id === 'nurse');
 if (!nurse?.scope?.note) throw new Error('packages/catalog/vetting.json has lost the nurse scope note Care withholds with.');
 const draft = protocols.refusals.find(r => r.id === 'a-draft-carries-nothing');
 if (!draft) throw new Error('packages/catalog/protocols.json has lost "a-draft-carries-nothing".');
 const noBase = contract.withheld.find(w => w.id === 'no-base-to-measure-from')?.statement;
 if (!noBase) throw new Error(`${SOURCE} has lost the withheld sentence "no-base-to-measure-from".`);
 /* How long an offer lasts is the setting offer-expiry: the founder's decision of 15 September 2026, and a
    default an admin changes on the web. scripts/settings-defaults.mjs refuses a default that says it was
    decided without naming who and on what day, or a proposal that does not say why, before two apps are
    told either; scripts/check-boundaries.mjs holds the rest of the setting to its shape on every build. */
 const expiry = settingDefault(SOURCE, contract, 'offer-expiry');
 /* Who may be offered the three visits no named scope covers, and whether an Encounter entry counts as
    signed: proposals waiting on a clinical review. A phone uses each default and is told whether that
    default was reviewed, which is the only value it can describe; scripts/settings-defaults.mjs says why. */
 const scopeSettings = [...new Set(contract.services.flatMap(s => s.rolesFromSetting ? [s.rolesFromSetting] : []))].map(key => ({
  key, ...settingDefault(SOURCE, contract, key), serviceIds: contract.services.filter(s => s.rolesFromSetting === key).map(s => s.serviceId)
 }));
 const encounterRule = settingDefault(SOURCE, contract, 'encounter-entry-counts-as-signed');
 const notClinicallyReviewed = read('packages/catalog/settings.json').screen?.notReviewed;
 if (!notClinicallyReviewed?.trim()) throw new Error('packages/catalog/settings.json has lost the words a setting waiting on a clinical review is shown with.');
 for (const s of contract.services) for (const id of s.protocolIds) {
  if (!protocols.protocols.some(p => p.id === id)) throw new Error(`${SOURCE} gives ${s.serviceId} the protocol "${id}", which the register does not hold.`);
 }
 const marker = id => contract.offers.order.find(o => o.id === id)?.marker ?? null;

 const sentences = [
  ['outsideScope', nurse.scope.note],
  ['noCurrentTrustScore', routeRefusal('/v1/care/offers', 'no-current-trust-score')],
  ['carerWithoutRn', routeRefusal('/v1/care/offers', 'carer-without-rn')],
  ['noBase', noBase],
  ['noEligibleClinician', routeRefusal('/v1/care/offers', 'no-eligible-clinician')],
  ['withheldIsNotLast', contract.offers.withheldIsNotLast.statement],
  ['declined', contract.offers.declined],
  ['lapsed', contract.offers.lapsed],
  ['offerExpired', routeRefusal('/v1/care/offers/{offerRef}/accept', 'offer-expired')],
  ['notYourOffer', routeRefusal('/v1/care/offers/{offerRef}/accept', 'not-your-offer')],
  ['distanceBasis', contract.offers.distanceBasis],
  ['markerNamed', marker('named')],
  ['markerPrevious', marker('previous')],
  ['locationWhileShared', contract.position.whileShared],
  ['locationBeyondTheVisit', engineRefusal('location-beyond-the-visit')],
  ['startCodeWrong', routeRefusal('/v1/care/visits/{appointmentRef}/start', 'visit-code-wrong')],
  ['notToday', routeRefusal('/v1/care/visits/{appointmentRef}/start', 'not-today')],
  ['checklistNotRatified', routeRefusal('/v1/care/visits/{appointmentRef}/checklist', 'protocol-not-ratified')],
  ['checklistNoProtocol', contract.checklist.noProtocol],
  ['draftCarriesNothing', draft.statement],
  ['recordSentence', contract.record.sentence],
  ['encounterIncomplete', routeRefusal('/v1/care/visits/{appointmentRef}/handover', 'encounter-incomplete')],
  ['handoverWithoutVisit', routeRefusal('/v1/care/visits/{appointmentRef}/handover', 'handover-without-visit')],
  ['handoverQueued', contract.handover.queued],
  ['completeCodeWrong', routeRefusal('/v1/care/visits/{appointmentRef}/complete', 'visit-code-wrong')],
  ['encounterUnsigned', routeRefusal('/v1/care/visits/{appointmentRef}/complete', 'encounter-unsigned')],
  ['encounterSignatureUnconfirmed', engineRefusal('encounter-signature-awaits-status-route')],
  ['waitingForNamedNurse', routeRefusal('/v1/care/offers', 'waiting-for-named-nurse')],
  ['namedStillWaiting', toldSentence('still-waiting')],
  ['namedCannotTake', toldSentence('cannot-take')],
  ['namedGoneToSoonest', toldSentence('gone-to-soonest')],
  ['notClinicallyReviewed', notClinicallyReviewed],
  ['completeWithoutStart', routeRefusal('/v1/care/visits/{appointmentRef}/complete', 'complete-without-start')],
  ['billable', contract.complete.billable]
 ];
 for (const [name, value] of sentences) if (typeof value !== 'string' || !value.trim()) throw new Error(`The Care sentence "${name}" resolved to nothing.`);
 const p = contract.preview;

 const banner = [
  `Generated by scripts/emit-care.mjs from ${SOURCE}, with the refusal sentences it points at.`,
  'Do not edit by hand — run `npm run care`. The build fails if this file and the source disagree,',
  'so an edit here is lost rather than merely wrong.',
  '',
  'No checklist step is written here and none is coming from here: a draft protocol carries a name',
  'and a number, and a service lists only which protocols govern it.'
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const swiftFile = `${banner}

import Foundation

enum CareData {
    struct Requirement { let serviceId: String; let scope: String?; let protocolIds: [String]; let supervisedBy: String? }
    struct Stage: Identifiable { let id: String; let name: String }

    static let seedPhase = ${contract.seedPhase}
    /// ${expiry.note}
    static let offerExpiresAfterMinutes = ${expiry.value}
    /// ${encounterRule.note}
    static let encounterEntryCountsAsSigned = ${encounterRule.value}

    struct ScopeSetting { let key: String; let serviceIds: [String]; let roles: [String]; let defaultNotReviewed: Bool }
    /// Who may be offered the visits no named scope covers, by default. Each role list is an admin setting on the web waiting on a clinical review.
    static let scopeSettings: [ScopeSetting] = [
${scopeSettings.map(s => `        ScopeSetting(key: ${swift(s.key)}, serviceIds: [${s.serviceIds.map(swift).join(', ')}], roles: [${s.value.map(swift).join(', ')}], defaultNotReviewed: ${s.unreviewed})`).join(',\n')}
    ]

${sentences.map(([name, value]) => `    static let ${name} = ${swift(value)}`).join('\n')}

    static let requirements: [Requirement] = [
${contract.services.map(s => `        Requirement(serviceId: ${swift(s.serviceId)}, scope: ${s.scope === null ? 'nil' : swift(s.scope)}, protocolIds: [${s.protocolIds.map(swift).join(', ')}], supervisedBy: ${s.supervisedBy ? swift(s.supervisedBy) : 'nil'})`).join(',\n')}
    ]

    static let stages: [Stage] = [
${contract.stages.map(s => `        Stage(id: ${swift(s.id)}, name: ${swift(s.name)})`).join(',\n')}
    ]

    enum Preview {
        static let appointmentRef = ${swift(p.appointmentRef)}
        static let subjectRef = ${swift(p.subjectRef)}
        static let serviceId = ${swift(p.serviceId)}
        static let zone = ${swift(p.zone)}
        static let dayOffset = ${p.dayOffset}
        static let slot = ${swift(p.slot)}
        static let clinicianRef = ${swift(p.clinicianRef)}
        static let previousClinicianRefs: [String] = [${p.previousClinicianRefs.map(swift).join(', ')}]
        static let visitCode = ${swift(p.visitCode)}
        static let encounterRef = ${swift(p.encounterRef)}
    }

    static func requirement(_ serviceId: String) -> Requirement? { requirements.first { $0.serviceId == serviceId } }
    /// Whether the default roles for this service wait on a clinical review. It describes the default this app offers by, never a value in force on the web.
    static func scopeNotReviewed(_ serviceId: String) -> Bool { scopeSettings.contains { $0.serviceIds.contains(serviceId) && $0.defaultNotReviewed } }
}
`;

 const kotlinFile = `${banner}

package za.co.mythuso.model

object CareData {
    data class Requirement(val serviceId: String, val scope: String?, val protocolIds: List<String>, val supervisedBy: String?)
    data class Stage(val id: String, val name: String)

    const val seedPhase = ${contract.seedPhase}
    /** ${expiry.note} */
    const val offerExpiresAfterMinutes = ${expiry.value}
    /** ${encounterRule.note} Not const, so a guard on it reads as the rule it is rather than a folded constant. */
    val encounterEntryCountsAsSigned = ${encounterRule.value}

    data class ScopeSetting(val key: String, val serviceIds: List<String>, val roles: List<String>, val defaultNotReviewed: Boolean)
    /** Who may be offered the visits no named scope covers, by default. Each role list is an admin setting on the web waiting on a clinical review. */
    val scopeSettings = listOf(
${scopeSettings.map(s => `        ScopeSetting(${kotlin(s.key)}, listOf(${s.serviceIds.map(kotlin).join(', ')}), listOf(${s.value.map(kotlin).join(', ')}), ${s.unreviewed})`).join(',\n')}
    )

${sentences.map(([name, value]) => `    const val ${name} = ${kotlin(value)}`).join('\n')}

    val requirements = listOf(
${contract.services.map(s => `        Requirement(${kotlin(s.serviceId)}, ${s.scope === null ? 'null' : kotlin(s.scope)}, listOf(${s.protocolIds.map(kotlin).join(', ')}), ${s.supervisedBy ? kotlin(s.supervisedBy) : 'null'})`).join(',\n')}
    )

    val stages = listOf(
${contract.stages.map(s => `        Stage(${kotlin(s.id)}, ${kotlin(s.name)})`).join(',\n')}
    )

    object Preview {
        const val appointmentRef = ${kotlin(p.appointmentRef)}
        const val subjectRef = ${kotlin(p.subjectRef)}
        const val serviceId = ${kotlin(p.serviceId)}
        const val zone = ${kotlin(p.zone)}
        const val dayOffset = ${p.dayOffset}
        const val slot = ${kotlin(p.slot)}
        const val clinicianRef = ${kotlin(p.clinicianRef)}
        val previousClinicianRefs = listOf(${p.previousClinicianRefs.map(kotlin).join(', ')})
        const val visitCode = ${kotlin(p.visitCode)}
        const val encounterRef = ${kotlin(p.encounterRef)}
    }

    fun requirement(serviceId: String) = requirements.firstOrNull { it.serviceId == serviceId }
    /** Whether the default roles for this service wait on a clinical review. It describes the default this app offers by, never a value in force on the web. */
    fun scopeNotReviewed(serviceId: String) = scopeSettings.any { serviceId in it.serviceIds && it.defaultNotReviewed }
}
`;

 return [
  { path: 'apps/ios/MyThuso/Models/CareData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/CareData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitCare()) {
  writeFileSync(file.path, file.content);
  console.log(`care → ${file.path}`);
 }
}
