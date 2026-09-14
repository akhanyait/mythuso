/* ThusoIQ Core's event contracts, written out for two native apps by a machine.

   packages/catalog/events.json declares the engines and the envelope, and lists the files that
   contribute an `events` array — itself, the assistant contract and the trust contract, which are
   written by other people against the same shape. This generator reads every one of those that
   exists and emits what a native app needs to name an event without typing it: one constant per
   live type@version, carrying the engine that owns it.

   ONE CONSTANT PER LIVE VERSION, AND NOTHING ELSE THAT NAMES AN EVENT. Until the second review pass
   on 14 September this file emitted a type-name constant and, separately, a list of versions. That
   is an API in which `publish(EventsData.Types.personTrustUpdated, version: v)` compiles for any v,
   including a withdrawn one, and a pattern search over the source cannot see a version held in a
   variable. So the type constants are gone. What is emitted is `EventKey`, whose initialiser only
   this generated file can call — `fileprivate` in Swift, a private constructor in Kotlin — and one
   constant per live version, `personTrustUpdatedV2` and `PERSON_TRUST_UPDATED_V2`. There is no
   function taking a version. A withdrawn version is not a constant, so it cannot be named at all.
   scripts/check-boundaries.mjs holds the generated files to that shape, and keeps its pattern search
   for hand-written code as the second line.

   WHAT IS DELIBERATELY NOT EMITTED. The payloads. A native app does not publish to the bus — no
   app in this repository does — and a payload description compiled into a phone is a second copy
   of a frozen shape that nobody would remember to regenerate. The envelope's never-list is not
   emitted either: it is enforced where events are declared, by scripts/check-boundaries.mjs, not
   at a call site on a phone.

   A source file that is listed and does not exist yet is skipped rather than refused, so that this
   contract can land before the contracts that contribute to it. The day one of them lands, the
   generated files stop matching and the build says to run `npm run events`.

   The lock. `eventFingerprint` is exported for scripts/check-boundaries.mjs and for whoever appends
   a line to packages/catalog/events.lock. It fingerprints the type, the version, the owner and each
   payload field's name, type and whether it is required — the shape a subscriber is built against —
   and nothing else, so rewording a `why` or adding a subscriber is not a version change and changing
   a field is. The type and version were not in it until 14 September, when person.under_review@1 and
   person.deactivated@1 were found sharing one fingerprint: same owner, same payload, so the lock could
   not tell one from the other. Every line was re-locked in that one change.

   Escaping: Swift needs its quotes escaped; Kotlin needs backslash, quote and dollar, because a
   lone $ starts a template. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'packages/catalog/events.json';

const swift = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;

export const eventFingerprint = event => createHash('sha256')
 .update(JSON.stringify({ type: event.type, version: event.version, owner: event.owner, payload: (event.payload ?? []).map(f => [f.field, f.type, f.required === true]) }))
 .digest('hex').slice(0, 16);

/* Every event from every source that exists, in source order. Shared with the check so the two can
   never disagree about which events there are. */
export function collectEvents(root = '') {
 const contract = JSON.parse(readFileSync(root + SOURCE, 'utf8'));
 const events = [];
 const skipped = [];
 for (const source of contract.sources) {
  if (!existsSync(root + source)) { skipped.push(source); continue; }
  const declared = JSON.parse(readFileSync(root + source, 'utf8')).events;
  if (declared === undefined) { skipped.push(source); continue; }
  if (!Array.isArray(declared)) throw new Error(`${source} has an "events" key that is not a list. Every source of events uses the shape in ${SOURCE}.`);
  for (const event of declared) events.push({ ...event, source });
 }
 return { contract, events, skipped };
}

/* The constant names, exported so the check reads the same names the apps are given. */
export const swiftKeyName = e => e.type.split(/[._]/).map((part, i) => (i ? part[0].toUpperCase() + part.slice(1) : part)).join('') + `V${e.version}`;
export const kotlinKeyName = e => `${e.type.replace(/[.]/g, '_').toUpperCase()}_V${e.version}`;

