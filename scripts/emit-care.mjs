/* The Care engine's contract, written out for two native apps by a machine.

   packages/catalog/care.json holds the rules a nurse's offer and visit are computed from, and points at
   packages/catalog/apis/care.json, vetting.json and protocols.json for the sentences those rules are
   refused with rather than repeating them. A phone cannot read JSON at runtime, so this resolves every
   pointer and emits the sentence it lands on, word for word, into CareData.swift and CareData.kt — the
   copy is generated, so the day a route rewords a refusal both apps say the new words or the build
   fails.

   WHAT THIS GENERATOR REFUSES TO EMIT. A checklist step, a threshold or anything else from a protocol:
   it writes a service's protocol ids and nothing about what they say, and it throws if a protocol a
   service names is not in the register. And a decision nobody has taken: the offer expiry is written
   with the proposal it is, and the generator throws if the contract ever claims it was decided without
   naming who decided it.

   Escaping: Swift needs backslash and quote escaped; Kotlin needs backslash, quote and dollar, because a
   lone $ starts a template. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  const route = api.routes.find(r => r.method === 'POST' && r.path === path);
  const found = route?.refusals.find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/care.json has no refusal "${id}" on POST ${path}.`);
  return found.statement;
 };
 const engineRefusal = id => {
  const found = api.refusals.find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/care.json has lost the engine refusal "${id}".`);
  return found.statement;
 };
 const nurse = vetting.roles.find(r => r.id === 'nurse');
 if (!nurse?.scope?.note) throw new Error('packages/catalog/vetting.json has lost the nurse scope note Care withholds with.');
 const draft = protocols.refusals.find(r => r.id === 'a-draft-carries-nothing');
 if (!draft) throw new Error('packages/catalog/protocols.json has lost "a-draft-carries-nothing".');
 const noBase = contract.withheld.find(w => w.id === 'no-base-to-measure-from')?.statement;
 if (!noBase) throw new Error(`${SOURCE} has lost the withheld sentence "no-base-to-measure-from".`);
 if (contract.offers.decidedBy !== null && !contract.offers.decidedBy?.trim?.()) throw new Error(`${SOURCE} says the offer expiry was decided without naming who decided it.`);
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
    /// A proposal awaiting ${contract.offers.awaiting}. Nobody has decided it.
    static let offerExpiresAfterMinutes = ${contract.offers.expiresAfterMinutes}

${sentences.map(([name, value]) => `    static let ${name} = ${swift(value)}`).join('\n')}

    static let requirements: [Requirement] = [
${contract.services.map(s => `        Requirement(serviceId: ${swift(s.serviceId)}, scope: ${s.scope === null ? 'nil' : swift(s.scope)}, protocolIds: [${s.protocolIds.map(swift).join(', ')}], supervisedBy: ${s.supervisedBy ? swift(s.supervisedBy) : 'nil'})`).join(',\n')}
    ]

    static let stages: [Stage] = [
${contract.stages.map(s => `        Stage(id: ${swift(s.id)}, name: ${swift(s.name)})`).join(',\n')}
    ]

    enum Preview {
        static let appointmentRef = ${swift(p.appointmentRef)}
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
}
`;

 const kotlinFile = `${banner}

package za.co.mythuso.model

object CareData {
    data class Requirement(val serviceId: String, val scope: String?, val protocolIds: List<String>, val supervisedBy: String?)
    data class Stage(val id: String, val name: String)

    const val seedPhase = ${contract.seedPhase}
    /** A proposal awaiting ${contract.offers.awaiting}. Nobody has decided it. */
    const val offerExpiresAfterMinutes = ${contract.offers.expiresAfterMinutes}

${sentences.map(([name, value]) => `    const val ${name} = ${kotlin(value)}`).join('\n')}

    val requirements = listOf(
${contract.services.map(s => `        Requirement(${kotlin(s.serviceId)}, ${s.scope === null ? 'null' : kotlin(s.scope)}, listOf(${s.protocolIds.map(kotlin).join(', ')}), ${s.supervisedBy ? kotlin(s.supervisedBy) : 'null'})`).join(',\n')}
    )

    val stages = listOf(
${contract.stages.map(s => `        Stage(${kotlin(s.id)}, ${kotlin(s.name)})`).join(',\n')}
    )

    object Preview {
        const val appointmentRef = ${kotlin(p.appointmentRef)}
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
