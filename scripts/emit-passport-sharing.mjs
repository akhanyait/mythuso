/* The Health Passport's emergency card and access log, written out for two native apps by a machine.

   packages/catalog/passport-sharing.json holds what a card opens, how long it lasts and how often it opens, the
   sentence a camera reads off it, and the words and the synthetic log the access-log screen draws. Neither phone can
   read JSON at runtime, and neither may type a lifetime, a count or a sentence of its own, so this writes them into
   apps/ios/MyThuso/Models/PassportSharingData.swift and apps/android/app/src/main/java/za/co/mythuso/model/
   PassportSharingData.kt.

   WHAT IS RESOLVED HERE RATHER THAN ON A PHONE. Every reason in the preview log is a statement, a refusal or a
   break-glass reason in packages/catalog/passport-gateway.json named by its id, and every role is a grant role in
   packages/catalog/consent.json or a role the log names; both are turned into their sentences here, so a phone draws
   the gateway's words and cannot draw an id. The settings are written through scripts/settings-defaults.mjs, which is
   the one place a phone is told a default is a proposal nobody has decided.

   WHAT THIS GENERATOR REFUSES TO EMIT. A preview grant to a payer, or opening a category records.json does not hold.
   A card whose scope is not the category that opens the emergency summary. A reason, a role or an action with no
   sentence. A QR payload with nowhere to put the card's code. And any end or count typed anywhere but a setting.

   Escaping: Swift needs its backslashes and quotes escaped; Kotlin needs backslash, quote and dollar, because a lone
   $ starts a template. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settingDefault } from './settings-defaults.mjs';

const SOURCE = 'packages/catalog/passport-sharing.json';

const swift = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
const readJson = (root, file) => JSON.parse(readFileSync(root + file, 'utf8'));

export function emitPassportSharing(root = '') {
 const contract = readJson(root, SOURCE);
 const gateway = readJson(root, 'packages/catalog/passport-gateway.json');
 const consent = readJson(root, 'packages/catalog/consent.json');
 const records = readJson(root, 'packages/catalog/records.json');

 const recordName = id => {
  const found = records.records.find(record => record.id === id);
  if (!found) throw new Error(`${SOURCE} names the record category "${id}", which packages/catalog/records.json does not hold.`);
  return found.name;
 };
 const roleName = id => {
  const name = consent.grants.recipientRoles.find(role => role.id === id)?.name ?? contract.accessLog.roleLabels.find(role => role.id === id)?.label;
  if (!name) throw new Error(`${SOURCE} names the role "${id}" in its preview log, and neither consent.json nor its own roleLabels names it.`);
  return name;
 };
 const actionName = id => {
  const label = id.endsWith(contract.accessLog.probeSuffix) ? contract.accessLog.probeLabel : contract.accessLog.actions.find(action => action.id === id)?.label;
  if (!label) throw new Error(`${SOURCE} logs the action "${id}", which accessLog.actions does not label.`);
  return label;
 };
 const outcomeName = id => {
  const label = contract.accessLog.outcomes.find(outcome => outcome.id === id)?.label;
  if (!label) throw new Error(`${SOURCE} logs the outcome "${id}", which accessLog.outcomes does not label.`);
  return label;
 };
 const reasonOf = reason => {
  const sentence = reason.statement ? gateway.statements[reason.statement]
   : reason.refusal ? gateway.refusals.find(refusal => refusal.id === reason.refusal)?.sentence
   : reason.breakGlass ? gateway.breakGlass.reasons.find(candidate => candidate.id === reason.breakGlass)?.sentence
   : null;
  if (!sentence) throw new Error(`${SOURCE} gives a preview log entry the reason ${JSON.stringify(reason)}, which is no statement, refusal or break-glass reason in packages/catalog/passport-gateway.json.`);
  return sentence;
 };

 /* The card opens the category the gateway opens the emergency summary with, and the summary's categories are
    the gateway's. Read, never restated. */
 const card = contract.links.kinds.find(kind => kind.id === 'emergency-card');
 const openedBy = gateway.emergencySummary.openedBy;
 if (!card || card.scopeFrom !== 'packages/catalog/passport-gateway.json#emergencySummary.openedBy') throw new Error(`${SOURCE} has no emergency card whose scope is the gateway's emergency summary.`);
 if (!contract.links.qrPayload.includes('{code}')) throw new Error(`${SOURCE} links.qrPayload has no {code}, so a card would carry a sentence with no card in it.`);
 const payers = new Set([...contract.links.neverTo.map(payer => payer.id), ...consent.grants.recipientRoles.filter(role => role.gateway.reads === 'aggregate' || role.identifiable === false).map(role => role.id)]);
 for (const grant of contract.preview.grants) {
  if (payers.has(grant.recipientRole)) throw new Error(`${SOURCE} gives the preview a grant to ${grant.recipientRole}, and no link rides on a grant to a payer.`);
  grant.scope.forEach(recordName);
  if (!Number.isInteger(grant.endsInDays) || grant.endsInDays < 1 || grant.endsInDays > consent.grants.maximumExpiryDays) throw new Error(`${SOURCE} gives the preview grant ${grant.ref} an end past the founder's grant ceiling.`);
 }
 const cardGrant = contract.preview.grants.find(grant => grant.scope.includes(openedBy) && grant.purpose === 'emergency') ?? contract.preview.grants.find(grant => grant.scope.includes(openedBy));
 if (!cardGrant) throw new Error(`${SOURCE} has no preview grant a card could ride on.`);

 const settings = {
  cardLifetimeDays: settingDefault(SOURCE, contract, 'emergency-card-lifetime-days'),
  cardMaxUses: settingDefault(SOURCE, contract, 'emergency-card-max-uses'),
  linkLifetimeDays: settingDefault(SOURCE, contract, 'share-link-lifetime-days'),
  linkMaxUses: settingDefault(SOURCE, contract, 'share-link-max-uses'),
  linkDefaultScope: settingDefault(SOURCE, contract, 'share-link-default-scope')
 };

 const entries = contract.preview.accessLog.map((entry, index) => ({
  id: `preview-${index}`, dayOffset: entry.dayOffset, time: entry.time, who: roleName(entry.requesterRole), requesterRole: entry.requesterRole,
  action: actionName(entry.action), purpose: entry.purpose ?? null, outcome: entry.outcome, outcomeLabel: outcomeName(entry.outcome),
  reason: reasonOf(entry.reason), breakGlass: entry.breakGlass === true, reviewDueInHours: entry.reviewDueInHours ?? null
 }));
 const summaryNames = gateway.emergencySummary.categories.map(recordName);

 const banner = [
  `Generated by scripts/emit-passport-sharing.mjs from ${SOURCE}, packages/catalog/passport-gateway.json,`,
  'packages/catalog/consent.json and packages/catalog/records.json.',
  'Do not edit by hand — run `npm run passport-sharing`. The build fails if this file and its sources disagree.',
  '',
  'Nothing here is connected. A card drawn from this reaches no responder, and the log is synthetic.'
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const s = contract.screens;
 const swiftFile = `${banner}

import Foundation

enum PassportSharingData {
    struct LogEntry: Identifiable {
        let id: String; let dayOffset: Int; let time: String; let who: String; let requesterRole: String
        let action: String; let purpose: String?; let outcome: String; let outcomeLabel: String
        let reason: String; let breakGlass: Bool; let reviewDueInHours: Int?
    }
    struct Exclusion: Identifiable { let id: String; let sentence: String }

    /* The Record settings a card and a link are made with. ${settings.cardLifetimeDays.note} */
    static let cardLifetimeDays = ${settings.cardLifetimeDays.value}
    static let cardMaxUses = ${settings.cardMaxUses.value}
    static let linkLifetimeDays = ${settings.linkLifetimeDays.value}
    static let linkMaxUses = ${settings.linkMaxUses.value}
    static let linkDefaultScope = ${swift(settings.linkDefaultScope.value)}
    static let settingsNote = ${swift(settings.cardLifetimeDays.note)}
    /* No card outlives the longest a consent grant may run, the founder's decision of ${consent.grants.maximumExpiryDecision.decidedOn}. */
    static let grantCeilingDays = ${consent.grants.maximumExpiryDays}

    /* What a card opens: the category that opens the emergency summary, and the summary's own categories. */
    static let emergencyScope = ${swift(openedBy)}
    static let emergencySummaryNames: [String] = [${summaryNames.map(swift).join(', ')}]
    static let qrPayload = ${swift(contract.links.qrPayload)}
    static let codeAlphabet = ${swift(contract.links.previewCode.alphabet)}
    static let codeGroups = ${contract.links.previewCode.groups}
    static let codeGroupLength = ${contract.links.previewCode.groupLength}

    /* The grant the preview card rides on. */
    static let cardRecipient = ${swift(roleName(cardGrant.recipientRole))}
    static let cardGrantEndsInDays = ${cardGrant.endsInDays}

    enum Card {
        static let route = ${swift(s.card.route)}
        static let eyebrow = ${swift(s.card.eyebrow)}
        static let title = ${swift(s.card.title)}
        static let intro = ${swift(s.card.intro)}
        static let preview = ${swift(s.card.preview)}
        static let ridesOn = ${swift(s.card.ridesOn)}
        static let noGrant = ${swift(s.card.noGrant)}
        static let make = ${swift(s.card.make)}
        static let code = ${swift(s.card.code)}
        static let qrLabel = ${swift(s.card.qrLabel)}
        static let ends = ${swift(s.card.ends)}
        static let opens = ${swift(s.card.opens)}
        static let print = ${swift(s.card.print)}
        static let opensOnly = ${swift(s.card.opensOnly)}
        static let sealedNever = ${swift(s.card.sealedNever)}
    }
    enum Log {
        static let route = ${swift(s.log.route)}
        static let eyebrow = ${swift(s.log.eyebrow)}
        static let title = ${swift(s.log.title)}
        static let intro = ${swift(s.log.intro)}
        static let preview = ${swift(s.log.preview)}
        static let chain = ${swift(s.log.chain)}
        static let empty = ${swift(s.log.empty)}
        static let newest = ${swift(s.log.newest)}
        static let breakGlass = ${swift(contract.accessLog.breakGlass)}
        static let reviewDue = ${swift(contract.accessLog.reviewDue)}
        static let purpose = ${swift(contract.accessLog.purpose)}
    }

    static let accessLog: [LogEntry] = [
${entries.map(e => `        LogEntry(id: ${swift(e.id)}, dayOffset: ${e.dayOffset}, time: ${swift(e.time)}, who: ${swift(e.who)}, requesterRole: ${swift(e.requesterRole)},
                 action: ${swift(e.action)}, purpose: ${e.purpose === null ? 'nil' : swift(e.purpose)}, outcome: ${swift(e.outcome)}, outcomeLabel: ${swift(e.outcomeLabel)},
                 reason: ${swift(e.reason)}, breakGlass: ${e.breakGlass}, reviewDueInHours: ${e.reviewDueInHours === null ? 'nil' : e.reviewDueInHours})`).join(',\n')}
    ]

    static let exportExclusions: [Exclusion] = [
${contract.export.exclusions.map(x => `        Exclusion(id: ${swift(x.id)}, sentence: ${swift(x.sentence)})`).join(',\n')}
    ]
    static let exportStepUp = ${swift(contract.export.stepUp.sentence)}
}
`;

 const kotlinFile = `${banner}

package za.co.mythuso.model

object PassportSharingData {
    data class LogEntry(
        val id: String, val dayOffset: Int, val time: String, val who: String, val requesterRole: String,
        val action: String, val purpose: String?, val outcome: String, val outcomeLabel: String,
        val reason: String, val breakGlass: Boolean, val reviewDueInHours: Int?
    )
    data class Exclusion(val id: String, val sentence: String)

    // The Record settings a card and a link are made with. ${settings.cardLifetimeDays.note}
    const val CARD_LIFETIME_DAYS = ${settings.cardLifetimeDays.value}
    const val CARD_MAX_USES = ${settings.cardMaxUses.value}
    const val LINK_LIFETIME_DAYS = ${settings.linkLifetimeDays.value}
    const val LINK_MAX_USES = ${settings.linkMaxUses.value}
    const val LINK_DEFAULT_SCOPE = ${kotlin(settings.linkDefaultScope.value)}
    const val SETTINGS_NOTE = ${kotlin(settings.cardLifetimeDays.note)}
    // No card outlives the longest a consent grant may run, the founder's decision of ${consent.grants.maximumExpiryDecision.decidedOn}.
    const val GRANT_CEILING_DAYS = ${consent.grants.maximumExpiryDays}

    // What a card opens: the category that opens the emergency summary, and the summary's own categories.
    const val EMERGENCY_SCOPE = ${kotlin(openedBy)}
    val emergencySummaryNames = listOf(${summaryNames.map(kotlin).join(', ')})
    const val QR_PAYLOAD = ${kotlin(contract.links.qrPayload)}
    const val CODE_ALPHABET = ${kotlin(contract.links.previewCode.alphabet)}
    const val CODE_GROUPS = ${contract.links.previewCode.groups}
    const val CODE_GROUP_LENGTH = ${contract.links.previewCode.groupLength}

    // The grant the preview card rides on.
    const val CARD_RECIPIENT = ${kotlin(roleName(cardGrant.recipientRole))}
    const val CARD_GRANT_ENDS_IN_DAYS = ${cardGrant.endsInDays}

    object Card {
        const val TITLE_ROUTE = ${kotlin(s.card.route)}
        const val EYEBROW = ${kotlin(s.card.eyebrow)}
        const val TITLE = ${kotlin(s.card.title)}
        const val INTRO = ${kotlin(s.card.intro)}
        const val PREVIEW = ${kotlin(s.card.preview)}
        const val RIDES_ON = ${kotlin(s.card.ridesOn)}
        const val NO_GRANT = ${kotlin(s.card.noGrant)}
        const val MAKE = ${kotlin(s.card.make)}
        const val CODE = ${kotlin(s.card.code)}
        const val QR_LABEL = ${kotlin(s.card.qrLabel)}
        const val ENDS = ${kotlin(s.card.ends)}
        const val OPENS = ${kotlin(s.card.opens)}
        const val PRINT = ${kotlin(s.card.print)}
        const val OPENS_ONLY = ${kotlin(s.card.opensOnly)}
        const val SEALED_NEVER = ${kotlin(s.card.sealedNever)}
    }
    object Log {
        const val TITLE_ROUTE = ${kotlin(s.log.route)}
        const val EYEBROW = ${kotlin(s.log.eyebrow)}
        const val TITLE = ${kotlin(s.log.title)}
        const val INTRO = ${kotlin(s.log.intro)}
        const val PREVIEW = ${kotlin(s.log.preview)}
        const val CHAIN = ${kotlin(s.log.chain)}
        const val EMPTY = ${kotlin(s.log.empty)}
        const val NEWEST = ${kotlin(s.log.newest)}
        const val BREAK_GLASS = ${kotlin(contract.accessLog.breakGlass)}
        const val REVIEW_DUE = ${kotlin(contract.accessLog.reviewDue)}
        const val PURPOSE = ${kotlin(contract.accessLog.purpose)}
    }

    val accessLog = listOf(
${entries.map(e => `        LogEntry(${kotlin(e.id)}, ${e.dayOffset}, ${kotlin(e.time)}, ${kotlin(e.who)}, ${kotlin(e.requesterRole)},
            ${kotlin(e.action)}, ${e.purpose === null ? 'null' : kotlin(e.purpose)}, ${kotlin(e.outcome)}, ${kotlin(e.outcomeLabel)},
            ${kotlin(e.reason)}, ${e.breakGlass}, ${e.reviewDueInHours === null ? 'null' : e.reviewDueInHours})`).join(',\n')}
    )

    val exportExclusions = listOf(
${contract.export.exclusions.map(x => `        Exclusion(${kotlin(x.id)}, ${kotlin(x.sentence)})`).join(',\n')}
    )
    const val EXPORT_STEP_UP = ${kotlin(contract.export.stepUp.sentence)}
}
`;

 return [
  { path: 'apps/ios/MyThuso/Models/PassportSharingData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/PassportSharingData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitPassportSharing()) {
  writeFileSync(file.path, file.content);
  console.log(`passport sharing → ${file.path}`);
 }
}