export function emitEvents(root = '') {
 const { contract, events: declared } = collectEvents(root);
 const live = declared.filter(e => !e.withdrawn);
 /* Two versions that differ only in punctuation would collapse into one constant and one of them
    would silently vanish from both apps. */
 for (const [name, of] of [['Swift', swiftKeyName], ['Kotlin', kotlinKeyName]]) {
  const seen = new Map();
  for (const e of live) {
   const key = `${e.type}@${e.version}`;
   if (seen.has(of(e))) throw new Error(`${key} and ${seen.get(of(e))} become the same ${name} constant. Rename one of them in its contract.`);
   seen.set(of(e), key);
  }
 }

 const banner = [
  `Generated by scripts/emit-events.mjs from ${contract.sources.join(', ')}.`,
  'Do not edit by hand — run `npm run events`. The build fails if this file and its sources',
  'disagree, so an edit here is lost rather than merely wrong.',
  '',
  'One sealed constant per live event version, carrying the engine that owns it. Nothing in this app',
  'publishes to a bus, and no payload shape is written here. A withdrawn version has no constant and',
  'an EventKey cannot be made outside this file, so no code in this app can name one.'
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const swiftFile = `${banner}

import Foundation

enum EventsData {
    struct Engine: Identifiable { let id: String; let name: String; let productName: String }

    /* A live event version. The initialiser is fileprivate: only this generated file makes one. */
    struct EventKey: Identifiable, Hashable {
        let type: String
        let version: Int
        let owner: String
        var id: String { "\\(type)@\\(version)" }
        fileprivate init(_ type: String, _ version: Int, _ owner: String) {
            self.type = type
            self.version = version
            self.owner = owner
        }
    }

    static let contractVersion = ${contract.version}
    static let frozen = ${contract.frozen === true}

    static let engines: [Engine] = [
${contract.engines.map(e => `        Engine(id: ${swift(e.id)}, name: ${swift(e.name)}, productName: ${swift(e.productName)})`).join(',\n')}
    ]

${live.map(e => `    static let ${swiftKeyName(e)} = EventKey(${swift(e.type)}, ${e.version}, ${swift(e.owner)})`).join('\n')}

    static let events: [EventKey] = [
${live.map(e => `        ${swiftKeyName(e)}`).join(',\n')}
    ]

    static func owner(of type: String) -> String? { events.first { $0.type == type }?.owner }
}
`;

 const kotlinFile = `${banner}

package za.co.mythuso.model

object EventsData {
    data class Engine(val id: String, val name: String, val productName: String)

    // A live event version. The constructor is private: only the constants below make one, and it is
    // not a data class, so there is no copy() to change its version with.
    class EventKey private constructor(val type: String, val version: Int, val owner: String) {
        override fun toString() = "$type@$version"
        override fun equals(other: Any?) = other is EventKey && other.type == type && other.version == version
        override fun hashCode() = 31 * type.hashCode() + version

        companion object {
${live.map(e => `            val ${kotlinKeyName(e)} = EventKey(${kotlin(e.type)}, ${e.version}, ${kotlin(e.owner)})`).join('\n')}

            val all = listOf(
${live.map(e => `                ${kotlinKeyName(e)}`).join(',\n')}
            )
        }
    }

    const val CONTRACT_VERSION = ${contract.version}
    const val FROZEN = ${contract.frozen === true}

    val engines = listOf(
${contract.engines.map(e => `        Engine(${kotlin(e.id)}, ${kotlin(e.name)}, ${kotlin(e.productName)})`).join(',\n')}
    )

    val events get() = EventKey.all

    fun ownerOf(type: String) = events.firstOrNull { it.type == type }?.owner
}
`;

 return [
  { path: 'apps/ios/MyThuso/Models/EventsData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/EventsData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitEvents()) {
  writeFileSync(file.path, file.content);
  console.log(`events → ${file.path}`);
 }
}
