/* The clinical review pack, written for the clinician who has to sign it rather than for a platform.

   Everything in MyThuso that waits on a clinician is already in a contract: settings that carry
   reviewRequired, protocols nobody has ratified, GilbertOne's emergency terms with no reviewer, the scopes
   the vetting register sends people out under, and proposals with decidedBy: null whose effect is on a
   patient or on a nurse at a door. This writes all of it into docs/governance/CLINICAL-REVIEW-PACK.md,
   each item with the question it asks and blank sign-off fields.

   It is generated rather than written because a review pack that drifts from the contracts is worse
   than none: a Clinical Governance Lead would approve a value that is no longer the value in force, and
   the approval would read afterwards as covering the new one. scripts/check-boundaries.mjs asks this
   generator what the pack should say and fails the build when the file says anything else.

   WHAT IT WILL NOT DO. It never writes a reviewer's name, a decision or a date into a sign-off field:
   those fields are blank in every run, whatever a contract holds, because a generated signature is not
   a signature. A setting whose default already names a reviewer is not listed as waiting. And it does
   not decide what is clinical by keyword. The lists below say, item by item, why each is clinical or
   why it was left out; a setting or a proposal they do not classify is printed under "Not yet
   classified" rather than dropped, so the next one somebody adds is seen by a clinician instead of
   quietly missing from the pack.

   Numbers are never typed here. Every value, bound, count and sentence is read from its contract. */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/* Settings are read through the one module every emitter reads them through, so "not clinically
   reviewed" means here exactly what it means on a phone, and a default that module refuses is refused
   before a reviewer is shown it. */
import { settingDefault, settingsIn } from './settings-defaults.mjs';
/* Clinical Intelligence's frames (Wave 5): which consultation headings are required is worked out by the Clinical
   domain from records.json, and read from there so the pack and the gate cannot disagree about it. */
import { frame as consultationFrame } from '../packages/engines/src/clinical/domain/contract.ts';

const TARGET = 'docs/governance/CLINICAL-REVIEW-PACK.md';
const CATALOG = 'packages/catalog/';

