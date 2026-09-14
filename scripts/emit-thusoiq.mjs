/* The clinical workflow kernel, written out for two native apps by a machine.

   packages/catalog/thusoiq.json is the kernel's vocabulary: forty-seven refusal sentences, the
   appointment transition table, the metric-to-unit map, nine field labels and every numeric bound
   the five engines enforce. The engines in packages/thusoiq hold none of them any more — they
   reach for a sentence by id — and this generator carries the same sentences into Swift and Kotlin
   so that a patient told no on an iPhone is told no in the words the web app would have used.

   WHAT THIS GENERATOR REFUSES TO EMIT. A refusal with no `why` beside its sentence: the sentence is
   written for the person being refused and the reasoning is written for whoever is about to delete
   it, and a refusal that arrives with only the first half is a refusal with nothing defending it. A
   transition into a state nothing declares, because an appointment that can reach a status no
   screen renders is a visit that disappears. A unit mapped to a metric the contract has not got,
   because a unit nothing is checked against is a check that silently does nothing. A refusal
   carrying an error code the kernel cannot throw — the codes are read out of packages/thusoiq
   /types.ts rather than restated here. And a `{token}` in a sentence that the refusal has not
   declared, because an unfilled placeholder reaches a person as literal braces at the worst moment.

   THE FOUR SOAP HEADINGS ARE NOT IN THE CONTRACT AND ARE NOT WRITTEN HERE. They are derived from
   packages/catalog/records.json, which the consultation form in all three apps already renders. Two
   of the refusals say the word "four" out loud, so `soap.mustBe` holds the derivation to that
   length: the day somebody adds a fifth section the build fails rather than the sentence quietly
   becoming a lie.

   Numbers: every bound is a whole number and the generator throws on anything else, because the
   moment a rate appears here somebody has to decide what it is in Kotlin — an Int literal does not
   widen to a Double, and the first place that bites is a nullable field that compiles and rounds.
   Millisecond bounds are emitted as Kotlin Longs, since a duration in an Int is a clock waiting to
   overflow inside somebody's arithmetic.

   Escaping: Swift needs its quotes escaped; Kotlin needs backslash, quote and dollar, because a
   lone $ starts a template. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'packages/catalog/thusoiq.json';
const RECORDS = 'packages/catalog/records.json';
const VETTING = 'packages/catalog/vetting.json';
const CAPABILITIES = 'packages/catalog/capabilities.json';
const TYPES = 'packages/thusoiq/types.ts';

const swift = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
const wrap = (text, width = 94) => text.match(new RegExp(`.{1,${width}}(\\s|$)`, 'g')).map(line => line.trim());
const swiftList = values => values.map(swift).join(', ');
const kotlinList = values => values.map(kotlin).join(', ');

export function emitThusoIQ(root = '') {
 const contract = JSON.parse(readFileSync(root + SOURCE, 'utf8'));
 const records = JSON.parse(readFileSync(root + RECORDS, 'utf8'));
 const vetting = JSON.parse(readFileSync(root + VETTING, 'utf8'));
 const capabilities = JSON.parse(readFileSync(root + CAPABILITIES, 'utf8'));

 /* The codes the kernel can actually throw, read out of the type rather than listed again here. */
 const codes = new Set([...readFileSync(root + TYPES, 'utf8').matchAll(/export type EngineErrorCode = ([^;]+);/g)]
  .flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(code => code[1])));
 if (!codes.size) throw new Error('No EngineErrorCode union was found in packages/thusoiq/types.ts. Every refusal names a code, and the codes are the type\'s rather than this generator\'s.');

 if (!contract.refusals?.length) throw new Error(`${SOURCE} declares no refusals, and the refusals are the feature.`);
 const seen = new Set();
 for (const refusal of contract.refusals) {
  if (!refusal.sentence || !refusal.why) throw new Error(`Refusal "${refusal.id}" is missing its sentence or its reasoning. The sentence is what a person reads; the reasoning is what stops the next person deleting it.`);
  if (seen.has(refusal.id)) throw new Error(`Two refusals in ${SOURCE} are called "${refusal.id}". Whichever the kernel reaches first wins, and it will not be the one somebody is looking at.`);
  seen.add(refusal.id);
  if (!codes.has(refusal.code)) throw new Error(`Refusal "${refusal.id}" carries the code "${refusal.code}", which is not an EngineErrorCode the kernel can throw.`);
  const tokens = [...refusal.sentence.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
  const declared = new Set(refusal.fills ?? []);
  for (const token of tokens) if (!declared.has(token)) throw new Error(`Refusal "${refusal.id}" says {${token}} and does not declare it in "fills". An unfilled placeholder reaches a person as literal braces at the moment the kernel is telling them no.`);
  for (const fill of declared) if (!tokens.includes(fill)) throw new Error(`Refusal "${refusal.id}" declares the fill "${fill}", which its sentence never uses.`);
 }

 /* The transition table. Every row and every destination has to be a state somebody declared, and
    every state has to have a row — a terminal one says so with an empty list rather than by being
    left out, because a state nobody mentioned is a state nobody decided about. */
 const states = new Set(contract.appointments.states.map(state => state.id));
 for (const [from, destinations] of Object.entries(contract.appointments.transitions)) {
  if (!states.has(from)) throw new Error(`The transition table has a row for "${from}", which ${SOURCE} has not declared as an appointment state.`);
  for (const to of destinations) if (!states.has(to)) throw new Error(`The transition "${from}" → "${to}" names a state ${SOURCE} has not got. An appointment that can reach a status no screen renders is a visit that disappears.`);
 }
 for (const state of contract.appointments.states) {
  const row = contract.appointments.transitions[state.id];
  if (!row) throw new Error(`The appointment state "${state.id}" has no row in the transition table. A terminal state says so with an empty list rather than by being left out.`);
  if (state.terminal !== (row.length === 0)) throw new Error(`The appointment state "${state.id}" is marked terminal: ${state.terminal}, and its transition row disagrees.`);
 }

 /* A unit is only meaningful against the metric it measures, and a unit map entry with no metric is
    a check that quietly does nothing to a number on a clinician's screen. */
 const metrics = new Set(contract.wearables.metrics.map(metric => metric.id));
 for (const metric of Object.keys(contract.wearables.units)) if (!metrics.has(metric)) throw new Error(`wearables.units maps "${metric}", which is not one of ${SOURCE}'s metrics. A unit with no metric is a check nothing is ever run against.`);
 for (const metric of contract.wearables.metrics) if (!contract.wearables.units[metric.id]) throw new Error(`The metric "${metric.id}" has no unit. A sample whose unit is not checked is a number in whatever units the device felt like.`);

 for (const [name, bound] of Object.entries(contract.bounds)) {
  if (!bound.unit || !bound.why) throw new Error(`The bound "${name}" has no unit or no reasoning. A number with neither is a number the next person will change because it looked arbitrary.`);
  if (!Number.isInteger(bound.max) || bound.max <= 0) throw new Error(`The bound "${name}" has no positive whole maximum. Every bound here is counted in whole things, and a rate would have to be decided for Kotlin before it could be emitted.`);
  if ('min' in bound && (!Number.isInteger(bound.min) || bound.min >= bound.max)) throw new Error(`The bound "${name}" has a minimum that is not a whole number below its maximum.`);
 }

 const soapKeys = records.consultation.soap.map(section => section.name.toLowerCase());
 if (soapKeys.length !== contract.soap.mustBe) throw new Error(`${RECORDS} now yields ${soapKeys.length} SOAP sections and ${SOURCE} says there must be ${contract.soap.mustBe}. Two refusals say the word "four" out loud, so this is a sentence about to become a lie rather than a list about to get longer.`);

 const vettingRoles = new Set(vetting.roles.map(role => role.id));
 for (const role of contract.clinicalRoles) {
  if (!vettingRoles.has(role.vettingRole)) throw new Error(`The clinical role "${role.id}" is vetted as "${role.vettingRole}", which ${VETTING} has not got. Verification belongs to that file, and a role vetted against nothing is a role nothing can withdraw.`);
  if (!role.mayNot) throw new Error(`The clinical role "${role.id}" does not say what it may not do, which is the half of it that matters.`);
 }
 const recordIds = new Set(records.records.map(record => record.id));
 for (const type of contract.recordTypes) if (!recordIds.has(type)) throw new Error(`This kernel claims to write the record type "${type}", which ${RECORDS} has not got.`);
 const capabilityIds = new Set(capabilities.capabilities.map(capability => capability.id));
 for (const capability of contract.capabilities) if (!capabilityIds.has(capability)) throw new Error(`This kernel names the capability "${capability}", which ${CAPABILITIES} has not got. An invented capability is a gap nobody can be told about.`);

 /* The sentence a person reads when they have not chosen a mode names both modes. A third one
    cannot be added without somebody reading what is asked. */
 const modeSentence = contract.refusals.find(refusal => refusal.id === 'mode-required').sentence;
 for (const mode of contract.appointments.modes) if (!modeSentence.toLowerCase().includes(mode.id)) throw new Error(`The visit mode "${mode.id}" is not named in the mode-required refusal, which reads ${JSON.stringify(modeSentence)}.`);

 const boundNames = Object.entries(contract.bounds).flatMap(([name, bound]) =>
  ('min' in bound ? [[`${name}Min`, bound.min, name]] : []).concat([[`${name}Max`, bound.max, name]]));
 /* A duration in a Kotlin Int is a clock waiting to overflow inside somebody's arithmetic. */
 const longish = from => from.endsWith('Ms');

 const banner = () => [
  `Generated by scripts/emit-thusoiq.mjs from ${SOURCE}.`,
  'Do not edit by hand — run `npm run thusoiq-contract`. The build fails if this file and the',
  'source disagree, so an edit here is lost rather than merely wrong.',
  '',
  'The ThusoIQ clinical workflow kernel, as the apps need to read it: every sentence it refuses',
  'with, the appointment transition table, the wearable unit map, the field labels and the bounds.',
  'The sentences are rendered word for word. A patient told one story on the web and another on a',
  'phone about why their medicine was held is a patient who believes neither.',
  '',
  'The four SOAP headings below are derived from packages/catalog/records.json — they are that',
  "file's, and a second list would be the copy that drifts. The roles are vetted through",
  'packages/catalog/vetting.json, so a lapsed registration withdraws a capability here too.',
  '',
  'Nothing here is a real service. No visit is booked, no consultation is signed, no medicine is',
  'dispensed and no device is read. Three fictional patients, in memory, gone when the app closes.'
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const swiftFile = `${banner()}

import Foundation

enum ThusoIQData {
    /// Something the kernel will not do, in the words a person reads. \`fills\` names the
    /// placeholders the sentence carries; the reasoning stays in the contract, written for whoever
    /// is about to delete the sentence rather than for the patient.
    struct Refusal: Identifiable, Hashable { let id: String; let code: String; let sentence: String; let fills: [String] }
    /// Half of a refusal: "Hold reason is required" is the whole sentence a person reads.
    struct FieldLabel: Identifiable, Hashable { let id: String; let label: String }
    struct AppointmentState: Identifiable, Hashable { let id: String; let name: String; let detail: String; let terminal: Bool }
    struct VisitMode: Identifiable, Hashable { let id: String; let name: String; let detail: String }
    /// A metric and the only unit a sample of it may arrive in. Mismatches are rejected, never
    /// converted: a kernel that quietly converts a unit will one day convert the wrong one.
    struct Metric: Identifiable, Hashable { let id: String; let name: String; let unit: String }
    struct SampleQuality: Identifiable, Hashable { let id: String; let name: String; let detail: String }
    /// What a role may do, and — the half that matters — what it may not.
    struct ClinicalRole: Identifiable, Hashable { let id: String; let vettingRole: String; let may: String; let mayNot: String }

${wrap(contract._whyTheSentencesLiveHere).map(line => `    // ${line}`).join('\n')}
    static let refusals: [Refusal] = [
${contract.refusals.map(r => `        .init(id: ${swift(r.id)}, code: ${swift(r.code)},
              sentence: ${swift(r.sentence)},
              fills: [${swiftList(r.fills ?? [])}])`).join(',\n')}
    ]

${wrap(contract.fieldLabelsNote).map(line => `    // ${line}`).join('\n')}
    static let fieldLabels: [FieldLabel] = [
${contract.fieldLabels.map(f => `        .init(id: ${swift(f.id)}, label: ${swift(f.label)})`).join(',\n')}
    ]

    static let appointmentStates: [AppointmentState] = [
${contract.appointments.states.map(s => `        .init(id: ${swift(s.id)}, name: ${swift(s.name)},
              detail: ${swift(s.detail)}, terminal: ${s.terminal})`).join(',\n')}
    ]

${wrap(contract.appointments.transitionsNote).map(line => `    // ${line}`).join('\n')}
    static let appointmentTransitions: [String: [String]] = [
${Object.entries(contract.appointments.transitions).map(([from, to]) => `        ${swift(from)}: [${swiftList(to)}]`).join(',\n')}
    ]

${wrap(contract.appointments.modesNote).map(line => `    // ${line}`).join('\n')}
    static let visitModes: [VisitMode] = [
${contract.appointments.modes.map(m => `        .init(id: ${swift(m.id)}, name: ${swift(m.name)}, detail: ${swift(m.detail)})`).join(',\n')}
    ]

${wrap(contract.wearables.unitsNote).map(line => `    // ${line}`).join('\n')}
    static let metrics: [Metric] = [
${contract.wearables.metrics.map(m => `        .init(id: ${swift(m.id)}, name: ${swift(m.name)}, unit: ${swift(contract.wearables.units[m.id])})`).join(',\n')}
    ]
    static let sampleQualities: [SampleQuality] = [
${contract.wearables.qualities.map(q => `        .init(id: ${swift(q.id)}, name: ${swift(q.name)}, detail: ${swift(q.detail)})`).join(',\n')}
    ]
${wrap(contract.wearables.sourcesNote).map(line => `    // ${line}`).join('\n')}
    static let sampleSources: [String] = [${swiftList(contract.wearables.sources)}]
${wrap(contract.wearables.neverInferred).map(line => `    // ${line}`).join('\n')}

${wrap(contract.soap.why).map(line => `    // ${line}`).join('\n')}
    static let soapKeys: [String] = [${swiftList(soapKeys)}]

${wrap(contract.clinicalRolesNote).map(line => `    // ${line}`).join('\n')}
    static let clinicalRoles: [ClinicalRole] = [
${contract.clinicalRoles.map(r => `        .init(id: ${swift(r.id)}, vettingRole: ${swift(r.vettingRole)},
              may: ${swift(r.may)},
              mayNot: ${swift(r.mayNot)})`).join(',\n')}
    ]

${wrap(contract.boundsNote).map(line => `    // ${line}`).join('\n')}
${boundNames.map(([name, value, from]) => `    /// ${contract.bounds[from].unit}\n    static let ${name} = ${value}`).join('\n')}

${wrap(contract.recordTypesNote).map(line => `    // ${line}`).join('\n')}
    static let recordTypes: [String] = [${swiftList(contract.recordTypes)}]
${wrap(contract.capabilitiesNote).map(line => `    // ${line}`).join('\n')}
    static let capabilities: [String] = [${swiftList(contract.capabilities)}]

${wrap(contract.neverInThisKernel).map(line => `    // ${line}`).join('\n')}

    static func refusal(_ id: String) -> Refusal? { refusals.first { $0.id == id } }
    static func fieldLabel(_ id: String) -> String? { fieldLabels.first { $0.id == id }?.label }
    static func unit(_ metric: String) -> String? { metrics.first { $0.id == metric }?.unit }
    static func transitions(from state: String) -> [String] { appointmentTransitions[state] ?? [] }

    /// The sentence with its placeholders filled, exactly as the web kernel fills them. A refusal
    /// is looked up first so that a missing id is nil here rather than an empty sentence in front
    /// of somebody being told no.
    static func fill(_ refusal: Refusal, _ fills: [String: String] = [:]) -> String {
        refusal.fills.reduce(refusal.sentence) { text, token in
            text.replacingOccurrences(of: "{\\(token)}", with: fills[token] ?? "")
        }
    }

    /// Grouped by hand rather than by locale, so a sentence a patient reads does not change shape
    /// with the device's region setting. Bounds are positive whole numbers — the generator throws
    /// otherwise — so there is no sign to carry.
    static func grouped(_ value: Int) -> String {
        let digits = String(value)
        var out = ""
        for (index, character) in digits.enumerated() {
            if index > 0 && (digits.count - index) % 3 == 0 { out.append(",") }
            out.append(character)
        }
        return out
    }
}
`;

 const kotlinFile = `${banner()}

package za.co.mythuso.model

/**
 * Something the kernel will not do, in the words a person reads. [fills] names the placeholders the
 * sentence carries; the reasoning stays in the contract, written for whoever is about to delete the
 * sentence rather than for the patient.
 */
data class ThusoIQRefusal(val id: String, val code: String, val sentence: String, val fills: List<String>)

/** Half of a refusal: "Hold reason is required" is the whole sentence a person reads. */
data class ThusoIQFieldLabel(val id: String, val label: String)

data class ThusoIQAppointmentState(val id: String, val name: String, val detail: String, val terminal: Boolean)
data class ThusoIQVisitMode(val id: String, val name: String, val detail: String)

/**
 * A metric and the only unit a sample of it may arrive in. Mismatches are rejected, never
 * converted: a kernel that quietly converts a unit will one day convert the wrong one.
 */
data class ThusoIQMetric(val id: String, val name: String, val unit: String)

data class ThusoIQSampleQuality(val id: String, val name: String, val detail: String)

/** What a role may do, and — the half that matters — what it may not. */
data class ThusoIQClinicalRole(val id: String, val vettingRole: String, val may: String, val mayNot: String)

${wrap(contract._whyTheSentencesLiveHere).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQRefusals = listOf(
${contract.refusals.map(r => `    ThusoIQRefusal(${kotlin(r.id)}, ${kotlin(r.code)},
        ${kotlin(r.sentence)},
        listOf(${kotlinList(r.fills ?? [])})),`).join('\n')}
)

${wrap(contract.fieldLabelsNote).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQFieldLabels = listOf(
${contract.fieldLabels.map(f => `    ThusoIQFieldLabel(${kotlin(f.id)}, ${kotlin(f.label)}),`).join('\n')}
)

val thusoIQAppointmentStates = listOf(
${contract.appointments.states.map(s => `    ThusoIQAppointmentState(${kotlin(s.id)}, ${kotlin(s.name)}, ${kotlin(s.detail)}, ${s.terminal}),`).join('\n')}
)

${wrap(contract.appointments.transitionsNote).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQAppointmentTransitions = mapOf(
${Object.entries(contract.appointments.transitions).map(([from, to]) => `    ${kotlin(from)} to listOf(${kotlinList(to)}),`).join('\n')}
)

${wrap(contract.appointments.modesNote).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQVisitModes = listOf(
${contract.appointments.modes.map(m => `    ThusoIQVisitMode(${kotlin(m.id)}, ${kotlin(m.name)}, ${kotlin(m.detail)}),`).join('\n')}
)

${wrap(contract.wearables.unitsNote).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQMetrics = listOf(
${contract.wearables.metrics.map(m => `    ThusoIQMetric(${kotlin(m.id)}, ${kotlin(m.name)}, ${kotlin(contract.wearables.units[m.id])}),`).join('\n')}
)

val thusoIQSampleQualities = listOf(
${contract.wearables.qualities.map(q => `    ThusoIQSampleQuality(${kotlin(q.id)}, ${kotlin(q.name)}, ${kotlin(q.detail)}),`).join('\n')}
)

${wrap(contract.clinicalRolesNote).map((line, i) => `${i ? '   ' : '/* '}${line}`).join('\n')} */
val thusoIQClinicalRoles = listOf(
${contract.clinicalRoles.map(r => `    ThusoIQClinicalRole(${kotlin(r.id)}, ${kotlin(r.vettingRole)},
        ${kotlin(r.may)},
        ${kotlin(r.mayNot)}),`).join('\n')}
)

object ThusoIQData {
${wrap(contract.wearables.sourcesNote, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
    val sampleSources = listOf(${kotlinList(contract.wearables.sources)})

${wrap(contract.soap.why, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
    val soapKeys = listOf(${kotlinList(soapKeys)})

${wrap(contract.recordTypesNote, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
    val recordTypes = listOf(${kotlinList(contract.recordTypes)})

${wrap(contract.capabilitiesNote, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
    val capabilities = listOf(${kotlinList(contract.capabilities)})

${wrap(contract.boundsNote, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
${boundNames.map(([name, value, from]) => `    /** ${contract.bounds[from].unit} */\n    const val ${name} = ${value}${longish(from) ? 'L' : ''}`).join('\n')}

${wrap(contract.wearables.neverInferred, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */
${wrap(contract.neverInThisKernel, 88).map((line, i) => `${i ? '       ' : '    /* '}${line}`).join('\n')} */

    fun refusal(id: String) = thusoIQRefusals.firstOrNull { it.id == id }
    fun fieldLabel(id: String) = thusoIQFieldLabels.firstOrNull { it.id == id }?.label
    fun unit(metric: String) = thusoIQMetrics.firstOrNull { it.id == metric }?.unit
    fun transitionsFrom(state: String) = thusoIQAppointmentTransitions[state] ?: emptyList()

    /**
     * The sentence with its placeholders filled, exactly as the web kernel fills them. A refusal is
     * looked up first, so a missing id is null here rather than an empty sentence in front of
     * somebody being told no.
     */
    fun fill(refusal: ThusoIQRefusal, fills: Map<String, String> = emptyMap()): String =
        refusal.fills.fold(refusal.sentence) { text, token -> text.replace("{\$token}", fills[token] ?: "") }

    /**
     * Grouped by hand rather than by locale, so a sentence a patient reads does not change shape
     * with the device's region setting. Bounds are positive whole numbers — the generator throws
     * otherwise — so there is no sign to carry.
     */
    fun grouped(value: Int): String {
        val digits = value.toString()
        return buildString {
            digits.forEachIndexed { index, character ->
                if (index > 0 && (digits.length - index) % 3 == 0) append(',')
                append(character)
            }
        }
    }
}
`;

 return [
  { path: 'apps/ios/MyThuso/Models/ThusoIQData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/ThusoIQData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitThusoIQ()) {
  writeFileSync(file.path, file.content);
  console.log(`thusoiq → ${file.path}`);
 }
}