const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const tick = value => '`' + String(value).replace(/`/g, "'") + '`';

/* Capabilities that put somebody's hands on a patient or their record. A role on the register holding
   one of these, and a scope of practice, is a role whose scope a clinician should read. */
const CLINICAL_CAPABILITIES = ['take-visit', 'view-clinical-record', 'write-clinical-note', 'sign-clinical-review', 'prescribe', 'dispense', 'release-lab-result'];

/* Settings that do not carry reviewRequired and are still clinical, each with why. The field safety
   numbers are here because the Full Scope makes the Nurse Operations and Field Safety policy the
   Clinical Governance Lead's to sign (MyThuso Full Scope v1.0, Engine 4); escalation and handover
   because they decide how long a patient's concern waits and who answers it. */
const CLINICAL_SETTINGS = {
 'core:escalation-rota': 'It decides whether a concern about a patient that nobody has taken on reaches a clinician at every hour, and at which hours it reaches nobody.',
 'core:escalation-minutes': 'It decides how long a concern about a patient waits at each post of the rota before it goes to the next one.',
 'safety:grace': 'It decides how long after a visit should have ended the desk is told a nurse has not checked out, which is how long a nurse who cannot press panic waits to be looked for. The Full Scope makes the field safety policy the Clinical Governance Lead\'s to sign (Engine 4).',
 'safety:panic-window': 'It decides how long the desk sees a nurse\'s position after she presses panic. The Full Scope makes the field safety policy the Clinical Governance Lead\'s to sign (Engine 4).',
 'safety:extension-steps': 'A visit that runs long is usually a patient who needs more than was booked. The steps decide how a nurse asks for that time at the door.',
 'safety:extension-ceiling': 'It decides how long a visit may run past its booked time on the nurse\'s own word before the desk speaks to her.',
 'access:handover-answered-by': 'It decides which registered role answers when a patient\'s conversation with GilbertOne is handed over, and a handover exists because the patient said something about their health.',
 'access:handover-hours': 'It decides the hours in which a handed-over conversation reaches that role, and so the hours in which it reaches nobody.',
 'money:priority-sos-wording': 'It tells a family what a paid plan changes about how an emergency is answered. Whether the words keep urgency ahead of payment is a triage question, not only a commercial one.',
 'trust:complaint-review-hours': 'A complaint may be about the care a patient was given, and this decides how long it waits before anybody reads it. The Full Scope\'s Verify engine names the window (Engine 6).',
 'devices:stale-after-minutes': 'It decides how long a certified instrument may send nothing before it is shown as stale and announced, and Sentinel will read device silence against a patient\'s baseline in Wave 5. How long a patient\'s monitoring may go quiet unnoticed is a clinical question.'
};

/* Settings that were looked at and are not clinical, each with why, so their absence is a decision
   somebody can read rather than an omission. An engine-wide reason covers a whole engine. */
const NOT_CLINICAL_SETTINGS = {
 'care:offer-expiry': 'How long an offer to a nurse stays open before it goes to somebody else. It decides who is asked, among people already cleared to attend, not what is done.',
 'safety:stale-panic-window-uses-window-in-force': 'Which of two windows a panic opens when a phone read an older one. The panic opens either way.',
 'safety:settings-changed-by': 'Who may change the field safety settings. An authority question, not a clinical one.',
 'access:named-nurse-fallback': 'What happens when a patient\'s named nurse is not free, among roles already cleared to attend.',
 'access:visit-thread-max-characters': 'How long one message in a visit thread may be.',
 'access:visit-thread-open-hours-after-visit': 'How long a visit thread stays open. Nobody watches a thread for emergencies however long it is open, and the thread says so.',
 'money:visit-reports-whatsapp': 'What reaches a family on WhatsApp is a privacy and third-party question for the Information Officer, and is in docs/governance/DPIA-DRAFT.md rather than here.',
 'money:*': 'Money\'s plan names, prices, shares and wording are commercial decisions. None of them decides who may do what to a patient.',
 'medicines:pin-lifetime': 'How long a hand-over PIN works is chain of custody: it decides when a sealed bag goes back to the pharmacy, not what is in it or who may take it. Whether a medicine may leave the pharmacy at all was decided by the prescriber and the pharmacist.',
 'medicines:pin-attempts': 'How many wrong PINs a collector may enter is a guard against guessing at the door. It decides when a bag goes back, never whether a patient is treated.',
 'medicines:collection-window': 'How long a patient\'s authorisation to collect lasts is custody and logistics. A sealed bag that goes back is dispensed again; nothing about the medicine changes.',
 'trust:unmatched-shift-start-dispatch': 'Whether somebody nobody could face match may be offered work is a fraud and identity question for Operations and the Information Officer (D-3), among people already vetted to attend.',
 'trust:door-code-lifetime': 'How long a door code works. It decides how a patient checks who is at her door, not what is done once the door is open.',
 'trust:door-code-attempts': 'How many wrong door codes a patient may type before the desk is told. A safety-desk threshold, not a clinical one.',
 'trust:settings-changed-by': 'Who may change the Verify in service settings. An authority question, not a clinical one.',
 'record:*': 'How long a share link or an emergency card lasts, how often each opens and what a link opens by default decide who may read a record and for how long. That is a privacy question for the Information Officer and the DPIA, not a clinical one, and none of them decides what is done to a patient.',
 'devices:calibration-due-days': 'How early a calibration is shown as due. An overdue calibration marks every reading taken while it lasts whatever this says, and the cadence itself is packages/catalog/capture.json\'s.',
 'devices:kit-deposit': 'The deposit recorded against a kit. A commercial number, recorded and taken from nobody in this build.',
 'record:hl7-quarantine-retention-days': 'How long the record of an HL7 message nobody could be matched to is kept. The record holds nothing the message said, and the period is a retention question for the Information Officer (D-8), not a clinical one. Wave 5, Trust & Record lead.',
 'record:hl7-clock-skew-minutes': 'How far a partner\'s clock may drift before its message is refused. It decides whether a message is believed to describe the present, and a refused message is sent again; it decides nothing done to a patient. Wave 5, Trust & Record lead.'
};

/* Proposals outside a settings block (decidedBy: null), classified by where they sit. */
const PROPOSALS = [
 /* Wave 5, Trust & Record lead: the follow-up concern Core opens when a hospital says a patient was discharged. */
 { file: 'closed-loop.json', path: /^\.dischargeReceived\.ownerRole$/, title: 'Who follows up a patient discharged from hospital', clinical: 'A patient home from hospital may not have understood the discharge or have their medicines. Which registered role calls them first is a question about their care.' },
 { file: 'closed-loop.json', path: /^\.dischargeReceived\.fallbackRole$/, title: 'Who holds a discharge follow-up nobody took on', clinical: 'A discharge nobody followed up is a patient nobody checked on. Who it goes to next decides whether a clinician sees it before harm does.' },
 { file: 'closed-loop.json', path: /^\.dischargeReceived\.ladderRung$/, title: 'How urgently a discharge follow-up goes to its owner', clinical: 'The rung decides how long a patient home from hospital waits for somebody to take their follow-up on. Whether a routine discharge is a nurse-review urgency is a clinical judgement.' },
 { file: 'closed-loop.json', path: /^\.ladder\.rungs\[\d+\]\.acknowledgeWithinMinutes$/, clinical: 'A rung is how urgent a concern about a patient is, and this is how long its first owner has to take it on. The Master Blueprint v4 sets an expectation for acknowledging an escalation (Part F, Incidents).' },
 { file: 'closed-loop.json', path: /^\.panic\.ladderRung$/, title: 'The rung a panic is given', clinical:'A nurse who presses panic is given the time the ladder gives this rung. Whether a nurse in danger and a patient in danger should share one number belongs with the field safety policy the Clinical Governance Lead signs (Full Scope v1.0, Engine 4).' },
 { file: 'closed-loop.json', path: /^\.snooze\.reasons$/, title: 'The reasons a concern may be snoozed', clinical:'A snooze lets a concern about a patient wait. Whether a reason is good enough for that is a clinical judgement.' },
 { file: 'closed-loop.json', path: /^\.outcomes$/, title: 'The outcomes a concern is closed with', clinical:'Every concern is closed with one of these and a review counts them. Whether they are enough to tell a harmful outcome from a safe one, without naming a condition, is a clinical governance question.' },
 { file: 'closed-loop.json', path: /^\.escalationReasons\.byCaller$/, notClinical: 'The reasons the desk moves a concern early say who answered and who can decide, not anything about the patient.' },
 { file: 'closed-loop.json', path: /^\.resultAcknowledged\.closesAs$/, title: 'The outcome an acknowledged lab result\'s concern is closed with', clinical: 'A clinician acknowledging a result closes the concern Core opened for it as dealt with. Whether acknowledging a result is enough to call its concern dealt with, before anybody has acted on what it says, is a clinical governance question (Full Scope v1.0, Engine 8: a result is not complete until acknowledged).' },
 /* Sentinel and safeguarding (Wave 5). */
 { file: 'closed-loop.json', path: /^\.sentinel\.opensAtRung$/, title: 'The Sentinel tier that opens a concern on the rota', clinical: 'A tier below it pages nobody and a tier at it pages a doctor. Which tier a patient\'s concern must reach before a clinician is asked to take it on is a clinical judgement.' },
 { file: 'closed-loop.json', path: /^\.sentinel\.(ownerRole|fallbackRole)$/, title: 'Who owns a Sentinel concern, and who it falls back to', clinical: 'A Sentinel tier three is a concern about a patient\'s monitoring that nobody has taken on. Which clinician owns it first, and who holds it when they do not answer, decides who judges what the patient needs.' },
 { file: 'closed-loop.json', path: /^\.safeguarding\.ladderRung$/, title: 'How long the desk has to take on a safeguarding concern', clinical: 'A safeguarding concern is somebody who may be at risk. How long it waits before it goes to somebody else belongs with the safeguarding protocol the Clinical Governance Lead signs.' },
 { file: 'sentinel.json', path: /^\.rungs\[\d+\]$/, title: 'What a Sentinel tier means, and who is told', clinical: 'Each tier says how urgent a concern about a patient\'s monitoring is and who hears of it: nobody, the nurse\'s queue, or a doctor on the rota. What each tier means, and whether the right people are told at each, is a clinical decision.' },
 { file: 'sentinel.json', path: /^\.safeguarding\.groupsAndCategories$/, title: 'The groups and kinds of concern a safeguarding report is recorded under', clinical: 'A safeguarding report is recorded against these and nothing typed. Whether they name what a nurse or a doctor needs to say about a child, an older person or an adult at risk belongs with the safeguarding protocol.' },
 { file: 'closed-loop.json', path: /^\.safeguarding\.(ownerRole|fallbackRole)$/, notClinical: 'Who owns the desk\'s concern for a safeguarding report says who makes sure the report reaches the safeguarding officer. The report itself is held for that officer, and nothing about the patient is on the concern.' },
];
const PROPOSED_ROLES = {
 carer: 'A carer is in a patient\'s home beside a registered nurse. What a carer may do, how they are trained, and when they must call the nurse rather than act are questions about the patient\'s care.',
 'head-of-operations': null
};
const PROPOSED_ROLES_NOT_CLINICAL = {
 'head-of-operations': 'Operations authority over the desk\'s escalations. The register grants it no record, no summary and no dispatch.'
};

const WALKED = ['closed-loop.json', 'field-safety.json', 'care.json', 'booking.json', 'sentinel.json'];

export function emitClinicalReviewPack(root = '') {
 const json = name => JSON.parse(readFileSync(root + CATALOG + name, 'utf8'));
 const settingsShape = json('settings.json');
 const vetting = json('vetting.json');
 const proposals = json('vetting-proposals.json');
 const protocols = json('protocols.json');
 const terms = json('gilbert-emergency-terms.json');
 const assistant = json('assistant.json');
 const records = json('records.json');
 const sos = json('sos.json');
 const locales = json('locales.json');
 const events = json('events.json');
 const loop = json('closed-loop.json');

 const roleOf = id => vetting.roles.find(role => role.id === id);
 const roleName = id => (roleOf(id) ? `${roleOf(id).name} (${tick(id)})` : tick(id));
 const holders = capability => vetting.roles.filter(role => role.grants.some(grant => grant.capability === capability));
 const capabilityName = id => vetting.capabilities.find(c => c.id === id)?.name ?? id;
 const screen = settingsShape.screen;
 const refusal = id => settingsShape.refusals.find(r => r.id === id)?.statement;

 const valueOf = (setting, value) => {
  switch (setting.type) {
   case 'roleList': return value.length ? value.map(roleName).join(', ') : 'No role';
   case 'boolean': case 'enum': {
    const choice = (setting.allowed ?? []).find(c => c.value === value);
    return choice ? `${choice.label} (${tick(value)})` : tick(value);
   }
   case 'minutes': return `${value} minutes`;
   case 'count': return `${value} ${setting.unit}`;
   case 'moneyCents': return `R${(value / 100).toFixed(2)}`;
   case 'percentage': return `${value}%`;
   case 'list': return value.map(v => valueOf({ ...setting, type: setting.of, unit: setting.unit === 'of' ? setting.of : setting.unit }, v)).join(', ');
   case 'schedule': return value.map(w => `${(setting.posts ?? []).find(p => p.id === w.post)?.label ?? w.post}: ${w.days.join(', ')}, ${w.from}–${w.to}`).join('; ');
   case 'text': return `“${value}”`;
   case 'record': return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
   default: return tick(JSON.stringify(value));
  }
 };
 const itemType = setting => (setting.type === 'list' ? { ...setting, type: setting.of, unit: setting.unit === 'of' ? setting.of : setting.unit } : setting);
 const whose = entry => (entry.decidedBy !== null
  ? `Decided by the ${entry.decidedBy} on ${entry.decidedOn}. ${entry.why}`
  : `A proposal nobody has decided. Proposed by the ${entry.proposedBy ?? 'author of the contract'}: ${entry.proposedBecause}`);
 const undecided = entries => entries.filter(Boolean).some(entry => entry.decidedBy === null);
 const limitsOf = setting => {
  const out = [];
  if (setting.allowedRoles) out.push(`Roles an admin may name: ${setting.allowedRoles.roles.map(roleName).join(', ')}.`);
  if (setting.items) out.push(`${setting.type === 'roleList' ? 'Roles named' : 'Items'}: from ${setting.items.lowest.value} to ${setting.items.highest.value}.`);
  if (setting.allowed) out.push(`Choices: ${setting.allowed.map(c => `${c.label} (${tick(c.value)})`).join('; ')}.`);
  if (setting.bounds) out.push(`An admin may set ${valueOf(itemType(setting), setting.bounds.lowest.value)} to ${valueOf(itemType(setting), setting.bounds.highest.value)}.`);
  if (setting.maxLength) out.push(`Up to ${setting.maxLength.value} characters.`);
  if (setting.posts) out.push(`Posts: ${setting.posts.map(p => `${p.label} (${p.role ? roleName(p.role) : 'held by no role on the register'})`).join('; ')}.`);
  if (setting.mustCover) out.push(`Must always cover: ${setting.mustCover.map(m => `${m.post} ${m.days.join(', ')} ${m.from}–${m.to}`).join('; ')}.`);
  if (!out.length) return 'No limits beyond its type.';
  const provenance = [setting.allowedRoles, setting.items?.lowest, setting.items?.highest, ...(setting.allowed ?? []), setting.bounds?.lowest, setting.bounds?.highest, setting.maxLength];
  return `${out.join(' ')} ${undecided(provenance) ? 'These limits are proposals nobody has decided.' : 'These limits were decided.'}`;
 };
 const changedBy = setting => (typeof setting.changedBy === 'string'
  ? (roleOf(setting.changedBy) ? roleName(setting.changedBy) : `anybody who may ${tick(setting.changedBy)}`)
  : `the roles named by the setting ${tick(setting.changedBy.fromSetting)}`);

 const signOff = () => [
  '| Sign-off | |',
  '|---|---|',
  '| Decision: approve / change to ___ / reject | |',
  '| Reason | |',
  '| Reviewer name | |',
  '| HPCSA/SANC number | |',
  '| Date | |'
 ].join('\n');
 const facts = rows => ['| | |', '|---|---|', ...rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `| ${k} | ${cell(v)} |`)].join('\n');

 /* ---- A. Settings waiting for clinical review ---------------------------------------------------- */
 const settingSources = settingsShape.sources.map(({ engine, file }) => ({ engine, file, contract: JSON.parse(readFileSync(root + file, 'utf8')) }));
 const reviewRoute = engine => {
  try {
   const api = json(`apis/${engine}.json`);
   const route = (api.routes ?? []).filter(r => /\/setting-reviews$/.test(r.path ?? '')).sort((a, b) => b.version - a.version)[0];
   return route ? `${route.method} ${route.path}@${route.version}` : null;
  } catch { return null; }
 };
 const changeRoute = engine => {
  try {
   const api = json(`apis/${engine}.json`);
   const route = (api.routes ?? []).filter(r => /\/setting-changes$/.test(r.path ?? '')).sort((a, b) => b.version - a.version)[0];
   return route ? `${route.method} ${route.path}@${route.version}` : null;
  } catch { return null; }
 };

 const waiting = [];
 const clinicalSettings = [];
 const notClinicalSettings = [];
 const unclassifiedSettings = [];
 for (const { engine, file, contract } of settingSources) {
  for (const setting of settingsIn(file, contract)) {
   const id = `${engine}:${setting.key}`;
   const { value, unreviewed } = settingDefault(file, contract, setting.key, { list: setting.type === 'list' });
   if (unreviewed) waiting.push({ engine, file, setting, value });
   else if (setting.reviewRequired) notClinicalSettings.push({ engine, file, setting, why: `Already clinically reviewed by the ${setting.default.reviewedBy} on ${setting.default.reviewedOn}.` });
   else if (CLINICAL_SETTINGS[id]) clinicalSettings.push({ engine, file, setting, value, why: CLINICAL_SETTINGS[id] });
   else if (NOT_CLINICAL_SETTINGS[id] || NOT_CLINICAL_SETTINGS[`${engine}:*`]) notClinicalSettings.push({ engine, file, setting, why: NOT_CLINICAL_SETTINGS[id] ?? NOT_CLINICAL_SETTINGS[`${engine}:*`] });
   else unclassifiedSettings.push({ engine, file, setting });
  }
 }

 /* ---- B. Protocols not ratified ------------------------------------------------------------------ */
 const unratified = protocols.protocols.filter(p => p.status !== 'ratified');
 const catalogFiles = [
  ...readdirSync(root + CATALOG).filter(f => f.endsWith('.json') && f !== 'protocols.json').sort().map(f => CATALOG + f),
  ...readdirSync(root + CATALOG + 'apis').filter(f => f.endsWith('.json')).sort().map(f => `${CATALOG}apis/${f}`)
 ];
 const catalogText = Object.fromEntries(catalogFiles.map(f => [f, readFileSync(root + f, 'utf8')]));
 const namedIn = id => {
  const pattern = new RegExp(`(^|[^a-z0-9-])${id.replace(/[-]/g, '\\-')}([^a-z0-9-]|$)`);
  return catalogFiles.filter(f => pattern.test(catalogText[f]));
 };
 const ratifiedEvent = (events.events ?? []).find(e => e.type === 'protocol.ratified');

 /* ---- D. The vetting register -------------------------------------------------------------------- */
 const clinicalScopes = vetting.roles.filter(role => role.scope && role.grants.some(g => CLINICAL_CAPABILITIES.includes(g.capability)));
 const proposedRoles = proposals.roles.filter(r => r.decidedBy === null);

 /* ---- E. Proposals outside settings blocks ------------------------------------------------------- */
 const found = [];
 for (const file of WALKED) {
  const walk = (node, path) => {
   if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}[${i}]`));
   if (!node || typeof node !== 'object') return;
   if (path.startsWith('.settings')) return;
   if ('decidedBy' in node && node.decidedBy === null) found.push({ file, path, node });
   for (const key of Object.keys(node)) walk(node[key], `${path}.${key}`);
  };
  walk(json(file), '');
 }
 const clinicalProposals = [];
 const notClinicalProposals = [];
 const unclassifiedProposals = [];
 for (const entry of found) {
  const rule = PROPOSALS.find(p => p.file === entry.file && p.path.test(entry.path));
  if (rule?.clinical) clinicalProposals.push({ ...entry, why: rule.clinical, title: rule.title });
  else if (rule?.notClinical) notClinicalProposals.push({ ...entry, why: rule.notClinical });
  else unclassifiedProposals.push(entry);
 }

 /* ---- F. Clinical content with no clinical sign-off recorded ------------------------------------- */
 const observationNote = records.consultation.sections.find(s => s.id === 'observations')?.note;
 const unreviewedLocales = locales.locales.filter(l => !['source', 'complete'].includes(l.clinicalReview?.state));
 /* The symptom intake's question set (28 September 2026): predefined questions GilbertOne asks after a
    symptom, for the nurse to read — not triage, no priority, no cause — and unreviewed until a clinician
    signs review.reviewedBy. */
 const intake = json('symptom-intake.json');
 const intakeUnreviewed = intake.review.reviewedBy === null;
 /* The care tips (28 September 2026): general guidance a patient reads after a visit, in a card stack —
    written by nobody clinical and shown with the contract's notice until a clinician signs. */
 const careTips = json('care-tips.json');
 const careTipsUnreviewed = careTips.review.reviewedBy === null;

 /* ---- Counts ------------------------------------------------------------------------------------- */
 const counts = {
  A: waiting.length,
  B: unratified.length,
  C: terms.clinicalReview?.reviewedBy ? 0 : 1,
  D: clinicalScopes.length + proposedRoles.filter(r => PROPOSED_ROLES[r.role]).reduce((n, r) => {
   const role = roleOf(r.role);
   const proposalChecks = Object.values(r.checksFrom ?? {}).filter(v => /^A proposal/.test(v)).length;
   const notYetChecks = Object.values(role?.gateNotes ?? {}).filter(g => g.kind === 'not-yet-a-check').length;
   return n + 1 + proposalChecks + notYetChecks;
  }, 0),
  E: clinicalSettings.length + clinicalProposals.length,
  F: 1 + 1 + (unreviewedLocales.length ? 1 : 0) + (intakeUnreviewed ? 1 : 0) + (careTipsUnreviewed ? 1 : 0),
  G: 6
 };
 const clinicalFrames = json('clinical.json');
 const total = Object.values(counts).reduce((a, b) => a + b, 0);

 const out = [];
 const line = (text = '') => out.push(text);

 line('# Clinical review pack');
 line();
 line('> **Draft prepared for review. Not a clinical review. It has no effect until the named person signs.**');
 line('>');
 line('> Generated by `scripts/emit-clinical-review-pack.mjs` from the contracts in `packages/catalog/`. Do not edit');
 line('> by hand — run `npm run review-pack`. `npm run check` fails if this file and the contracts disagree, so a');
 line('> value in this pack is always the value the contracts hold today.');
 line();
 line('Nothing in MyThuso is a real service. No visit is booked, no clinical decision is issued and no patient is');
 line('treated. Every item below is a value, a list or a draft that the preview works to and that no clinician has');
 line('approved. This pack collects them in one place so that the work of a Clinical Governance Lead is to read,');
 line('decide and sign, not to search.');
 line();
 line('## Who should review this');
 line();
 line('A **Clinical Governance Lead**: a registered doctor (HPCSA) or registered nurse (SANC) with the governance');
 line('authority to set clinical policy for MyThuso. The planning documents name this post and a Medical Director, and');
 line('put protocol ratification with a clinical governance board (MyThuso Full Scope v1.0, §6; MyThuso Master Blueprint');
 line('v4, Part F and Part H). Protocols in section B are the board\'s to ratify; the reviewer may record a');
 line('recommendation for the board.');
 line();
 line('## How a decision becomes real');
 line();
 line('Writing in this pack changes nothing. A decision takes effect only through the contract\'s own process:');
 line();
 /* Who confirms is Clinical's review-confirmer setting (Wave 5), read through the one module every emitter reads a
    setting through, rather than the vetting register's grant of sign-clinical-review. */
 const clinicalSource = settingSources.find(s => s.engine === 'clinical');
 const confirmerKey = clinicalSource.contract.reviews.confirmerSetting;
 const confirmerSetting = settingsIn(clinicalSource.file, clinicalSource.contract).find(s => s.key === confirmerKey);
 const reviewers = settingDefault(clinicalSource.file, clinicalSource.contract, confirmerKey).value.map(roleOf).filter(Boolean);
 const mayBeNamed = confirmerSetting.allowedRoles.roles.map(roleOf).filter(Boolean);
 line(`- **Settings (sections A and E).** An admin puts a value in force on the Configuration tab (${[...new Set(settingSources.map(s => changeRoute(s.engine)).filter(Boolean))].map(tick).join(', ')}). For a setting that waits on a clinical review, somebody holding ${tick('sign-clinical-review')} (${capabilityName('sign-clinical-review')}) then confirms that exact value, with a reason, in the doctor workspace's "Settings waiting for clinical review" panel (\`apps/web/src/features/SettingReviews.tsx\`, ${[...new Set(waiting.map(w => reviewRoute(w.engine)).filter(Boolean))].map(tick).join(', ')}). "${refusal('setting-review-own-change')}" A default can instead be changed in the contract itself, naming the reviewer and the day (\`packages/catalog/settings.json\` \`provenance.reviewed\`) with a changelog entry, as \`settings.json\` \`howToChange\` describes.`);
 line(`- **Who can confirm through the panel today:** ${reviewers.map(r => `${r.name} (${tick(r.id)})`).join(', ') || 'no role on the register'}, because Clinical's ${tick(confirmerKey)} setting names ${reviewers.length === 1 ? 'that role' : 'those roles'} by default (\`packages/catalog/clinical.json\`), and every engine's review route confirms for the roles that setting names in force and for nobody else. An admin may name any of ${mayBeNamed.map(r => `${r.name} (${tick(r.id)})`).join(', ')} on the Configuration tab, and that change waits on a clinical review of its own.${reviewers.some(r => r.id === 'nurse') ? '' : ' A Clinical Governance Lead who is a registered nurse could confirm through the panel once the setting names her role.'}`);
 line(`- **Protocols (section B).** "${protocols.refusals.find(r => r.id === 'no-ratification-without-a-signature')?.statement}" "${protocols.refusals.find(r => r.id === 'a-new-version-is-a-new-row')?.statement}" The row in \`packages/catalog/protocols.json\` changes status, ratifiedBy and ratifiedOn, and gains a contentRef once the text exists.${ratifiedEvent ? ` Core announces a ratification as ${tick(`${ratifiedEvent.type}@${ratifiedEvent.version}`)}.` : ''}`);
 line('- **GilbertOne\'s emergency terms (section C).** Only in `packages/catalog/gilbert-emergency-terms.json`: raise `version`, add a changelog entry (day, role, terms added and removed, why, the new `termsHash`), keep the shared fixtures passing on all three platforms, and record `clinicalReview.reviewedBy` and `reviewedOn`. `CLAUDE.md` holds the rule; `npm run check` replays the changelog.');
 line('- **The vetting register (section D).** A scope or a check changes in `packages/catalog/vetting.json` and is regenerated with `npm run vetting`. A proposed role is decided in `packages/catalog/vetting-proposals.json` by naming who decided it.');
 line('- **Proposals outside settings (section E) and clinical content (section F).** Changed in their own contract, the way that file says it is changed. `closed-loop.json` explains why its codes are not admin settings.');
 line();
 line(`Until a decision is recorded, the app shows "${screen.notReviewed}" beside every setting in section A, a protocol stays "${protocols.statuses.find(s => s.id === 'draft')?.name}", and clinical wording stays in English in every language (\`packages/catalog/locales.json\` \`clinicalRule\`).`);
 line();
 line('## What is in this pack');
 line();
 line('| Section | What waits on a clinician | Items |');
 line('|---|---|---|');
 line(`| A | Settings that carry \`reviewRequired\` and name no reviewer | ${counts.A} |`);
 line(`| B | Protocols in the registry that are not ratified | ${counts.B} |`);
 line(`| C | GilbertOne's emergency terms | ${counts.C} |`);
 line(`| D | Clinical scopes and proposed clinical roles on the vetting register | ${counts.D} |`);
 line(`| E | Other clinical proposals and safety numbers nobody clinical has decided | ${counts.E} |`);
 line(`| F | Clinical content with no clinical sign-off recorded | ${counts.F} |`);
 line(`| G | Clinical Intelligence's frames and empty registries, waiting on the board | ${counts.G} |`);
 line(`| | **Total** | **${total}** |`);
 line();
 line('Each item gives the value in force by default, what an admin may set it to, why it was proposed and by whom,');
 line('the question for the reviewer, and blank sign-off fields.');
 line();

 /* ---- Section A ---------------------------------------------------------------------------------- */
 line('## A. Settings waiting for clinical review');
 line();
 let byEngine = null;
 waiting.forEach(({ engine, file, setting, value }, index) => {
  const heading = settingSources.find(s => s.engine === engine).contract.settings.heading;
  if (byEngine !== engine) { line(`### ${heading} (\`${file}\`)`); line(); byEngine = engine; }
  line(`#### A${index + 1}. ${setting.label}`);
  line();
  line(facts([
   ['Setting', tick(`${engine}:${setting.key}`)],
   ['What it decides', setting.help],
   ['In force by default', valueOf(setting, value)],
   ['What an admin may set', limitsOf(setting)],
   ['Guardrail', setting.guardrail?.statement ?? 'None.'],
   ['Why this default', whose(setting.default)],
   ['Who may change it', changedBy(setting)],
   ['What a change reaches', setting.appliesTo],
   ['Confirmed by', `Somebody who may ${tick(setting.reviewRequired)}, through ${reviewRoute(engine) ? tick(reviewRoute(engine)) : 'no review route declared yet'}`]
  ]));
  line();
  line(`**Question for the reviewer:** is ${valueOf(setting, value)} clinically safe as the answer to "${setting.help.replace(/[.?]$/, '')}", and are the limits an admin may set safe as well?`);
  line();
  line(signOff());
  line();
 });
 if (!waiting.length) { line('No setting waits on a clinical review.'); line(); }

 /* ---- Section B ---------------------------------------------------------------------------------- */
 line('## B. Protocols not ratified');
 line();
 line(`From \`packages/catalog/protocols.json\`. ${protocols.statuses.find(s => s.id === 'draft')?.detail} "${protocols.refusals.find(r => r.id === 'a-draft-carries-nothing')?.statement}"`);
 line();
 unratified.forEach((p, index) => {
  line(`#### B${index + 1}. ${p.name}`);
  line();
  const refs = namedIn(p.id);
  line(facts([
   ['Protocol', tick(`${p.id}@${p.version}`)],
   ['Status', `${protocols.statuses.find(s => s.id === p.status)?.name ?? p.status}. Ratified by: ${p.ratifiedBy ?? 'nobody'}. Content: ${p.contentRef ?? 'none written'}`],
   ['Engine that would work under it', tick(p.engine)],
   ['What ratification would allow', `A recommendation or act by the ${p.engine} engine may cite ${tick(`${p.id}@${p.version}`)} as the ratified protocol it followed. Until then nothing may claim to follow it.`],
   ['Other contracts that name it', refs.length ? refs.map(tick).join(', ') : 'None yet']
  ]));
  line();
  line(`**Question for the reviewer:** what must the ${p.name.toLowerCase()} protocol contain before it is ratified, who writes it, and should the board ratify it as version ${p.version}?`);
  line();
  line(signOff());
  line();
 });

 /* ---- Section C ---------------------------------------------------------------------------------- */
 line('## C. GilbertOne\'s emergency terms');
 line();
 const lastChange = terms.changelog[terms.changelog.length - 1];
 line(`#### C1. The emergency terms list, version ${terms.version}`);
 line();
 line(facts([
  ['File', '`packages/catalog/gilbert-emergency-terms.json`'],
  ['Version', terms.version],
  ['Status', terms.status],
  ['termsHash', tick(lastChange.termsHash)],
  ['Accepted by', `${terms.acceptedBy.role} on ${terms.acceptedBy.on}: "${terms.acceptedBy.decision}"`],
  ['Clinical review', terms.clinicalReview.reviewedBy ? `Reviewed by ${terms.clinicalReview.reviewedBy} on ${terms.clinicalReview.reviewedOn}` : `No clinical reviewer yet — ${terms.clinicalReview.why}.`],
  ['What a match does', terms.use],
  ['Known false positives reported by the tests', `${terms.falsePositives.messages.length} (non-blocking)`],
  ['Not for this review', `The listening cap and the words "Your Thuso AI Doctor" are founder decisions (\`packages/catalog/assistant.json\` \`voice.listeningDecision\`, decided by the ${assistant.voice.listeningDecision.decidedBy} on ${assistant.voice.listeningDecision.on}), not edits. How a term is matched is \`assistant.json\` \`matcher\`.`]
 ]));
 line();
 line('| Group | Condition | Terms |');
 line('|---|---|---|');
 for (const group of terms.groups) line(`| ${tick(group.id)}${group.name ? ` — ${cell(group.name)}` : ''} | ${group.condition ? tick(group.condition) : 'none'} | ${group.words.length} |`);
 line(`| **Total** | | **${terms.groups.reduce((n, g) => n + g.words.length, 0)}** |`);
 line();
 line('**Question for the reviewer:** read every term in the file. Is anything a patient in South Africa commonly says about a life-threatening emergency missing, is any group wrong, and is the list safe to show real patients as a starting configuration?');
 line();
 line(signOff());
 line();

 /* ---- Section D ---------------------------------------------------------------------------------- */
 line('## D. The vetting register');
 line();
 line(`Roles in \`packages/catalog/vetting.json\` that hold a scope of practice and a capability that reaches a patient or their record (${CLINICAL_CAPABILITIES.map(tick).join(', ')}), and proposed roles in \`packages/catalog/vetting-proposals.json\` whose work is clinical. The register records no provenance for a scope list, so none of these lists says who decided it.`);
 line();
 let d = 0;
 for (const role of clinicalScopes) {
  d += 1;
  line(`#### D${d}. ${role.name}: ${role.scope.label.toLowerCase()}`);
  line();
  line(facts([
   ['Role', tick(role.id)],
   ['What the role does', role.summary],
   [role.scope.label, role.scope.options.join('; ')],
   ['Rule shown to the person', role.scope.note],
   ['Capabilities granted', role.grants.map(g => tick(g.capability)).join(', ')],
   ['Checks', role.checks.map(c => `${c.name} (${c.risk} risk${c.renewMonths ? `, renewed every ${c.renewMonths} months` : ''})`).join('; ')]
  ]));
  line();
  line(`**Question for the reviewer:** does every entry in "${role.scope.label}" describe work a ${role.name.toLowerCase()} may lawfully and safely do for MyThuso, is anything missing, and are the checks enough before this role reaches a patient?`);
  line();
  line(signOff());
  line();
 }
 for (const proposal of proposedRoles) {
  const why = PROPOSED_ROLES[proposal.role];
  if (!why) continue;
  const role = roleOf(proposal.role);
  d += 1;
  line(`#### D${d}. Proposed role: ${role?.name ?? proposal.role}`);
  line();
  line(facts([
   ['Role', tick(proposal.role)],
   ['Why it is clinical', why],
   ['What the role does', role?.summary],
   ['Capabilities granted', role?.grants.map(g => `${tick(g.capability)} — "${g.refusal}"`).join('; ')],
   ['Status', `A proposal nobody has decided. Proposed by the ${proposal.proposedBy} on ${proposal.proposedOn}.`],
   ['Why it was proposed', proposal.proposedBecause]
  ]));
  line();
  line(`**Question for the reviewer:** is this role, with exactly these capabilities and always beside a registered nurse, clinically safe to offer?`);
  line();
  line(signOff());
  line();
  for (const [checkId, from] of Object.entries(proposal.checksFrom ?? {})) {
   if (!/^A proposal/.test(from)) continue;
   const check = role?.checks.find(c => c.id === checkId);
   d += 1;
   line(`#### D${d}. Proposed check for the ${role?.name.toLowerCase() ?? proposal.role}: ${check?.name ?? checkId}`);
   line();
   line(facts([
    ['Check', tick(`${proposal.role}.${checkId}`)],
    ['What it covers', check?.detail],
    ['Evidence', check?.evidence],
    ['Renewal', check?.renewMonths ? `Every ${check.renewMonths} months` : 'Not renewed'],
    ['Risk', check?.risk],
    ['Where it came from', from]
   ]));
   line();
   line('**Question for the reviewer:** what must this training contain, who may deliver and assess it, and is the renewal period right?');
   line();
   line(signOff());
   line();
  }
  for (const [gate, note] of Object.entries(role?.gateNotes ?? {})) {
   if (note.kind !== 'not-yet-a-check') continue;
   d += 1;
   line(`#### D${d}. Missing check for the ${role.name.toLowerCase()}: gate ${tick(gate)}`);
   line();
   line(facts([
    ['Gate', tick(gate)],
    ['What the register admits', note.sentence]
   ]));
   line();
   line('**Question for the reviewer:** what practical assessment should this role pass before a first visit, and who should assess it?');
   line();
   line(signOff());
   line();
  }
 }

 /* ---- Section E ---------------------------------------------------------------------------------- */
 line('## E. Other clinical proposals and safety numbers');
 line();
 line('These do not carry `reviewRequired`, so the app does not mark them "not clinically reviewed". Each is here because its effect falls on a patient\'s care or on a nurse\'s safety at a door, and each asks, besides the question about its value, whether it should carry `reviewRequired` from now on.');
 line();
 let e = 0;
 for (const { engine, file, setting, value, why } of clinicalSettings) {
  e += 1;
  line(`#### E${e}. ${setting.label}`);
  line();
  line(facts([
   ['Setting', `${tick(`${engine}:${setting.key}`)} in \`${file}\``],
   ['Why it is clinical', why],
   ['What it decides', setting.help],
   ['In force by default', valueOf(setting, value)],
   ['What an admin may set', limitsOf(setting)],
   ['Guardrail', setting.guardrail?.statement ?? 'None.'],
   ['Why this default', whose(setting.default)],
   ['Who may change it', changedBy(setting)]
  ]));
  line();
  line(`**Question for the reviewer:** is ${valueOf(setting, value)} safe, are the limits safe, and should this setting wait on a clinical review before a change takes effect?`);
  line();
  line(signOff());
  line();
 }
 for (const { file, path, node, why, title: named } of clinicalProposals) {
  e += 1;
  const rung = /^\.ladder\.rungs\[(\d+)\]/.exec(path);
  const rungEntry = rung ? loop.ladder.rungs[Number(rung[1])] : null;
  const title = rungEntry ? `Escalation ladder rung ${rungEntry.rung}, ${rungEntry.name}: time to acknowledge` : named ?? path.slice(1);
  const value = Array.isArray(node.value)
   ? node.value.map(v => `${tick(v.id)}${v.label ? ` ${v.label}` : ''} — ${v.means}`).join('; ')
   : rungEntry || path === '.panic.ladderRung'
    ? (path === '.panic.ladderRung' ? `Rung ${node.value} (${loop.ladder.rungs.find(r => r.rung === node.value)?.name})` : `${node.value} minutes`)
    : tick(JSON.stringify(node.value));
  line(`#### E${e}. ${title}`);
  line();
  line(facts([
   ['Where', `\`packages/catalog/${file}\` ${tick(path.slice(1))}`],
   ['Why it is clinical', why],
   ['The document says', rungEntry ? `${rungEntry.documentSays} (${loop.ladder.source})` : undefined],
   ['Proposed value', value],
   ['Why it was proposed', `${node.proposedBy ? `Proposed by the ${node.proposedBy}: ` : ''}${node.proposedBecause}`]
  ]));
  line();
  line(`**Question for the reviewer:** ${node.question ? `the contract asks "${node.question.replace(/[.?]$/, '')}". ` : ''}Is the proposed value clinically safe, and should a change to it wait on a clinical review?`);
  line();
  line(signOff());
  line();
 }

 /* ---- Section F ---------------------------------------------------------------------------------- */
 line('## F. Clinical content with no clinical sign-off recorded');
 line();
 line('#### F1. Reference ranges a reading is flagged against');
 line();
 line(`From \`packages/catalog/records.json\` \`observations\`. The note every platform shows: "${observationNote}"${'clinicalReview' in records.observations ? '' : ' The contract has no field in which a clinical review of these ranges could be recorded.'}`);
 line();
 line('| Measure | Unit | Low | High |');
 line('|---|---|---|---|');
 for (const m of records.observations.measures) line(`| ${cell(m.label)} | ${cell(m.unit)} | ${m.low} | ${m.high} |`);
 line();
 line('**Question for the reviewer:** are these indicative adult ranges acceptable for deciding which readings are put in front of a doctor, and which patients (children, pregnancy, older adults, known chronic conditions) need different ranges or no automatic flag at all?');
 line();
 line(signOff());
 line();
 line('#### F2. The conditions that end the SOS questions');
 line();
 line(`From \`packages/catalog/sos.json\` \`redFlags\`. "${sos.redFlags.endsTheQuestions}"`);
 line();
 line('| Condition | What the patient reads |');
 line('|---|---|');
 for (const c of sos.redFlags.conditions) line(`| ${cell(c.name)} (${tick(c.id)}) | ${cell(c.detail)} |`);
 line();
 line('**Question for the reviewer:** is each description one a frightened person will recognise, is any life-threatening presentation missing, and are these safe to show real patients?');
 line();
 line(signOff());
 line();
 if (unreviewedLocales.length) {
  line('#### F3. Clinical wording in languages other than English');
  line();
  line(`From \`packages/catalog/locales.json\`. "${locales.clinicalRule.sentence}"`);
  line();
  line('| Locale | Clinical review state |');
  line('|---|---|');
  for (const l of unreviewedLocales) line(`| ${cell(l.label)} (${tick(l.code)}) | ${cell(l.clinicalReview?.state ?? 'none')} |`);
  line();
  line('**Question for the reviewer:** which languages should be clinically reviewed first, and who — by name, registration and language — is qualified to review each?');
  line();
  line(signOff());
  line();
 }

 if (intakeUnreviewed) {
  line('#### F4. The symptom intake question set');
  line();
  line(`From \`packages/catalog/symptom-intake.json\`. ${intake.whatItIsNot.join(' ')} "${intake.order.rule}"`);
  line();
  line(`Asked of every symptom group first:`);
  line();
  line('| Question | Kind | Options |');
  line('|---|---|---|');
  for (const q of intake.common.questions) line(`| ${cell(q.ask)} (${tick(q.id)}) | ${cell(q.kind)} | ${cell((q.options ?? []).join('; '))} |`);
  line();
  for (const g of intake.groups) {
   line(`**${cell(g.name)}** (${tick(g.id)}) — opened by: ${g.triggers.map(t => tick(t)).join(', ')}`);
   line();
   line('| Question | Kind | Options |');
   line('|---|---|---|');
   for (const q of g.questions) line(`| ${cell(q.ask)} (${tick(q.id)}) | ${cell(q.kind)} | ${cell((q.options ?? []).join('; '))} |`);
   line();
  }
  line(`The patient reads: "${intake.review.unreviewed}"`);
  line();
  line('**Question for the reviewer:** are these the questions a nurse wants answered before a home visit for each group, is any question one a patient should not be asked without a clinician present, are the groups the right groups, and which words in isiZulu, isiXhosa, Sesotho and Afrikaans should open each? The reviewer signs with a registration in the vetting register\'s format in `review.reviewedBy`; until then the build refuses any question that carries a clinical instruction or a number.');
  line();
  line(signOff());
  line();
 }

 if (careTipsUnreviewed) {
  line('#### F5. The care tips a patient reads after a visit');
  line();
  line(`From \`packages/catalog/care-tips.json\`. ${careTips.review.why} The patient reads beside every tip: "${careTips.review.notice}"`);
  line();
  line('| Tip | Category | What the patient reads |');
  line('|---|---|---|');
  for (const t of careTips.tips) line(`| ${cell(t.title)} (${tick(t.id)}) | ${cell(t.category)} | ${cell(t.body)} |`);
  line();
  line('**Question for the reviewer:** is each tip safe general guidance for every adult patient this service visits, is any tip wrong for a patient group (pregnancy, kidney or heart failure, children, the very old), and is the "when not to wait" tip complete? The reviewer signs `review.reviewedBy` and `review.reviewedOn`; until then no tip may carry a number, a dose or a diagnosis.');
  line();
  line(signOff());
  line();
 }

 /* ---- Section G (Wave 5): Clinical Intelligence's frames ------------------------------------------
    Every frame Clinical builds is a shape with no clinical content in it, and every registry is empty. A clinician
    still has to say whether each frame is the right shape for the content the board will write into it, and the
    two settings Clinical adds are in section A with the rest. */
 const cf = clinicalFrames;
 const namedVersions = ids => (ids.length ? ids.map(tick).join(', ') : 'None');
 line('## G. Clinical Intelligence: frames and empty registries');
 line();
 line(`From \`packages/catalog/clinical.json\`. ${cf.whereContentLives.says} Nothing in this section is clinical content: each item is the frame the board's content would be written into, and each registry is empty until the board fills it. Who confirms a clinical review and the days outcome questions are asked on are settings, in section A.`);
 line();
 line('#### G1. The consultation frame');
 line();
 line('| Heading | What it holds | Sections it covers | Required |');
 line('|---|---|---|---|');
 for (const heading of consultationFrame) line(`| ${cell(heading.name)} (${tick(heading.code)}) | ${cell(heading.detail)} | ${cf.consultation.covers[heading.code].map(tick).join(', ')} | ${heading.required ? 'Required, because a section it covers is required in `records.json`' : 'Optional'} |`);
 line();
 line(`${cf.consultation.screen.intro} The refusal a sign-off meets: "${JSON.parse(readFileSync(root + CATALOG + 'apis/clinical.json', 'utf8')).routes.find(r => r.path === '/v1/clinical/consultations' && r.version === 2)?.refusals.find(x => x.id === 'required-sections-missing')?.statement}"`);
 line();
 line('**Question for the reviewer:** are these the headings a nurse\'s and a doctor\'s consultation must both have, is each required heading one no consultation may be signed off without, and should any optional section be required?');
 line();
 line(signOff());
 line();
 line('#### G2. Signing a review outside any protocol');
 line();
 line(facts(cf.reviews.signingModes.map(m => [m.label, `${m.sentence}${m.noProtocolSentence ? ` When the visit named none: ${m.noProtocolSentence}` : ''}`])));
 line();
 line(`${cf.reviews.complete} Every protocol in section B is a draft, so every review signed today is signed as reviewed outside any protocol, and says so. ${cf.reviews.autoSign.why}`);
 line();
 line('**Question for the reviewer:** until the board ratifies the protocols in section B, is a doctor\'s signature on a visit reviewed outside any protocol acceptable, and what should a signing doctor be required to have read before signing one?');
 line();
 line(signOff());
 line();
 line('#### G3. The triage frame');
 line();
 line('| Stage | What it does |');
 line('|---|---|');
 for (const stage of cf.triage.stages) line(`| ${cell(stage.label)} | ${cell(stage.rule)} |`);
 line();
 line(facts([
  ['Triage protocols the board has named', namedVersions(cf.triage.triageProtocols.ids)],
  ['Why none', cf.triage.triageProtocols.why],
  ['What every triage answers today', `${cf.triage.notTriaged.label}. ${cf.triage.notTriaged.human} ${cf.triage.notTriaged.emergencyFirst}`]
 ]));
 line();
 line('**Question for the reviewer:** which protocol should become the triage protocol, who writes its red flags, priority scale, reason codes and care settings, and is the order of the stages above safe, with GilbertOne\'s emergency terms always first?');
 line();
 line(signOff());
 line();
 line('#### G4. Home Guidance outcomes');
 line();
 line(facts([
  ['Outcomes, by name only', cf.guidance.outcomes.map(o => `${o.label} (${tick(o.code)})`).join('; ')],
  ['Ratified scripts', cf.guidance.scripts.length ? cf.guidance.scripts.map(s => tick(s.scriptRef)).join(', ') : 'None'],
  ['Rule', cf.guidance.rule]
 ]));
 line();
 line('**Question for the reviewer:** are these the four outcomes MyThuso should end a triage in, who writes and translates the script for each, and what must every script say before a patient hears it?');
 line();
 line(signOff());
 line();
 line('#### G5. Outcome question instruments');
 line();
 line(facts([
  ['Instruments the board has chosen', cf.proms.instruments.length ? cf.proms.instruments.map(i => tick(i.id)).join(', ') : 'None'],
  ['When an episode starts', cf.proms.episode.startsWhen],
  ['What it keeps', cf.proms.episode.keeps],
  ['Rule', cf.proms.rule]
 ]));
 line();
 line('**Question for the reviewer:** which validated instrument, or instruments per condition pack, should outcome questions come from, in which languages, and who may change the choice?');
 line();
 line(signOff());
 line();
 line('#### G6. What a patient is never told');
 line();
 line(`${cf.wording.patientDiagnosis.rule} ${cf.wording.patientDiagnosis.why}`);
 line();
 line(`Phrases the build refuses in any contract or screen: ${cf.wording.patientDiagnosis.phrases.map(p => `“${p}”`).join(', ')}.`);
 line();
 line('**Question for the reviewer:** are these phrases enough to keep a diagnosis out of what software says to a patient, and which other constructions should be refused?');
 line();
 line(signOff());
 line();

 /* ---- Left out, and not yet classified ----------------------------------------------------------- */
 line('## Looked at and left out');
 line();
 line('Listed so that leaving them out is a decision a reviewer can disagree with.');
 line();
 line('| Item | What it decides | Why it is not in this pack |');
 line('|---|---|---|');
 for (const { engine, setting, why } of notClinicalSettings) line(`| ${tick(`${engine}:${setting.key}`)} | ${cell(setting.help)} | ${cell(why)} |`);
 for (const { file, path, node, why } of notClinicalProposals) line(`| ${tick(`${file} ${path.slice(1)}`)} | ${cell(node.question ?? '')} | ${cell(why)} |`);
 for (const proposal of proposedRoles.filter(r => !PROPOSED_ROLES[r.role])) line(`| ${tick(`vetting-proposals.json ${proposal.role}`)} | ${cell(roleOf(proposal.role)?.summary ?? '')} | ${cell(PROPOSED_ROLES_NOT_CLINICAL[proposal.role] ?? 'Not yet classified.')} |`);
 line();
 line('## Not yet classified');
 line();
 if (!unclassifiedSettings.length && !unclassifiedProposals.length) {
  line('Nothing. Every setting and every proposal in the contracts this pack reads has been classified above.');
 } else {
  line('Added to a contract after this pack\'s generator was last taught about them. A reviewer should look at each; `scripts/emit-clinical-review-pack.mjs` should then say whether it is clinical and why.');
  line();
  line('| Item | What it decides |');
  line('|---|---|');
  for (const { engine, setting } of unclassifiedSettings) line(`| ${tick(`${engine}:${setting.key}`)} | ${cell(setting.help)} |`);
  for (const { file, path, node } of unclassifiedProposals) line(`| ${tick(`${file} ${path.slice(1)}`)} | ${cell(node.question ?? node.proposedBecause ?? '')} |`);
 }
 line();

 return [{ path: TARGET, content: out.join('\n') }];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitClinicalReviewPack()) {
  writeFileSync(file.path, file.content);
  console.log(`review-pack → ${file.path}`);
 }
}
