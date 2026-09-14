import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { emitTokens } from './emit-tokens.mjs';
import { emitVetting } from './emit-vetting.mjs';
import { emitRecords } from './emit-records.mjs';
import { emitEarnings } from './emit-earnings.mjs';
import { emitSos } from './emit-sos.mjs';
import { emitTeleconsult } from './emit-teleconsult.mjs';
import { emitEvents, collectEvents, eventFingerprint, swiftKeyName, kotlinKeyName } from './emit-events.mjs';
import { emitApis, loadApis, routeKey, routeFingerprint } from './emit-apis.mjs';
import { emitConsentGrants } from './emit-consent-grants.mjs';
import { emitProtocols } from './emit-protocols.mjs';
import { emitLocales } from './emit-locales.mjs';
import { emitDispensing } from './emit-dispensing.mjs';
import { emitProgrammes } from './emit-programmes.mjs';
import { clinicalIdentifiers, tablesIn } from './clinical-tables.mjs';
import { emitInterpreting } from './emit-interpreting.mjs';
import { emitScheduling } from './emit-scheduling.mjs';
import { emitGeography } from './emit-geography.mjs';
import { emitCapabilities } from './emit-capabilities.mjs';
import { emitCancellation } from './emit-cancellation.mjs';
import { emitPassport } from './emit-passport.mjs';
import { emitCapture } from './emit-capture.mjs';
import { emitFraming } from './emit-framing.mjs';
import { emitWellbeing } from './emit-wellbeing.mjs';
import { emitShop } from './emit-shop.mjs';
import { emitRewards } from './emit-rewards.mjs';
import { emitThusoIQ } from './emit-thusoiq.mjs';
import { emitAssistant } from './emit-assistant.mjs';
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]); }
const read = f => readFileSync(f,'utf8');
const native=[...files('apps/ios/MyThuso'),...files('apps/android/app/src/main')].filter(f=>/\.(swift|kt|xml)$/.test(f));
const forbidden=/\b(WKWebView|UIWebView|android\.webkit|WebView)\b/;
for(const f of native) if(forbidden.test(read(f))) throw new Error(`Embedded web runtime is forbidden: ${f}`);
for(const f of files('apps/web/src').filter(f=>/\.(tsx?|css)$/.test(f))) {
 const source=read(f);
 if(/\b(localStorage|sessionStorage|indexedDB)\b/.test(source)) throw new Error(`Preview must not persist patient data: ${f}`);
 if(/dangerouslySetInnerHTML|\beval\(/.test(source)) throw new Error(`Unsafe dynamic content in ${f}`);
}
/* The native apps carry the phase-one visit menu, which is what launches. Later-phase services are
   web and admin only until they are actually built for a nurse to deliver, so only phase one is
   held in step across the three apps. */
const catalogue=JSON.parse(read('packages/catalog/services.json'));
const nativeCatalogues=['apps/ios/MyThuso/Models/CareService.swift','apps/android/app/src/main/java/za/co/mythuso/model/CareModels.kt'];
for(const f of nativeCatalogues) {
 const source=read(f);
 for(const s of catalogue.filter(s=>s.phase===1)) {
  if(!source.includes(`"${s.id}"`)||!source.includes(`"${s.name}"`)||!source.includes(String(s.price))) throw new Error(`Native catalogue drift: ${s.id} in ${f}`);
  /* A visit's duration decides when it ends, on every platform. It used to exist only in the web
     catalogue, so both native apps ended every visit an hour after it started whatever it was. */
  const line=source.split('\n').find(l=>l.includes(`"${s.id}"`));
  if(!line||!new RegExp(`\\b${s.duration}\\b`).test(line)) throw new Error(`Native catalogue drift: ${s.id} does not carry its ${s.duration}-minute duration in ${f}`);
 }
}
/* The commercial model is the proposal's, and the admin console reports against it. If the two
   disagree the console is quietly misreporting, so the arithmetic is checked here. */
const model=JSON.parse(read('packages/catalog/business-model.json'));
const allocated=model.funding.allocation.reduce((total,line)=>total+line.amount,0);
if(allocated!==model.funding.round) throw new Error(`Funding allocation totals R${allocated.toLocaleString()} against a round of R${model.funding.round.toLocaleString()}`);
const gated=model.funding.milestones.reduce((total,m)=>total+(m.releases??0),0);
if(gated!==model.funding.round) throw new Error(`Milestone tranches release R${gated.toLocaleString()} against a round of R${model.funding.round.toLocaleString()}`);
for(const s of catalogue) if(s.nurseShare>=s.price) throw new Error(`Service ${s.id} pays the nurse R${s.nurseShare} out of R${s.price}, leaving the platform nothing`);
const worked=model.unitEconomics.worked;
if(worked.price-worked.nurseShare-worked.paymentCost!==worked.platformRetains) throw new Error('The worked unit-economics example does not add up');

/* ---- Reference ranges -------------------------------------------------------------------------

   A reference range decides whether a reading is flagged to a doctor. Seven of them, and until this
   check was rewritten they lived in the `observations` array of apps/web/src/features/Clinical.tsx
   — a React component — and this file compared the iOS and Android assessments against *that TSX
   file*. Two native apps were held to a screen, and the screen was the authority.

   They are in packages/catalog/records.json now, beside the observations section of the standard
   consultation that says they are indicative. The web reads them through lib/observations.ts; the
   emitter writes them into RecordsData.swift and RecordsData.kt. So there are three checks here and
   they are different questions:

     1. The contract itself is a range — low below high, and every measure complete.
     2. All three platforms carry it. The generated files are compared byte for byte further down,
        so what is asked here is that the numbers reached the platform at all, which is the thing a
        reader of a native file actually wants to know.
     3. Nothing else anywhere types one. This is the check the other two cannot make: a second copy
        that agrees today is a second copy that disagrees on the day one of them is corrected. */
const recordContract = JSON.parse(read('packages/catalog/records.json'));
const measures = recordContract.observations.measures;
if(!measures?.length) throw new Error('packages/catalog/records.json declares no observations, so no reading can be flagged against anything');
const observationsNote = recordContract.consultation.sections.find(s=>s.id==='observations')?.note;
if(!observationsNote) throw new Error('The observations consultation section carries no note, so the reference ranges are stated with nothing qualifying them. "Indicative, and not a validated early-warning score" is the whole of what makes stating them honest.');
for(const m of measures) {
 for(const field of ['id','label','unit','low','high','step','placeholder']) {
  if(m[field]===undefined) throw new Error(`Observation ${m.id ?? '(unnamed)'} in records.json has no ${field}`);
 }
 if(!(m.low < m.high)) throw new Error(`Reference range for '${m.id}' is ${m.low}–${m.high}, which is not a range: every reading ever taken would be flagged`);
 if(!(m.step > 0)) throw new Error(`Observation '${m.id}' has a step of ${m.step}, which is not a granularity`);
}

/* Where each platform's copy is expected to be. The web has no entry: it imports the JSON, so there
   is nothing to compare it against but itself. */
const rangeCarriers = {
 ios: 'apps/ios/MyThuso/Models/RecordsData.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/model/RecordsData.kt'
};
for(const [platform,file] of Object.entries(rangeCarriers)) {
 const source=read(file);
 for(const m of measures) {
  const line=source.split('\n').find(l=>l.includes(`"${m.id}"`)&&l.includes(`"${m.unit}"`));
  if(!line) throw new Error(`Missing observation '${m.id}' in the ${platform} record contract (${file}). Run: npm run records`);
  const numbers=(line.match(/\d+(\.\d+)?/g)||[]).map(Number);
  if(!numbers.includes(m.low)||!numbers.includes(m.high)) throw new Error(`Reference range drift for '${m.id}' in ${platform}: expected ${m.low}–${m.high} in ${file}. Run: npm run records`);
 }
 if(!source.includes(observationsNote)) throw new Error(`${file} carries the reference ranges without the sentence that qualifies them. Run: npm run records`);
}

/* ---- And the check the other two cannot make ---------------------------------------------------

   No screen, on any platform, may type a reference range. A file "types" one when a single line
   names an observation and carries both ends of its range as numbers — which is exactly how all
   three platforms used to declare them, and exactly what a fourth copy would look like.

   Two files are quarantined. The hand-written native assessment screens still declare their own
   seven, because the emitter's output cannot be adopted by them without editing them, and both
   native apps are being rebuilt by other people as this lands. The quarantine is not a permanent
   exemption and it cannot rot into one: an entry whose file has *stopped* typing a range is an
   error too, so the day either screen switches to the generated list the build fails until its line
   is deleted from below. Until then the quarantined files are still held to the contract's numbers
   by the loop above them, so the copy cannot drift while it waits to be removed. */
const RANGE_QUARANTINE = [
 ['apps/ios/MyThuso/Features/AssessmentView.swift', 'switch Observation.all for the generated Records.observations'],
 ['apps/android/app/src/main/java/za/co/mythuso/ui/ClinicalScreens.kt', 'switch observations for the generated observationRanges']
];
/* The contract, the generated copies of it, the emitter and this checker are where a range is
   supposed to be written down. Everything else is a screen, a library or a test. */
const RANGE_SOURCES = new Set([
 'packages/catalog/records.json',
 'scripts/check-boundaries.mjs',
 'scripts/emit-records.mjs',
 ...Object.values(rangeCarriers)
]);
const typesARange = source => measures.filter(m => source.split('\n').some(line => {
 if(!line.includes(`'${m.id}'`)&&!line.includes(`"${m.id}"`)) return false;
 const numbers=(line.match(/\d+(\.\d+)?/g)||[]).map(Number);
 return numbers.includes(m.low)&&numbers.includes(m.high);
})).map(m => m.id);
const quarantinedRanges=new Map(RANGE_QUARANTINE);
for(const file of [
 ...files('apps/web/src').filter(f=>/\.(tsx?|css)$/.test(f)),
 ...files('packages/catalog'),
 ...files('scripts').filter(f=>/\.mjs$/.test(f)),
 ...files('tests').filter(f=>/\.ts$/.test(f)),
 ...native
]) {
 if(RANGE_SOURCES.has(file)) continue;
 const typed=typesARange(read(file));
 if(quarantinedRanges.has(file)) {
  if(!typed.length) throw new Error(`${file} no longer types a reference range, so its quarantine entry in RANGE_QUARANTINE is spent: ${quarantinedRanges.get(file)}. Delete the line — an exemption nobody can lose is how a rule stops being one.`);
  continue;
 }
 if(typed.length) throw new Error(`${file} types the reference range for ${typed.map(id=>`'${id}'`).join(', ')}. A reference range decides whether a reading is put in front of a doctor, and it lives in packages/catalog/records.json. Read it: lib/observations.ts on web, Records.observations on iOS, observationRanges on Android.`);
}
for(const [file,todo] of RANGE_QUARANTINE) {
 if(!existsSync(file)) throw new Error(`RANGE_QUARANTINE names ${file}, which does not exist (${todo}). A quarantine list that outlives its files is a list nobody reads.`);
}
/* ---- Localisation ----------------------------------------------------------------------------

   This check used to ask whether each of three hand-typed locale tables mentioned each of four
   locale codes. It passed for months while isiZulu called vetting `Ukuqinisekiswa` on iOS and
   `Ukuhlolwa` on Android, and while `vettingApply` read "Apply to join" on one and "Start an
   application" on the other, because mentioning a code is not the same as agreeing about what is
   under it. The table is packages/catalog/locales.json now and the native ones are generated from
   it by scripts/emit-locales.mjs, so those two disagreements can no longer be typed. What is left
   for a check to do is the part a generator cannot: hold the contract itself to its own claims. */
const localeContract = JSON.parse(read('packages/catalog/locales.json'));
const localeSetIds = new Set(localeContract.sets.map(s => s.id));
const reviewStates = Object.fromEntries(localeContract.reviewStates.map(s => [s.id, s]));
const seenKeyIds = new Set();
for(const key of localeContract.keys) {
 if(seenKeyIds.has(key.id)) throw new Error(`The locale contract declares "${key.id}" twice`);
 seenKeyIds.add(key.id);
 if(!localeSetIds.has(key.set)) throw new Error(`Locale key "${key.id}" belongs to a set "${key.set}" that is not declared`);
 if(!key.surfaces.length) throw new Error(`Locale key "${key.id}" is rendered on no platform. A string nothing shows is a string nobody will maintain.`);
 /* No clinical string has a key here, so there is nothing for a translator to fill in and nothing
    for a screen to render in a language no clinician has read. The rule is worth more as a missing
    namespace than as a sentence in a comment. */
 if(/^clinical[.]/.test(key.id)) throw new Error(`Locale key "${key.id}" is clinical. Clinical wording is not translated in this contract — it stays in English until a clinician who reads the language has reviewed it, and the way that is guaranteed is that there is no key for it.`);
}
for(const [surface, field] of [['ios','swift'],['android','kotlin']]) {
 const names = localeContract.keys.filter(k => k.surfaces.includes(surface)).map(k => k[field]);
 const duplicate = names.find((name, index) => names.indexOf(name) !== index);
 if(duplicate) throw new Error(`Two locale keys both compile to "${duplicate}" on ${surface}`);
}
/* South African Sign Language. It is an official language and it is not a written one, so the one
   thing that must not happen is it appearing in the list of languages the interface is translated
   into — a toggle that changes nothing is a claim of access rather than access. */
const signLanguage = localeContract.signLanguage;
if(localeContract.locales.some(l => l.code === signLanguage.code)) throw new Error(`${signLanguage.short} is in the list of interface languages. It has no written form; choosing it would change nothing on the screen, which is worse than not offering it.`);
if(localeContract.strings[signLanguage.code]) throw new Error(`${signLanguage.short} has a string table. There is no written ${signLanguage.short} to put in one.`);

/* The invariant the old check could not express: every locale carries every key of every set it
   claims, and carries nothing outside them. A key present in one locale and absent from another is
   the drift; a key present in a locale that never claimed its set is a fallback nobody declared. */
for(const locale of localeContract.locales) {
 if(!locale.sets.includes('shell')) throw new Error(`${locale.code} does not carry the shell. A language offered in the picker whose navigation is English is an offer that is not kept.`);
 const table = localeContract.strings[locale.code];
 if(!table) throw new Error(`${locale.code} is declared with no strings at all`);
 const expected = new Set(localeContract.keys.filter(k => locale.sets.includes(k.set)).map(k => k.id));
 for(const id of expected) if(!table[id]) throw new Error(`${locale.code} is missing "${id}". It claims the "${localeContract.keys.find(k => k.id === id).set}" set, so it carries every key in it or it does not claim the set.`);
 for(const id of Object.keys(table)) {
  if(!seenKeyIds.has(id)) throw new Error(`${locale.code} translates "${id}", which is not a key`);
  if(!expected.has(id)) throw new Error(`${locale.code} translates "${id}" but does not claim the "${localeContract.keys.find(k => k.id === id).set}" set. Either claim the set and translate all of it, or drop the string — a half-translated set reads as a half-finished app.`);
 }
}
/* A language presented as checked when nobody checked it is the failure this whole mechanism
   exists to prevent, so it is the one thing here that is not a matter of taste. `reviewed` is a
   claim; a name, an organisation and a date are what makes it one. */
for(const locale of localeContract.locales) {
 const state = reviewStates[locale.review.state];
 if(!state) throw new Error(`${locale.code} claims a review state "${locale.review.state}" that is not declared`);
 if(state.reviewed && locale.review.state !== 'source' && !(locale.review.by && locale.review.organisation && locale.review.on)) {
  throw new Error(`${locale.code} is presented to readers as "${state.label}" without naming who read it, for whom and on what day. A language that says it was checked and cannot say by whom is worse than one that says nobody has checked it.`);
 }
 if(!state.reviewed && !state.notice) throw new Error(`${locale.code} is not reviewed and the "${locale.review.state}" state has no notice to show the reader. An unreviewed language that does not announce itself is the thing being guarded against.`);
 const clinical = locale.clinicalReview;
 if(!['none','source','complete'].includes(clinical.state)) throw new Error(`${locale.code} has an unknown clinical review state "${clinical.state}"`);
 if(clinical.state === 'source' && locale.code !== 'en-ZA') throw new Error(`${locale.code} claims to be the source language for clinical wording. Only English is.`);
 if(clinical.state === 'complete' && !(clinical.by && clinical.registration && clinical.on)) {
  throw new Error(`${locale.code} claims a completed clinical language review without naming the clinician, their registration number and the date. A reference range shown in a language on the strength of an unsigned claim is exactly the failure the rule is about.`);
 }
}
/* And the structural half of the same rule: a refusal sentence, an observation label or anything
   else long enough to be a sentence cannot be smuggled into the locale table out of a clinical
   contract. Six words is the line — shorter than that and the collisions are ordinary words. */
const clinicalSentences = new Set();
const collectSentences = node => {
 if(typeof node === 'string') { if(node.trim().split(/\s+/).length >= 6) clinicalSentences.add(node.trim()); }
 else if(node && typeof node === 'object') for(const value of Object.values(node)) collectSentences(value);
};
for(const path of localeContract.clinicalRule.clinicalContracts) {
 if(!existsSync(path)) throw new Error(`The locale contract names ${path} as a clinical contract, and it does not exist`);
 collectSentences(JSON.parse(read(path)));
}
for(const [code, table] of Object.entries(localeContract.strings)) {
 for(const [id, value] of Object.entries(table)) {
  if(clinicalSentences.has(value.trim())) throw new Error(`${code} "${id}" is a sentence out of a clinical contract. Clinical wording is rendered in English in every locale until a clinician who reads the language has reviewed it; translating one here routes around that.`);
 }
}
/* clinicalLocale() is where the rule is actually applied. If a platform loses it, every screen on
   that platform is one careless t() away from a dose in an unreviewed language. */
const clinicalLanguageGate = [
 ['web', 'apps/web/src/lib/i18n.ts', /export function clinicalLocale\s*\(/],
 ['ios', 'apps/ios/MyThuso/Models/LocalisationData.swift', /func clinicalLocale\s*\(/],
 ['android', 'apps/android/app/src/main/java/za/co/mythuso/model/LocalisationData.kt', /fun clinicalLocale\s*\(/]
];
for(const [platform,file,declaration] of clinicalLanguageGate) {
 /* The declaration, not the word. A check that a file mentions clinicalLocale is satisfied by the
    comment explaining why it used to be there — which is the mistake the old locale check made. */
 if(!declaration.test(read(file))) throw new Error(`${platform} no longer declares clinicalLocale() (${file}). It is the only thing standing between an unreviewed translation and a clinical instruction.`);
}
/* Nothing outside the contract and its generated output may know the locale list. English is
   exempt: it is the fallback and the default, and both have to be written somewhere. */
const localeCodesBeyondEnglish = localeContract.locales.map(l => l.code).filter(code => code !== 'en-ZA');
for(const file of ['apps/web/src/App.tsx','apps/ios/MyThuso/Models/Localisation.swift','apps/android/app/src/main/java/za/co/mythuso/model/Localisation.kt']) {
 const source = read(file);
 for(const code of localeCodesBeyondEnglish) if(source.includes(code)) throw new Error(`${file} writes the locale code ${code} out by hand. The list lives in packages/catalog/locales.json so that a language cannot be offered on one platform and not another.`);
}
/* Ten of the eleven languages are drafted by software and have been read by nobody who speaks
   them. Every surface that offers one has to say so where the choice is made, and a platform that
   quietly drops the notice is presenting those ten as finished. */
const languagePickers = {
 web: 'apps/web/src/App.tsx',
 'ios language screen': 'apps/ios/MyThuso/Features/GuardianView.swift',
 'ios first run': 'apps/ios/MyThuso/Features/OnboardingView.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/ui/OnboardingScreens.kt'
};
for(const [platform,file] of Object.entries(languagePickers)) {
 const source = read(file);
 if(!/reviewNotice/.test(source)) throw new Error(`The ${platform} language picker (${file}) no longer shows whether anybody who speaks the language has read it. That notice is the only honest part of offering ten machine-drafted languages.`);
 if(!/reviewLabel/.test(source)) throw new Error(`The ${platform} language picker (${file}) offers the languages without their review state beside them. A footnote under the list is where a claim goes to avoid being read.`);
}
const rosterParticipants = new Set(JSON.parse(read('packages/catalog/teleconsult.json')).participants.map(p => p.id));
if(!rosterParticipants.has(signLanguage.teleconsult.participantId)) throw new Error(`The sign-language accommodation points at a call participant "${signLanguage.teleconsult.participantId}" that the teleconsultation roster does not have. An interpreter added by a second mechanism is an interpreter nobody consented to.`);
for(const file of ['apps/web/src/features/Access.tsx','apps/web/src/App.tsx']) {
 if(!read(file).includes('signLanguage')) throw new Error(`${file} no longer reads the sign-language accommodation from the contract`);
}
if(!read('apps/web/src/features/Access.tsx').includes('mustNeverHappen')) throw new Error('The accessibility screen no longer renders what must never happen to a Deaf patient. Those six sentences are the accommodation; the rest is arrangements.');
if(!existsSync('docs/ACCESSIBILITY.md')) throw new Error('docs/ACCESSIBILITY.md is missing');
if(!read('docs/ACCESSIBILITY.md').includes('packages/catalog/locales.json')) throw new Error('docs/ACCESSIBILITY.md must point at the contract rather than restating it');
/* ---- Colour contrast ---------------------------------------------------------------------------

   Computed, not eyeballed. WCAG 2.2's relative-luminance formula run over the hexes in
   packages/design-tokens/tokens.json, for every foreground and background the design actually puts
   together. Two rules make this worth having rather than decorative:

   A pair listed in `pairs` must clear its minimum, so a palette edit that darkens a background
   until a label stops being readable fails the build rather than shipping.

   A pair listed in `knownFailures` must still fail, and its proposed fix must pass. That second
   half is the point: a failure can be parked, because a brand palette is not an engineer's to
   change in passing, but it cannot be parked without a specific replacement that has been measured.
   And when somebody does apply the fix, the build tells them to move the row up rather than leaving
   a stale confession behind. */
const CONTRAST_AA_TEXT = 4.5;
const tokens = JSON.parse(read('packages/design-tokens/tokens.json'));
const relativeLuminance = hex => {
 const channels = [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255)
  .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
 return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrastRatio = (a, b) => {
 const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
 return (high + 0.05) / (low + 0.05);
};
const colourOf = name => {
 const hex = tokens.color[name];
 if(!hex) throw new Error(`The contrast table names a colour "${name}" that is not in the palette`);
 return hex;
};
const round2 = value => Math.round(value * 100) / 100;
const contrast = tokens.contrast;
const listed = new Set();
for(const pair of contrast.pairs) {
 const key = `${pair.foreground} on ${pair.background}`;
 if(listed.has(key)) throw new Error(`The contrast table lists ${key} twice`);
 listed.add(key);
 const ratio = contrastRatio(colourOf(pair.foreground), colourOf(pair.background));
 if(ratio < pair.minimum) throw new Error(`${key} measures ${round2(ratio)}:1 against a required ${pair.minimum}:1 — ${pair.use}. WCAG 2.2 AA, computed from packages/design-tokens/tokens.json.`);
}
for(const failure of contrast.knownFailures) {
 const key = `${failure.foreground} on ${failure.background}`;
 if(listed.has(key)) throw new Error(`${key} is listed both as a checked pair and as a known failure`);
 listed.add(key);
 if(!failure.note || !failure.proposedFix) throw new Error(`${key} is parked as a known contrast failure without a proposed fix and a reason. A failure recorded without a way out is a failure being hidden in a place that looks like bookkeeping.`);
 const ratio = contrastRatio(colourOf(failure.foreground), colourOf(failure.background));
 if(ratio >= failure.minimum) throw new Error(`${key} now measures ${round2(ratio)}:1 and clears its ${failure.minimum}:1 requirement. Move it out of knownFailures and into pairs — a confession nobody removed is read as a live defect by the next person.`);
 const fixed = contrastRatio(failure.proposedFix, colourOf(failure.background));
 if(fixed < failure.minimum) throw new Error(`${key} proposes ${failure.proposedFix}, which measures ${round2(fixed)}:1 and still does not clear ${failure.minimum}:1. A proposed fix that has not been measured is a wish.`);
}
/* Three generations of colour live in this palette now — the proposal's indigo, the teal and mango
   it came with, and the sage surface system chosen on 8 September. Adding rather than renaming was
   right at the time: two agents and a second session were mid-flight and a rename would have lost
   work. But additive without a record is how a palette becomes sediment, and "a number lives in one
   place" had quietly acquired three answers to "what colour is a card ground".

   So every colour is either current or declared superseded by its replacement, and a colour in
   neither list fails here. That does not retire anything today. It makes the thirty-fifth token a
   decision somebody has to write down rather than a drift nobody notices. */
const generations = tokens.colorGenerations;
if(!generations) throw new Error('packages/design-tokens/tokens.json has no colorGenerations. With three generations of colour in one palette, a file that does not say which is authoritative is a file where the rule that survives is whichever one a screen happened to reach for.');
const accountedFor = new Set([...generations.current, ...Object.keys(generations.supersededBy)]);
for(const name of Object.keys(tokens.color)) {
 if(!accountedFor.has(name)) throw new Error(`The colour "${name}" is in neither colorGenerations.current nor colorGenerations.supersededBy. Say which it is: a colour nobody has placed is the thirty-fifth token, and the reason there are already thirty-four.`);
}
for(const [old, replacement] of Object.entries(generations.supersededBy)) {
 if(!tokens.color[old]) throw new Error(`colorGenerations says "${old}" is superseded, but it is no longer in the palette. Once it is gone, take it out of the list too — a retirement note outliving its subject is the next person's confusion.`);
 if(!tokens.color[replacement]) throw new Error(`colorGenerations says "${old}" is superseded by "${replacement}", which does not exist. A retirement pointing nowhere cannot be carried out.`);
 if(generations.current.includes(old)) throw new Error(`"${old}" is listed as both current and superseded. It is one or the other.`);
}

for(const exempt of contrast.notMeasured) {
 if(!tokens.color[exempt.token]) throw new Error(`The contrast table exempts a colour "${exempt.token}" that is not in the palette`);
 if(!exempt.why) throw new Error(`${exempt.token} is exempted from the contrast table without saying why`);
}
/* The focus ring is a keyboard user's only way of knowing where they are, and SC 1.4.11 gives it a
   3:1 floor. It used to be --gold, which measures 2.12:1 on a card. Naming the token here means a
   stylesheet that quietly puts a two-to-one ring back fails the build rather than a review. */
const focusRing = contrast.pairs.filter(p => /focus ring/i.test(p.use));
if(focusRing.length < 2) throw new Error('The contrast table no longer measures the focus ring against the grounds it appears on');
const focusToken = focusRing[0].foreground;
/* styles.css was split per entry, so the design system is four sheets rather than one. Every check
   that used to read the single file reads all four: a guard that follows a rename by narrowing its
   own scope is a guard that stops guarding. */
const designSheets = ['apps/web/src/surface/core.css','apps/web/src/surface/app.css','apps/web/src/surface/patient-screens.css','apps/web/src/surface/clinical-screens.css'];
for(const sheet of designSheets) {
 for(const outline of read(sheet).match(/outline:\s*\d+px solid var\(--[a-z-]+\)/g) ?? []) {
  const used = outline.match(/var\(--([a-z-]+)\)/)[1];
  if(used !== focusToken) throw new Error(`A focus outline in ${sheet} uses --${used}, and the contrast table measures the ring as --${focusToken}. ${outline}`);
 }
}
const onboardingSources = {
 web: 'apps/web/src/features/Onboarding.tsx',
 ios: 'apps/ios/MyThuso/Features/OnboardingView.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/ui/OnboardingScreens.kt'
};
const idValidators = ['apps/web/src/features/Onboarding.tsx','apps/ios/MyThuso/Models/Localisation.swift','apps/android/app/src/main/java/za/co/mythuso/model/Localisation.kt'];
for(const file of idValidators) if(!/check digit/.test(read(file))) throw new Error(`Identity-number check-digit validation is missing from ${file}`);
/* The three assessment screens. They no longer declare the reference ranges — those are in the
   record contract — but they are still the three places one visit is worked through, so the demo
   visit code and the attribution line are held in step across them here. */
const clinicalSources = {
 web: 'apps/web/src/features/Clinical.tsx',
 ios: 'apps/ios/MyThuso/Features/AssessmentView.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/ui/ClinicalScreens.kt'
};
/* An attribution line is where a reader is being shown what accountability looks like. A placeholder
   registration number there is the one place a preview should not be fictional twice over. */
const attributionSources = { ...clinicalSources,
 'web orders': 'apps/web/src/features/Orders.tsx',
 'ios orders': 'apps/ios/MyThuso/Features/OrdersView.swift',
 'android orders': 'apps/android/app/src/main/java/za/co/mythuso/ui/OrderScreens.kt' };
for(const [platform,file] of Object.entries(attributionSources)) {
 if(/(SANC|HPCSA) 0{4,}/.test(read(file))) throw new Error(`A placeholder registration number is back in the ${platform} attribution (${file}). Read it from the vetting record.`);
}
const demoCodes = [['240924','sign-up verification code',Object.values(onboardingSources)],
                   ['482190','visit code',Object.values(clinicalSources)],
                   ['8001015009087','sample identity number',Object.values(onboardingSources)]];
for(const [code,label,paths] of demoCodes) for(const f of paths) if(!read(f).includes(code)) throw new Error(`Demo ${label} ${code} is missing from ${f}`);
/* The three apps share one illustration source. If a native bundle is missing an illustration, or
   an SVG changed without re-running the renderer, the apps quietly stop looking like each other. */
const illustrations = ['nurse', 'patient', 'family', 'elder'];
for (const name of illustrations) {
 const source = `packages/illustrations/${name}.svg`;
 if (!existsSync(source)) throw new Error(`Missing illustration source ${source}`);
 const derived = [`apps/ios/MyThuso/Assets.xcassets/${name[0].toUpperCase() + name.slice(1)}.imageset/${name}@3x.png`,
                  `apps/android/app/src/main/res/drawable-xxhdpi/mythuso_${name}.png`];
 for (const f of derived) {
  if (!existsSync(f)) throw new Error(`Illustration ${name} has not been rendered for ${f}. Run: node scripts/render-illustrations.mjs`);
  if (statSync(f).mtimeMs < statSync(source).mtimeMs) throw new Error(`${f} is older than ${source}. Run: node scripts/render-illustrations.mjs`);
 }
}
if (!read('apps/web/src/components/Portraits.tsx').includes('packages/illustrations')) throw new Error('The web app must read the shared illustration sources, not its own copy');
/* THE MARK IS ONE ARTWORK ON THREE PLATFORMS, AND IT IS THE FOUNDER'S RATHER THAN A TRACING.
 *
 * The brand SVGs in apps/web/public/brand are the supplied files with every glyph outlined. The web
 * reads them directly; the two native apps carry rasters of the same files, rendered by
 * scripts/render-illustrations.mjs. The failure this guards against is the one the illustrations
 * above already guard against and which a logo is far more likely to suffer: the artwork is replaced
 * in one place and the apps quietly keep shipping the old mark. That is exactly what had happened —
 * the indigo-and-teal logo was still in the iOS asset catalogue after the real files landed.
 *
 * NOT A FONT. The supplied SVGs set the wordmark as live <text font-family="Poppins">, which renders
 * correctly only on a machine that happens to have Poppins and silently substitutes everywhere else.
 * They are outlined now, and this refuses a file that has grown a font dependency back — in a logo
 * that is not a rendering detail, it is a different logo on most of the devices that see it. */
for (const [file, ios, android] of [['mythuso-logo', 'Brand', 'mythuso_logo'],
                                    ['mythuso-mark', 'BrandMark', 'mythuso_mark'],
                                    ['mythuso-mark-reversed', 'BrandMarkReversed', 'mythuso_mark_reversed'],
                                    ['mythuso-logo-reversed', 'BrandReversed', 'mythuso_logo_reversed']]) {
 const source = `apps/web/public/brand/${file}.svg`;
 if (!existsSync(source)) throw new Error(`Missing brand source ${source}. The three apps draw one mark and this is it.`);
 if (/<text|font-family/i.test(read(source))) throw new Error(`${source} sets type as live text rather than outlines. Poppins is installed on the machine the logo was drawn on and on almost nothing else, so this renders as the brand here and as a substitute everywhere a patient will see it. Outline the glyphs.`);
 const derived = [`apps/ios/MyThuso/Assets.xcassets/${ios}.imageset/${file}@3x.png`,
                  `apps/android/app/src/main/res/drawable-xxhdpi/${android}.png`];
 for (const f of derived) {
  if (!existsSync(f)) throw new Error(`The brand cut ${file} has not been rendered for ${f}. Run: node scripts/render-illustrations.mjs`);
  if (statSync(f).mtimeMs < statSync(source).mtimeMs) throw new Error(`${f} is older than ${source}, so a native app is drawing a mark the brand no longer is. Run: node scripts/render-illustrations.mjs`);
 }
}
/* The landing banner is written out three times. A slide added in one app and forgotten in another
   is exactly the kind of drift a design review will not catch. */
const heroCutouts = ['care-that-comes-to-you', 'one-safe-place', 'feel-better'];
for (const name of heroCutouts) {
 const source = `packages/banners/${name}-cutout.png`;
 if (!existsSync(source)) throw new Error(`Missing hero cut-out ${source}. Run: python3 scripts/prepare-banners.py`);
 /* Each platform carries the cut-out in the format that platform actually decodes well: WebP on
    Android and on the web, HEIC in the Apple asset catalogue. The PNG master stays the source. A
    photograph with an alpha channel kept as PNG-24 was 77% of the Android release APK. */
 const set = `apps/ios/MyThuso/Assets.xcassets/Banner${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('')}.imageset`;
 const apple = existsSync(`${set}/${name}-cutout.heic`) ? `${set}/${name}-cutout.heic` : `${set}/${name}-cutout.png`;
 const derived = [`apps/web/public/banners/${name}-cutout.webp`, apple,
                  `apps/android/app/src/main/res/drawable-nodpi/banner_${name.replace(/-/g, '_')}.webp`];
 for (const f of derived) {
  if (!existsSync(f)) throw new Error(`Hero cut-out ${name} has not been distributed to ${f}. Run: node scripts/render-illustrations.mjs`);
  if (statSync(f).mtimeMs < statSync(source).mtimeMs) throw new Error(`${f} is older than ${source}. Run: node scripts/render-illustrations.mjs`);
 }
}
/* The app icon is one drawing stated three times, and until today one of those statements was
   missing. apps/ios had no AppIcon.appiconset and no ASSETCATALOG_COMPILER_APPICON_NAME, so every
   build produced an app with a blank tile on the home screen — the kind of gap that survives because
   a simulator shows the springboard for about a second.

   The other two statements are Android's adaptive drawables, which restate the SVG's paths by hand.
   That copy is what this checks: the heart, the pulse and the two ends of the gradient are read out
   of packages/illustrations/app-icon.svg and looked for in the drawables, so a brand change made in
   the drawing cannot quietly leave Android on the old one. The iOS square is generated rather than
   compared, by scripts/emit-appicon.py, so it has nothing to drift from. */
const iconSvg = readFileSync('packages/illustrations/app-icon.svg', 'utf8');
const iconOnly = (pattern, what) => {
 const found = iconSvg.match(pattern);
 if (!found) throw new Error(`packages/illustrations/app-icon.svg no longer holds ${what}. Three icons are drawn from it; the pattern that finds it is in scripts/check-boundaries.mjs and in scripts/emit-appicon.py.`);
 return found;
};
const iconHeart = iconOnly(/<path d="(M[^"]*)" fill="none" stroke="(#[0-9A-Fa-f]{6})" stroke-width="(\d+)"/, 'the heart path');
const iconPulse = iconOnly(/<polyline points="([^"]+)" fill="none" stroke="(#[0-9A-Fa-f]{6})" stroke-width="(\d+)"/, 'the pulse polyline');
const iconStops = [...iconOnly(/<linearGradient id="bg".*?<\/linearGradient>/s, 'the background gradient')[0]
 .matchAll(/stop-color="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]);
if (iconStops.length !== 2) throw new Error('The app icon background gradient no longer has exactly two stops, which is what both platforms draw.');

const appicon = 'apps/ios/MyThuso/Assets.xcassets/AppIcon.appiconset';
for (const f of [`${appicon}/AppIcon-1024.png`, `${appicon}/Contents.json`]) {
 if (!existsSync(f)) throw new Error(`${f} is missing, so the iOS app ships with a blank home-screen tile. Run: python3 scripts/emit-appicon.py`);
}
if (statSync(`${appicon}/AppIcon-1024.png`).mtimeMs < statSync('packages/illustrations/app-icon.svg').mtimeMs)
 throw new Error('The iOS app icon is older than the drawing it comes from. Run: python3 scripts/emit-appicon.py');
/* Generating the square is not enough on its own: Xcode ignores an asset catalogue's AppIcon unless
   the target is told its name, and it says nothing when it does. Both configurations of the app
   target — not the UI test target, which has no icon of its own — must name it. */
const pbxproj = readFileSync('apps/ios/MyThuso.xcodeproj/project.pbxproj', 'utf8');
const iconNamed = (pbxproj.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g) ?? []).length;
if (iconNamed !== 2) throw new Error(`ASSETCATALOG_COMPILER_APPICON_NAME is set in ${iconNamed} build configurations rather than the app target's 2. Without it Xcode builds the catalogue and ships no icon, silently.`);

/* Android's two drawables are the hand-written copy, so they are the ones held to the source. The
   path data is compared with whitespace and the SVG's optional commas removed, because the two
   formats spell the same curve slightly differently and neither spelling is the drawing. */
const iconPathData = d => d.replace(/,/g, ' ').replace(/([A-Za-z])/g, ' $1 ').replace(/\s+/g, ' ').trim();
const iconForeground = readFileSync('apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml', 'utf8');
const iconBackground = readFileSync('apps/android/app/src/main/res/drawable/ic_launcher_background.xml', 'utf8');
const androidPaths = [...iconForeground.matchAll(/android:pathData="([^"]+)"/g)].map(m => iconPathData(m[1]));
if (!androidPaths.includes(iconPathData(iconHeart[1])))
 throw new Error('The Android launcher foreground no longer draws the heart in packages/illustrations/app-icon.svg. Two platforms would show different icons. Update apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml.');
/* The polyline's points become an L-command path on Android, so the numbers are what is compared. */
const iconPulseNumbers = iconPulse[1].replace(/[, ]+/g, ' ').trim();
const androidPulse = androidPaths.find(d => d.replace(/[ML]/g, ' ').replace(/\s+/g, ' ').trim() === iconPulseNumbers);
if (!androidPulse) throw new Error('The Android launcher foreground no longer draws the pulse in packages/illustrations/app-icon.svg. Update ic_launcher_foreground.xml.');
for (const [i, stop] of iconStops.entries()) {
 if (!iconBackground.includes(`#FF${stop.slice(1).toUpperCase()}`))
  throw new Error(`The Android launcher background is missing gradient stop ${i + 1}, ${stop}, which packages/illustrations/app-icon.svg and the iOS square both use. Update ic_launcher_background.xml.`);
}
for (const [name, colour, width] of [['heart', iconHeart[2], iconHeart[3]], ['pulse', iconPulse[2], iconPulse[3]]]) {
 if (!iconForeground.includes(`#FF${colour.slice(1).toUpperCase()}`))
  throw new Error(`The Android launcher foreground no longer strokes the ${name} in ${colour}. Update ic_launcher_foreground.xml.`);
 if (!iconForeground.includes(`android:strokeWidth="${width}"`))
  throw new Error(`The Android launcher foreground no longer strokes the ${name} at ${width}. Update ic_launcher_foreground.xml.`);
}

/* The banner copy used to be checked substring by substring across three files, because it was
   written out three times. It is one set of keys in packages/catalog/locales.json now, so what is
   left to check is that a slide has all of its parts in every locale that claims the set — the
   locale block above does that — and that the three slides the pictures were cut for still exist.
   A fourth slide with no cut-out is a blank banner rather than a missing sentence. */
const heroSlideKeys = ['title','body','cta','trust1','trust2','trust3','caption'];
for (let slide = 1; slide <= heroCutouts.length; slide += 1) {
 for (const part of heroSlideKeys) {
  if (!localeContract.keys.some(k => k.id === `slide${slide}.${part}` && k.set === 'hero')) {
   throw new Error(`Hero slide ${slide} has no "${part}" in the hero set of packages/catalog/locales.json, and ${heroCutouts[slide - 1]} was cut for it`);
  }
 }
}
if (localeContract.keys.filter(k => /^slide\d+\.title$/.test(k.id)).length !== heroCutouts.length) {
 throw new Error(`The locale contract has a different number of hero slides than there are cut-outs (${heroCutouts.length})`);
}
/* ---- The four banners, and what they may not promise -------------------------------------------
 *
 * The founder supplied four finished compositions on 13 September and asked for the pieces loose, so
 * packages/catalog/hero.json is the whole of the landing page's hero: four slides of words, four
 * photographs named by stem, and the two lines every slide carries. Six things are checked, and each
 * of them is a way the banner could quietly stop being the contract.
 *
 * A picture for every slide, published in both formats. A slide whose photograph has not been
 * distributed is a blank frame on the one page a stranger reads first, and the WebP is not a nicety:
 * four photographs on a metered South African connection is the difference between 140 kB and 290.
 *
 * Every icon name drawn, every tint known, every destination answered. The contract names ideas
 * rather than glyphs so that three platforms can each use the set they have; the web's answer is the
 * HeroIcon union in apps/web/src/lib/hero.ts, and a name in one and not the other is an empty disc
 * or a dead type.
 *
 * Not one of the banner's sentences typed into the page. That is the whole reason the compositions
 * were taken apart — a picture of a headline is a headline nobody can translate — and a sentence
 * that reappears as a literal has undone it.
 *
 * AND THE ONE THAT IS NOT BOOKKEEPING: the everyday-wellbeing slide advertises Live well, and
 * wellbeing.json refuses a score, a grade, a target, a streak, a rank, a percentage and a unit
 * anywhere in that feature. A banner that sells a feature may not promise what the screen behind it
 * refuses, so that slide is read for a digit and for the vocabulary of measurement. It passes today
 * — "move a little more", "at your own pace", "nourish your everyday" are none of those things — and
 * the check exists so that the first person to add a number to it for visual balance is stopped by
 * the build rather than by a review. */
{
 const hero = JSON.parse(read('packages/catalog/hero.json'));
 const heroLib = read('apps/web/src/lib/hero.ts');
 const landing = read('apps/web/src/features/Landing.tsx');
 if (hero.slides.length < 2) throw new Error('packages/catalog/hero.json has fewer than two slides, so the landing page is carrying a carousel around one picture.');
 for (const slide of hero.slides) {
  const source = `packages/banners/${slide.photograph}.jpg`;
  if (!existsSync(source)) throw new Error(`Hero slide "${slide.id}" names the photograph ${slide.photograph}, and ${source} does not exist. The crops live in packages/banners; run: python3 scripts/prepare-banners.py`);
  for (const published of [`apps/web/public/banners/${slide.photograph}.jpg`, `apps/web/public/banners/${slide.photograph}.webp`]) {
   if (!existsSync(published)) throw new Error(`Hero slide "${slide.id}" has no ${published}, so its half of the banner is a blank frame. Run: node scripts/render-illustrations.mjs`);
   if (statSync(published).mtimeMs < statSync(source).mtimeMs) throw new Error(`${published} is older than ${source}. Run: node scripts/render-illustrations.mjs`);
  }
 }
 /* The names the contract uses, against the names the web can draw. The union in lib/hero.ts is what
    TypeScript holds the glyph table to, so checking the union against the contract closes the loop
    from the JSON to the rendered disc. */
 const declared = (name) => new Set((heroLib.match(new RegExp(`export type ${name} =([^;]+);`))?.[1] ?? '')
  .split('|').map(part => part.trim().replace(/^'|'$/g, '')).filter(Boolean));
 const icons = declared('HeroIcon'), tints = declared('HeroTint'), destinations = declared('HeroDestination');
 for (const set of [['HeroIcon', icons], ['HeroTint', tints], ['HeroDestination', destinations]]) {
  if (!set[1].size) throw new Error(`apps/web/src/lib/hero.ts no longer declares ${set[0]}, so nothing checks that the banner's names are the ones the page can draw.`);
 }
 const used = { icon: new Set(), tint: new Set(), goes: new Set() };
 for (const slide of hero.slides) {
  used.goes.add(slide.action.goes);
  for (const mark of slide.marks) used.icon.add(mark.icon);
  for (const card of slide.cards) { used.icon.add(card.icon); used.tint.add(card.tint); }
 }
 for (const name of used.icon) if (!icons.has(name)) throw new Error(`packages/catalog/hero.json uses the icon "${name}" and apps/web/src/lib/hero.ts does not know it, so the web draws an empty disc where the art has a glyph.`);
 for (const name of used.tint) if (!tints.has(name)) throw new Error(`packages/catalog/hero.json uses the tint "${name}", which apps/web/src/lib/hero.ts does not declare.`);
 for (const name of used.goes) if (!destinations.has(name)) throw new Error(`A hero slide's call to action goes to "${name}", which apps/web/src/lib/hero.ts has no address for — a button that promises a screen nobody can open.`);
 /* Every destination the type allows must have somewhere to go. `sections` answers two of them with
    a page name and `roleFor` answers the third; a destination missing from both is an address of
    `/app/` wearing a more specific label. */
 for (const name of destinations) {
  if (!new RegExp(`(^|[^\\w'])'?${name}'?\\s*:`, 'm').test(heroLib)) throw new Error(`apps/web/src/lib/hero.ts declares the destination "${name}" and never says where it goes.`);
 }
 /* Not one of the banner's sentences typed onto the page. */
 const sentences = hero.slides.flatMap(slide => [slide.eyebrow, slide.headline.lead, slide.headline.accent, slide.body, slide.action.label,
  ...slide.marks.flatMap(mark => mark.lines), ...slide.cards.flatMap(card => [card.title, ...card.lines])])
  .concat([hero.standing.place, hero.standing.photographNote]);
 /* Three words and fourteen characters, which is the line between a sentence out of the banner and
    a word the English language also uses — "visits" and "Doctor" appear on this page for reasons
    that have nothing to do with a trust mark. What is being caught is copy, not vocabulary. */
 for (const sentence of sentences.filter(line => line.trim().split(/\s+/).length >= 3 && line.length >= 14)) {
  if (landing.includes(sentence)) throw new Error(`apps/web/src/features/Landing.tsx types the banner's own words — "${sentence}" — instead of rendering them from packages/catalog/hero.json. That is the state the four supplied JPEGs were in, and it is why they were taken apart.`);
 }
 /* The slide that sells Live well is held to Live well's contract. */
 const wellbeingSlide = hero.slides.find(slide => /wellbeing|live.?well/i.test(slide.id));
 if (!wellbeingSlide) throw new Error('No hero slide advertises Live well any more. If that is deliberate, take this check out with it — a rule about a slide nobody has is a rule nobody is keeping.');
 const wellbeingWords = [wellbeingSlide.eyebrow, wellbeingSlide.headline.lead, wellbeingSlide.headline.accent, wellbeingSlide.body, wellbeingSlide.action.label,
  ...wellbeingSlide.marks.flatMap(mark => mark.lines), ...wellbeingSlide.cards.flatMap(card => [card.title, ...card.lines])].join(' ');
 if (/\d/.test(wellbeingWords)) throw new Error(`The "${wellbeingSlide.id}" banner carries a digit, and packages/catalog/wellbeing.json forbids a score, a target, a streak and a unit anywhere in the feature it advertises. A banner may not promise what the screen behind it refuses.`);
 /* Words that are a measurement whatever sits beside them. A unit needs a number to become one —
    "Small steps." is a metaphor and the digit check above is what catches a step count — so no unit
    is listed here, and listing one is how a headline the contract wrote gets refused by a regex. */
 const measuring = /\b(score|scored|grade|graded|target|goal|streak|rank|ranked|ranking|per ?cent|percentage|bmi|calorie|calories|kilograms?|kg)\b/i;
 const found = wellbeingWords.match(measuring);
 if (found) throw new Error(`The "${wellbeingSlide.id}" banner says "${found[0]}", which is the vocabulary of measurement that packages/catalog/wellbeing.json refuses — no score, no grade, no target, no streak, no rank, no percentage, no unit. The slide sells Live well and Live well has none of those.`);
}
/* The identity service holds a name and a mobile number. That is personal information, not the
   special personal information that health data is, which is the only reason it can exist ahead of
   the controls in docs/PRIVACY-AND-SECURITY.md. If a clinical table appears here, that reasoning
   has quietly stopped being true. */
if(existsSync('apps/api/src')) {
 /* The word list has not moved. What has moved is what it is held against: scripts/clinical-tables.mjs
    reads the table name and every column name out of the statement and tests those, instead of
    grepping the whole `CREATE TABLE …;` text. The old form ran to the next semicolon in the *file*,
    so it scanned the prose underneath a schema, and it could not tell a table of clinical data from
    a table about access to clinical records — which is why the log of who opened whose record is
    called record_access_log rather than the name it should have had.

    Proved both ways before it is trusted, in the same spirit as breaking a source to watch a check
    fire: a schema that must still fail, and one that must now pass. Cheap, and it means a refactor
    of the parser that quietly stopped refusing anything cannot reach the tree. */
 const mustFail = [
  ['a column holding a reading', 'CREATE TABLE record_access_log (id TEXT PRIMARY KEY, observation TEXT)'],
  ['a table of readings', 'CREATE TABLE IF NOT EXISTS vitals (id TEXT PRIMARY KEY, taken_at INTEGER)'],
  ['a reading behind a quoted name', 'CREATE TABLE notes ("id" TEXT, "clinical_finding" TEXT)'],
  ['a date a reading was taken', 'CREATE TABLE x (id TEXT, observation_at INTEGER)'],
  ['a name that only reads as innocent', 'CREATE TABLE patient_records (id TEXT, body TEXT)']
 ];
 for(const [what,schema] of mustFail) {
  if(!clinicalIdentifiers(schema).length) throw new Error(`scripts/clinical-tables.mjs has stopped refusing ${what}: ${schema}`);
 }
 const mustPass = [
  ['a log about access to clinical records', 'CREATE TABLE clinical_access_log (id TEXT PRIMARY KEY, observation_id TEXT, record_type TEXT, seq INTEGER)'],
  ['prose beside a schema', '/* a CREATE TABLE will not add one, and the medication column stays where it is. */'],
  ['a default containing a bracket', "CREATE TABLE t (id TEXT, label TEXT NOT NULL DEFAULT '(none)')"]
 ];
 for(const [what,schema] of mustPass) {
  const found = clinicalIdentifiers(schema);
  if(found.length) throw new Error(`scripts/clinical-tables.mjs refuses ${what} over "${found[0].identifier}", which is a name rather than a place a value could go: ${schema}`);
 }
 for(const f of files('apps/api/src')) {
  for(const found of clinicalIdentifiers(read(f))) {
   throw new Error(`The identity service has grown a clinical ${found.kind} in ${f}: ${found.kind === 'table' ? found.identifier : `${found.table}.${found.identifier}`}. Health data is special personal information: work through docs/PRIVACY-AND-SECURITY.md before this ships.`);
  }
 }
 if(!read('apps/api/src/config.ts').includes('holds no health information')) throw new Error('The identity service must state what it holds in apps/api/src/config.ts');
 /* The gate is the only thing that opens a sealed value. A module that imports the crypto directly
    can decide for itself who may read a record, which is the hole the gate exists to close — and
    the sibling projects show how it ends: a check remembered on some of the routes. */
 for(const f of files('apps/api/src').filter(f=>f.endsWith('.ts')&&!f.includes('src/protection/'))) {
  if(/from\s+['"][^'"]*protection\/crypto/.test(read(f))) throw new Error(`Only the gate opens sealed values: ${f} imports the protection crypto directly`);
 }
 /* A renewal warning that fires at 45 days in three apps and at something else in the gate is a
    clinician warned on their phone and refused by the server. */
 if(!/EXPIRY_WARNING_DAYS = 45/.test(read('apps/api/src/protection/gate.ts'))) throw new Error('The 45-day renewal warning has moved in apps/api/src/protection/gate.ts');
 /* The audit trail is only worth having if nothing rewrites it. */
 const store=read('apps/api/src/store.ts');
 if(/UPDATE audit|DELETE FROM audit/i.test(store)) throw new Error('The audit table must stay append-only');
 /* ---- What every answer carries, and how long a request may take ---------------------------
    Two controls that used to live only in docs/PRIVACY-AND-SECURITY.md, in the sentence "production
    must supply HTTP security headers … at the hosting layer". A control owned by a hosting layer is
    a control owned by nobody, and the hosting layer named in deploy/README.md serves five unrelated
    production sites whose config this repository is forbidden to touch. So the service sets them,
    and this is what keeps them set: a header quietly dropped from send() is a header nobody notices
    is gone, because nothing about the answer looks different.

    frame-ancestors and X-Frame-Options are the pair; if one is here without the other, something
    was half-edited. HSTS is deliberately *not* required unconditionally — it is sent only where the
    cookie is already Secure, and a development server that taught a browser to refuse localhost
    over http for two years would be a header nobody could turn off. What is checked is that it is
    conditional rather than absent, and that it never carries `preload`: a preload entry is a
    submission to a list this service cannot withdraw itself from. */
 const apiServer = read('apps/api/src/server.ts');
 const TRANSPORT_HEADERS = [
  ["content-security-policy", "frame-ancestors 'none'", 'nothing may frame an answer from this service'],
  ["content-security-policy", "default-src 'none'", 'a JSON body that reaches a browser as a document must load nothing'],
  ["x-frame-options", 'DENY', 'the older half of the same refusal, for the browsers that only read this one'],
  ["permissions-policy", 'camera=()', 'an identity service asks for no camera; the teleconsultation contract says so in its own words'],
  ["permissions-policy", 'microphone=()', 'and no microphone'],
  ["permissions-policy", 'geolocation=()', 'and no location'],
  ["cross-origin-resource-policy", 'same-origin', "somebody else's page may not read what this returned to a signed-in browser"],
  ["cross-origin-opener-policy", 'same-origin', 'a window that opened this one may not reach back into it'],
  ["x-content-type-options", 'nosniff', 'a JSON body is never guessed at'],
  ["referrer-policy", 'no-referrer', 'a URL from this service is never handed to the next site']
 ];
 /* Read out of the declaration rather than out of the file. The comment above it quotes every one
    of these directives to explain them, so grepping the whole file would pass on the explanation
    while the header said something else — which is the exact failure this check is for. */
 const transportBlock = apiServer.match(/const TRANSPORT_HEADERS: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
 if(!transportBlock) throw new Error('apps/api/src/server.ts no longer declares TRANSPORT_HEADERS as one object this check can read');
 for(const [header, value, why] of TRANSPORT_HEADERS) {
  const line = transportBlock.split('\n').find(l => l.includes(`'${header}'`));
  if(!line) throw new Error(`apps/api/src/server.ts no longer sets ${header} on every answer: ${why}`);
  if(!line.includes(value)) throw new Error(`apps/api/src/server.ts sets ${header} without "${value}": ${why}`);
 }
 if(!/\.\.\.TRANSPORT_HEADERS/.test(apiServer.split('function send(')[1] ?? '')) throw new Error('send() no longer spreads TRANSPORT_HEADERS, so the headers are declared and not sent');
 if(!/config\.cookieSecure\)\s*res\.setHeader\('strict-transport-security'/.test(apiServer)) throw new Error('HSTS must be sent exactly where the cookie is already Secure, and nowhere else. A development server on plain http that sent it would teach a browser to refuse localhost over http for two years, and nobody can turn that off from here.');
 const hsts = apiServer.match(/const HSTS = '([^']+)'/)?.[1];
 if(!hsts) throw new Error('apps/api/src/server.ts no longer declares the HSTS header as a named constant this check can read');
 if(/preload/.test(hsts)) throw new Error('The HSTS header must not carry preload: a preload entry is a submission to a list this service cannot withdraw itself from, and the domain it would be submitted for hosts five unrelated sites.');
 if(!/includeSubDomains/.test(hsts)||!/max-age=\d{7,}/.test(hsts)) throw new Error(`HSTS is "${hsts}". A max-age under a few months, or one that leaves subdomains out, is a header that reads as protection and is not.`);
 /* The body has been capped at 8 KiB since this service was written; time was not capped at all, so
    it inherited Node's five-minute request timeout. A connection sending one header byte a minute
    costs nothing to make and holds a socket for five minutes. Nothing here needs five minutes. */
 for(const setting of ['requestTimeout', 'headersTimeout', 'keepAliveTimeout', 'maxHeadersCount']) {
  if(!new RegExp(`server\\.${setting} =`).test(apiServer)) throw new Error(`apps/api/src/server.ts does not set ${setting} on the listening server, so a slow or oversized request is held to Node's defaults rather than to this service's. A body cap on its own caps the wrong half of a request.`);
 }
 const requestMs = Number(apiServer.match(/requestMs:\s*([\d_]+)/)?.[1].replace(/_/g, ''));
 const headersMs = Number(apiServer.match(/headersMs:\s*([\d_]+)/)?.[1].replace(/_/g, ''));
 if(!(requestMs > 0 && requestMs <= 30_000)) throw new Error(`The request timeout is ${requestMs} ms. Node's default is five minutes and that is what this exists to replace; anything above thirty seconds is not a cap.`);
 if(!(headersMs > 0 && headersMs < requestMs)) throw new Error(`The header timeout is ${headersMs} ms against a request timeout of ${requestMs} ms. Headers must land sooner than the whole request, or the header cap never fires.`);

 /* ---- A library with a test suite is not a running control -----------------------------------

    docs/PRIVACY-AND-SECURITY.md's sharpest sentence for months was that the authorisation gate had
    a real vault, a real test suite and no HTTP route reaching either — and it named the eight calls
    that were reached from the tests and from nowhere else. They have routes now, and this is what
    stops them quietly losing them again during a refactor that "tidied up an unused endpoint".

    The check is on the calls rather than on the route strings on purpose: a path can be renamed and
    the control is unchanged, and a call that disappears is the control disappearing. */
 const VAULT_SURFACE = {
  'enrol': 'nobody can be put on the register',
  'submit': 'no certificate can be put in',
  'open': 'no certificate can be taken out',
  'decide': 'no check can be verified or declined',
  'second': 'the two-reviewer rule is decided by nobody',
  'suspend': 'nobody can be stood down',
  'restore': 'nobody stood down can be brought back',
  'standing': 'nobody can be told where they stand'
 };
 for(const [call, cost] of Object.entries(VAULT_SURFACE)) {
  if(!new RegExp(`vetting!?\\.${call}\\(`).test(apiServer)) throw new Error(`No route in apps/api/src/server.ts calls vetting.${call}(), so ${cost}. The gate and the vault were written, tested and unreachable for months and docs/PRIVACY-AND-SECURITY.md called that out by name: a library with a test suite is not a running control.`);
 }
 /* And the thing that made those routes safe to add at all. The comment beside the intake ledger has
    always said it: a route that takes an actor id off a request body and hands it to the gate is
    precisely the hole the gate exists to close, because anybody who can POST is then anybody. The id
    comes off the session cookie and the role out of vetting_parties — apps/api/src/actor.ts — and
    nothing on a request may name either. */
 for(const file of files('apps/api/src').filter(f=>f.endsWith('.ts'))) {
  for(const line of read(file).split('\n')) {
   if(/\b(actorId|actorRole)\s*:/.test(line)&&/\bbody\b/.test(line)) throw new Error(`${file} builds a gate request out of a request body: ${line.trim()}. Who is asking is resolved from the session and from the vetting register, never declared — see apps/api/src/actor.ts. An actor off a body is the whole of the hole the gate exists to close.`);
  }
 }

 /* ---- What a legitimate caller may do --------------------------------------------------------
    This file used to say, in prose, that everything except the sign-in door was unlimited. The
    limiter lives in handle() rather than on each route, which is the only arrangement in which a
    route added next year cannot forget it — so what is checked is that it is still there, that it
    is still counted against a named constant, and that the exemption list has not grown. The three
    exempted routes carry their own and tighter limits, counted against the number and the address;
    everything else, writes and the health routes, is held to the caller limit. */
 const dispatcher = apiServer.split('return async function handle(')[1] ?? '';
 if(!/store\.countWrites\(/.test(dispatcher)||!/store\.recordWrite\(/.test(dispatcher)) throw new Error('apps/api/src/server.ts no longer counts writes per caller in handle(). A limiter on each route is a limiter the next route forgets; this one is on the way in, before any handler runs.');
 /* The comparison specifically, not merely a mention of the constant. A dispatcher that counts
    against a literal and then quotes the constant back in the refusal message is the worst of both:
    the number a caller is told about and the number they are held to have come apart. */
 if(!/>=\s*limits\.writesPerCallerPerWindow/.test(dispatcher)) throw new Error('The caller limit in apps/api/src/server.ts is not compared against limits.writesPerCallerPerWindow. A number typed into a dispatcher is a number nobody can find the reasoning for, and the reasoning — including that the number is a proposal rather than a measurement — is in apps/api/src/config.ts.');
 const selfLimited = (apiServer.match(/const SELF_LIMITED = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '').match(/'[^']+'/g) ?? [];
 if(!selfLimited.length) throw new Error('apps/api/src/server.ts no longer declares SELF_LIMITED as one list this check can read.');
 for(const route of selfLimited) {
  if(!/^'POST \/auth\/(start|verify|second-factor)'$/.test(route)) throw new Error(`${route} is exempted from the caller limit in apps/api/src/server.ts. Only the three sign-in routes are, and only because each already carries a tighter limit of its own counted against the mobile number and the address. Nothing is exempt for being harmless: a route nobody thought about is exactly the one that is unlimited a year later.`);
 }
 /* The health routes answer the loopback and only there. The comment beside them always said they
    "answer on the loopback to a script"; until this landed nothing in the code said so, and
    /health/audit walks the whole hash chain for whoever asks.

    It is asserted on the *path* rather than on `GET /health/`, which is what this check used to
    require. A restriction written against a method is one the first route with a different method
    walks straight past, and the first one to arrive was POST /health/witness — which answers whether
    the audit chain has been truncated, and would therefore have been both a public announcement of
    an incident and an oracle for testing forged statements against. So there are two halves here:
    the restriction has to exist, and it must not be keyed on a method again. */
 if(/route\.startsWith\('GET \/health\//.test(dispatcher)) throw new Error("apps/api/src/server.ts holds the health routes to the loopback by method again. A POST under /health/ is not a GET: keyed on the method, the next route added under that prefix is public, and the one that would have been is the route that says whether the audit chain has been truncated.");
 if(!/\.startsWith\('\/health\/'\)\s*&&\s*!LOOPBACK\.has/.test(dispatcher)) throw new Error('apps/api/src/server.ts no longer holds the /health/* routes to the loopback. They run real work for whoever asks — one of them verifies the whole audit chain — and the comment beside them has claimed they answer a script on the box since they were written.');

 /* ---- The proof that a request was answered --------------------------------------------------
    Append-only for the same reason the audit table is, and checked the same way: a proof of an
    answer that somebody could go back and improve is not a proof of anything. */
 const subjectRequests = read('apps/api/src/subjectRequests.ts');
 if(/UPDATE subject_request_responses|DELETE FROM subject_request_responses/i.test(subjectRequests)) throw new Error('The record of what MyThuso answered a data subject must stay append-only. A response somebody can edit afterwards proves a date and nothing else.');

 /* ---- The breach register must not become a copy of the breach -------------------------------
    A register of what leaked, listing everybody it leaked about, kept in the file most likely to be
    opened by the largest number of people during the worst week the company has. It holds a count.
    Enforced on the identifiers rather than on the prose above them, exactly as the clinical-table
    check is. */
 const incidentColumns = (tablesIn(read('apps/api/src/incidents.ts')).find(t => t.name === 'incidents')?.columns ?? []).map(c => c.toLowerCase());
 if(!incidentColumns.length) throw new Error('apps/api/src/incidents.ts no longer creates the incidents table, or this check can no longer read it.');
 for(const column of incidentColumns) {
  if(/^(person_id|subject_id|people|phone|name|full_name|account_id|affected_people|patient.*)$/.test(column)) throw new Error(`The incident register has grown a column somebody could be named in: incidents.${column}. It holds how many people an incident reached and never which ones — who has to be told is worked out at the time from the records it touched, not curated in the register beforehand.`);
 }
 /* ---- And the export carries nothing that is a key -------------------------------------------
    An export is the one route on a platform designed to put everything in one place, which is what
    makes it the one worth reading twice. The list is declared by the module that does the excluding
    — apps/api/src/subjectExport.ts — so a section added to the answer later is held to it without
    anybody remembering to come back here. */
 const exportRoute = (apiServer.match(/routes\.set\('POST \/account\/export'[\s\S]*?\n  \}\);/) ?? [])[0] ?? '';
 if(!exportRoute) throw new Error('apps/api/src/server.ts no longer declares POST /account/export in a form this check can read.');
 const forbiddenKeys = (read('apps/api/src/subjectExport.ts').match(/export const FORBIDDEN_KEYS: readonly string\[\] = \[([^\]]*)\]/)?.[1] ?? '').match(/'[^']+'/g) ?? [];
 if(forbiddenKeys.length < 5) throw new Error('apps/api/src/subjectExport.ts no longer declares FORBIDDEN_KEYS as one list this check can read.');
 for(const raw of forbiddenKeys) {
  const key = raw.slice(1, -1);
  if(new RegExp(`\\b${key}\\s*:`).test(exportRoute)) throw new Error(`POST /account/export sends "${key}", which apps/api/src/subjectExport.ts lists as never exported. ${key === 'secret' || key === 'recoveryCodes' ? 'An export carrying a second factor hands it to whoever ends up with the file.' : 'It is a key rather than information about a person.'}`);
 }
 if(!/stepUp\(person\.id, 'account\.export'/.test(exportRoute)) throw new Error('POST /account/export no longer demands a step-up. It is the one answer on this service that puts a whole record in one place, which is exactly what somebody holding an unlocked phone would ask for.');
 /* Nobody answers their own request. An operator who is also a data subject is ordinary and fine;
    an operator recording the answer to their own request is the one arrangement in which the proof
    of response proves nothing. */
 const respondRoute = (apiServer.match(/routes\.set\('POST \/operator\/requests\/respond'[\s\S]*?\n  \}\);/) ?? [])[0] ?? '';
 if(!/personId === held\.person\.id/.test(respondRoute)) throw new Error('POST /operator/requests/respond no longer refuses somebody answering their own section 24 request. That is the one arrangement in which the proof that a request was answered proves nothing.');
}
/* Three things the apps share are no longer written out by hand in each of them: the design tokens,
   the vetting table and the record contract are generated into CSS, Swift and Kotlin by
   scripts/emit-tokens.mjs, scripts/emit-vetting.mjs and scripts/emit-records.mjs. Drift can no
   longer be typed in, but a generated file can still be stale, or edited by somebody who did not
   read the header. Both are the same failure, so both are caught the same way: ask the emitter what
   the file should say and compare it with what is there. The modification time is looked at first
   only because "regenerate" is a more useful thing to be told than a diff — it is the same rule the
   illustrations and banners below are held to. */
const generated = [
 { source: 'packages/design-tokens/tokens.json', command: 'npm run tokens', files: emitTokens() },
 { source: 'packages/catalog/vetting.json', command: 'npm run vetting', files: emitVetting() },
 { source: 'packages/catalog/records.json', command: 'npm run records', files: emitRecords() },
 { source: 'packages/catalog/earnings.json', command: 'npm run earnings', files: emitEarnings() },
 { source: 'packages/catalog/sos.json', command: 'npm run sos', files: emitSos() },
 { source: 'packages/catalog/teleconsult.json', command: 'npm run teleconsult', files: emitTeleconsult() },
 { source: 'packages/catalog/events.json', command: 'npm run events', files: emitEvents() },
 { source: 'packages/catalog/consent.json', command: 'npm run consent-grants', files: emitConsentGrants() },
 { source: 'packages/catalog/protocols.json', command: 'npm run protocols', files: emitProtocols() },
 { source: 'packages/catalog/apis.json', command: 'npm run apis', files: emitApis() },
 { source: 'packages/catalog/locales.json', command: 'npm run locales', files: emitLocales() },
 { source: 'packages/catalog/dispensing.json', command: 'npm run dispensing', files: emitDispensing() },
 { source: 'packages/catalog/programmes.json', command: 'npm run programmes', files: emitProgrammes() },
 { source: 'packages/catalog/interpreting.json', command: 'npm run interpreting', files: emitInterpreting() },
 { source: 'packages/catalog/scheduling.json', command: 'npm run scheduling', files: emitScheduling() },
 { source: 'packages/catalog/geography.json', command: 'npm run geography', files: emitGeography() },
 { source: 'packages/catalog/capabilities.json', command: 'npm run capabilities', files: emitCapabilities() },
 { source: 'packages/catalog/cancellation.json', command: 'npm run cancellation', files: emitCancellation() },
 { source: 'packages/catalog/passport.json', command: 'npm run passport', files: emitPassport() },
 { source: 'packages/catalog/capture.json', command: 'npm run capture', files: emitCapture() },
 { source: 'packages/catalog/framing.json', command: 'npm run framing', files: emitFraming() },
 { source: 'packages/catalog/wellbeing.json', command: 'npm run wellbeing', files: emitWellbeing() },
 { source: 'packages/catalog/shop.json', command: 'npm run shop', files: emitShop() },
 { source: 'packages/catalog/rewards.json', command: 'npm run rewards', files: emitRewards() },
 { source: 'packages/catalog/thusoiq.json', command: 'npm run thusoiq-contract', files: emitThusoIQ() },
 { source: 'packages/catalog/assistant.json', command: 'npm run assistant', files: emitAssistant() },
 { source: 'packages/catalog/gilbert-emergency-terms.json', command: 'npm run assistant', files: emitAssistant() }
];
for(const {source,command,files} of generated) {
 for(const file of files) {
  if(!existsSync(file.path)) throw new Error(`${file.path} has not been generated from ${source}. Run: ${command}`);
  if(statSync(file.path).mtimeMs<statSync(source).mtimeMs) throw new Error(`${file.path} is older than ${source}. Run: ${command}`);
  if(read(file.path)!==file.content) throw new Error(`${file.path} is not what ${source} generates. Either it was edited by hand — it says at the top not to be — or the generator changed. Run: ${command}`);
 }
}

/* ==== Contracts & Core (Wave 1) ==================================================================

   Added by the Contracts & Core lead for three contracts other engines are being written against
   at the same time: packages/catalog/events.json (ThusoIQ Core's event contracts, frozen),
   the `grants` section of packages/catalog/consent.json, and packages/catalog/protocols.json.
   Everything in this block is new and self-contained, so it can be moved or merged without touching
   the checks around it.

   The events are read from every file events.json lists under `sources`, not only from events.json,
   because the assistant and trust contracts declare their own events in the same shape. A listed
   file that does not exist yet is noted and skipped, so this block passes before those land and
   holds them to every rule below the moment they do.

   Corrected on 14 September after review, and the corrections are the reason for four rules below.
   A never-list that matched only the end of a field's name, and had no word for a score, let the
   Trust Score itself onto the bus. A rule that sent grant news to every engine serving a grant role
   sent it to Money, which serves only the scheme's aggregate role. A fingerprint without the event
   type could not tell two Verify events apart. And `frozen: false` would have switched every lock
   check off without a word. The defective versions are withdrawn rather than edited, which is itself
   now checked. */
{
 const coreFieldTypes = new Set(JSON.parse(read('packages/catalog/feeds.json')).fieldTypes.map(t => t.id));
 const coreRecords = JSON.parse(read('packages/catalog/records.json')).records;
 const coreRecordById = new Map(coreRecords.map(r => [r.id, r]));
 /* The gate's purposes are a TypeScript union in apps/api, and that union is the one place they are
    written. Read it, rather than list them again here. */
 const gatePurposes = new Set([...((read('apps/api/src/protection/contract.ts').match(/export type Purpose =([^;]+);/) ?? [])[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]));
 if (!gatePurposes.size) throw new Error('scripts/check-boundaries.mjs can no longer read the Purpose union out of apps/api/src/protection/contract.ts, so nothing checks that an event or a grant names a purpose the gate knows.');

 const { contract: eventsContract, events: coreEvents, skipped: skippedSources } = collectEvents();
 for (const source of skippedSources) console.log(`${source} is listed as a source of events in packages/catalog/events.json and declares none on this branch yet. It is read, and held to the same rules, the moment it does.`);
 const coreRefusal = id => {
  const r = eventsContract.refusals.find(x => x.id === id);
  if (!r?.statement?.trim() || !r.why?.trim()) throw new Error(`packages/catalog/events.json has lost the refusal "${id}", or its statement or its reasoning.`);
  return r;
 };
 /* Every lock check below used to sit behind `frozen === true`, which made the flag an off switch for
    all of them. The flag is held first, so the only way to stop the lock being checked is to delete
    this line in a diff somebody reads. */
 if (eventsContract.frozen !== true) throw new Error(`packages/catalog/events.json says frozen is ${JSON.stringify(eventsContract.frozen)}. ${coreRefusal('freezing-cannot-be-switched-off').statement} ${coreRefusal('freezing-cannot-be-switched-off').why}`);
 const engineIds = new Set(eventsContract.engines.map(e => e.id));
 if (engineIds.size !== eventsContract.engines.length) throw new Error('packages/catalog/events.json declares the same engine twice. An engine id is who an event is owned by; two of them is two owners.');
 const coreNorm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
 /* How a field name is matched against a refused one. By ending, as words or as letters, for
    everything: the last word of a name is what the field is, so patientName is a name and
    readingKind — which pulse.device.highlight carries to say which kind of reading to point at — is
    a kind, not a reading. And anywhere in the name for an entry that says so, which is the score:
    a score's band, rank or percentile is the score, so scoreBand is refused where an ending-only
    rule would have let it through. Words are what a field name is made of in both spellings the
    contracts use, camelCase and snake_case. */
 const coreWords = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 const namedLike = (field, name, match = 'ending') => {
  const f = coreWords(field), n = coreWords(name);
  if (match === 'anywhere' && f.some((_, i) => n.every((w, j) => f[i + j] === w))) return true;
  return n.every((w, j) => f[f.length - n.length + j] === w) || coreNorm(field).endsWith(coreNorm(name));
 };
 const neverOnBus = eventsContract.neverInEnvelope.map(b => {
  if (!b.why?.trim()) throw new Error(`neverInEnvelope lists "${b.field}" without saying why. A refusal with no reasoning is the one somebody deletes.`);
  if (b.aliases !== undefined && (!Array.isArray(b.aliases) || b.aliases.some(a => typeof a !== 'string' || !a.trim()))) throw new Error(`neverInEnvelope gives "${b.field}" aliases that are not a list of names.`);
  if (b.match !== undefined && !['ending', 'anywhere'].includes(b.match)) throw new Error(`neverInEnvelope matches "${b.field}" by "${b.match}", which is neither ending nor anywhere.`);
  return { ...b, names: [b.field, ...(b.aliases ?? [])] };
 });
 const refusedField = field => {
  for (const b of neverOnBus) {
   const hit = b.names.find(n => namedLike(field, n, b.match));
   if (hit) return { ...b, hit };
  }
  return null;
 };
 for (const word of ['score', 'trustScore', 'scoreBand', 'points', 'rank', 'rating', 'weight', 'level', 'band', 'stars', 'grade', 'percentile']) {
  if (!refusedField(word)) throw new Error(`neverInEnvelope no longer refuses a field named ${word}. ${coreRefusal('a-score-never-leaves-verify').statement} ${coreRefusal('a-score-never-leaves-verify').why}`);
 }

 /* A word list is walked round by the next word — trustLevel and band passed the first one — so a
    field named for trust, a badge, a standing or a tier is held to something no synonym escapes:
    it is the badge tier, a string whose values packages/catalog/trust.json holds, or it is refused.
    An alert's tier is the escalation ladder's rung and is left alone, because it is about how urgent
    a concern is and not about anybody's standing; that exception is written in the contract. */
 const trustNames = eventsContract.trustNames;
 const badgeEnum = eventsContract.badgeEnum;
 if (!Array.isArray(trustNames?.words) || !['trust', 'badge', 'tier'].every(w => trustNames.words.includes(w)) || trustNames.only !== badgeEnum?.field || !trustNames.why?.trim()) throw new Error(`packages/catalog/events.json no longer holds trust-named fields to the badge enum. ${coreRefusal('a-trust-name-is-the-badge-or-nothing').why}`);
 const badgeValues = existsSync(badgeEnum.valuesFrom ?? '') ? (JSON.parse(read(badgeEnum.valuesFrom))[badgeEnum.path] ?? []).map(t => t.id).filter(Boolean) : [];
 if (badgeEnum.type !== 'string' || !badgeValues.length) throw new Error(`The badge enum in packages/catalog/events.json does not resolve to string tier ids in ${badgeEnum.valuesFrom}#${badgeEnum.path}. The badge's values live in the Trust contract; an enum that points nowhere is a string anybody can put a number in.`);
 const trustNamed = (e, field) => coreWords(field).some(w => trustNames.words.includes(w) && !(w === trustNames.except?.word && e.type.startsWith(trustNames.except.inTypesStartingWith)));

 const checkFields = (where, fields, { refuse = true } = {}) => {
  if (!Array.isArray(fields)) throw new Error(`${where} has no field list.`);
  const seen = new Set();
  for (const f of fields) {
   if (!f.field?.trim()) throw new Error(`${where} has a field with no name.`);
   if (seen.has(coreNorm(f.field))) throw new Error(`${where} declares "${f.field}" twice.`);
   seen.add(coreNorm(f.field));
   if (!coreFieldTypes.has(f.type)) throw new Error(`${where} gives "${f.field}" the type "${f.type}", which is not a field type in packages/catalog/feeds.json. One vocabulary of types, so a feed and an event cannot disagree about what an instant is.`);
   if (typeof f.required !== 'boolean') throw new Error(`${where} does not say whether "${f.field}" is required.`);
   if (!f.why?.trim()) throw new Error(`${where} declares "${f.field}" without saying why it is there.`);
   const refused = refuse && refusedField(f.field);
   if (refused) throw new Error(`${where} carries "${f.field}", which the bus refuses as "${refused.hit}": ${refused.why}`);
  }
 };

 /* 1. The envelope. Every event carries these, and the ones a subscriber cannot do without are named. */
 checkFields('The event envelope in packages/catalog/events.json', eventsContract.envelope);
 const envelopeNames = new Set(eventsContract.envelope.map(f => coreNorm(f.field)));
 for (const need of ['eventId', 'type', 'version', 'occurredAt', 'owner', 'actorRole', 'subjectRef', 'purposeOfUse', 'protocolVersion']) {
  if (!envelopeNames.has(coreNorm(need))) throw new Error(`The event envelope has lost "${need}". Every engine is being built against an envelope that carries it.`);
 }

 /* 2. Every event, from every source. A withdrawn version keeps the shape it was frozen with, defect
       included, so the shape refusals are not applied to it; every rule about being used is. */
 const byKey = new Map();
 const versionsByType = new Map();
 const measureNames = measures.map(m => coreNorm(m.id));
 const CLINICAL_ON_ALERT = /(value|reading|result|measure|metric|threshold|baseline|deviation|trend|score|finding|diagnos)/;
 for (const e of coreEvents) {
  const where = `The event ${e.type}@${e.version} in ${e.source}`;
  if (!/^[a-z]+(\.[a-z_]+)+$/.test(e.type ?? '')) throw new Error(`${e.source} declares an event type "${e.type}" that is not dotted lower-case words. Subscribers dispatch on the string, so there is one way to spell one.`);
  if (!Number.isInteger(e.version) || e.version < 1) throw new Error(`${where} has no whole-number version.`);
  const key = `${e.type}@${e.version}`;
  if (byKey.has(key)) throw new Error(`${e.type} at version ${e.version} is declared in both ${byKey.get(key).source} and ${e.source}. ${coreRefusal('one-type-one-version-one-entry').why}`);
  byKey.set(key, e);
  versionsByType.set(e.type, [...(versionsByType.get(e.type) ?? []), e.version]);
  if (!engineIds.has(e.owner)) throw new Error(`${where} is owned by "${e.owner}", which is not an engine in packages/catalog/events.json.`);
  if (!e.summary?.trim()) throw new Error(`${where} has no summary.`);
  const withdrawn = e.withdrawn !== undefined;
  checkFields(where, e.payload, { refuse: !withdrawn });
  if (!withdrawn) for (const f of e.payload) {
   if (trustNamed(e, f.field) && (f.field !== badgeEnum.field || f.type !== badgeEnum.type)) throw new Error(`${where} carries "${f.field}" as ${['integer', 'number'].includes(f.type) ? `a number (${f.type})` : f.type}. ${coreRefusal('a-trust-name-is-the-badge-or-nothing').statement} ${coreRefusal('a-trust-name-is-the-badge-or-nothing').why}`);
  }
  for (const f of e.payload) if (envelopeNames.has(coreNorm(f.field))) throw new Error(`${where} repeats the envelope's "${f.field}" in its payload. Two copies of one fact on one event disagree the first time a publisher fills in only one.`);
  if (!Array.isArray(e.neverCarries)) throw new Error(`${where} does not say what it never carries. The valuable part of an event contract is what it will not put on the bus.`);
  for (const n of e.neverCarries) {
   if (!n.field?.trim() || !n.why?.trim()) throw new Error(`${where} refuses a field without naming it or saying why.`);
   const carried = !withdrawn && e.payload.find(f => namedLike(f.field, n.field));
   if (carried) throw new Error(`${where} carries "${carried.field}" and says it never carries "${n.field}".`);
  }
  if (!Array.isArray(e.subscribers)) throw new Error(`${where} has no subscriber list.`);
  if (withdrawn) {
   const w = e.withdrawn;
   if (!/^\d{4}-\d{2}-\d{2}$/.test(w?.on ?? '') || !w.why?.trim() || !Array.isArray(w.formerSubscribers) || !/^[a-z_.]+@\d+$/.test(w.supersededBy ?? '')) throw new Error(`${where} is withdrawn without a day, a reason, the subscribers it had and the version that corrects it. ${coreRefusal('withdrawn-means-silent').why}`);
   if (e.subscribers.length) throw new Error(`${where} is withdrawn and still subscribed to by ${e.subscribers.join(', ')}. ${coreRefusal('withdrawn-means-silent').statement} ${coreRefusal('withdrawn-means-silent').why}`);
   continue;
  }
  if (!e.subscribers.length) throw new Error(`${where} has no subscribers. An event nobody reads is noise on a bus every engine has to filter.`);
  if (new Set(e.subscribers).size !== e.subscribers.length) throw new Error(`${where} lists a subscriber twice.`);
  for (const s of e.subscribers) if (!engineIds.has(s)) throw new Error(`${where} is subscribed to by "${s}", which is not an engine in packages/catalog/events.json.`);
  if (e.subscribers.includes(e.owner)) throw new Error(`${where} is subscribed to by its own owner, ${e.owner}. ${coreRefusal('no-subscribing-to-yourself').why}`);

  /* An alert points at the record; it never is the record. The rule follows what the event is —
     alert: true — and not what it is called, because sentinel.tier_raised carried a reading reference
     past it under another name; and every alert. type must say so, so a rename cannot slip one out. */
  if (e.alert !== undefined && e.alert !== true) throw new Error(`${where} has alert set to ${JSON.stringify(e.alert)}. An event is an alert or it is not: alert is true or absent.`);
  if (e.type.startsWith('alert.') && e.alert !== true) throw new Error(`${where} is an alert. type without alert: true. ${coreRefusal('an-alert-is-an-alert-by-role').statement} ${coreRefusal('an-alert-is-an-alert-by-role').why}`);
  if (e.alert === true) {
   for (const f of e.payload) {
    const n = coreNorm(f.field);
    if (f.type === 'number' || CLINICAL_ON_ALERT.test(n) || measureNames.some(m => n.includes(m))) {
     throw new Error(`${where} carries "${f.field}". ${coreRefusal('an-alert-points-at-the-record').statement} ${coreRefusal('an-alert-points-at-the-record').why}`);
    }
   }
  }
 }
 for (const [type, versions] of versionsByType) {
  const sorted = [...versions].sort((a, b) => a - b);
  if (sorted.some((v, i) => v !== i + 1)) throw new Error(`${type} is declared at versions ${sorted.join(', ')}. Versions start at one and a new one is the next number, so no subscriber is left looking for a version that was skipped.`);
 }
 /* The newest version of a type that has not been withdrawn — the one an engine is built against. */
 const live = type => [...byKey.values()].filter(e => e.type === type && !e.withdrawn).sort((a, b) => b.version - a.version)[0];
 /* A withdrawn version names the version that corrected it, and that one may itself be withdrawn
    later: passport.consent.granted@1 was corrected by @2 on the first review pass and @2 by @3 on the
    second. Pointing @1 straight at @3 would rewrite what the first withdrawal said, so the history is
    kept as written and the chain is followed instead — every link a later version of the same event,
    and the last link live. */
 for (const e of [...byKey.values()].filter(e => e.withdrawn)) {
  let from = e, next = byKey.get(e.withdrawn.supersededBy);
  const path = [`${e.type}@${e.version}`];
  while (true) {
   const renamed = from.withdrawn.renamed === true;
   if (from.withdrawn.renamed !== undefined && !renamed) throw new Error(`${from.type}@${from.version} has renamed set to ${JSON.stringify(from.withdrawn.renamed)}; a rename says renamed: true.`);
   if (!next || (renamed ? next.type === from.type || next.owner !== from.owner : next.type !== from.type || next.version <= from.version)) throw new Error(`${e.type}@${e.version} is withdrawn in favour of ${e.withdrawn.supersededBy}, and following its corrections — ${path.join(' → ')} → ${from.withdrawn.supersededBy} — does not lead through later versions of the same event, or a rename to a type the same engine owns, to a live one. ${coreRefusal('withdrawn-means-silent').statement}${renamed ? ` ${coreRefusal('a-rename-is-a-withdrawal').statement}` : ''}`);
   path.push(`${next.type}@${next.version}`);
   if (!next.withdrawn) break;
   from = next;
   next = byKey.get(next.withdrawn.supersededBy);
  }
 }
 const closed = live('alert.closed');
 if (!closed?.payload.some(f => f.field === 'outcomeRef' && f.required === true)) throw new Error(`alert.closed no longer requires outcomeRef. ${coreRefusal('an-alert-closes-on-an-outcome').why}`);
 for (const type of ['person.suspended', 'person.deactivated']) {
  if (!live(type)) throw new Error(`${type} has no live version, and Verify's events are part of the frozen contract.`);
  for (const e of [...byKey.values()].filter(x => x.type === type)) if (e.subscribers.includes('money')) throw new Error(`Money subscribes to ${type}@${e.version}. ${coreRefusal('a-suspension-never-reaches-money').why}`);
 }
 for (const need of ['appointment.requested', 'appointment.offered', 'appointment.booked', 'appointment.confirmed', 'appointment.en_route', 'appointment.in_progress', 'appointment.completed', 'appointment.no_show', 'appointment.cancelled', 'appointment.follow_up_required', 'person.trust_updated', 'passport.access.breakglass', 'passport.consent.granted', 'passport.consent.revoked', 'alert.raised', 'alert.escalated']) {
  if (!live(need)) throw new Error(`${need} has no live version. It is named by the Master document with an owner, and engines are being built to subscribe to it.`);
 }
 /* Nobody publishes or subscribes to a withdrawn version, and code is where either would happen: a
    type@version token; an object naming the type beside the version, held to one object so that a
    type on one line and the next event's version on the line below are not mistaken for each other
    (the first version of this check made exactly that mistake on the generated Swift); or a
    constructor taking the two in order. The contracts themselves and the lock are the record of the
    withdrawal and are the only places allowed to name it. */
 const withdrawnEvents = [...byKey.values()].filter(e => e.withdrawn);
 const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 const oneObject = '(?:(?!\\b(?:type|version)\\b)[^})]){0,160}?';
 const namingWithdrawn = withdrawnEvents.map(e => ({
  e,
  patterns: [
   new RegExp(`${escapeRe(e.type)}@${e.version}(?!\\d)`),
   new RegExp(`\\btype['"]?\\s*[:=]\\s*['"]${escapeRe(e.type)}['"]${oneObject}['"]?\\bversion['"]?\\s*[:=]\\s*${e.version}(?!\\d)`),
   new RegExp(`\\bversion['"]?\\s*[:=]\\s*${e.version}(?!\\d)${oneObject}['"]?\\btype['"]?\\s*[:=]\\s*['"]${escapeRe(e.type)}['"]`),
   new RegExp(`['"]${escapeRe(e.type)}['"]\\s*,\\s*${e.version}(?!\\d)`)
  ]
 }));
 const eventCode = [
  ...files('apps/web/src'), ...files('apps/api/src'), ...(existsSync('apps/passport') ? files('apps/passport').filter(f => !f.includes('node_modules')) : []),
  ...files('apps/ios/MyThuso'), ...files('apps/android/app/src/main'), ...files('packages/thusoiq'), ...files('packages/commerce'), ...files('tests'), ...files('scripts')
 ].filter(f => /\.(tsx?|mjs|js|swift|kt|json)$/.test(f) && f !== 'scripts/check-boundaries.mjs' && !eventsContract.sources.includes(f));
 for (const file of eventCode) {
  const source = read(file);
  for (const { e, patterns } of namingWithdrawn) {
   if (patterns.some(p => p.test(source))) throw new Error(`${file} names ${e.type}@${e.version}, which was withdrawn on ${e.withdrawn.on}: ${e.withdrawn.why} ${coreRefusal('withdrawn-means-silent').statement} Use ${e.withdrawn.supersededBy}.`);
  }
 }

 /* The first line against a withdrawn version is that the generated API cannot express one. Both
    files are held to the shape the generator promises: an EventKey only the generated file can make,
    no type constant without a version, nothing that takes a version as a parameter, and exactly one
    constant for every live type@version under the name the generator gives it. The pattern search
    above stays, for hand-written code that types a type and a version out itself. */
 const liveKeys = new Map([...byKey.values()].filter(e => !e.withdrawn).map(e => [`${e.type}@${e.version}`, e]));
 for (const [platform, file, keyPattern, nameOf, sealed, unsealed] of [
  ['Swift', 'apps/ios/MyThuso/Models/EventsData.swift', /static let (\w+) = EventKey\("([^"]+)", (\d+), "([^"]+)"\)/g, swiftKeyName,
   source => /struct EventKey\b/.test(source) && (source.match(/\binit\(/g) ?? []).length === 1 && /fileprivate init\(/.test(source),
   source => /static let \w+\s*=\s*"[a-z]+(\.[a-z_]+)+"/.test(source) || /func \w+\([^)]*\bversion\b/.test(source)],
  ['Kotlin', 'apps/android/app/src/main/java/za/co/mythuso/model/EventsData.kt', /val ([A-Z0-9_]+) = EventKey\("([^"]+)", (\d+), "([^"]+)"\)/g, kotlinKeyName,
   source => /\bclass EventKey private constructor\(/.test(source) && !/data class EventKey\b/.test(source) && !/fun copy\(/.test(source),
   source => /const val \w+\s*=\s*"[a-z]+(\.[a-z_]+)+"/.test(source) || /fun \w+\([^)]*\bversion\b/.test(source)]
 ]) {
  const source = read(file);
  if (!sealed(source)) throw new Error(`${file} lets an EventKey be made outside the generated file. ${coreRefusal('the-generated-api-names-live-versions-only').statement} ${coreRefusal('the-generated-api-names-live-versions-only').why}`);
  if (unsealed(source)) throw new Error(`${file} exposes an event type without its version, or something that takes a version as a parameter. ${coreRefusal('the-generated-api-names-live-versions-only').statement} ${coreRefusal('the-generated-api-names-live-versions-only').why}`);
  const emitted = [...source.matchAll(keyPattern)].map(([, name, type, version, owner]) => ({ name, type, version: Number(version), owner }));
  for (const k of emitted) {
   const e = liveKeys.get(`${k.type}@${k.version}`);
   if (!e) throw new Error(`${file} holds a ${platform} constant for ${k.type}@${k.version}, which is not a live version. ${coreRefusal('the-generated-api-names-live-versions-only').why}`);
   if (k.name !== nameOf(e) || k.owner !== e.owner) throw new Error(`${file} names ${k.type}@${k.version} "${k.name}" owned by ${k.owner}; the generator names it ${nameOf(e)}, owned by ${e.owner}.`);
  }
  const missing = [...liveKeys.keys()].filter(key => !emitted.some(k => `${k.type}@${k.version}` === key));
  if (missing.length) throw new Error(`${file} does not expose ${missing.join(', ')}. Every live version is one constant, or an app has to type it out by hand — which is how a withdrawn one gets typed.`);
 }

 /* 3. Frozen means frozen. The lock is every type@version ever published with the fingerprint of its
       type and shape; an event that disappears, changes version or changes shape fails here unless
       the lock line was changed in the same commit, where a reviewer can see it. Withdrawn versions
       keep their lines: withdrawal is how a frozen event stops being used, not how it stops being
       recorded. */
 const lockLines = read(eventsContract.lock).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
 const locked = new Map();
 for (const line of lockLines) {
  const [key, print] = line.split(/\s+/);
  if (locked.has(key)) throw new Error(`${eventsContract.lock} lists ${key} twice.`);
  locked.set(key, print);
 }
 const gone = [...locked.keys()].filter(key => !byKey.has(key));
 if (gone.length) throw new Error(`${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} frozen in ${eventsContract.lock} and no longer declared. ${coreRefusal('frozen-means-frozen').why} Restore the entry — withdraw it if it is wrong — and add the next version as a new one.`);
 const unlocked = [...byKey.values()].filter(e => !locked.has(`${e.type}@${e.version}`));
 if (unlocked.length) throw new Error(`${unlocked.length} declared ${unlocked.length === 1 ? 'event is' : 'events are'} not in ${eventsContract.lock}. A new event joins the frozen contract deliberately — append:\n${unlocked.map(e => `${e.type}@${e.version} ${eventFingerprint(e)}`).join('\n')}`);
 for (const [key, e] of byKey) {
  if (locked.get(key) !== eventFingerprint(e)) throw new Error(`${key} does not match its line in ${eventsContract.lock}: its type, owner, or a payload field's name, type or requiredness is not what was frozen. Put it back — withdraw it if it is wrong — and declare ${e.type}@${e.version + 1} as a new entry. ${coreRefusal('frozen-means-frozen').statement}`);
 }
 const sharedPrints = [...locked.entries()].filter(([, print], i, all) => all.findIndex(([, p]) => p === print) !== i);
 if (sharedPrints.length) throw new Error(`${eventsContract.lock} gives ${sharedPrints.map(([key]) => key).join(', ')} a fingerprint another line already has. A fingerprint that two events share cannot tell a subscriber which one it was built against.`);

 /* 4. Consent grants. The shape is fixed because the Passport gateway validates against it. */
 const grants = JSON.parse(read('packages/catalog/consent.json')).grants;
 if (!grants) throw new Error('packages/catalog/consent.json has no grants section, so nothing says who else may be let into a record, for what, or for how long.');
 const grantRefusal = id => {
  const r = grants.refusals.find(x => x.id === id);
  if (!r?.statement?.trim() || !r.why?.trim()) throw new Error(`packages/catalog/consent.json has lost the grant refusal "${id}", or its statement or its reasoning.`);
  return r;
 };
 checkFields('The consent grant shape in packages/catalog/consent.json', grants.shape);
 const shapeFields = grants.shape.map(f => f.field).join(',');
 if (shapeFields !== 'subject,recipientRole,scope,purpose,expiresAt,sealedIncluded') throw new Error(`The consent grant shape is now ${shapeFields}. The Passport gateway validates exactly subject, recipientRole, scope, purpose, expiresAt and sealedIncluded; a change here is a change to it.`);
 const shapeOf = field => grants.shape.find(f => f.field === field);
 if (shapeOf('expiresAt').required !== true) throw new Error(`A consent grant's expiresAt is no longer required. ${grantRefusal('every-grant-expires').statement}`);
 if (shapeOf('sealedIncluded').type !== 'boolean' || shapeOf('sealedIncluded').default !== false) throw new Error(`A consent grant no longer starts with sealedIncluded false. ${grantRefusal('sealed-needs-an-explicit-tick').statement}`);
 if (grants.revocation?.graceSeconds !== 0) throw new Error(`Grant revocation has a grace period of ${grants.revocation?.graceSeconds} seconds. ${grantRefusal('revocation-is-immediate').statement} ${grantRefusal('revocation-is-immediate').why}`);

 const roleIds = new Set();
 for (const role of grants.recipientRoles) {
  const where = `The grant role ${role.id} in packages/catalog/consent.json`;
  if (roleIds.has(role.id)) throw new Error(`${where} is declared twice.`);
  roleIds.add(role.id);
  if (!role.why?.trim()) throw new Error(`${where} does not say why it gets what it gets.`);
  if (!engineIds.has(role.engine)) throw new Error(`${where} is served by "${role.engine}", which is not an engine in packages/catalog/events.json.`);
  if (!Number.isInteger(role.defaultExpiryDays) || role.defaultExpiryDays < 1 || !(role.defaultExpiryDays <= grants.maximumExpiryDays)) throw new Error(`${where} has a default expiry of ${role.defaultExpiryDays} days. ${grantRefusal('every-grant-expires').statement} A default is a whole number of days from one to the contract-wide ceiling of ${grants.maximumExpiryDays}.`);
  if (role.sealed !== false) throw new Error(`${where} opens sealed categories by default. ${grantRefusal('sealed-needs-an-explicit-tick').statement}`);
  for (const id of role.defaultScope) {
   const record = coreRecordById.get(id);
   if (!record) throw new Error(`${where} scopes "${id}", which is not a record in packages/catalog/records.json. The gateway filters to record ids and would silently open nothing — or, worse, somebody would map it to something.`);
   if (record.sensitivity === 'protected') throw new Error(`${where} has ${id}, a sealed category, in its default scope. ${grantRefusal('sealed-needs-an-explicit-tick').why}`);
  }
  if (role.defaultPurpose !== null && !gatePurposes.has(role.defaultPurpose)) throw new Error(`${where} defaults to the purpose "${role.defaultPurpose}", which is not in the gate's Purpose union in apps/api/src/protection/contract.ts.`);
  if (/(^|-)(ops|operations|support|engineer|engineering|admin|operator)(-|$)/.test(role.id)) throw new Error(`${where} makes operations, support or engineering a grant recipient. ${grantRefusal('operations-and-engineering-receive-no-grant').why}`);
  if (/(scheme|insur|employ|advertis|funder|medical-aid)/.test(role.id)) {
   if (role.id !== 'scheme-aggregate' || role.identifiable !== false || role.defaultScope.length || role.defaultPurpose !== null) throw new Error(`${where} lets a payer, employer or advertiser into an identifiable record. ${grantRefusal('scheme-receives-aggregate-only').statement}`);
  } else if (role.identifiable !== true) throw new Error(`${where} is marked non-identifiable. Only the scheme's aggregate role is, and a second one is a place an identifiable grant can hide.`);
 }
 const scheme = grantRefusal('scheme-receives-aggregate-only').statement.toLowerCase();
 for (const word of ['scheme', 'insurer', 'employer', 'advertiser']) if (!scheme.includes(word)) throw new Error(`The grant refusal scheme-receives-aggregate-only no longer names ${word}s. The contract has to say in words that no such grant exists, not leave it to be inferred from a list.`);
 const roleById = id => {
  const role = grants.recipientRoles.find(r => r.id === id);
  if (!role) throw new Error(`packages/catalog/consent.json has lost the grant role ${id}, which Master section 21 names.`);
  return role;
 };
 for (const id of ['caregiver', 'next-of-kin', 'nurse-assigned', 'doctor-assigned', 'pharmacist', 'care-coordinator', 'responder-on-trip', 'scheme-aggregate']) roleById(id);
 const responder = roleById('responder-on-trip');
 if (responder.boundTo !== 'trip' || responder.defaultExpiryDays !== 1) throw new Error(`The responder's grant is bound to "${responder.boundTo}" for ${responder.defaultExpiryDays} days. ${grantRefusal('responder-grant-ends-with-the-trip').statement}`);
 /* A doctor reviewing a nurse's assessment reads what she read, and the full clinical record means
    every record in the patients and clinical areas that is not sealed — derived, not listed again. */
 const doctorScope = new Set(roleById('doctor-assigned').defaultScope);
 const unseen = [...roleById('nurse-assigned').defaultScope, ...coreRecords.filter(r => ['patients', 'clinical'].includes(r.area) && r.sensitivity !== 'protected').map(r => r.id)].filter(id => !doctorScope.has(id));
 if (unseen.length) throw new Error(`The assigned doctor's default scope is missing ${[...new Set(unseen)].join(', ')}. Master section 21 gives the doctor the full clinical record, and a doctor who cannot read what the nurse read is signing off an assessment half-blind.`);
 const clinicalForCoordinator = roleById('care-coordinator').defaultScope.filter(id => coreRecordById.get(id).sensitivity !== 'routine');
 if (clinicalForCoordinator.length) throw new Error(`The care coordinator's default scope includes ${clinicalForCoordinator.join(', ')}, which records.json marks as more than routine. Master section 21: tasks, appointments, summaries — not clinical detail.`);
 /* Grant news reaches the engines that serve an identifiable recipient, and no others. The rule used
    to be every engine serving any grant role, and the scheme's aggregate role is served by Money — so
    the engine facing the scheme was obliged to be told about one patient's grant. An engine that
    serves only non-identifiable roles is now held the other way: no passport.consent event, and no
    event carrying a field that describes a person's grant. */
 const identifiableEngines = new Set(grants.recipientRoles.filter(r => r.identifiable !== false).map(r => r.engine));
 const aggregateOnlyEngines = new Set(grants.recipientRoles.filter(r => r.identifiable === false).map(r => r.engine).filter(engine => !identifiableEngines.has(engine)));
 const schemeEngine = roleById('scheme-aggregate').engine;
 if (!aggregateOnlyEngines.has(schemeEngine)) throw new Error(`${schemeEngine} serves the scheme's aggregate role and an identifiable grant role as well. ${coreRefusal('no-grant-news-for-an-aggregate-engine').why} An engine facing the scheme that also serves somebody identifiable cannot be kept from grant news without starving the other role.`);
 const grantFieldNames = eventsContract.grantFields;
 if (!Array.isArray(grantFieldNames) || !['recipientRef', 'scope', 'sealedIncluded'].every(f => grantFieldNames.includes(f))) throw new Error(`packages/catalog/events.json no longer lists recipientRef, scope and sealedIncluded among grantFields, so nothing keeps them from an engine that serves only an aggregate role.`);
 /* Publishing an event is holding what it carries, so the owner is held to this as well as the
    subscribers: Money may not be told about a person's grant, and may not be the one telling. */
 for (const e of coreEvents.filter(x => !x.withdrawn)) {
  for (const [engine, how] of [[e.owner, 'is published by'], ...e.subscribers.map(s => [s, 'is subscribed to by'])].filter(([engine]) => aggregateOnlyEngines.has(engine))) {
   const carried = e.payload.filter(f => grantFieldNames.some(g => namedLike(f.field, g))).map(f => f.field);
   if (e.type.startsWith('passport.consent.') || carried.length) throw new Error(`${e.type}@${e.version} in ${e.source} ${how} ${engine}, which serves only a non-identifiable grant role, and ${carried.length ? `it carries ${carried.join(', ')}` : "it is about a person's grant"}. ${coreRefusal('no-grant-news-for-an-aggregate-engine').statement} ${coreRefusal('no-grant-news-for-an-aggregate-engine').why}`);
  }
 }
 /* A grant is news for the one engine serving its recipient's role. Any live event that carries a
    grant's recipient is routed by recipientRole, and the routing is held to consent.json in both
    directions: every identifiable role has its engine among the subscribers, so no grant goes
    undelivered, and every subscriber serves at least one identifiable role, so no engine is on the
    list only to hear grants that are never meant for it. Why this is a routing rule and not one event
    type per engine is written in events.json under _routingMeans. */
 const servingEngine = new Map(grants.recipientRoles.filter(r => r.identifiable !== false).map(r => [r.id, r.engine]));
 for (const e of coreEvents.filter(x => !x.withdrawn)) {
  const where = `${e.type}@${e.version} in ${e.source}`;
  const carriesRecipient = e.payload.some(f => ['recipientRole', 'recipientRef'].some(g => namedLike(f.field, g)));
  if (!carriesRecipient && !e.routing) continue;
  const r = e.routing;
  if (!r || r.by !== 'recipientRole' || r.from !== 'packages/catalog/consent.json' || !r.why?.trim()) throw new Error(`${where} carries a grant's recipient and is not routed by recipientRole from packages/catalog/consent.json, so every subscriber hears every grant. ${coreRefusal('a-grant-reaches-only-its-recipients-engine').statement} ${coreRefusal('a-grant-reaches-only-its-recipients-engine').why}`);
  const key = e.payload.find(f => f.field === r.by);
  if (!key || key.type !== 'string' || key.required !== true) throw new Error(`${where} is routed by ${r.by}, which it does not carry as a required string. A grant with no role on it cannot be delivered to the engine serving that role, and the bus's only other choice is everybody.`);
  const unrouted = [...servingEngine].filter(([, engine]) => engine !== e.owner && !e.subscribers.includes(engine));
  if (unrouted.length) throw new Error(`${where} has no route for ${unrouted.map(([role, engine]) => `${role} (served by ${engine})`).join(', ')}. ${e.type === grants.revocation.event ? grantRefusal('revocation-is-immediate').why : 'An engine that is never told about a grant to a role it serves has to be told some other way, and that other way is a direct call the bus exists to prevent.'}`);
  const strangers = e.subscribers.filter(s => ![...servingEngine.values()].includes(s));
  if (strangers.length) throw new Error(`${where} is subscribed to by ${strangers.join(', ')}, which ${strangers.length === 1 ? 'serves' : 'serve'} no identifiable grant role, so no grant is routed to ${strangers.length === 1 ? 'it' : 'them'}. ${coreRefusal('a-grant-reaches-only-its-recipients-engine').statement}`);
 }
 for (const type of [grants.revocation.event, 'passport.consent.granted']) {
  const e = live(type);
  if (!e) throw new Error(`${type} has no live version in packages/catalog/events.json, so nothing tells an engine that a grant has ${type.endsWith('revoked') ? 'ended' : 'begun'}.`);
  if (!e.routing) throw new Error(`${type}@${e.version} is not routed. ${coreRefusal('a-grant-reaches-only-its-recipients-engine').statement}`);
  /* What a grant opens is the gateway's filter. Announcing it tells every subscriber what this patient
     has let somebody see, and whether something sealed is among it. */
  for (const field of ['scope', 'sealedIncluded']) {
   const carried = e.payload.find(f => namedLike(f.field, field));
   if (carried) throw new Error(`${type}@${e.version} carries "${carried.field}". Which records a grant opens, and whether a sealed category is among them, is the Passport gateway's to know: an engine asks and is answered. ${grantRefusal('sealed-needs-an-explicit-tick').why}`);
  }
 }
 const grantEvent = live('passport.consent.granted');
 for (const f of grants.shape.filter(f => ['recipientRole', 'purpose', 'expiresAt'].includes(f.field))) {
  const carried = grantEvent.payload.find(p => p.field === f.field);
  if (!carried || carried.type !== f.type) throw new Error(`passport.consent.granted@${grantEvent.version} does not carry the grant's ${f.field} as ${f.type}. Who was let in, for what and until when is what the engines serving the recipient need to know.`);
 }

 /* 5. The protocol registry. Names and numbers, and nothing that could be mistaken for a protocol. */
 const protocolContract = JSON.parse(read('packages/catalog/protocols.json'));
 const protocolRefusal = id => {
  const r = protocolContract.refusals.find(x => x.id === id);
  if (!r?.statement?.trim() || !r.why?.trim()) throw new Error(`packages/catalog/protocols.json has lost the refusal "${id}", or its statement or its reasoning.`);
  return r;
 };
 const protocolStatuses = new Set(protocolContract.statuses.map(s => s.id));
 if ([...protocolStatuses].sort().join() !== 'draft,ratified,retired') throw new Error('packages/catalog/protocols.json has statuses other than draft, ratified and retired.');
 const PROTOCOL_KEYS = 'contentRef,engine,id,name,ratifiedBy,ratifiedOn,status,supersedes,version';
 const registered = new Set();
 for (const p of protocolContract.protocols) {
  const where = `The protocol ${p.id}@${p.version} in packages/catalog/protocols.json`;
  if (Object.keys(p).sort().join() !== PROTOCOL_KEYS) throw new Error(`${where} has the fields ${Object.keys(p).sort().join(', ')}. A registry entry holds ${PROTOCOL_KEYS.split(',').join(', ')} and nothing else — a threshold or a dose in the registry is clinical content that no board ratified.`);
  if (!/^[a-z]+(-[a-z]+)*$/.test(p.id)) throw new Error(`${where} has an id that is not lower-case words joined by hyphens.`);
  if (!Number.isInteger(p.version) || p.version < 1) throw new Error(`${where} has no whole-number version.`);
  if (registered.has(`${p.id}@${p.version}`)) throw new Error(`${where} is registered twice.`);
  registered.add(`${p.id}@${p.version}`);
  if (!engineIds.has(p.engine)) throw new Error(`${where} belongs to "${p.engine}", which is not an engine in packages/catalog/events.json.`);
  if (!protocolStatuses.has(p.status)) throw new Error(`${where} has the status "${p.status}".`);
  if (p.status === 'ratified') {
   if (!p.ratifiedBy?.role?.trim() || !p.ratifiedBy?.name?.trim() || !Number.isInteger(p.ratifiedOn) || p.ratifiedOn > 0) throw new Error(`${where} is ratified without a named role, a named person and a day that has happened. ${protocolRefusal('no-ratification-without-a-signature').why}`);
  }
  if (p.status === 'draft') {
   if (p.ratifiedBy !== null || p.ratifiedOn !== null) throw new Error(`${where} is a draft that says who ratified it. ${protocolRefusal('no-ratification-without-a-signature').statement}`);
   if (p.contentRef !== null) throw new Error(`${where} is a draft with content. ${protocolRefusal('a-draft-carries-nothing').why}`);
   for (const [key, value] of Object.entries(p)) {
    if (['version', 'supersedes'].includes(key)) continue;
    if (typeof value === 'number' || /\d/.test(JSON.stringify(value))) throw new Error(`${where} carries a number in ${key}. ${protocolRefusal('a-draft-carries-nothing').statement} ${protocolRefusal('a-draft-carries-nothing').why}`);
   }
  }
 }
 for (const p of protocolContract.protocols) {
  if (p.supersedes === null) { if (p.version !== 1) throw new Error(`packages/catalog/protocols.json registers ${p.id}@${p.version} without saying which version it supersedes. ${protocolRefusal('a-new-version-is-a-new-row').statement}`); continue; }
  const [id, v] = String(p.supersedes).split('@');
  if (id !== p.id || Number(v) !== p.version - 1 || !registered.has(p.supersedes)) throw new Error(`${p.id}@${p.version} supersedes "${p.supersedes}", which is not the previous registered version of the same protocol. ${protocolRefusal('a-new-version-is-a-new-row').why}`);
 }
 const blueprintProtocols = 12;
 const protocolIds = new Set(protocolContract.protocols.map(p => p.id));
 if (protocolIds.size !== blueprintProtocols) throw new Error(`packages/catalog/protocols.json registers ${protocolIds.size} protocols. The Master Blueprint Part F names twelve launch protocols; one added or lost here is a launch scope nobody agreed.`);

 /* Nothing outside the registry invents a version. A reference is an id@number token: any whose id is
    a registered protocol, and any on a line that says "protocol" — so a new protocol cannot be cited
    before it is registered just because its id is new. */
 const protocolReference = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)@(\d+)\b/g;
 const citing = [
  ...files('apps/web/src'), ...files('apps/api/src'), ...files('apps/ios/MyThuso'), ...files('apps/android/app/src/main'),
  ...files('packages/catalog'), ...files('packages/thusoiq'), ...files('packages/commerce'), ...files('scripts'), ...files('tests'), ...files('docs')
 ].filter(f => /\.(tsx?|mjs|json|swift|kt|md|lock)$/.test(f) && f !== 'packages/catalog/protocols.json');
 for (const file of citing) {
  for (const line of read(file).split('\n')) {
   for (const [token, id, v] of line.matchAll(protocolReference)) {
    if (!protocolIds.has(id) && !/protocol/i.test(line)) continue;
    if (!registered.has(`${id}@${v}`)) throw new Error(`${file} cites the protocol version ${token}, which packages/catalog/protocols.json does not register. ${protocolRefusal('no-version-outside-the-register').why}`);
   }
  }
 }

 console.log(`ThusoIQ Core's event contract is frozen at version ${eventsContract.version}, and the build refuses one that says otherwise: ${coreEvents.length} events from ${eventsContract.sources.length - skippedSources.length} of ${eventsContract.sources.length} source files, owned by ${new Set(coreEvents.map(e => e.owner)).size} of ${engineIds.size} engines, every one of them in ${eventsContract.lock} under a fingerprint of its type and shape that no other line shares. ${withdrawnEvents.length} withdrawn versions keep their lines, have no subscribers and are named by none of ${eventCode.length} code files. None of the live events carries a field whose words name any of the ${neverOnBus.reduce((n, b) => n + b.names.length, 0)} things the bus refuses — a score, points, a rank, a level, a band and a weight among them — or names trust, a badge, a standing or a tier outside the escalation ladder as anything but the badge tier, a string; both apps hold one sealed constant per live version and nothing that takes a version; no engine listens to itself, no alert carries a reading, no alert closes without an outcome, and Money is never told a person was suspended. Each grant is routed by its recipient's role to the one engine of ${identifiableEngines.size} that serves it, carries no scope and no sealed flag, and never reaches ${[...aggregateOnlyEngines].join(', ')}, which serves only the scheme's aggregate role. ${grants.recipientRoles.length} consent grant roles, each one expiring within a year, none opening a sealed category by default, a responder's ending with the trip, and revocation with no grace. ${protocolContract.protocols.length} protocols registered, ${protocolContract.protocols.filter(p => p.status === 'ratified').length} ratified, and not a number in any draft; ${citing.length} files read to make sure none of them cites a version the registry does not hold.`);
}
/* ==== end of Contracts & Core (Wave 1) ============================================================ */
/* ==== Contracts & Core (Wave 2): the engine API contracts ==========================================

   Added by the Contracts & Core lead for packages/catalog/apis.json, the twelve engine files under
   packages/catalog/apis/, packages/catalog/apis.lock and packages/mock-api. Self-contained, and kept
   apart from the Gilbert section below it so the branches merge cleanly.

   The Full Scope's Core acceptance test is a role and scope matrix enforced on every API. What this
   block enforces is that the matrix exists, route by route, before any engine is built past it: every
   route names its callers and purposes, refuses something, says what it emits, keeps to its own
   engine's store, carries clinical content only through the Passport gateway, keys its money and
   dispatch writes, lets no supplier call it, carries nothing the bus already refuses, is built only
   where a handler exists, cites only sections a reader can open, and is frozen by the lock. The mock
   that answers these routes is held to loopback, a flag and a deploy tree that never names it. */
{
 const apiContract = JSON.parse(read('packages/catalog/apis.json'));
 const apiRefusal = id => {
  const r = apiContract.refusals.find(x => x.id === id);
  if (!r?.statement?.trim() || !r.why?.trim()) throw new Error(`packages/catalog/apis.json has lost the refusal "${id}", or its statement or its reasoning.`);
  return r;
 };
 const fail = (id, detail) => { throw new Error(`${detail} ${apiRefusal(id).statement} ${apiRefusal(id).why}`); };
 if (apiContract.frozen !== true) fail('api-freezing-cannot-be-switched-off', `packages/catalog/apis.json says frozen is ${JSON.stringify(apiContract.frozen)}.`);
 if (apiContract.decidedBy !== 'Programme (founder delegated)' || apiContract.awaiting !== 'Head of Engineering') throw new Error('packages/catalog/apis.json no longer records that its conventions are the programme\'s delegated decision, awaiting a Head of Engineering. A provisional decision that stops saying so has quietly become a final one.');

 const { contract: apiEventsContract, events: apiEvents } = collectEvents();
 const { engines: apiEngines, routes: apiRoutes } = loadApis();
 const engineIds = apiEventsContract.engines.map(e => e.id);

 /* One file per engine, named for it, and no file the contract does not list. */
 const expectedFiles = engineIds.map(id => `packages/catalog/apis/${id}.json`).sort();
 if (JSON.stringify([...apiContract.engineFiles].sort()) !== JSON.stringify(expectedFiles)) throw new Error(`packages/catalog/apis.json lists ${apiContract.engineFiles.length} engine files; there is exactly one per engine in packages/catalog/events.json, named for it.`);
 for (const { file, doc } of apiEngines) if (file !== `packages/catalog/apis/${doc.engine}.json`) throw new Error(`${file} says it is the ${doc.engine} engine's contract.`);
 for (const name of readdirSync('packages/catalog/apis')) if (!apiContract.engineFiles.includes(`packages/catalog/apis/${name}`)) throw new Error(`packages/catalog/apis/${name} is not listed in packages/catalog/apis.json, so nothing checks it and nothing generates from it.`);

 /* The vocabularies a route is written in, each read from where it lives. */
 const apiFieldTypes = new Set(JSON.parse(read('packages/catalog/feeds.json')).fieldTypes.map(t => t.id));
 const apiPurposes = new Set([...((read('apps/api/src/protection/contract.ts').match(/export type Purpose =([^;]+);/) ?? [])[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]));
 if (!apiPurposes.size) throw new Error('scripts/check-boundaries.mjs can no longer read the gate\'s Purpose union, so no route\'s purpose is checked.');
 const vettingRoleIds = JSON.parse(read('packages/catalog/vetting.json')).roles.map(r => r.id);
 const grantRoleIds = JSON.parse(read('packages/catalog/consent.json')).grants.recipientRoles.map(r => r.id);
 for (const c of apiContract.callers) {
  if (vettingRoleIds.includes(c.id) || grantRoleIds.includes(c.id)) throw new Error(`packages/catalog/apis.json defines the caller "${c.id}", which already exists as a vetting or grant role. A role is defined in one place.`);
  if (!c.why?.trim()) throw new Error(`packages/catalog/apis.json defines the caller "${c.id}" without saying why it exists.`);
 }
 const apiCallers = new Set([...vettingRoleIds, ...grantRoleIds, ...JSON.parse(read('packages/catalog/passport-gateway.json')).breakGlass.roles, ...apiContract.callers.map(c => c.id)]);
 const supplierIds = new Set(apiContract.supplierCallers.map(s => s.id));
 for (const id of supplierIds) if (apiCallers.has(id)) throw new Error(`"${id}" is both a caller and a supplier. A supplier is never a caller.`);
 const sectionIds = new Set(apiContract.documentSections.map(s => s.id));
 const sharedIds = new Set(apiContract.sharedRefusals.map(r => r.id));
 const feedIds = JSON.parse(read('packages/catalog/feeds.json')).feeds.map(f => f.id);
 const liveEventVersions = new Map(apiEvents.filter(e => !e.withdrawn).map(e => [`${e.type}@${e.version}`, e]));
 const anyEventVersions = new Map(apiEvents.map(e => [`${e.type}@${e.version}`, e]));
 const gateways = new Map(apiContract.gateways.map(g => [g.id, g]));

 /* Built routes: who a handler actually lets in, worked out from the contracts it enforces rather than
    written down. The third review found twelve routes whose written callers their handlers did not
    enforce — admin-only routes said to be an operator's, Passport routes narrower than the gateway. */
 const vettingForApis = JSON.parse(read('packages/catalog/vetting.json'));
 const grantRolesForApis = JSON.parse(read('packages/catalog/consent.json')).grants.recipientRoles;
 const credentialRoles = JSON.parse(read('packages/catalog/passport-gateway.json')).breakGlass.roles;
 const mechanisms = new Map(apiContract.enforcementMechanisms.map(m => [m.id, m]));
 const withCapability = cap => vettingForApis.roles.filter(role => role.grants.some(g => g.capability === cap)).map(role => role.id);
 const deriveCallers = (e, r) => {
  switch (e.mechanism) {
   case 'anonymous': return ['anonymous'];
   case 'identity-session': case 'vetting-register-self': return ['self'];
   case 'vetting-register': return vettingForApis.roles.map(role => role.id);
   case 'vetting-capability': return withCapability(e.capability);
   case 'vetting-capability-or-self': return [...withCapability(e.capability), 'self'];
   case 'vetting-capability-or-reporter': return [...withCapability(e.capability), 'incident-reporter'];
   case 'loopback': return ['loopback'];
   case 'passport-patient-session': return ['patient'];
   case 'passport-grant': return [...(e.patientToo ? ['patient'] : []), ...grantRolesForApis.filter(role => role.gateway.reads !== 'aggregate' && (e.grantWrites ? role.gateway.writes === true && role.gateway.reads !== 'emergency-summary' : (e.grantReads ?? []).includes(role.gateway.reads))).map(role => role.id)];
   case 'operator-credential': return [...credentialRoles];
   case 'supplier-callback': return r.legacyCallback && e.supplier ? [e.supplier] : [];
   case 'development-token': return ['developer'];
   /* The engine runtime's binder reads a route's callers from this contract and admits them before the
      handler runs, except the callers it cannot tell apart from anybody — which the contract lists. */
   case 'engines-runtime:callers': return r.callers.filter(c => c.startsWith('engine:') ? engineIds.includes(c.slice('engine:'.length)) : apiCallers.has(c) && !apiContract.engineRuntime.binderCannotAdmit.includes(c));
   default: return [];
  }
 };
 /* The handler as written: an identity-service route runs to the next routes.set, a Passport form to the
    next top-level branch. The mechanism has to be visible in it. */
 const handlerBlock = r => {
  if (!r.evidence?.file || !existsSync(r.evidence.file)) return '';
  const source = read(r.evidence.file);
  const at = source.indexOf(r.evidence.handler);
  if (at < 0) return '';
  const rest = source.slice(at + r.evidence.handler.length);
  const next = r.evidence.file === 'apps/api/src/server.ts' ? rest.search(/routes\.set\(/) : rest.search(/\n  (if \(|return refuse\(res, 404)/);
  return r.evidence.handler + (next < 0 ? rest : rest.slice(0, next));
 };
 const contractIds = new Map(apiContract.contractIds.map(c => {
  if (!existsSync(c.contract)) throw new Error(`packages/catalog/apis.json declares ${c.field} as an entry in ${c.contract}, which does not exist.`);
  return [c.field, c.contract];
 }));
 const missingEnforcement = [];
 const quoteChecks = [];
 const records = JSON.parse(read('packages/catalog/records.json'));

 /* Words, as the event contract matches them: by ending for names, anywhere for the score family. */
 const apiWords = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 const containsWords = (field, name) => { const f = apiWords(field), n = apiWords(name); return f.some((_, i) => n.every((w, j) => f[i + j] === w)); };
 const endsWords = (field, name) => { const f = apiWords(field), n = apiWords(name); return n.length <= f.length && n.every((w, j) => f[f.length - n.length + j] === w); };
 const apiNorm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
 const neverEntries = apiContract.neverCrossesAnApi.fromEventNeverList.map(name => {
  const entry = apiEventsContract.neverInEnvelope.find(b => b.field === name);
  if (!entry) throw new Error(`packages/catalog/apis.json refuses "${name}" by pointing at the event never-list, which no longer has it.`);
  return entry;
 });
 const neverHit = field => {
  for (const entry of neverEntries) for (const name of [entry.field, ...(entry.aliases ?? [])]) {
   if (entry.match === 'anywhere' ? containsWords(field, name) : (endsWords(field, name) || apiNorm(field).endsWith(apiNorm(name)))) return name;
  }
  return null;
 };
 const trustRule = apiContract.neverCrossesAnApi.trustNames;
 if (!Array.isArray(trustRule.words) || !["trust", "badge", "tier"].every(w => trustRule.words.includes(w))) throw new Error("packages/catalog/apis.json no longer lists trust, badge and tier as the trust words an API field is held to.");
 const trustWords = trustRule.words;
 const sealedNames = [...records.sensitivity.find(s => s.id === 'protected').categories, ...records.records.filter(r => r.sensitivity === 'protected').map(r => r.id)];
 const clinicalNames = [...apiContract.clinicalContent.words, ...records.observations.measures.map(m => m.id),
  ...records.records.filter(r => ['clinical', 'protected'].includes(r.sensitivity) && ['patients', 'clinical'].includes(r.area)).map(r => r.id)];
 const storeReference = field => apiContract.conventions.references.storeSuffixes.some(s => field.endsWith(s));
 const anyReference = field => [...apiContract.conventions.references.storeSuffixes, ...apiContract.conventions.references.contractSuffixes].some(s => field.endsWith(s));

 /* Resources and doors, each owned by exactly one engine. */
 const resourceOwner = new Map();
 const doorOwner = new Map();
 for (const { file, doc } of apiEngines) {
  for (const resource of doc.resources) {
   if (resourceOwner.has(resource)) throw new Error(`The resource "${resource}" is claimed by both ${resourceOwner.get(resource)} and ${doc.engine}. One store has one owner.`);
   resourceOwner.set(resource, doc.engine);
  }
  for (const r of doc.refusals) if (!r.id || !Number.isInteger(r.status) || !r.statement?.trim() || !r.why?.trim()) throw new Error(`${file} declares an engine refusal without an id, a status, a statement or a reason.`);
  if (!doc.refusals.length) fail('every-route-refuses-something', `${file} declares no engine-level refusal from its card.`);
  for (const door of doc.doors) {
   if (!feedIds.includes(door)) throw new Error(`${file} links the door "${door}", which packages/catalog/feeds.json does not have.`);
   if (doorOwner.has(door)) throw new Error(`The door "${door}" is linked by both ${doorOwner.get(door)} and ${doc.engine}.`);
   doorOwner.set(door, doc.engine);
  }
  for (const d of doc.doorsToAdd) {
   if (!d.id || !d.why?.trim()) throw new Error(`${file} lists a door to add without an id or a reason.`);
   if (feedIds.includes(d.id)) throw new Error(`${file} lists "${d.id}" as a door to add, and it already exists in packages/catalog/feeds.json. Link it.`);
   if (d.namedInDocuments !== undefined) throw new Error(`${file} still uses namedInDocuments on the door "${d.id}". A door names the capability it serves with capabilityNamed.`);
   if (d.capabilityNamed !== null && (!sectionIds.has(d.capabilityNamed?.section) || !d.capabilityNamed?.what?.trim() || d.capabilityNamed.what.length > 90)) fail('named-means-a-section-exists', `${file} says the door "${d.id}" serves ${JSON.stringify(d.capabilityNamed)}.`);
   if (d.capabilityNamed) quoteChecks.push({ where: `${file}, the door ${d.id},`, named: d.capabilityNamed });
  }
  if (!doc.routes.length && !doc.noRoutesBecause?.trim()) throw new Error(`${file} has no routes and does not say why.`);
  for (const own of doc.ownIds ?? []) if (!/Ids?$/.test(own.field ?? '') || !own.why?.trim() || contractIds.has(own.field)) throw new Error(`${file} declares the identifier ${JSON.stringify(own)} as its own without a name ending Id, without a reason, or when it is really a contract entry.`);
 }
 for (const id of feedIds) if (!doorOwner.has(id)) fail('suppliers-arrive-through-doors', `The door "${id}" in packages/catalog/feeds.json is linked to no engine's API contract.`);
 const resourceOf = stem => resourceOwner.get(stem) ?? resourceOwner.get(`${stem}s`) ?? resourceOwner.get(`${stem}es`);

 /* Every route. */
 const pattern = /^\/v1\/([a-z]+)\/([a-z][a-z0-9-]*)(?:\/\{([A-Za-z][A-Za-z0-9]*)\}(?:\/([a-z][a-z0-9-]*))?)?$/;
 const seenKeys = new Set();
 const idem = apiContract.conventions.idempotency;
 const passportPaths = apiContract.conventions.passportPaths;
 let builtCount = 0, endpointCount = 0, capabilityCount = 0;
 for (const r of apiRoutes) {
  const doc = apiEngines.find(x => x.file === r.file).doc;
  const where = `${r.method} ${r.path}@${r.version} in ${r.file}`;
  const key = routeKey(r);
  if (seenKeys.has(key)) throw new Error(`${where} is declared twice.`);
  seenKeys.add(key);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method)) throw new Error(`${where} has the method "${r.method}".`);
  if (!Number.isInteger(r.version) || r.version < 1) throw new Error(`${where} has no whole-number version.`);
  if (!r.summary?.trim()) throw new Error(`${where} has no summary.`);
  if (r.withdrawn) {
   if (!/^\d{4}-\d{2}-\d{2}$/.test(r.withdrawn.on ?? '') || !r.withdrawn.why?.trim() || !r.withdrawn.supersededBy) throw new Error(`${where} is withdrawn without a day, a reason and its correction.`);
   if (r.callers.length) fail('api-frozen-means-frozen', `${where} is withdrawn and still names callers.`);
   continue;
  }

  const m = r.path.match(pattern);
  let resource;
  if (m) {
   if (m[1] !== doc.engine) fail('no-engine-reads-another-engines-store', `${where} is a route under /v1/${m[1]} in the ${doc.engine} engine's file.`);
   resource = m[2];
  } else if (doc.engine === passportPaths.engine && passportPaths.paths.includes(r.path)) {
   resource = r.path.split('/')[1];
  } else throw new Error(`${where} does not follow ${apiContract.conventions.pathPattern}${doc.engine === 'record' ? ', and is not one of the §26 Passport paths' : ''}. ${apiContract.conventions.why}`);
  if (!doc.resources.includes(resource)) fail('no-engine-reads-another-engines-store', `${where} names the resource "${resource}", which ${r.file} does not declare as its own.`);
  for (const [, param] of r.path.matchAll(/\{([^}]+)\}/g)) {
   if (!r.request.some(f => f.field === param && f.type === 'string' && f.required === true)) throw new Error(`${where} has the path parameter {${param}} and no required string request field of that name, so a client cannot build the path from the request.`);
  }

  if (!Array.isArray(r.callers) || !r.callers.length || !Array.isArray(r.purpose) || !r.purpose.length) fail('every-route-names-its-scope', `${where} names ${r.callers?.length ?? 0} callers and ${r.purpose?.length ?? 0} purposes.`);
  for (const caller of r.callers) {
   if ((doc.forbiddenCallers ?? []).includes(caller)) throw new Error(`${where} takes calls from "${caller}", which ${r.file} forbids.`);
   if (caller === 'engine') fail('engine-callers-are-named', `${where} takes calls from any engine.`);
   const engineCaller = caller.match(/^engine:([a-z]+)$/);
   if (engineCaller) {
    if (!engineIds.includes(engineCaller[1])) fail('engine-callers-are-named', `${where} names the caller "${caller}", and there is no such engine.`);
    const because = r.callerJustifications?.[caller];
    const justifying = liveEventVersions.get(because ?? '');
    if (!justifying || (justifying.owner !== engineCaller[1] && !justifying.subscribers.includes(engineCaller[1]))) fail('engine-callers-are-named', `${where} takes calls from ${caller}, justified by ${JSON.stringify(because ?? null)}, which is not a live event that engine owns or hears.`);
    continue;
   }
   if (supplierIds.has(caller)) {
    const door = r.legacyCallback?.door;
    if (r.status !== 'built' || !door || !r.legacyCallback.why?.trim() || !doc.doorsToAdd.some(d => d.id === door)) fail('suppliers-arrive-through-doors', `${where} is called by the supplier "${caller}".`);
   } else if (!apiCallers.has(caller)) fail('every-route-names-its-scope', `${where} names the caller "${caller}", which is not a vetting role, a grant role, a Passport credential role or a caller in packages/catalog/apis.json.`);
  }
  for (const justified of Object.keys(r.callerJustifications ?? {})) if (!r.callers.includes(justified)) throw new Error(`${where} justifies ${justified}, which is not one of its callers.`);
  for (const p of r.purpose) if (!apiPurposes.has(p)) fail('every-route-names-its-scope', `${where} serves the purpose "${p}", which is not in the gate's Purpose union.`);

  for (const [side, list] of [['request', r.request], ['response', r.response]]) {
   if (!Array.isArray(list)) throw new Error(`${where} has no ${side} field list.`);
   const names = new Set();
   for (const f of list) {
    if (!f.field?.trim() || names.has(f.field)) throw new Error(`${where} has a ${side} field with no name, or "${f.field}" twice.`);
    names.add(f.field);
    if (!apiFieldTypes.has(f.type) || typeof f.required !== 'boolean' || !f.why?.trim()) throw new Error(`${where} declares the ${side} field "${f.field}" without a type from packages/catalog/feeds.json, a requiredness or a reason.`);
    if (f.object !== undefined && (f.object !== true || !apiContract.objectFields.allowedTypes.includes(f.type))) throw new Error(`${where} marks "${f.field}" as an object with the type ${f.type}. ${apiContract.objectFields.why}`);
    const refused = neverHit(f.field);
    if (refused) fail('nothing-identifying-or-sealed-crosses-an-api', `${where} carries the ${side} field "${f.field}", refused as "${refused}".`);
    const trustNamed = apiWords(f.field).some(w => trustWords.includes(w));
    if (trustNamed && (['integer', 'number'].includes(f.type) || (doc.engine !== trustRule.outsideEngine && (f.field !== trustRule.only || f.type !== 'string')))) fail('nothing-identifying-or-sealed-crosses-an-api', `${where} carries the trust-named ${side} field "${f.field}" as ${f.type}. ${trustRule.why}`);
    const sealed = sealedNames.find(name => containsWords(f.field, name));
    if (sealed) fail('nothing-identifying-or-sealed-crosses-an-api', `${where} carries the ${side} field "${f.field}", named for the sealed category "${sealed}".`);
    if (doc.engine !== 'record' && (r.through !== apiContract.clinicalContent.onlyThrough || apiContract.clinicalContent.alwaysForEngines.includes(doc.engine)) && !anyReference(f.field)) {
     const clinical = clinicalNames.find(name => containsWords(f.field, name));
     if (clinical) fail('clinical-content-only-through-the-record', `${where} carries the ${side} field "${f.field}" ("${clinical}") without going through the Passport gateway.`);
    }
    if (storeReference(f.field)) {
     const owner = resourceOf(apiWords(f.field.replace(/(Refs|Ref)$/, '')).join('-'));
     if (owner && owner !== doc.engine && !r.through) fail('no-engine-reads-another-engines-store', `${where} carries "${f.field}", a reference into the ${owner} engine's store.`);
    }
    if (/Ids?$/.test(f.field) && !contractIds.has(f.field) && !(doc.ownIds ?? []).some(own => own.field === f.field)) fail('references-are-declared', `${where} carries "${f.field}", which is neither an entry in a contract listed in contractIds nor an identifier ${r.file} declares as its own.`);
   }
  }

  if (!Array.isArray(r.refusals) || !r.refusals.length) fail('every-route-refuses-something', `${where} declares no refusal.`);
  const refusalIds = new Set();
  for (const x of r.refusals) {
   if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.id ?? '') || refusalIds.has(x.id) || !Number.isInteger(x.status) || x.status < 400 || x.status > 599 || !x.statement?.trim() || !x.why?.trim()) fail('every-route-refuses-something', `${where} declares the refusal "${x.id}" without a unique id, a 4xx or 5xx status, a statement or a reason.`);
   if (sharedIds.has(x.id)) throw new Error(`${where} redeclares the shared refusal "${x.id}". Every route inherits it already, and two definitions of one refusal can disagree.`);
   refusalIds.add(x.id);
  }

  if (!Array.isArray(r.emits)) fail('every-route-says-what-it-emits', `${where} has no emits list.`);
  for (const ev of r.emits) {
   const e = liveEventVersions.get(ev);
   if (!e) fail('every-route-says-what-it-emits', `${where} emits ${ev}, which is ${anyEventVersions.has(ev) ? 'withdrawn' : 'not declared'} in the event contract.`);
   if (e.owner !== doc.engine) fail('every-route-says-what-it-emits', `${where} emits ${ev}, which the ${e.owner} engine owns.`);
  }
  if (!r.emits.length && !r.emitsNoneBecause?.trim()) fail('every-route-says-what-it-emits', `${where} emits nothing and does not say why.`);

  if (typeof r.idempotent !== 'boolean') throw new Error(`${where} does not say whether it is idempotent.`);
  if (r.reads !== undefined && (r.reads !== true || r.emits.length)) throw new Error(`${where} says it reads${r.emits.length ? ' and emits ' + r.emits.join(', ') : ''}. A route that only reads is marked reads: true and emits nothing.`);
  const needsKey = r.reads !== true && idem.appliesToMethods.includes(r.method) && (idem.appliesToEngines.includes(doc.engine) || r.purpose.some(p => idem.appliesToPurposes.includes(p)));
  if (needsKey && (r.idempotent !== true || !r.request.some(f => f.field === idem.field && f.type === idem.type && f.required === true))) fail('money-and-dispatch-writes-are-idempotent', `${where} is a ${idem.appliesToEngines.includes(doc.engine) ? 'money' : 'dispatch'} write without a required ${idem.field}.`);

  /* Only §26 names an endpoint, method and path. A route on one of those paths says so, and no other
     route may: elsewhere a document names what an engine does, which is capabilityNamed, with the
     words, and the route that does it is the programme's. */
  if (r.namedInDocuments !== undefined) throw new Error(`${where} still uses namedInDocuments. A route says endpointNamed only for a §26 path, and capabilityNamed with the section and the words for anything else a document names.`);
  const onPassportPath = doc.engine === passportPaths.engine && passportPaths.paths.includes(r.path);
  if (r.endpointNamed === undefined || r.capabilityNamed === undefined) throw new Error(`${where} does not say whether a document names its endpoint or its capability.`);
  if (r.endpointNamed !== null && (!onPassportPath || r.endpointNamed?.section !== passportPaths.namedIn)) fail('named-means-a-section-exists', `${where} says a document names its endpoint (${JSON.stringify(r.endpointNamed)}), and only the ${passportPaths.namedIn} Passport paths are named as endpoints.`);
  if (onPassportPath && r.endpointNamed === null) fail('named-means-a-section-exists', `${where} is on a ${passportPaths.namedIn} path and does not say the document names it.`);
  if (r.capabilityNamed !== null && (!sectionIds.has(r.capabilityNamed?.section) || !r.capabilityNamed?.what?.trim() || r.capabilityNamed.what.length > 90)) fail('named-means-a-section-exists', `${where} says it serves ${JSON.stringify(r.capabilityNamed)}.`);
  if (r.capabilityNamed) quoteChecks.push({ where, named: r.capabilityNamed });
  if (r.endpointNamed !== null && r.capabilityNamed !== null) throw new Error(`${where} claims both a named endpoint and a named capability; a named endpoint already says what the document names.`);
  if (r.endpointNamed) endpointCount++;
  else if (r.capabilityNamed) capabilityCount++;

  if (r.status === 'built') {
   builtCount++;
   const enforced = r.enforcedBy;
   const mechanism = mechanisms.get(enforced?.mechanism);
   if (!mechanism) fail('built-callers-are-enforced', `${where} is built and does not say, in enforcedBy, how its handler decides who may call it.`);
   if (enforced.capability !== undefined && !vettingForApis.capabilities.some(c => c.id === enforced.capability)) throw new Error(`${where} is enforced by the capability "${enforced.capability}", which packages/catalog/vetting.json does not have.`);
   const derived = deriveCallers(enforced, r);
   if (derived.length !== r.callers.length || !derived.every(c => r.callers.includes(c))) fail('built-callers-are-enforced', `${where} names the callers ${JSON.stringify([...r.callers].sort())}, and its handler's ${enforced.mechanism} admits ${JSON.stringify([...derived].sort())}.`);
   if (r.enforcement === 'missing') {
    if (!r.finding?.trim()) throw new Error(`${where} says its enforcement is missing without the finding.`);
    missingEnforcement.push(`${where}: ${r.finding}`);
   } else if (r.enforcement !== undefined) {
    throw new Error(`${where} has the enforcement ${JSON.stringify(r.enforcement)}; it is missing or absent.`);
   } else {
    const block = handlerBlock(r);
    if (mechanism.handlerMarks?.length && !mechanism.handlerMarks.some(mark => block.includes(mark))) fail('built-callers-are-enforced', `${where} says its handler enforces ${enforced.mechanism}, and ${r.evidence?.file} shows none of ${JSON.stringify(mechanism.handlerMarks)} in it.`);
    const asks = (mechanism.forbiddenMarks ?? []).find(mark => block.includes(mark));
    if (asks) fail('built-callers-are-enforced', `${where} says anybody may call it, and its handler asks for ${asks}.`);
    if (mechanism.pathPrefix && !String(r.evidence?.handler).includes(mechanism.pathPrefix)) fail('built-callers-are-enforced', `${where} says it is answered on loopback only, and its handler is not under ${mechanism.pathPrefix}.`);
   }
   if (!r.evidence?.file || !existsSync(r.evidence.file) || !read(r.evidence.file).includes(r.evidence.handler ?? ' ')) fail('built-means-a-handler-exists', `${where} is marked built, and ${r.evidence?.file ?? 'no file'} does not hold ${JSON.stringify(r.evidence?.handler)}.`);
  } else if (r.status !== 'proposed' || r.evidence) throw new Error(`${where} has the status "${r.status}"${r.evidence ? ' and evidence, which only a built route has' : ''}.`);
  if (r.status !== 'built' && (r.enforcedBy || r.enforcement || r.finding)) throw new Error(`${where} is proposed and claims an enforcement; only a built route has a handler that enforces anything.`);

  if (r.through) {
   const gateway = gateways.get(r.through);
   if (!gateway) throw new Error(`${where} goes through "${r.through}", which is not a gateway.`);
   if (gateway.engine === doc.engine && gateway.id === 'passport-gateway') throw new Error(`${where} is the Passport's own route; it is the gateway, not a route through it.`);
   if (gateway.id === 'tool-gateway' && (doc.engine !== 'access' || r.path !== gateway.path)) throw new Error(`${where} claims Gilbert's tool gateway, which is one route in Access.`);
  }
 }

 /* Frozen: the lock, as for events. */
 const apiLockLines = read(apiContract.lock).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
 const apiLocked = new Map();
 for (const line of apiLockLines) {
  const cut = line.lastIndexOf(' ');
  const k = line.slice(0, cut), print = line.slice(cut + 1);
  if (apiLocked.has(k)) throw new Error(`${apiContract.lock} lists ${k} twice.`);
  apiLocked.set(k, print);
 }
 const declaredRoutes = new Map(apiRoutes.map(r => [routeKey(r), r]));
 const goneRoutes = [...apiLocked.keys()].filter(k => !declaredRoutes.has(k));
 if (goneRoutes.length) fail('api-frozen-means-frozen', `${goneRoutes.join(', ')} ${goneRoutes.length === 1 ? 'is' : 'are'} frozen in ${apiContract.lock} and no longer declared.`);
 const unlockedRoutes = [...declaredRoutes.values()].filter(r => !apiLocked.has(routeKey(r)));
 if (unlockedRoutes.length) throw new Error(`${unlockedRoutes.length} declared ${unlockedRoutes.length === 1 ? 'route is' : 'routes are'} not in ${apiContract.lock}. A new route joins the frozen contract deliberately — append:\n${unlockedRoutes.map(r => `${routeKey(r)} ${routeFingerprint(r)}`).join('\n')}`);
 for (const [k, r] of declaredRoutes) if (apiLocked.get(k) !== routeFingerprint(r)) fail('api-frozen-means-frozen', `${k} does not match its line in ${apiContract.lock}: a request or response field's name, type, requiredness or object flag is not what was frozen. Put it back, withdraw it if it is wrong, and declare version ${r.version + 1}.`);
 const apiPrints = [...apiLocked.values()];
 if (new Set(apiPrints).size !== apiPrints.length) throw new Error(`${apiContract.lock} has two lines with one fingerprint.`);

 /* What Money may hear, as the event contract states it: billing-relevant state changes with a
    reference and a code, and never a reference into the clinical record, heard or published. */
 const moneyHears = apiEventsContract.moneyHears;
 const eventRefusal = id => {
  const found = apiEventsContract.refusals.find(x => x.id === id);
  if (!found) throw new Error(`packages/catalog/events.json has lost the refusal "${id}".`);
  return found;
 };
 /* An allow-list of references, not a deny-list of clinical ones. The fourth review found the deny-list
    let review.billable give Money reviewRef and would have let a new assessmentRef through: a list of
    what may not reach Money is always one name short. So every reference-shaped field — one ending in a
    store or contract suffix — on an event Money hears or publishes must be on mayReference with the
    reason Money needs it, and an entry nothing uses is refused as a permission waiting to be misused. */
 if (!moneyHears || moneyHears.engine !== 'money' || !moneyHears.why?.trim() || !Array.isArray(moneyHears.events) || !Array.isArray(moneyHears.mayReference) || moneyHears.neverReferences !== undefined || moneyHears.neverReferencesSuffix !== undefined) throw new Error('packages/catalog/events.json no longer states what Money may hear and which references it may hold, as an allow-list.');
 const moneyMayReference = new Map(moneyHears.mayReference.map(x => {
  if (!x.field?.trim() || !x.why?.trim()) throw new Error(`packages/catalog/events.json lets Money hold the reference ${JSON.stringify(x)} without saying why.`);
  return [x.field, x];
 }));
 const referenceShaped = field => [...apiContract.conventions.references.storeSuffixes, ...apiContract.conventions.references.contractSuffixes].some(s => field.endsWith(s));
 const moneyReferencesUsed = new Set();
 const moneyMay = new Map(moneyHears.events.map(x => {
  if (!x.type || !x.why?.trim()) throw new Error(`packages/catalog/events.json lets Money hear ${JSON.stringify(x)} without saying why.`);
  return [x.type, x];
 }));
 const moneyFail = detail => { throw new Error(`${detail} ${eventRefusal('money-hears-billing-not-care').statement} ${eventRefusal('money-hears-billing-not-care').why}`); };
 for (const e of apiEvents.filter(x => !x.withdrawn)) {
  const hears = e.subscribers.includes(moneyHears.engine), publishes = e.owner === moneyHears.engine;
  if (!hears && !publishes) continue;
  if (hears && !moneyMay.has(e.type)) moneyFail(`${e.type}@${e.version} is subscribed to by money and is not among the events moneyHears lets it hear.`);
  for (const f of e.payload.filter(f => referenceShaped(f.field))) {
   if (!moneyMayReference.has(f.field)) moneyFail(`${e.type}@${e.version} ${hears ? 'reaches' : 'is published by'} money carrying "${f.field}", which moneyHears.mayReference does not list with a reason Money needs it.`);
   moneyReferencesUsed.add(f.field);
  }
 }
 for (const field of moneyMayReference.keys()) if (!moneyReferencesUsed.has(field)) throw new Error(`moneyHears.mayReference lets Money hold ${field}, which no event Money hears or publishes carries. A permission nobody uses is one somebody uses later without reading it.`);
 for (const type of moneyMay.keys()) if (!apiEvents.some(e => !e.withdrawn && e.type === type && e.subscribers.includes(moneyHears.engine))) throw new Error(`moneyHears lets Money hear ${type}, which Money does not subscribe to. A permission nobody uses is one somebody uses later without reading it.`);

 /* Capability quotes, against the documents themselves when they are in this checkout. They are
    untracked, so their absence is said in a sentence rather than failed. */
 const quoteNorm = t => String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();
 const quoteFiles = apiContract.documentQuotes.files;
 const absentDocuments = Object.values(quoteFiles).filter(file => !existsSync(file));
 const documentTexts = {};
 let quoteNote = null, quotesFound = 0, paraphrases = 0;
 if (absentDocuments.length) quoteNote = `${absentDocuments.join(' and ')} ${absentDocuments.length === 1 ? 'is' : 'are'} not in this checkout — Documentation/ is untracked — so ${quoteChecks.length} capability quotes were not compared with the documents`;
 else {
  try {
   const { execFileSync } = await import('node:child_process');
   for (const [name, file] of Object.entries(quoteFiles)) documentTexts[name] = execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
   quoteNote = `the documents are here and could not be converted (${String(error.message).split('\n')[0]}), so ${quoteChecks.length} capability quotes were not compared`;
  }
 }
 const sectionOf = (document, id) => {
  const text = documentTexts[document] ?? '';
  if (id.startsWith('FS-')) {
   if (id === 'FS-2') { const a = text.indexOf('\n2. ThusoIQ Core'), b = text.indexOf('\n3. Engine scope'); return a < 0 ? '' : text.slice(a, b < 0 ? undefined : b); }
   const k = Number(id.slice(4));
   const a = text.indexOf(`\nEngine ${k} —`);
   if (a < 0) return '';
   const b = k < 10 ? text.indexOf(`\nEngine ${k + 1} —`) : text.indexOf('\n4. ', a);
   return text.slice(a, b < 0 ? undefined : b);
  }
  let key = id.slice(1);
  if (/^\d$/.test(key)) key = `0${key}`;
  const start = text.search(new RegExp(`^${key.replace('.', '\\.')}  \\S`, 'm'));
  if (start < 0) return '';
  const lineEnd = text.indexOf('\n', start);
  const next = text.slice(lineEnd).search(/^(\d{2}|\d+\.\d+|\d+[A-F])  \S/m);
  return text.slice(start, next < 0 ? undefined : lineEnd + next);
 };
 const sectionDocuments = new Map(apiContract.documentSections.map(section => [section.id, section.document]));
 for (const { where, named } of quoteChecks) {
  if (named.paraphrase !== undefined && named.paraphrase !== true) throw new Error(`${where} marks paraphrase as ${JSON.stringify(named.paraphrase)}; it is true or absent.`);
  if (named.paraphrase === true) { paraphrases++; continue; }
  if (quoteNote) continue;
  const document = sectionDocuments.get(named.section);
  if (!quoteFiles[document]) throw new Error(`${where} cites ${named.section}, in ${document}, which documentQuotes names no file for.`);
  const body = sectionOf(document, named.section);
  if (!body) fail('quotes-are-quotes', `${where} cites ${named.section}, and no such section was found in ${quoteFiles[document]}.`);
  if (!quoteNorm(body).includes(quoteNorm(named.what))) fail('quotes-are-quotes', `${where} quotes "${named.what}" from ${named.section}, and those words are not in it. Quote the section as written, or mark the phrase paraphrase: true.`);
  quotesFound++;
 }

 /* The mock is not a service. */
 const mockPackage = JSON.parse(read('packages/mock-api/package.json'));
 if (mockPackage.dependencies || mockPackage.devDependencies) fail('the-mock-is-not-a-service', 'packages/mock-api declares dependencies; it is zero-dependency, like the services it stands in for.');
 const mockServer = read('packages/mock-api/src/server.ts');
 if (!/const HOST = '127\.0\.0\.1'/.test(mockServer) || !/server\.listen\(port, host\)/.test(mockServer) || !/LOOPBACK\.has\(req\.socket\.remoteAddress/.test(mockServer) || !/LOOPBACK_HOSTS\.has\(hostName\(req\.headers\.host\)\)/.test(mockServer)) fail('the-mock-is-not-a-service', 'packages/mock-api/src/server.ts no longer binds to 127.0.0.1 and refuses a request that did not arrive on loopback, addressed to a loopback name.');
 const mockLibrary = read('packages/mock-api/src/mock.ts');
 if (!/if \(options\.env\[contract\.mock\.flag\] !== contract\.mock\.flagValue\) throw new MockRefusedToStart/.test(mockLibrary)) fail('the-mock-is-not-a-service', `createMock() in packages/mock-api/src/mock.ts no longer refuses without ${apiContract.mock.flag}=${apiContract.mock.flagValue}, so importing the library skips the door the server goes through.`);
 if (!sharedIds.has('malformed-path') || !/shared\('malformed-path'\)/.test(mockLibrary)) fail('the-mock-is-not-a-service', 'The mock no longer answers a path it cannot decode with the declared malformed-path refusal.');
 for (const file of files('deploy')) {
  if (/mock-api|MYTHUSO_MOCK/.test(read(file))) fail('the-mock-is-not-a-service', `${file} names the development mock.`);
 }
 const rootPackageForMock = JSON.parse(read('package.json'));
 if (!rootPackageForMock.workspaces.includes(apiContract.mock.package) || !/-w @mythuso\/mock-api/.test(rootPackageForMock.scripts.check) || !/-w @mythuso\/mock-api/.test(rootPackageForMock.scripts.test)) throw new Error('The root package.json no longer typechecks and tests packages/mock-api. A mock whose refusals nobody has seen fire is a mock that says yes.');
 const mockTests = read('packages/mock-api/test/contract.test.ts');
 if (!/for \(const route of contract\.routes\)/.test(mockTests) || !/returns every refusal it declares, exactly/.test(mockTests) || !/refuses a caller it does not name/.test(mockTests)) throw new Error('packages/mock-api/test/contract.test.ts no longer hits every route with a valid and an invalid call and every declared refusal.');

 const perEngine = apiEngines.map(({ doc }) => `${doc.engine} ${doc.routes.filter(r => !r.withdrawn).length}`).join(', ');
 console.log(`ThusoIQ's engine API contract is frozen at version ${apiContract.version} and marked as the programme's delegated decision, awaiting a Head of Engineering: ${apiRoutes.length} routes over twelve engine files (${perEngine}), ${builtCount} of them built and found in their handlers, ${apiRoutes.length - builtCount} proposed; ${endpointCount} on an endpoint the documents name (§26), ${capabilityCount} serving a capability or message set the documents name, and ${apiRoutes.length - endpointCount - capabilityCount} ours. Every one names its callers and purposes, refuses something, says what it emits — only live events its own engine owns — and is in ${apiContract.lock} under a fingerprint no other line shares. No route names another engine's store outside a gateway, carries clinical content outside the Passport gateway, lets a supplier call it except the one legacy callback that names the door it should become, or carries an identity number, a transcript, a card number, a score or a sealed category; every money and dispatch write needs an idempotency key; and all ${feedIds.length} supplier doors are linked to the engine they serve. The development mock answers every route on loopback only, behind ${apiContract.mock.flag}, and nothing in deploy/ names it.`);
 console.log(`Built routes name exactly the callers their handlers enforce, worked out from vetting.json capabilities, consent.json grant gateways and the Passport's credential roles${missingEnforcement.length ? `, except ${missingEnforcement.length} whose enforcement is still missing` : ''}; every engine caller is one engine with the event that justifies it; Money hears ${moneyMay.size} billing events and no reference into the clinical record; ${quoteNote ?? `${quotesFound} capability quotes were found word for word in their sections and ${paraphrases} say they are paraphrases`}.`);
 if (missingEnforcement.length) fail('built-callers-are-enforced', `${missingEnforcement.length} built ${missingEnforcement.length === 1 ? 'route names callers its handler does' : 'routes name callers their handlers do'} not enforce yet:\n${missingEnforcement.join('\n')}\nThe contract keeps the intended callers; the build passes when the handler enforces them.`);
}
/* ==== end of Contracts & Core (Wave 2) ============================================================ */


/* ---- The Health Passport's own record ----------------------------------------------------------

   Four sets of readings, a reviewing doctor, three sentences of review, a passport number, three
   documents and the five sentences the device screens refuse in. All of it fictional, and until
   packages/catalog/passport.json existed all of it was typed three times: apps/web/src/lib/
   passport.ts, apps/ios/MyThuso/Models/Passport.swift and .../model/Passport.kt each declared their
   own copy with nothing comparing them, and two of the three had already drifted to a different
   number of charts. The Kotlin file said so at the top and named the fix — "it belongs in
   packages/catalog as a passport fixture with an emit-passport.mjs beside it". This is the check
   that makes the fix stick.

   Three questions, and they are different ones:

     1. The contract is a record. The visits are oldest first and in the past, every reading is a
        measure the assessment collects and can therefore be judged, no document carries a date of
        its own, and the doctor did not review readings before they were taken.
     2. The two hand-written native copies still agree with it, word for word and number for number,
        for as long as they exist. They are quarantined rather than corrected because both native
        apps are being rebuilt by other people as this lands.
     3. Nothing else types one. What counts as typing a passport value is deliberately narrow: a
        line does it when it names a measure in quotes and carries both that measure's reading and
        the day the set was taken, and a file does it when it repeats the reviewer's registration or
        one of the three sentences of the last review. The holder's name is not one of them —
        "Lerato Molefe" is the preview's patient on thirty screens, and a check that fires on a
        booking form naming her is a check somebody deletes. */
const passport=JSON.parse(read('packages/catalog/passport.json'));
const passportSets=passport.readingSets;
const passportMeasureIds=new Set(measures.map(m=>m.id));
if(!passportSets.length) throw new Error('packages/catalog/passport.json holds no readings, so the Health Passport has nothing to chart and the completed visit has nothing to look up');
passportSets.reduce((previous,set)=>{
 if(!(set.dayOffset<0)) throw new Error(`A reading set in packages/catalog/passport.json is dated ${set.dayOffset} days from today. The passport is a record of visits that have happened, and a reading taken in the future is a reading nobody took.`);
 if(previous!==null&&!(set.dayOffset>previous)) throw new Error(`packages/catalog/passport.json lists its reading sets out of order at day ${set.dayOffset}. They are oldest first: every chart, the latest set and the completed visit's lookup read that order rather than sorting it.`);
 for(const id of Object.keys(set.values)) if(!passportMeasureIds.has(id)) throw new Error(`The reading set ${Math.abs(set.dayOffset)} days ago carries "${id}", which is not an observation in packages/catalog/records.json. A reading with no reference range cannot be flagged, so it would be shown to a patient with nothing said about where it sits.`);
 return set.dayOffset;
},null);
const latestPassportSet=passportSets[passportSets.length-1];
if(passport.lastReview.reviewedDayOffset<latestPassportSet.dayOffset) throw new Error(`The last review is dated ${Math.abs(passport.lastReview.reviewedDayOffset)} days ago and the visit it reviews was ${Math.abs(latestPassportSet.dayOffset)} days ago. A doctor cannot have reviewed readings that had not been taken.`);
for(const id of passport.headline.measures) if(!passportMeasureIds.has(id)) throw new Error(`The passport leads with "${id}", which is not an observation in packages/catalog/records.json, so the trends screen would open on a chart of nothing.`);
for(const document of passport.documents) if(document.dayOffset!==undefined) throw new Error(`The document "${document.name}" in packages/catalog/passport.json carries a day of its own. Documents are issued out of the visit the last reading set was taken at, and a stored date is one that can disagree with the visit it came from.`);
/* Two hand-written files still declare the record themselves. They cannot adopt the generated one
   without being edited, and both native apps are being rebuilt by other people as this lands. The
   quarantine is not a permanent exemption and it cannot rot into one: an entry whose file has
   *stopped* typing the record is an error too, so the day either model reads PassportData the build
   fails until its line is deleted from below. Until then the loop holds both files to every value in
   the contract, word for word and number for number, so neither copy can drift while it waits. */
const PASSPORT_QUARANTINE = [
 ['apps/ios/MyThuso/Models/Passport.swift', 'read PassportData for the holder, the reviewer, the readings and the review']
];
/* The contract, the generated copies of it, the emitter and this checker are where the record is
   supposed to be written down. Everything else is a screen, a library or a test. */
const PASSPORT_SOURCES = new Set([
 'packages/catalog/passport.json',
 'scripts/check-boundaries.mjs',
 'scripts/emit-passport.mjs',
 'apps/ios/MyThuso/Models/PassportData.swift',
 'apps/android/app/src/main/java/za/co/mythuso/model/PassportData.kt',
 /* The vetting register, and it is here for a reason worth reading rather than as an exemption.
    The passport names a doctor, and the register is the authority on doctors — it is where their
    registration is issued, checked and lapsed. Before this, passport.json held "Dr N. Khumalo ·
    MP 0741225", a number no authority ever issued, precisely because the register was forbidden to
    hold the same string and so nothing could compare the two. Forbidding the copy did not prevent
    the second copy; it prevented the comparison.
    So the register may hold it, and `the passport's reviewer is a party the register knows` below
    fails the build if the two ever disagree. A checked copy beats a copy nobody may look at. */
 'apps/web/src/lib/vetting-fixtures.ts',
 'packages/catalog/roster.json',
 'apps/ios/MyThuso/Models/Vetting.swift',
 'apps/android/app/src/main/java/za/co/mythuso/model/Vetting.kt'
]);
/* Three of them, which is the register's own problem rather than the passport's: the vetted parties
   are hand-written in all three applications and generated in none, so a doctor's registration
   already exists in triplicate before any other contract quotes it. That is the next generator this
   repository owes itself and it is written up in docs/ROADMAP.md rather than fixed here — moving the
   party list into the catalogue touches every screen that names a person, and it is not a change to
   make in the middle of another one. */
/* Two lists, and the difference between them is the whole design. `passportProhibited` is what no
   file outside those sources may type. `passportHeld` is wider — it is everything a quarantined copy
   is measured against while it waits, because holding one file to a value is not the same as
   forbidding that value everywhere. */
const passportProhibited=[passport.reviewer.registration,passport.lastReview.assessment,passport.lastReview.plan,passport.lastReview.next];
const passportHeld=[...passportProhibited,passport.holder.name,passport.holder.passportId,passport.holder.issuedBy,passport.reviewer.name];
const typesAPassportValue=source=>{
 const typed=passportProhibited.filter(sentence=>source.includes(sentence));
 for(const set of passportSets) for(const [id,value] of Object.entries(set.values)) {
  if(source.split('\n').some(line=>{
   if(!line.includes(`'${id}'`)&&!line.includes(`"${id}"`)) return false;
   const numbers=(line.match(/\d+(\.\d+)?/g)||[]).map(Number);
   return numbers.includes(value)&&numbers.includes(Math.abs(set.dayOffset));
  })) typed.push(`the ${id} taken ${Math.abs(set.dayOffset)} days ago`);
 }
 return typed;
};
/* A reading set wraps over two lines in Swift and sits on one in Kotlin, so a quarantined copy is
   read as a window from its day offset rather than line by line: the day, and then every reading of
   that set written against its own name. */
const declaresPassportSet=(source,set)=>{
 const start=source.search(new RegExp(`-${Math.abs(set.dayOffset)}\\b`));
 const window=start<0?'':source.slice(start,start+400);
 return Object.entries(set.values).filter(([id,value])=>!new RegExp(`"${id}"\\s*(?:to|:)\\s*${String(value).replace('.','\\.')}(\\.0)?\\b`).test(window)).map(([id])=>id);
};
for(const [file,todo] of PASSPORT_QUARANTINE) {
 if(!existsSync(file)) throw new Error(`PASSPORT_QUARANTINE names ${file}, which does not exist (${todo}). A quarantine list that outlives its files is a list nobody reads.`);
 const source=read(file);
 if(!typesAPassportValue(source).length) throw new Error(`${file} no longer types a passport value, so its quarantine entry in PASSPORT_QUARANTINE is spent: ${todo}. Delete the line — an exemption nobody can lose is how a rule stops being one.`);
 for(const value of passportHeld) if(!source.includes(value)) throw new Error(`${file} is quarantined and has drifted from packages/catalog/passport.json: it no longer carries "${value.length>60?`${value.slice(0,60)}…`:value}" word for word. Either take the record from PassportData and delete its quarantine line, or keep the copy identical. A quarantine is a delay, not a licence to disagree.`);
 for(const set of passportSets) {
  const wrong=declaresPassportSet(source,set);
  if(wrong.length) throw new Error(`${file} disagrees with packages/catalog/passport.json about the ${wrong.join(', ')} taken ${Math.abs(set.dayOffset)} days ago, or has lost that visit altogether. Run: npm run passport, and read PassportData.`);
 }
}
const quarantinedPassport=new Map(PASSPORT_QUARANTINE);
for(const file of [
 ...files('apps/web/src').filter(f=>/\.tsx?$/.test(f)),
 ...files('packages/catalog'),
 ...files('scripts').filter(f=>/\.mjs$/.test(f)),
 ...files('tests').filter(f=>/\.ts$/.test(f)),
 ...native
]) {
 if(PASSPORT_SOURCES.has(file)||quarantinedPassport.has(file)) continue;
 const typed=typesAPassportValue(read(file));
 if(typed.length) throw new Error(`${file} types ${typed.map(t=>`"${t}"`).join(', ')} out of the Health Passport's record. That record lives in packages/catalog/passport.json: lib/passport.ts reads it on the web, PassportData on iOS and Android.`);
}
/* And the sentences. A refusal is only a refusal where somebody reads it, so each platform is asked
   whether it still says these words — in a screen, not in its copy of the contract, which is why the
   three files that read the contract are left out of the search. A platform that has adopted the
   contract instead of typing it says so by naming PassportData or deviceIntegrations, and that
   counts as saying it. What is refused is a platform that quietly says neither. */
const passportReaders=['apps/web/src/lib/passport.ts','apps/ios/MyThuso/Models/PassportData.swift','apps/android/app/src/main/java/za/co/mythuso/model/PassportData.kt'];
const readsThePassport=/PassportData\.|\bdeviceIntegrations\b/;
const passportScreens = {
 web: files('apps/web/src').filter(f=>/\.tsx?$/.test(f)&&!passportReaders.includes(f)).map(read).join('\n'),
 ios: files('apps/ios/MyThuso').filter(f=>/\.swift$/.test(f)&&!passportReaders.includes(f)).map(read).join('\n'),
 android: files('apps/android/app/src/main').filter(f=>/\.kt$/.test(f)&&!passportReaders.includes(f)).map(read).join('\n')
};
const passportSays=(platform,sentence)=>passportScreens[platform].includes(sentence)||readsThePassport.test(passportScreens[platform]);
for(const refusal of passport.refusals) for(const platform of Object.keys(passportScreens)) {
 if(!passportSays(platform,refusal.sentence)) throw new Error(`${platform} no longer says "${refusal.sentence}" anywhere a person would read it. ${refusal.why} A refusal that exists only in the contract has been made on nobody's behalf.`);
}
for(const device of passport.devices) for(const platform of device.offeredOn) {
 for(const sentence of [device.sheet,device.withdraw]) {
  if(!passportSays(platform,sentence)) throw new Error(`${platform} offers ${device.name} and no longer says "${sentence}". How the permission is asked, and where it is taken back again, are the two answers a person needs before saying yes; packages/catalog/passport.json holds both.`);
 }
}

/* Vetting is the gate the whole marketplace rests on, and it is described once, as data, in
   packages/catalog/vetting.json. A grant that points at a capability nobody defined, or a check
   issued by an authority that is not listed, is a hole in that gate rather than a typo. */
const vetting=JSON.parse(read('packages/catalog/vetting.json'));
const capabilityIds=new Set(vetting.capabilities.map(c=>c.id));
const authorityIds=new Set(vetting.authorities.map(a=>a.id));
if(capabilityIds.size!==vetting.capabilities.length) throw new Error('Duplicate capability id in packages/catalog/vetting.json');
if(authorityIds.size!==vetting.authorities.length) throw new Error('Duplicate authority id in packages/catalog/vetting.json');
const roleIds=new Set();
for(const role of vetting.roles) {
 if(roleIds.has(role.id)) throw new Error(`Duplicate vetted role ${role.id}`);
 roleIds.add(role.id);
 if(!role.grants.length) throw new Error(`Vetted role ${role.id} is refused nothing, so vetting it decides nothing`);
 if(!role.checks.length) throw new Error(`Vetted role ${role.id} has no checks`);
 for(const grant of role.grants) {
  if(!capabilityIds.has(grant.capability)) throw new Error(`Role ${role.id} grants unknown capability ${grant.capability}`);
  if(!grant.refusal) throw new Error(`Role ${role.id} does not say what is refused for ${grant.capability}`);
 }
 const seen=new Set();
 for(const check of role.checks) {
  if(seen.has(check.id)) throw new Error(`Role ${role.id} lists check ${check.id} twice`);
  seen.add(check.id);
  if(!authorityIds.has(check.authority)) throw new Error(`Check ${role.id}/${check.id} is issued by unknown authority ${check.authority}`);
  if(check.risk!=='high'&&check.risk!=='standard') throw new Error(`Check ${role.id}/${check.id} has no risk level`);
  if(check.renewMonths!==null&&!(check.renewMonths>0)) throw new Error(`Check ${role.id}/${check.id} has an impossible renewal cadence`);
 }
 /* Identity is the one check nothing can proceed without: a party nobody has identified cannot be
    vetted, whatever else is on file. */
 if(role.party!=='site'&&!role.checks.some(c=>c.authority==='dha'||c.id==='identity'||c.id==='signatory'||c.id==='attendant-vetting')) throw new Error(`Role ${role.id} is vetted without anybody being identified`);
 /* A high-risk check is the one that needs a second reviewer. A role with none of them is a role
    one person can wave through. */
 if(!role.checks.some(c=>c.risk==='high')) throw new Error(`Role ${role.id} has no high-risk check, so one reviewer could clear it alone`);
}
/* Every capability must be reachable by someone, or the matrix is describing a gate around nothing. */
for(const capability of vetting.capabilities) if(!vetting.roles.some(r=>r.grants.some(g=>g.capability===capability.id))) throw new Error(`Capability ${capability.id} is granted to nobody`);

/* ==== VERIFY: THE SEVEN GATES ======================================================================
   ADDED BY THE TRUST, RECORD & IDENTITY LEAD. Kept in one block so a merge with the contracts and
   voice branches is a matter of keeping all three.

   The master document puts every person through seven onboarding gates, each with a rule it refuses
   under. Four things are held here, and each one is a way the gates quietly stop meaning anything:

     1. The gates are seven, numbered 1 to 7 without a gap, and each carries its fail rule and the
        sentence a person is shown. A gate with no fail rule is a gate nobody can fail.
     2. Every check names a gate, and every role reaches gate 7 through gates 1 to 6 — or says, per
        gate, in a real sentence, why no check sits there. Silence about a gate is how "the nurse
        passed assessment" comes to mean "nobody assessed the nurse".
     3. No role activates past a failed hard stop. Proved against the service's own arithmetic in
        apps/api/src/vetting/gates.ts rather than a second copy of it here: for every role and every
        check at a hard-stop gate, a party with everything else cleared and that one check declined
        must be refused, at that gate, in that gate's words.
     4. The fail rules are rendered from the contract on all three platforms, never typed, and the
        gate is never a column: a stored gate number stops being true the night a clearance lapses. */
{
 const gateList = vetting.gates ?? [];
 if(gateList.length !== 7) throw new Error(`packages/catalog/vetting.json declares ${gateList.length} gates. The master document's onboarding has seven — apply, identity, credentials, background, assess, train, activate — and a person told they are at "gate 4 of 7" is owed seven.`);
 [...gateList].sort((a,b)=>a.order-b.order).forEach((gate,index)=>{
  if(gate.order !== index+1) throw new Error(`The gates in packages/catalog/vetting.json are not numbered 1 to 7 without a gap: "${gate.id}" is ${gate.order} where ${index+1} belongs. A status of "gate 5 of 7" has to mean the fifth.`);
 });
 const gateIds = new Set(gateList.map(g=>g.id));
 if(gateIds.size !== gateList.length) throw new Error('Two gates in packages/catalog/vetting.json share an id.');
 for(const gate of gateList) {
  for(const field of ['name','happens','failRule','statement']) if(!(typeof gate[field]==='string' && gate[field].trim().length > 3)) throw new Error(`Gate "${gate.id}" has no ${field}. A gate without a fail rule is a gate nobody can fail, and one without a statement is a gate the person at it is not told about.`);
  if(typeof gate.hardStop !== 'boolean') throw new Error(`Gate "${gate.id}" does not say whether it is a hard stop.`);
 }
 const byOrder = [...gateList].sort((a,b)=>a.order-b.order);
 if(byOrder[0].evidencedBy !== 'enrolment' || byOrder[6].evidencedBy !== 'gates' || byOrder.slice(1,6).some(g=>g.evidencedBy)) throw new Error('Only the first gate is evidenced by the enrolment and only the last by the other six. Any other gate with no checks of its own is a gate passed on nothing.');
 for(const role of vetting.roles) {
  for(const check of role.checks) {
   if(!check.gate) throw new Error(`Check ${role.id}/${check.id} sits at no gate. Every check is somewhere in the seven, or it is a check nothing waits on.`);
   if(!gateIds.has(check.gate)) throw new Error(`Check ${role.id}/${check.id} names gate "${check.gate}", which packages/catalog/vetting.json does not have.`);
   if(check.gate === byOrder[0].id || check.gate === byOrder[6].id) throw new Error(`Check ${role.id}/${check.id} sits at "${check.gate}", which is evidenced by ${check.gate === byOrder[0].id ? 'the enrolment' : 'the other six gates'} rather than by a check.`);
  }
  const notes = role.gateNotes ?? {};
  for(const noted of Object.keys(notes)) if(!gateIds.has(noted)) throw new Error(`Role ${role.id} explains gate "${noted}", which does not exist.`);
  for(const gate of byOrder.slice(1,6)) {
   const here = role.checks.filter(c=>c.gate===gate.id);
   const note = notes[gate.id];
   if(here.length && note) throw new Error(`Role ${role.id} has ${here.length} check(s) at ${gate.name} and also says why none applies there. One of the two is wrong.`);
   if(!here.length && !(note && ['does-not-apply','not-yet-a-check'].includes(note.kind) && typeof note.sentence==='string' && note.sentence.split(' ').length >= 10)) throw new Error(`Role ${role.id} does not reach gate 7 through ${gate.name}: no check sits there and the role does not say, in a sentence, why. Add a check, or a gateNotes entry saying it does not apply or is not yet a check.`);
  }
 }
 const { gateProgress } = await import('../apps/api/src/vetting/gates.ts');
 const at = Date.now();
 let hardStopsProved = 0;
 for(const role of vetting.roles) {
  for(const check of role.checks.filter(c=>gateList.find(g=>g.id===c.gate).hardStop)) {
   const actor = { actorId: `${role.id}-proof`, roleId: role.id, records: role.checks.map(c=>({ checkId: c.id, state: c.id===check.id ? 'declined' : 'verified', secondedBy: 'second reviewer' })) };
   const progress = gateProgress(actor, at);
   const gate = gateList.find(g=>g.id===check.gate);
   if(progress.activated) throw new Error(`Role ${role.id} activates with ${check.name} declined at ${gate.name}, which is a hard stop. Nothing after a failed hard stop may be reached.`);
   if(progress.at.id !== gate.id || progress.sentence !== gate.failRule) throw new Error(`Role ${role.id} with ${check.name} declined is told it is at "${progress.at.id}" with "${progress.sentence}". A failed hard stop holds the party at ${gate.name}, in its own fail rule, word for word.`);
   if(progress.outcome !== 'stopped' || progress.gates.some(g=>g.order > gate.order && g.state !== 'not-reached')) throw new Error(`Role ${role.id} with ${check.name} declined is "${progress.outcome}" rather than stopped, or a gate after ${gate.name} was still reached. Nothing after a failed hard stop is looked at, however green it is.`);
   /* And a hard stop outranks an earlier gate that is merely unfinished: a background bar is not
      hidden behind an identity check nobody has got round to. */
   const earlier = role.checks.find(c=>gateList.find(g=>g.id===c.gate).order < gate.order);
   if(earlier) {
    const unfinished = gateProgress({ ...actor, records: actor.records.map(r=>r.checkId===earlier.id ? { ...r, state: 'in-review' } : r) }, at);
    if(unfinished.at.id !== gate.id || unfinished.outcome !== 'stopped') throw new Error(`Role ${role.id} with ${check.name} declined and ${earlier.name} still in review is told it is at "${unfinished.at.id}", ${unfinished.outcome}. A failed hard stop outranks an earlier gate that is only unfinished, or the bar is hidden behind the paperwork.`);
   }
   hardStopsProved++;
  }
 }
 if(hardStopsProved < 20) throw new Error(`Only ${hardStopsProved} hard-stop checks were proved. The contract has lost its identity or background checks, or this check has stopped reading them.`);
 const gateModels = {
  web: 'apps/web/src/lib/vetting.ts',
  ios: 'apps/ios/MyThuso/Models/Vetting.swift',
  android: 'apps/android/app/src/main/java/za/co/mythuso/model/Vetting.kt'
 };
 const gateScreens = {
  web: 'apps/web/src/features/Vetting.tsx',
  ios: 'apps/ios/MyThuso/Features/VettingView.swift',
  android: 'apps/android/app/src/main/java/za/co/mythuso/ui/VettingScreens.kt'
 };
 for(const [platform,file] of Object.entries(gateModels)) {
  const source = read(file);
  if(!/failRule/.test(source) || !/function gateProgress|func gateProgress|fun gateProgress/.test(source)) throw new Error(`${file} no longer works out gate progress from the contract's failRule. The ${platform} vetting screen would have nothing to say about where a person is stuck, or something typed.`);
 }
 for(const [platform,file] of Object.entries(gateScreens)) {
  const source = read(file);
  if(!/gateProgress\(subject\)/.test(source) || !/\.sentence/.test(source) || !/\.status/.test(source)) throw new Error(`${file} no longer shows where the party stands among the seven gates, or no longer renders the gate's own sentence. The ${platform} status screen is the one a person reads to find out why they are not activated.`);
 }
 const gateSentences = [...gateList.map(g=>g.failRule), ...gateList.map(g=>g.statement), ...Object.values(vetting.gateRules).filter(v=>typeof v==='string' && v.split(' ').length > 6), ...vetting.roles.flatMap(r=>Object.values(r.gateNotes ?? {}).map(n=>n.sentence))];
 const handWritten = [...files('apps/web/src').filter(f=>/\.tsx?$/.test(f)), ...native.filter(f=>!/Data\.(swift|kt)$/.test(f)), ...files('apps/api/src')];
 for(const file of handWritten) {
  const source = read(file);
  const typed = gateSentences.find(sentence=>source.includes(sentence));
  if(typed) throw new Error(`${file} types a gate sentence out of packages/catalog/vetting.json: "${typed.slice(0,80)}…". The fail rules are rendered from the contract (VettingData on the phones), so a reworded rule is reworded everywhere at once.`);
 }
 for(const table of tablesIn(read('apps/api/src/vetting/store.ts'))) {
  const stored = table.columns.find(column=>/gate/i.test(column));
  if(stored) throw new Error(`apps/api/src/vetting/store.ts stores ${table.name}.${stored}. Where a party stands among the gates is computed from its checks on every read — apps/api/src/vetting/gates.ts — and a stored gate is a claim that stops being true the night a clearance lapses.`);
 }
}

/* ==== VERIFY: TRUST SCORE v1 =======================================================================
   ADDED BY THE TRUST, RECORD & IDENTITY LEAD.

   "No Trust Score, no dispatch", and a safety instrument rather than a leaderboard. Four things
   would quietly turn it into something else, and each is held here:

     1. A weight becomes a number without a recorded decision. The weights are a governance decision
        nobody has taken; a number typed into packages/catalog/trust.json before one is a formula with
        no author, and while any weight is null the only reachable tier is Verified.
     2. A refusal is typed in the service rather than looked up, so the contract and the dispatch
        board say different things.
     3. A patient receives a number. The patient view is the badge and nothing it was worked out
        from, and no screen on any platform reads a score's value.
     4. The dispatch path stops asking. The roster simulator ranks through the trust module or the
        rule is a paragraph. */
{
 const trust = JSON.parse(read('packages/catalog/trust.json'));
 const gateIdsForTrust = new Set((vetting.gates ?? []).map(g=>g.id));
 for(const hard of trust.hardGates) {
  if(!hard.failing?.trim()) throw new Error(`Trust hard gate "${hard.id}" has no sentence for failing.`);
  for(const gate of hard.gates) if(!gateIdsForTrust.has(gate)) throw new Error(`Trust hard gate "${hard.id}" reads gate "${gate}", which packages/catalog/vetting.json does not have.`);
 }
 let undecided = 0;
 for(const input of trust.softInputs) {
  if(!input.setBy?.trim()) throw new Error(`The Trust Score input "${input.id}" does not say who sets its weight. A weight with no owner is a weight somebody will set in a pull request.`);
  const decided = input.decision && ['decidedBy','decidedOn','minute'].every(field => typeof input.decision[field]==='string' && input.decision[field].trim());
  if(input.weight !== null && !decided) throw new Error(`The Trust Score input "${input.id}" has weight ${input.weight} and no recorded decision by ${input.setBy}. The weights are a governance decision nobody has made: record who decided, on what day and in which minute, or put it back to null.`);
  if(input.weight === null) undecided++;
 }
 if(undecided) {
  const reachable = trust.tiers.filter(tier => tier.needs !== 'weights');
  if(reachable.length !== 1 || reachable[0].id !== 'verified') throw new Error(`While ${undecided} Trust Score weight(s) are undecided the only reachable tier is Verified, and packages/catalog/trust.json makes ${reachable.map(t=>t.name).join(', ') || 'none'} reachable.`);
  for(const tier of trust.tiers.filter(t => t.needs === 'weights')) if(!(typeof tier.unavailable === 'string' && tier.unavailable.split(' ').length >= 8)) throw new Error(`The ${tier.name} tier needs weights nobody has decided and does not say so in a sentence. A tier nobody can hold has to tell the person looking at it why.`);
 }
 for(const refusal of trust.refusals) if(!refusal.sentence?.trim() || !refusal.why?.trim()) throw new Error(`The Trust Score refusal "${refusal.id}" is missing its sentence or its reasoning.`);
 const trustSentences = [...trust.refusals.map(r=>r.sentence), ...Object.values(trust.reasons), ...trust.hardGates.map(h=>h.failing), ...trust.tiers.map(t=>t.unavailable).filter(Boolean)];
 const trustSources = files('apps/api/src/trust').filter(f=>f.endsWith('.ts'));
 if(!trustSources.length) throw new Error('apps/api/src/trust is gone, so nothing computes a Trust Score and nothing refuses a dispatch without one.');
 const refusalIds = new Set(trust.refusals.map(r=>r.id));
 for(const file of [...trustSources, 'apps/api/src/simulation/roster.ts']) {
  const source = read(file);
  const typed = trustSentences.find(sentence => source.includes(sentence));
  if(typed) throw new Error(`${file} types a Trust Score sentence out of packages/catalog/trust.json: "${typed.slice(0,80)}". Look it up with refusal() or reason() — a typed copy goes on refusing in the old words after the contract has changed.`);
  for(const [, id] of source.matchAll(/refusal\('([a-z-]+)'/g)) if(!refusalIds.has(id)) throw new Error(`${file} refuses with "${id}", which packages/catalog/trust.json does not hold.`);
 }
 /* The patient view. Held on the contract, on the function that builds it, on the ranked entry a
    dispatch desk receives, on the feed a roster supplier would send, and on every screen. */
 for(const field of ['value','reasons','hardGates']) {
  if(trust.patientView.fields.includes(field)) throw new Error(`packages/catalog/trust.json lets a patient receive the score's ${field}. A patient is told the badge — Verified, Trusted, Senior — and never a number or what it was worked out from.`);
 }
 if(!trust.patientView.never.includes('value')) throw new Error('packages/catalog/trust.json no longer says a patient never receives the score\'s value.');
 if(!/contract\.patientView\.fields/.test(read('apps/api/src/trust/score.ts'))) throw new Error('forPatient() in apps/api/src/trust/score.ts no longer builds the patient view from the contract\'s own list of fields.');
 const rankedType = read('apps/api/src/trust/dispatch.ts').match(/export type Ranked = \{([^}]*)\}/)?.[1];
 if(rankedType === undefined) throw new Error('apps/api/src/trust/dispatch.ts no longer declares Ranked as one type this check can read.');
 if(/\b(value|reasons|score)\s*:/.test(rankedType)) throw new Error(`A ranked dispatch entry carries the score itself (${rankedType.trim()}). The desk is told who to send, with the badge; the number and its reasons stay with the vetting team.`);
 const feedsForTrust = JSON.parse(read('packages/catalog/feeds.json'));
 for(const feed of feedsForTrust.feeds) for(const accepted of feed.accepts ?? []) if(/score|trust/i.test(accepted.field)) throw new Error(`The ${feed.id} feed accepts "${accepted.field}". A Trust Score is computed by Verify from vetting evidence, never received from a supplier.`);
 for(const file of [...files('apps/web/src').filter(f=>/\.tsx?$/.test(f)), ...native]) {
  const source = read(file);
  if(/trust\w*\??\.value\b|score\??\.value\b/i.test(source)) throw new Error(`${file} reads a Trust Score's value. No screen shows a raw score — patients see a badge tier, and only the vetting team a number, on a surface built for them.`);
 }
 const rosterSource = read('apps/api/src/simulation/roster.ts');
 if(!/rankForDispatch\(/.test(rosterSource) || !/trustScore\(/.test(rosterSource)) throw new Error('apps/api/src/simulation/roster.ts no longer ranks dispatch through the Trust Score. "No Trust Score, no dispatch" is enforced by the ranking or it is not enforced.');
 /* The events this branch declares, in the shape the three Wave 1 branches agreed. The architect owns
    person.*, credential.*, partner.* and passport.*, and nothing here may declare one of them. */
 const engines = new Set(['core','access','pulse','care','clinical','safety','movement','trust','record','medicines','devices','money']);
 const fieldTypes = new Set(feedsForTrust.fieldTypes.map(t=>t.id));
 for(const event of trust.events ?? []) {
  if(/^(person|credential|partner|passport)\./.test(event.type)) throw new Error(`packages/catalog/trust.json declares ${event.type}, which the contracts branch owns. Subscribe to it; do not redeclare it.`);
  /* "version 1" was the agreed shape until an event could have a second. Versions are now held for
     every source file by the Contracts & Core block — contiguous from one, each line locked, and a
     withdrawn version naming its correction — so this asks only for a whole number from one. */
  if(!Number.isInteger(event.version) || event.version < 1 || !['trust','record'].includes(event.owner) || !event.summary?.trim()) throw new Error(`Event ${event.type} is not in the agreed shape: a whole-number version from one, owner trust or record, and a summary.`);
  for(const field of event.payload) if(!fieldTypes.has(field.type) || typeof field.required !== 'boolean' || !field.why?.trim()) throw new Error(`Event ${event.type} carries ${field.field} as "${field.type}", or without saying why. Field types are packages/catalog/feeds.json's.`);
  if(!event.neverCarries?.length || event.neverCarries.some(n=>!n.why?.trim())) throw new Error(`Event ${event.type} does not say what it never carries, and why. What an event refuses to carry is the part of it worth writing down.`);
  for(const subscriber of event.subscribers) if(!engines.has(subscriber)) throw new Error(`Event ${event.type} is subscribed to by "${subscriber}", which is not an engine.`);
 }
}

/* ==== HEALTH PASSPORT P0 ===========================================================================
   ADDED BY THE TRUST, RECORD & IDENTITY LEAD.

   The Passport is "its own service, database and encryption keys. No other engine holds a copy"
   (master document §16), and it holds the one thing in this repository that cannot be re-issued
   after a breach. So it exists in development only, on synthetic data, and what keeps it there is
   checked rather than hoped:

     1. Nothing under deploy/ names it, its workspace or its port. docs/PRIVACY-AND-SECURITY.md
        records that there is no DPIA, no Information Officer and no residency decision; the day
        those exist, this is the check to change, deliberately, with the reason.
     2. apps/api and apps/passport never import each other. Two services that share a module share a
        compromise.
     3. No Passport table has a column for a name, a phone number, an address or an identity number,
        and no file in it holds a realistic South African identity number.
     4. The service still refuses to start without its development flag, still binds to the loopback,
        and its audit log is still append-only.
     5. The grant-roles fixture is deleted the day packages/catalog/consent.json carries grants. */
{
 const passportDir = 'apps/passport';
 if(!existsSync(`${passportDir}/src`)) throw new Error('apps/passport is gone. Passport P0 is a Phase 0 foundation; removing it is a decision to write down, not a directory to delete.');
 const gatewayContract = JSON.parse(read('packages/catalog/passport-gateway.json'));
 const passportPort = String(gatewayContract.service.port);
 const deployNames = new RegExp(`apps/passport|@mythuso/passport|passport-p0|MYTHUSO_PASSPORT|\\b${passportPort}\\b`, 'i');
 for(const file of files('deploy')) {
  const found = read(file).match(deployNames);
  if(found) throw new Error(`${file} names the Health Passport service ("${found[0]}"). Passport P0 runs in development only: there is no signed DPIA, no registered Information Officer and no data residency decision (docs/PRIVACY-AND-SECURITY.md), and the master document says the Passport goes live only after its DPIA is signed. No nginx location, systemd unit or deploy step may reach it until then.`);
 }
 const passportSources = files(passportDir).filter(f=>/\.(ts|json)$/.test(f) && !f.includes('node_modules'));
 for(const file of passportSources) {
  const found = read(file).match(/from\s+['"][^'"]*(apps\/api|@mythuso\/api|\.\.\/api\/|protection\/|vetting\/|simulation\/)[^'"]*['"]/);
  if(found) throw new Error(`${file} imports from the identity service (${found[0]}). The Passport shares no module with apps/api: a compromise of the Core must leave "a gateway they cannot authenticate to and a store they cannot decrypt" (§16).`);
 }
 for(const file of files('apps/api')) {
  if(!/\.(ts|json)$/.test(file) || file.includes('node_modules')) continue;
  const found = read(file).match(/from\s+['"][^'"]*(apps\/passport|@mythuso\/passport|passport\/src)[^'"]*['"]/);
  if(found) throw new Error(`${file} imports the Health Passport service (${found[0]}). The identity service reaches the Passport through its gateway or not at all, and it holds no clinical table of its own.`);
 }
 const identityColumn = /(^|_)(name|names|surname|first_?name|phone|mobile|msisdn|cell|email|address|birth|dob|id_?number|identity_?number|sa_?id|national_?id|passport_?number)(_|$)/i;
 let passportTables = 0;
 for(const file of passportSources.filter(f=>f.endsWith('.ts'))) {
  for(const table of tablesIn(read(file))) {
   passportTables++;
   for(const identifier of [table.name, ...table.columns]) if(identityColumn.test(identifier)) throw new Error(`${file} gives the Passport a place to hold who somebody is: ${table.name}.${identifier}. The Passport knows a person as an opaque token it minted; names, numbers and addresses live in the identity service and never here.`);
  }
 }
 if(passportTables < 5) throw new Error(`scripts/check-boundaries.mjs read ${passportTables} tables out of apps/passport, so the check on what they may hold is reading nothing.`);
 const realisticSaId = digits => {
  const month = Number(digits.slice(2,4)), day = Number(digits.slice(4,6));
  if(month < 1 || month > 12 || day < 1 || day > 31 || !/[01]/.test(digits[10])) return false;
  let sum = 0;
  for(let i = 0; i < 13; i++) { let d = Number(digits[12-i]); if(i % 2 === 1) { d *= 2; if(d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
 };
 for(const file of passportSources) {
  for(const [digits] of read(file).matchAll(/(?<!\d)\d{13}(?!\d)/g)) if(realisticSaId(digits)) throw new Error(`${file} holds ${digits}, which reads as a valid South African identity number. The Passport's fixtures are synthetic tokens and obviously invalid values, never a number that could be somebody's.`);
 }
 const passportConfig = read(`${passportDir}/src/config.ts`);
 const passportServer = read(`${passportDir}/src/server.ts`);
 if(!/developmentFlag/.test(passportConfig) || !/PassportRefusedToStart\(refusalOf\('not-development'\)\)/.test(passportConfig)) throw new Error('apps/passport/src/config.ts no longer refuses to start without the development flag. Until the DPIA is signed the service does not run anywhere it has not been told, in so many words, that the data is synthetic.');
 if(!/sharesIdentityKey\(/.test(passportConfig) || !/refusalOf\('shared-key'\)/.test(passportConfig)) throw new Error('apps/passport/src/config.ts no longer refuses a master key shared with, or derived from, the identity service\'s keys.');
 /* createPassport() loads — and so refuses — its own configuration, the gateway refuses one nobody
    loaded, and the process creates its server only from what createPassport() returned. Importing
    the service is not a way round the door the process goes through. */
 const passportGateway = read(`${passportDir}/src/gateway.ts`);
 if(!/export function createPassport\(env: NodeJS\.ProcessEnv\b.*\)\s*\{\s*const config = loadPassportConfig\(env\);/.test(passportServer) || passportServer.indexOf('createPassport(process.env)') < 0 || passportServer.indexOf('createPassport(process.env)') > passportServer.indexOf('createServer(passport.handle)')) throw new Error('apps/passport/src/server.ts no longer loads, and so refuses, its configuration inside createPassport() before it creates a server.');
 if(!/if \(!wasLoaded\(deps\.config\)\) throw new PassportRefusedToStart/.test(passportGateway)) throw new Error('apps/passport/src/gateway.ts no longer refuses a configuration loadPassportConfig() did not produce, so a gateway can be built that skipped the development flag, the key separation and the separate database.');
 if(!/listen\(config\.port, config\.host/.test(passportServer) || /0\.0\.0\.0/.test(passportServer) || !/LOOPBACK\.has\(req\.socket\.remoteAddress/.test(passportServer)) throw new Error('apps/passport/src/server.ts no longer binds to the configured loopback host and refuses requests that did not arrive on it.');
 if(!/LOOPBACK_HOSTS\.has\(hostName\(req\.headers\.host\)\)/.test(passportServer)) throw new Error('apps/passport/src/server.ts no longer refuses a request whose Host is not a loopback name. A page that has rebound its own hostname to 127.0.0.1 connects from the loopback address, so the address alone lets it in.');
 if(/requesterRole:\s*String\(body\.|requesterRef:\s*String\(body\./.test(passportServer)) throw new Error('apps/passport/src/server.ts takes who is breaking the glass from the request body. It comes from an operator credential (apps/passport/src/operator.ts) or not at all.');
 /* A patient session here is a stand-in for the identity service's session, and it does not outlive one. */
 const identityIdleMinutes = Number((read('apps/api/src/config.ts').match(/sessionIdleSeconds:\s*(\d+)\s*\*\s*60/) ?? [])[1]);
 if(!(identityIdleMinutes > 0)) throw new Error('scripts/check-boundaries.mjs can no longer read sessionIdleSeconds out of apps/api/src/config.ts, so nothing holds the Passport\'s development session to it.');
 if(gatewayContract.patientSession?.lifetimeMinutes !== identityIdleMinutes) throw new Error(`The Passport's development patient session lives ${gatewayContract.patientSession?.lifetimeMinutes} minutes and the identity service's idle limit is ${identityIdleMinutes}. A stand-in for a login does not last longer than the login it stands in for.`);
 if(!/DPIA/.test(passportServer.slice(0, 2500))) throw new Error('apps/passport/src/server.ts no longer says at the top why it runs in development only. The reason is the DPIA, and it belongs where the next person to open the file reads first.');
 for(const file of passportSources) if(/UPDATE\s+audit_events|DELETE\s+FROM\s+audit_events/i.test(read(file)) && !file.includes('/test/')) throw new Error(`${file} rewrites the Passport's audit log. It is append-only; the chain shows tampering, and the service itself must never be the thing it shows.`);
 const consentContract = JSON.parse(read('packages/catalog/consent.json'));
 const fixture = `${passportDir}/src/grant-roles.fixture.ts`;
 if(consentContract.grants && existsSync(fixture)) throw new Error(`packages/catalog/consent.json now carries grants, and ${fixture} still exists. The fixture was always a stand-in for that contract: read the roles from consent.json in apps/passport/src/contract.ts and delete the fixture.`);
 if(!consentContract.grants && !existsSync(fixture)) throw new Error(`${fixture} is gone and packages/catalog/consent.json has no grants, so the Passport's gateway has no roles to decide anything against.`);
 /* ---- Integration, Wave 1: what each grant role may do at the Passport gateway -----------------
    The Passport's roles came from a local fixture until consent.json carried grants. They now come
    from the contract, and what a role may do at the gateway lives on the role, so the grant sheet,
    the gateway and this check read one list. Only clinicians write; aggregate reading and a
    non-identifiable role are the same fact and must agree; a grant bound to a trip opens the
    emergency summary and nothing else. */
 if (consentContract.grants) {
  const GATEWAY_READS = new Set(['records', 'routine', 'emergency-summary', 'aggregate']);
  for (const role of consentContract.grants.recipientRoles) {
   const g = role.gateway, where = `The grant role ${role.id} in packages/catalog/consent.json`;
   if (!g || !GATEWAY_READS.has(g.reads) || typeof g.writes !== 'boolean' || typeof g.sealedMayBeIncluded !== 'boolean' || typeof g.clinician !== 'boolean') throw new Error(`${where} does not say what it may do at the Passport gateway (reads, writes, sealedMayBeIncluded, clinician), so the gateway would have to guess.`);
   if (g.writes && !g.clinician) throw new Error(`${where} may write to a record without being a clinician. Only the patient's own session and the treating clinicians write.`);
   if ((g.reads === 'aggregate') !== (role.identifiable === false)) throw new Error(`${where} reads "${g.reads}" while identifiable is ${role.identifiable}. Reading aggregates and being a non-identifiable role are the same fact, and they must agree.`);
   if (role.boundTo === 'trip' && g.reads !== 'emergency-summary') throw new Error(`${where} is bound to a trip but reads more than the emergency summary.`);
   if (g.reads === 'aggregate' && g.sealedMayBeIncluded) throw new Error(`${where} could have a sealed category ticked into an aggregate.`);
  }
  /* ---- Added by the Trust, Record & Identity lead, on the integrator's decision: how long, and why.
     Every role carries maxExpiryDays and allowedPurposes, and the Passport gateway enforces both when
     a grant is made. A ceiling below the default would make the grant sheet's own default refused; a
     ceiling past a year is the grant nobody remembers; a trip-bound grant outliving a day is the
     responder who can look again. A purpose outside the gate's union is a reason nobody can check,
     and a default purpose the role may not name is a grant sheet that starts refused. And a role
     whose default scope the gateway itself would refuse is a grant sheet offering a door that does
     not open — which is what the responder's emergency card and transport were until this landed. */
  /* The founder's ceiling, 14 September 2026: no grant lasts longer than grants.maximumExpiryDays. The
     number lives in consent.json once and is read here, never restated, so a role cannot be given
     longer than it by editing one side. A ceiling with no recorded decision is a guess with a field name. */
  const ceiling = consentContract.grants.maximumExpiryDays;
  const decision = consentContract.grants.maximumExpiryDecision;
  if (!Number.isInteger(ceiling) || ceiling < 1) throw new Error(`packages/catalog/consent.json has no contract-wide grant ceiling (grants.maximumExpiryDays is ${JSON.stringify(ceiling)}). The founder decided on 14 September 2026 that no consent grant may last longer than a set number of days, and every role's ceiling is measured against it.`);
  if (!decision || !['decidedBy', 'decidedOn', 'why'].every(field => typeof decision[field] === 'string' && decision[field].trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(decision.decidedOn)) throw new Error('packages/catalog/consent.json carries a grant ceiling without its decision: who decided it, on what day, and why. A number with no author is a number the next person changes.');
  const grantPurposes = new Set([...((read('apps/api/src/protection/contract.ts').match(/export type Purpose =([^;]+);/) ?? [])[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]));
  if (!grantPurposes.size) throw new Error('scripts/check-boundaries.mjs can no longer read the Purpose union out of apps/api/src/protection/contract.ts, so nothing checks a grant role\'s allowed purposes.');
  const { grantRoles: passportGrantRoles, grantScopeRefusal } = await import('../apps/passport/src/contract.ts');
  for (const role of consentContract.grants.recipientRoles) {
   const where = `The grant role ${role.id} in packages/catalog/consent.json`;
   if (!Number.isInteger(role.maxExpiryDays) || role.maxExpiryDays < role.defaultExpiryDays || role.maxExpiryDays > ceiling) throw new Error(`${where} lets a grant run ${role.maxExpiryDays} days against a default of ${role.defaultExpiryDays} and a contract-wide ceiling of ${ceiling}. A role's ceiling is a whole number of days, no shorter than its default and no longer than the ceiling the founder decided (${decision.decidedOn}).`);
   if (role.boundTo === 'trip' && role.maxExpiryDays !== 1) throw new Error(`${where} is bound to a trip and may be granted for ${role.maxExpiryDays} days. A trip-bound grant lasts at most a day.`);
   if (!Array.isArray(role.allowedPurposes) || role.allowedPurposes.some(p => !grantPurposes.has(p)) || new Set(role.allowedPurposes).size !== role.allowedPurposes.length) throw new Error(`${where} allows the purposes ${JSON.stringify(role.allowedPurposes)}. Each is one purpose, once, from the gate's Purpose union in apps/api/src/protection/contract.ts.`);
   if (role.defaultPurpose === null ? role.allowedPurposes.length !== 0 : !role.allowedPurposes.includes(role.defaultPurpose)) throw new Error(`${where} defaults to the purpose ${JSON.stringify(role.defaultPurpose)} and allows ${JSON.stringify(role.allowedPurposes)}. The default purpose is one the role may name, and a role with no default purpose — the scheme — may name none.`);
   if (role.gateway?.reads === 'aggregate' && role.allowedPurposes.length) throw new Error(`${where} reads aggregates and may still name a purpose for reading a record.`);
   if (role.defaultScope.length) {
    const gatewayRole = passportGrantRoles().find(r => r.id === role.id);
    const refusal = gatewayRole ? grantScopeRefusal(gatewayRole, role.defaultScope, false) : 'unknown-role';
    if (refusal) throw new Error(`${where} has a default scope of ${role.defaultScope.join(', ')}, and the Passport gateway refuses that scope for this role ("${refusal}"). A grant sheet must never start from a grant the gateway will not accept.`);
   }
  }
 }
 const rootPackage = JSON.parse(read('package.json'));
 if(!rootPackage.workspaces.includes(passportDir) || !/-w @mythuso\/passport/.test(rootPackage.scripts.check) || !/-w @mythuso\/passport/.test(rootPackage.scripts.test)) throw new Error('The root package.json no longer typechecks and tests apps/passport. A service nobody tests is a service whose refusals nobody has seen fire.');
 if(!/Health Passport P0/.test(read('docs/PRIVACY-AND-SECURITY.md'))) throw new Error('docs/PRIVACY-AND-SECURITY.md no longer records the Health Passport P0 service and what it is absent of in production.');
}

/* ==== HANDLERS THAT DECIDE WHO MAY ACT =============================================================
   ADDED BY THE TRUST, RECORD & IDENTITY LEAD, after the third review.

     1. The identity callback's signature branch is never conditioned on the session's mode alone.
        The first version read `if (session.mode === 'live')`, so every stored value that was not
        exactly `live` skipped the signature. A signature is waived only where the session is a
        sandbox, the environment is explicitly development, and no credentials are configured —
        all three, on one line this check can read — and a stored mode is never defaulted to sandbox.
     2. Recording an incident's containment is held to its reporter or a review-vetting holder.
     3. Creating a Passport subject takes a developer credential, not the loopback alone. */
{
 const identitySource = read('apps/api/src/vetting/identityProvider.ts');
 const modeAlone = identitySource.match(/if\s*\(\s*session\.mode\s*(===?\s*'live'|!==?\s*'sandbox')\s*\)/);
 if (modeAlone) throw new Error(`apps/api/src/vetting/identityProvider.ts decides whether an identity callback needs a signature on the session's mode alone ("${modeAlone[0]}"). A mode read from a row is a string anybody with the database can change; the signature is waived only where the session is a sandbox, MYTHUSO_ENV says development and no credentials are configured, all three at once.`);
 if (!/const unsignedAllowed = session\.mode === 'sandbox' && explicitDevelopment && !credentialled;/.test(identitySource) || !/if \(!unsignedAllowed\) \{[\s\S]{0,400}signature/.test(identitySource)) throw new Error('apps/api/src/vetting/identityProvider.ts no longer waives the callback signature only for a sandbox session in explicit development with no credentials, on one line guarding the signature check.');
 if (!/const explicitDevelopment = config\.environment === 'development' && config\.explicitDevelopment === true;/.test(identitySource)) throw new Error('apps/api/src/vetting/identityProvider.ts no longer takes explicit development from MYTHUSO_ENV said in so many words. An unset environment is not permission to accept unsigned callbacks.');
 const vettingStoreSource = read('apps/api/src/vetting/store.ts');
 if (/===\s*'live'\s*\?\s*'live'\s*:\s*'sandbox'/.test(vettingStoreSource) || !/isIdentityMode\(row\.mode\)\s*\?\s*row\.mode\s*:\s*null/.test(vettingStoreSource)) throw new Error('apps/api/src/vetting/store.ts reads an identity session\'s stored mode by defaulting it rather than validating it. A value that is not a mode is unknown, never sandbox.');
 const apiServerSource = read('apps/api/src/server.ts');
 const containRoute = (apiServerSource.match(/routes\.set\('POST \/incidents\/contain'[\s\S]*?\n  \}\);/) ?? [])[0] ?? '';
 if (!containRoute) throw new Error('apps/api/src/server.ts no longer declares POST /incidents/contain in a form this check can read.');
 if (!/incident\.openedBy === held\.actor\.party\.id/.test(containRoute) || !/grants\.includes\('review-vetting'\)/.test(containRoute) || !/INCIDENT_REFUSALS\.notYours/.test(containRoute)) throw new Error('POST /incidents/contain no longer holds containment to the party who reported the incident or a reviewer holding review-vetting. Any vetted party could mark anybody\'s incident contained.');
 for (const route of ['notified', 'close']) {
  const body = (apiServerSource.match(new RegExp(`routes\\.set\\('POST \\/incidents\\/${route}'[\\s\\S]*?\\n  \\}\\);`)) ?? [])[0] ?? '';
  if (!/asOperator\(req, res, 'incident'\)/.test(body)) throw new Error(`POST /incidents/${route} is no longer held to a reviewer through asOperator.`);
 }
 const passportServerSource = read('apps/passport/src/server.ts');
 if (!/gateway\.createSubject\(tokenFor\(req, 'Developer'\)\)/.test(passportServerSource) || !/const developer = developerOf\(/.test(read('apps/passport/src/gateway.ts'))) throw new Error('apps/passport creates a synthetic subject without a developer credential. The loopback alone mints no patient.');
}

/* What is left to check about the native vetting models is what is still written by hand. The
   tables themselves are generated above, so a refusal sentence cannot say one thing on iOS and
   another on Android — there is only one sentence and one writer of it. The lifecycle is a
   different matter: the 45-day renewal warning is arithmetic, it lives in three hand-written
   files, and a nurse warned at 45 days on one phone and 30 on another is warned too late on one
   of them. */
const nativeVetting = {
 ios: 'apps/ios/MyThuso/Models/Vetting.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/model/Vetting.kt'
};
for(const [platform,file] of Object.entries(nativeVetting)) {
 if(!existsSync(file)) throw new Error(`The ${platform} app has no vetting model (${file}). Vetting is not optional on one platform.`);
 const source=read(file);
 if(!/(?<![\d.])45(?![\d.])/.test(source)) throw new Error(`The 45-day renewal warning is missing from ${platform} (${file})`);
 /* A generated table is only worth having if it is the only one. Pasting the roles back in here
    would leave two, and two is where drift comes from. */
 if(/(static let (capabilities|authorities|roles|scopes|gates|gateRules|gateNotes)\b|val vetting(Capabilities|Authorities|Roles|Scopes|Gates|GateRules|GateNotes)\s*[:=])/.test(source)) throw new Error(`${file} declares a vetting table of its own. That table is generated into VettingData — the app should read that one.`);
}
/* Read only so the line below can say how much was generated. Nothing about the contract is checked
   against a native file any more: there is one copy of it and a generator between it and the two
   apps, which is the whole point of the block above. */
const records=JSON.parse(read('packages/catalog/records.json'));
const webVetting=read('apps/web/src/lib/vetting.ts');
if(!webVetting.includes('EXPIRY_WARNING_DAYS = 45')) throw new Error('The 45-day renewal warning has moved in apps/web/src/lib/vetting.ts');

/* Coordinates are written out three times, because each app is genuinely native and none of them
   reads packages/geo at runtime. This is the layer where a disagreement is silent: a bounding box
   that differs by a degree, or a speed that differs by ten, produces a plausible number on one phone
   and a different plausible number on another, and nothing looks broken. ArtisanZA had a simulator's
   default coordinate reach production and draw a 16 939 km route line — the refusal sentences below
   are what send whoever finds it to the right line, so they are compared word for word. */
const geoSources = {
 /* The web splits the layer across modules; the natives keep it in one file each. Both are read
    whole, because what is being compared is the answer the layer gives, not where it lives. */
 web: ['packages/geo/coords.ts','packages/geo/normalize.ts','packages/geo/eta.ts'],
 ios: ['apps/ios/MyThuso/Models/Geo.swift'],
 android: ['apps/android/app/src/main/java/za/co/mythuso/model/Geo.kt']
};
const geoRefusals = [
 'No coordinate was given.',
 'Coordinate is not a number.',
 'Coordinate exceeds the global lat/lng range.',
 'Coordinate is null-island (0, 0) — almost always an unset field rather than a place.',
 'Coordinate looks like a mobile simulator default (Cupertino, or the Android emulator’s Mountain View).',
 'Coordinate is outside South Africa.'
];
/* The numbers an estimate is built from. A speed named on the row must be the speed the arithmetic
   used, on every platform, or the row is lying about its own working. */
const geoConstants = [['16', 'western bound'], ['33.5', 'eastern bound'], ['-35.5', 'southern bound'], ['-22', 'northern bound'],
                      ['30', 'assumed urban speed'], ['300', 'the distance beyond which it is a coordinate fault'], ['6371', 'earth radius']];
for(const [platform,paths] of Object.entries(geoSources)) {
 for(const f of paths) if(!existsSync(f)) throw new Error(`The ${platform} app has no coordinate guard (${f}). Every coordinate is guarded or none of them is.`);
 const file=paths[0], source=paths.map(read).join('\n');
 for(const refusal of geoRefusals) if(!source.includes(refusal)) throw new Error(`Coordinate refusal drift in ${platform} (${file}): it does not say "${refusal}"`);
 /* Swift and Kotlin write a Double as 30.0 where TypeScript writes 30, so a trailing zero is the
    same number rather than a different one. Anything else after it is not. */
 for(const [value,what] of geoConstants) {
  const literal=value.replace('-','').replace('.','\\.');
  if(!new RegExp(`(?<![\\d.])-?${literal}(?:\\.0+)?(?![\\d.])`).test(source)) throw new Error(`The ${what} (${value}) is missing from the ${platform} coordinate guard (${file})`);
 }
}

/* A reading's origin decides what may be done with it, so the contract that describes origins is
   checked the way the others are: every device must measure something the clinical assessment
   actually collects, and every conflict must say who resolves it. A conflict with no resolver is a
   merge waiting to be invented by whoever is next in the file. */
const capture=JSON.parse(read('packages/catalog/capture.json'));
const NOT_RANGE_FLAGGED=['ecg','weight'];
/* Read from the contract, which is where the seven live now — not scraped out of a screen. */
const observationIds=measures.map(m=>m.id);
for(const device of capture.devices) {
 if(!device.measures.length) throw new Error(`Kit device ${device.id} measures nothing`);
 for(const measure of device.measures) {
  /* Two measurements are recorded without being flagged against an indicative range, and both for
     the same reason: there is no range to flag them against. A weight is only meaningful against
     this person's own previous weights, and a single-lead ECG is a trace rather than a number.
     Naming them here keeps the list deliberate — a third one has to be argued for. */
  if(!NOT_RANGE_FLAGGED.includes(measure)&&!observationIds.includes(measure)) throw new Error(`Kit device ${device.id} measures "${measure}", which the clinical assessment does not collect and which is not on the not-range-flagged list`);
 }
 if(!(device.calibrateEveryMonths>0)) throw new Error(`Kit device ${device.id} has no calibration cadence`);
}
const resolvers=new Set(['clinician','server']);
for(const conflict of capture.conflicts) if(!resolvers.has(conflict.resolution)) throw new Error(`Capture conflict ${conflict.id} does not say who resolves it`);
if(!capture.provenance.some(p=>p.id==='device')||!capture.provenance.some(p=>p.id==='manual')) throw new Error('The capture contract must tell a measured reading from a typed one');

/* What a nurse is paid is the one number in this repository that is written down in three places
   at once: the price a patient is quoted, the payout on the nurse's own screen, and the claim the
   public landing page makes about both. So it is written down in one place — packages/catalog/
   services.json — and everything else derives from it. These checks exist to keep that true, and
   the first of them is the one that matters: earnings.json must not be able to name an amount for
   a visit at all. */
const earnings=JSON.parse(read('packages/catalog/earnings.json'));
const serviceById=new Map(catalogue.map(s=>[s.id,s]));
const payStates=new Set(earnings.states.map(s=>s.id));
const payKinds=new Map(earnings.lineKinds.map(k=>[k.id,k]));
let accruing=0, settledWeeks=0;
for(const week of earnings.weeks) {
 if(!payStates.has(week.state)) throw new Error(`Payout week ${week.id} is in a state nothing defines: ${week.state}`);
 if(week.state==='accruing') accruing++;
 if(earnings.states.find(s=>s.id===week.state).settled) settledWeeks++;
 if(week.state==='failed'&&!week.failure) throw new Error(`Payout week ${week.id} failed without saying why. A payout that says only "failed" is one a nurse cannot act on.`);
 if(!week.lines.length) throw new Error(`Payout week ${week.id} has no lines`);
 for(const line of week.lines) {
  const kind=payKinds.get(line.kind);
  if(!kind) throw new Error(`Payout line ${line.reference} has an unknown kind ${line.kind}`);
  if(kind.sign>0&&line.service) {
   if(!serviceById.has(line.service)) throw new Error(`Payout line ${line.reference} names a service that is not in the catalogue: ${line.service}`);
   /* The whole design of the feature. A visit is worth the nurse's share of its catalogue price
      and nothing else, so there is nowhere here to type a different number. */
   if(line.amount!==undefined) throw new Error(`Payout line ${line.reference} carries its own amount. A visit is worth the nurse's share of its price in packages/catalog/services.json — there is no second place for that number.`);
  } else {
   if(typeof line.amount!=='number') throw new Error(`Payout line ${line.reference} is a ${line.kind} with no amount`);
   if(!line.reason) throw new Error(`Payout line ${line.reference} takes money off or puts it back without saying why. A line that only says "adjustment" is a line a nurse cannot argue with.`);
  }
 }
}
if(accruing!==1) throw new Error(`Exactly one payout week may be accruing; ${accruing} are`);
if(!settledWeeks) throw new Error('No payout week has settled, so the tax-year total on the earnings screen is a figure about nothing');
for(const id of ['share-is-not-reduced','suspension-is-not-confiscation','accrued-is-not-paid','no-tax-withheld','account-change-waits','every-deduction-is-named']) {
 if(!earnings.rules.some(r=>r.id===id)) throw new Error(`The earnings contract has lost the rule "${id}". These are promises made to nurses on three platforms at once.`);
}
/* The public page says three quarters of the fee goes to the nurse, and gives a range. Both are
   claims about the catalogue rather than decoration, so both are held to it. */
for(const s of catalogue.filter(s=>s.phase===1)) {
 const share=s.nurseShare/s.price;
 if(share<0.74||share>0.76) throw new Error(`${s.name} pays the nurse ${(share*100).toFixed(1)}% of R${s.price}. The public page says three quarters; either the price changes or the claim does.`);
}
const shares=catalogue.filter(s=>s.phase===1).map(s=>s.nurseShare);
const advertised=read('apps/web/src/features/Landing.tsx').match(/\{money\((\d+)\)\}–\{money\((\d+)\)\} a visit/);
if(!advertised) throw new Error('The landing page no longer advertises a per-visit range for nurses, or has stopped writing it in a form this check can read');
if(Number(advertised[1])!==Math.min(...shares)||Number(advertised[2])!==Math.max(...shares)) {
 throw new Error(`The landing page advertises R${advertised[1]}–R${advertised[2]} a visit; the catalogue pays R${Math.min(...shares)}–R${Math.max(...shares)}`);
}

/* Thuso SOS is the one screen in this repository where being wrong is dangerous rather than
   inconvenient, so it is checked harder than anything else here.

   The first check is the only one that would matter on its own: an emergency number on this screen
   must be a real South African emergency number. Not a placeholder, not a fictional demo number,
   not a digit typed wrongly into a Swift file and a Kotlin file. Every run of three or more digits
   anywhere in the contract is compared against the three that are allowed to be there, so a
   fictional number cannot be added to this pathway without failing the build — which is the
   opposite of the rule everywhere else in this preview, where the data is fictional on purpose.

   The rest hold the four promises the screen makes: emergency services above anything MyThuso
   sells, routing rather than triage, a target that is not a guarantee, and vetting that urgency
   does not lift. */
const sos=JSON.parse(read('packages/catalog/sos.json'));
const SA_EMERGENCY_NUMBERS=[['ambulance','10177'],['mobile','112'],['police','10111']];
if(sos.emergency.numbers.length!==SA_EMERGENCY_NUMBERS.length) throw new Error('The emergency pathway lists a number of emergency services other than the three South Africa actually has');
SA_EMERGENCY_NUMBERS.forEach(([id,number],index)=>{
 const entry=sos.emergency.numbers[index];
 if(entry.id!==id||entry.number!==number) throw new Error(`Emergency number ${index+1} must be ${id} on ${number}. South Africa's emergency numbers are 10177 for an ambulance, 112 from a mobile and 10111 for the police, and a wrong digit here is not a cosmetic defect.`);
 if(!entry.whenToUse) throw new Error(`Emergency number ${number} does not say when to use it`);
});
const allowedDigits=new Set(SA_EMERGENCY_NUMBERS.map(([,n])=>n));
for(const run of read('packages/catalog/sos.json').match(/\d{3,}/g)??[]) {
 if(!allowedDigits.has(run)) throw new Error(`packages/catalog/sos.json contains the number ${run}. The only numbers allowed on the emergency pathway are the real ones — ${[...allowedDigits].join(', ')} — because every other screen in this preview is fictional on purpose and this one must not be.`);
}
/* The eight conditions that end the questions. Losing one of them silently is losing the reason
   somebody with it would have been sent to an ambulance instead of to a nurse. */
for(const id of ['chest-pain','breathing','bleeding','unresponsive','stroke','seizure','infant','obstetric']) {
 if(!sos.redFlags.conditions.some(c=>c.id===id)) throw new Error(`The emergency pathway has lost the condition "${id}". These eight are what send somebody straight to emergency services; a shorter list is a longer wait for whoever falls off it.`);
}
/* Routing, not triage. Nothing in the contract may carry a severity, a score or a weight: the
   moment one appears, the questions have stopped routing and started assessing. */
for(const condition of sos.redFlags.conditions) {
 for(const field of ['severity','score','weight','priority','urgency']) {
  if(field in condition) throw new Error(`Condition ${condition.id} carries a "${field}". Software does not triage: these questions route, and a condition that can be scored is a condition that can be scored lower.`);
 }
}
if(sos.routing.questions[0].kind!=='red-flags') throw new Error('The red-flag question is no longer first in the emergency pathway. It is the only question that matters, and anything asked before it is a question asked instead of an ambulance.');
if(sos.routing.questions.length>3) throw new Error(`The emergency pathway asks ${sos.routing.questions.length} questions. A frightened person answers a small number of them; anything past three is triage wearing a form.`);
/* A target is not a promise, and the number is the catalogue's. sos.json writes {target} and has
   nowhere to type 45, R398 or R249 — the same rule the earnings contract is held to. */
const sosService=catalogue.find(s=>s.id==='sos');
if(!sosService) throw new Error('packages/catalog/services.json has no `sos` row, so the emergency pathway has no service behind it');
const sosAlert=model.subscriptions.find(s=>s.id==='alert');
if(!sosAlert?.price) throw new Error('packages/catalog/business-model.json has no priced `alert` subscription, so Thuso Alert has no price to be honest about');
if(!sosService.description.includes(String(sosService.duration))) throw new Error(`The Thuso SOS catalogue row promises "${sosService.description}" and targets ${sosService.duration} minutes. The claim and the target are the same number or the claim is wrong.`);
for(const [key,text] of Object.entries(sos.target)) {
 for(const token of text.match(/\{[a-z]+\}/g)??[]) if(token!=='{target}') throw new Error(`sos.target.${key} writes ${token}, which nothing fills in. The only token on this pathway is {target}.`);
}
if(!sos.target.statement.includes('{target}')) throw new Error('The target statement no longer names the target it is about');
/* Everything a failure screen is for. A failure with no way out is a dead end wearing an apology. */
for(const failure of sos.failures) {
 if(!failure.instead) throw new Error(`Failure "${failure.id}" does not say what to do instead. A panic button that fails without an alternative is worse than one that was never offered.`);
 if(!/10177|112/.test(failure.instead)&&failure.id!=='vetting') throw new Error(`Failure "${failure.id}" does not point at emergency services. Every dead end on this pathway ends at an ambulance number.`);
}
for(const id of ['no-signal','no-nurse','outside-hours','outside-coverage','no-callback','vetting']) {
 if(!sos.failures.some(f=>f.id===id)) throw new Error(`The emergency pathway has lost the "${id}" failure. A panic button people rely on has to be honest about every way it does not work.`);
}
for(const reason of sos.standDown.reasons) {
 if(!reason.nurseIsTold||!reason.recorded) throw new Error(`Stand-down reason "${reason.id}" does not say what the nurse is told and what is recorded`);
}
for(const id of ['emergency-services-first','routing-not-triage','target-is-a-target','urgency-does-not-relax-vetting','silence-is-not-cancellation','estimate-says-when-it-does-not-know']) {
 if(!sos.rules.some(r=>r.id===id)) throw new Error(`The emergency pathway has lost the rule "${id}". These are promises made on three platforms at once, on the screen where breaking one is dangerous.`);
}
/* Coverage is a claim about where a nurse can actually be sent, so it is held against the board
   that sends them. An area on this screen that the dispatch board has never heard of is a person
   waiting at a window. */
const geography=JSON.parse(read('packages/catalog/geography.json'));
/* Against the contract now, not against a string in a React component. The zones used to be typed
   into Dispatch.tsx and this grepped for them there, which meant the check passed or failed on how
   somebody had punctuated a property — and stopped working the moment the board started reading
   the same contract every platform reads. */
const coveredZones=new Set(geography.zones.map(z=>z.name));
for(const area of sos.coverage.areas) {
 if(!coveredZones.has(area)) throw new Error(`Thuso SOS claims to cover ${area}, which is not a zone in packages/catalog/geography.json. A coverage list drawn optimistically is a person waiting at a window.`);
}
/* The order of the page is the feature: emergency services above anything MyThuso sells. Each of
   the three screens is read for where it renders the emergency block and where it first renders the
   price of the visit, and the first must come before the second. */
const sosScreens = {
 web: ['apps/web/src/features/Sos.tsx','<EmergencyFirst/>','money(visitPrice)'],
 ios: ['apps/ios/MyThuso/Features/SosView.swift','emergencyFirst','Sos.visitPrice'],
 android: ['apps/android/app/src/main/java/za/co/mythuso/ui/SosScreens.kt','EmergencyFirst()','sosVisitPrice']
};
for(const [platform,[file,first,sells]] of Object.entries(sosScreens)) {
 const source=read(file);
 const emergencyAt=source.indexOf(first), sellsAt=source.indexOf(sells);
 if(emergencyAt<0) throw new Error(`The ${platform} emergency screen no longer renders the emergency block (${file})`);
 if(sellsAt>=0&&emergencyAt>sellsAt) throw new Error(`The ${platform} emergency screen offers a MyThuso visit before it shows the ambulance number (${file}). That ordering asks a frightened person to compare the two, and some of them will choose wrong.`);
 /* Urgency never relaxes vetting: the same gate the dispatch board asks. */
 if(!source.includes('take-visit')) throw new Error(`The ${platform} emergency screen does not ask vetting before offering a nurse (${file}). Urgency is exactly when a shortcut is easiest to justify.`);
 /* Nothing dials. No telephony reaches these files, on any platform. */
 if(/tel:|UIApplication\.shared\.open|ACTION_DIAL|ACTION_CALL|CallKit/.test(source)) throw new Error(`The ${platform} emergency screen has grown a way to place a call (${file}). Nothing in this preview dials, and a screen that half-dials is worse than one that prints the number.`);
}


/* The teleconsultation call. Five invariants, and only one of them is about wording.

   Nothing here connects. Neither native app declares a camera or a microphone permission and no
   call screen reaches for one, so "we never asked" stays a true sentence rather than one somebody
   forgot to delete when they wired up a media SDK.

   Recording is a second question. It is optional, it is revocable, and — this is the arithmetic
   rather than the promise — a build that declares no microphone may not offer to record at all.

   The degradation ladder shrinks. What a poor line permits must be a subset of what a good one
   permits, and a dropped line permits nothing. A degraded state that let a doctor conclude
   something a working one did not would be a screen inviting a decision on less evidence.

   An encounter that did not reach a decision is not a consultation, does not write the assessment
   or the plan, and is not charged for. This is the whole feature. The failure it is written against
   is not somebody typing the wrong sentence — it is a half-finished encounter sitting in a record
   looking exactly like a finished one until a clinician relies on it a year later.

   And there is one identity check in MyThuso. The doctor asks for the same six-digit visit code the
   nurse asks for at the door, and refuses in the same words, on all three platforms. */
const teleconsult=JSON.parse(read('packages/catalog/teleconsult.json'));
/* The web splits the call across a screen and the reasoning behind it; the natives keep the
   reasoning in a model file beside the view. Each platform is read whole, because what is being
   compared is the answer the call gives, not where it lives. */
const teleconsultSources={
 web: ['apps/web/src/features/Teleconsult.tsx','apps/web/src/lib/teleconsult.ts'],
 ios: ['apps/ios/MyThuso/Features/TeleconsultView.swift','apps/ios/MyThuso/Models/Teleconsult.swift'],
 android: ['apps/android/app/src/main/java/za/co/mythuso/ui/TeleconsultScreens.kt','apps/android/app/src/main/java/za/co/mythuso/model/Teleconsult.kt']
};
const mediaApis=/\b(getUserMedia|RTCPeerConnection|MediaRecorder|AVCaptureDevice|AVAudioRecorder|MediaProjection|CameraX|Manifest\.permission\.(CAMERA|RECORD_AUDIO))\b/;
for(const [platform,paths] of Object.entries(teleconsultSources)) {
 for(const file of paths) {
  if(!existsSync(file)) throw new Error(`The ${platform} app has no teleconsultation screen (${file}). The call is not optional on one platform.`);
  if(mediaApis.test(read(file))) throw new Error(`The ${platform} teleconsultation screen reaches for media (${file}). This build captures nothing and the screens say so — an app that says "we never asked" while holding a camera handle is lying to the patient rather than to the reviewer.`);
 }
}
/* Narrowed on 14 September 2026, when the founder gave Gilbert push-to-talk. The camera is still refused
   outright. The microphone may now be declared, but only because the voice capability names it — the
   consultation tells a patient it has never asked for one, and a permission declared for one feature
   is not a permission for another. The teleconsultation screens themselves are still held to no media
   API at all, above. */
const teleconsultVoiceAsks = new Set((JSON.parse(read('packages/catalog/capabilities.json')).capabilities.find(c => c.id === 'voice')?.requiresPermissions ?? []).map(p => p.permission));
if(/android\.permission\.CAMERA/.test(read('apps/android/app/src/main/AndroidManifest.xml'))) throw new Error('The Android manifest declares a camera permission. The teleconsultation screens tell the patient none is declared.');
if(/INFOPLIST_KEY_NSCameraUsageDescription/.test(read('apps/ios/MyThuso.xcodeproj/project.pbxproj'))) throw new Error('The iOS target declares a camera usage description. The teleconsultation screens tell the patient none is declared.');
if(/android\.permission\.RECORD_AUDIO/.test(read('apps/android/app/src/main/AndroidManifest.xml')) && !teleconsultVoiceAsks.has('android.permission.RECORD_AUDIO')) throw new Error('The Android manifest declares RECORD_AUDIO and the voice capability does not name it. The consultation tells a patient it has never asked for the microphone; the only feature allowed one is Gilbert\'s push-to-talk, by name.');
if(/INFOPLIST_KEY_NSMicrophoneUsageDescription/.test(read('apps/ios/MyThuso.xcodeproj/project.pbxproj')) && !teleconsultVoiceAsks.has('NSMicrophoneUsageDescription')) throw new Error('The iOS target declares a microphone usage description and the voice capability does not name it. The consultation tells a patient it has never asked for the microphone; the only feature allowed one is Gilbert\'s push-to-talk, by name.');
if(teleconsult.media.declared) throw new Error('packages/catalog/teleconsult.json says media is declared. Nothing in this repository declares it, so the screens would be describing a build that does not exist.');
if(!teleconsult.media.states.some(s=>s.id==='never-asked')||!teleconsult.media.states.some(s=>s.id==='refused')) {
 throw new Error('The media posture must tell "we never asked" from "you refused". One screen for both tells a patient their answer did not matter.');
}
/* Consent is per person, optional where the person is optional, and always revocable. A consent
   item that cannot be taken back in the middle of a call is a signature, not a consent. */
for(const item of teleconsult.consent) {
 if(!item.revocable||!item.revokedMidCall) throw new Error(`Consent item ${item.id} cannot be withdrawn mid-call, or does not say what happens when it is. Consent that only runs one way is not consent.`);
}
const recordConsent=teleconsult.consent.find(c=>c.id==='record-the-call');
if(!recordConsent) throw new Error('There is no separate consent to record a teleconsultation. Consent to be treated would then be consent to be recorded, which is the one thing this feature exists to keep apart.');
if(recordConsent.required) throw new Error('Consent to a recording is marked required. Refusing to be recorded has to be costless, and a required question is not a question.');
if(teleconsult.recording.offeredInPreview&&!teleconsult.media.declared) throw new Error('The teleconsultation contract offers recording in a build that declares no microphone. A control that cannot do what it says teaches a patient to grant it anyway.');
if(!(teleconsult.recording.whenItExists.keptForDays>0)) throw new Error('The recording policy does not say how long a recording is kept. "Until further notice" is a retention schedule nobody consented to.');
if(!teleconsult.recording.whenItExists.whoMayView.length) throw new Error('The recording policy does not say who may view a recording.');
for(const p of teleconsult.participants) {
 if(p.consentQuestion&&!p.ifDeclined) throw new Error(`Participant ${p.id} is asked for consent without saying what declining costs. A patient cannot weigh a question whose answer has undisclosed consequences.`);
 if(p.consentQuestion&&!teleconsult.consent.some(c=>c.participant===p.id)) throw new Error(`Participant ${p.id} is asked a consent question that no consent item can carry or withdraw.`);
 if(!p.essential&&!p.mayBeAskedToLeave) throw new Error(`Participant ${p.id} is not essential to the consultation and still cannot be asked to leave.`);
 if(p.essential&&p.mayBeAskedToLeave) throw new Error(`Participant ${p.id} is essential and can be asked to leave, which are two different screens pretending to be one.`);
}
/* The ladder. Ordered best first, each rung a subset of the one above it, and the bottom rung
   permitting nothing at all. */
const teleconsultLimitIds=new Set(teleconsult.clinicalLimits.map(l=>l.id));
const ladder=[...teleconsult.connection].sort((a,b)=>b.fidelity-a.fidelity);
for(const state of ladder) {
 if(!state.patientSees||!state.doctorSees) throw new Error(`Connection state ${state.id} does not say what both ends see. A patient staring at a frozen picture while the doctor's screen says something else is the failure this is written against.`);
 for(const id of state.permits) if(!teleconsultLimitIds.has(id)) throw new Error(`Connection state ${state.id} permits ${id}, which is not a clinical limit anything defines`);
}
for(let i=1;i<ladder.length;i++) {
 const above=new Set(ladder[i-1].permits);
 const gained=ladder[i].permits.filter(id=>!above.has(id));
 if(gained.length) throw new Error(`"${ladder[i].name}" permits ${gained.join(', ')}, which "${ladder[i-1].name}" does not. A worse line cannot allow a doctor to conclude more than a better one.`);
}
if(ladder[ladder.length-1].permits.length) throw new Error(`The worst connection state ("${ladder[ladder.length-1].name}") still permits something. A line that is down permits nothing, which is why there is no button to close an encounter while it is.`);
const audioOnly=teleconsult.connection.find(c=>c.id==='audio');
if(!audioOnly) throw new Error('There is no sound-only connection state. Bandwidth in South Africa is the ordinary case, not an error toast.');
for(const id of ['see-the-patient','assess-visible']) if(audioOnly.permits.includes(id)) throw new Error(`Sound only permits ${id}. A doctor who cannot see the patient does not assess what they cannot see.`);
if(!(teleconsult.reconnect.holdSeconds>0)||!(teleconsult.reconnect.attempts>0)) throw new Error('The reconnection protocol does not say how long anybody waits or how many times anybody tries.');
/* The invariant the whole feature is built around. */
const consultationSectionIds=new Set(records.consultation.sections.map(s=>s.id));
let unfinishedOutcomes=0, realConsultations=0;
for(const outcome of teleconsult.outcomes) {
 if(!outcome.record) throw new Error(`Encounter outcome ${outcome.id} does not say what it writes into the record.`);
 for(const id of outcome.writes) if(!consultationSectionIds.has(id)) throw new Error(`Encounter outcome ${outcome.id} writes "${id}", which is not a section of the consultation record in packages/catalog/records.json`);
 if(!outcome.reachedDecision&&outcome.countsAsConsultation) throw new Error(`Encounter outcome "${outcome.id}" reached no decision and is still counted as a consultation. A half-finished encounter that can be called a consultation is the failure this feature exists to prevent.`);
 if(outcome.countsAsConsultation) { realConsultations++; continue; }
 unfinishedOutcomes++;
 for(const id of ['assessment','plan']) if(outcome.writes.includes(id)) throw new Error(`Encounter outcome "${outcome.id}" is not a consultation and still writes the ${id}. Nobody may sign a decision they did not get to make.`);
 if(outcome.charged) throw new Error(`Encounter outcome "${outcome.id}" is not a consultation and is charged for. Making a patient pay for their own bad signal puts the cost of South African bandwidth on the person least able to fix it.`);
}
if(!unfinishedOutcomes||!realConsultations) throw new Error('The encounter outcomes do not distinguish a consultation from an encounter that was not one, so the record cannot either.');
if(!teleconsult.outcomes.some(o=>o.connectionLost&&!o.countsAsConsultation)) throw new Error('No encounter outcome covers a line that dropped and did not come back. That is the state this feature is for.');
if(!teleconsult.outcomes.some(o=>o.connectionLost&&o.countsAsConsultation)) throw new Error('No encounter outcome covers a line that dropped and was re-established. A break in a consultation is a clinical fact, not a reason to start the encounter again.');
/* A subscription price lives in the commercial model and nowhere else.
   The five plan prices were typed into the patient's care-plans screen beside the same five numbers
   in packages/catalog/business-model.json, which is where the funding proposal's own model lives.
   Two copies of a subscription price is how a landing page comes to advertise one figure while the
   app charges another — and these are the recurring revenue lines a funder is being asked to
   believe in. */
{
 const model = JSON.parse(read('packages/catalog/business-model.json'));
 const priced = model.subscriptions.filter(s => s.price !== null).map(s => s.price);
 for(const file of ['apps/web/src/features/Pages.tsx','apps/web/src/features/Landing.tsx']) {
  const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  for(const price of priced) {
   if(new RegExp(`['\`]${price}['\`]`).test(code)) throw new Error(`${file} writes the subscription price ${price} as a literal. It is in packages/catalog/business-model.json, which is the funding proposal's own commercial model — derive it from there, or the page and the plan will one day disagree about what a person pays every month.`);
  }
 }
}

/* The muted alpha is a token, not a number to retype.
   tokens.json declares opacity.charcoalMuted at 0.72 and explains why it must stay an alpha: a
   flattened grey fails on sage, and the same ink at 72% darkens with whatever it sits on. The
   emitter did not write it, so iOS spent it as a literal in 485 places and Android used a local
   constant. Both now read the token, and this keeps it that way. */
{
 const alpha = tokens.opacity?.charcoalMuted;
 if(alpha === undefined) throw new Error('packages/design-tokens/tokens.json no longer declares opacity.charcoalMuted. Every muted label on three platforms reads it, and a flattened grey cannot replace it — that is the note above it.');
 const literal = new RegExp(`opacity\\(\\s*${String(alpha).replace('.', '\\.')}f?\\s*\\)`);
 for(const file of native.filter(f => !/Data\.(swift|kt)$/.test(f) && !/Tokens\.(swift|kt)$/.test(f))) {
  if(literal.test(read(file))) throw new Error(`${file} writes the muted alpha ${alpha} as a literal. It is opacity.charcoalMuted in packages/design-tokens/tokens.json and reaches both platforms as ThusoOpacity — a second copy of the one value that has to darken with its ground is how the three platforms end up dimming text by three different amounts.`);
 }
}

/* No screen may name a nurse who is not on the register.
   Sister Naledi Mokoena was N-205 in the vetting register, the capture ledger, the visit queue and
   the consultation record — and **N-114** on all three dispatch boards and in the arrival view. One
   person, two ids, and the second one existed nowhere. On a product whose whole premise is that a
   credential gates dispatch, a nurse carrying an id the register has never heard of is precisely
   what vetting exists to catch, and nothing was watching.

   So every N-nnn a hand-written source names must be a party the register actually holds. The nurses
   moved out of apps/web/src/lib/vetting-fixtures.ts and into packages/catalog/roster.json, where
   apps/api can read them too, so the register is read from there and from the fixtures both — the
   fixtures still hold every party who is not a nurse. */
{
 const fixtures = read('apps/web/src/lib/vetting-fixtures.ts');
 const rosterParties = JSON.parse(read('packages/catalog/roster.json')).nurses.map(n => n.id);
 const known = new Set([...rosterParties, ...[...fixtures.matchAll(/id:\s*'(N-\d+)'/g)].map(m => m[1])]);
 if(known.size < 2) throw new Error('scripts/check-boundaries.mjs can no longer read the nurse ids out of packages/catalog/roster.json or apps/web/src/lib/vetting-fixtures.ts, so the check that every named nurse is on the register is checking nothing.');
 const sources = files('apps/web/src')
  .concat(files('apps/ios/MyThuso')).concat(files('apps/android/app/src/main'))
  .filter(f => /\.(tsx?|swift|kt)$/.test(f) && !/Data\.(swift|kt)$/.test(f) && !f.endsWith('vetting-fixtures.ts'));
 for(const file of sources) {
  const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  for(const [, id] of code.matchAll(/['"](N-\d+)['"]/g)) {
   if(!known.has(id)) throw new Error(`${file} names nurse ${id}, and the vetting register has no such party. A nurse who is not on the register is a nurse nothing has vetted — which is the one thing this product refuses to let a dispatch board do. Use the id the register holds, or add her to it.`);
  }
 }
}

/* And no screen may name a professional registration the register has never issued.
   The nurse-id check above was written after one nurse turned out to have two ids, the second
   existing nowhere. It caught N-nnn and nothing else, and underneath it three registration numbers
   were doing exactly the same thing in the places it matters most:

     · The Health Passport's reviewer was "Dr N. Khumalo · MP 0741225". Dr Lerato Khumalo is on the
       register at HPCSA MP0612885. Same surname, invented number, and it reached both native apps
       through the generated passport data.
     · The access log — the screen that answers "who has been in your record" — named "Dr A. Dlamini
       · HPCSA MP 0784512" and "Sister Naledi Mokoena · SANC 21847". Both people are on the register,
       under other numbers.

   A patient reading that log is being told who opened their record. Answering with a registration no
   authority issued is worse than answering with nothing, because it invites them to go and check it.
   And on a product whose premise is that a credential gates dispatch, a clinician whose number the
   register has never heard of is the thing vetting exists to catch.

   Matched loosely on purpose — spacing and the HPCSA prefix vary between the register and the
   screens, and a check that insisted on one spelling would have missed all three of these. */
{
 /* Two files hold the register now: the nurses moved into packages/catalog/roster.json so the
    service could read them, and the doctors, locums and partners are still fixtures. Both are read
    here — a check that knew about only one of them reported every nurse on every screen as
    unregistered the moment the other appeared, which is a false alarm whose obvious fix is to
    delete the check. */
 const registers = ['apps/web/src/lib/vetting-fixtures.ts', 'packages/catalog/roster.json']
  .filter(f => existsSync(f)).map(f => read(f)).join('\n');
 const registrationLike = /(?:HPCSA\s+)?\b(?:MP|SANC|SAPC)\s?\d{4,}/g;
 const plain = text => text.toUpperCase().replace(/HPCSA/g, '').replace(/[^A-Z0-9]/g, '');
 const issued = new Set([...registers.matchAll(registrationLike)].map(m => plain(m[0])));
 if(issued.size < 10) throw new Error('scripts/check-boundaries.mjs can no longer read professional registrations out of the vetting register, so the check that every clinician named on a screen is one the register issued is reading nothing at all.');
 const named = files('apps/web/src').concat(files('packages/catalog'))
  .concat(files('apps/ios/MyThuso')).concat(files('apps/android/app/src/main'))
  .filter(f => /\.(tsx?|json|swift|kt)$/.test(f) && !f.endsWith('vetting-fixtures.ts'));
 for(const file of named) {
  for(const [match] of read(file).matchAll(registrationLike)) {
   if(!issued.has(plain(match))) throw new Error(`${file} names the registration "${match}", and the vetting register has never issued it. A clinician carrying a number no authority gave them is exactly what vetting exists to catch — and on the access log it is a patient being invited to check something that does not exist. Use the party's reference from apps/web/src/lib/vetting-fixtures.ts, or add them to the register.`);
  }
 }
}

/* The passport's reviewer is a party the register knows, under the register's own number.
   A nurse records and a doctor reviews, and the passport says who reviewed. That doctor has to be
   somebody the vetting register issued a registration to, or the sentence is decoration — and it was
   decoration: "Dr N. Khumalo · MP 0741225" against a register holding Dr Lerato Khumalo at HPCSA
   MP0612885. Same surname, invented number, generated into both native apps.

   Name and registration are compared, not just the number. Half a match is the more dangerous half:
   the right registration under the wrong name is a screen telling a patient that somebody else read
   their record. */
{
 const reviewer = JSON.parse(read('packages/catalog/passport.json')).reviewer;
 const fixtures = read('apps/web/src/lib/vetting-fixtures.ts');
 const parties = [...fixtures.matchAll(/name:\s*'([^']+)',\s*roleId:\s*'([a-z-]+)',\s*reference:\s*'([^']+)'/g)]
  .map(m => ({ name: m[1], role: m[2], reference: m[3] }))
  /* The nurses live in the roster contract now. They are not candidates to review a passport — a
     nurse records and a doctor reviews — but they are read anyway, so the role check below refuses
     one by name rather than failing to find her at all and blaming the register. */
  .concat((JSON.parse(read('packages/catalog/roster.json')).nurses ?? [])
   .map(n => ({ name: n.name, role: 'nurse', reference: n.reference })));
 if(parties.length < 5) throw new Error('scripts/check-boundaries.mjs can no longer read the vetted parties out of apps/web/src/lib/vetting-fixtures.ts, so the check that the passport names a real doctor is reading nothing at all.');
 const match = parties.find(p => p.name === reviewer.name && p.reference === reviewer.registration);
 if(!match) throw new Error(`packages/catalog/passport.json says the Health Passport was reviewed by "${reviewer.name} · ${reviewer.registration}", and the vetting register holds no party under that name and that registration. A patient is being told who read their record; the answer has to be somebody the register issued a number to.`);
 if(match.role !== 'doctor') throw new Error(`packages/catalog/passport.json's reviewer "${reviewer.name}" is on the register as a ${match.role}, not a doctor. A nurse records and a doctor reviews — that separation is the point of naming the reviewer at all.`);
}

/* Nothing renders below the smallest size the design declares, and iOS does — 417 times.
   `ThusoType.minimumRendered` is 13 and its comment says "Nothing in any of the three apps renders
   text below this." The web is held to it: tests/accessibility.spec.ts measures rendered text at a
   320px viewport and found twenty-odd rules that had drifted under, each one a number somebody
   nudged to make a row fit. iOS was never measured the same way, and SwiftUI's `.caption` is 12
   points at the default content size and `.caption2` is 11.

   That is not caught by the Dynamic Type tests and could not be: those pair a screen against itself
   at two content sizes and ask whether every string grew. A caption grows perfectly. It is simply
   two points too small before it starts.

   Ratcheted rather than fixed, and deliberately. The replacement is mechanical —
   `.thusoFont(ThusoType.caption)` scales the same way and starts at 13 — but it is 414 text sites
   across 22 files and a bulk edit with no visual pass is how a design language gets flattened in one
   commit. So the number may fall and may not rise, every fix is noticed, and the day it reaches
   zero this block fails and gets deleted. The twelve that size an SF Symbol rather than a word are
   counted with the rest: a glyph has no legibility floor, but separating them by regex is a guess,
   and a ratchet that guesses is a ratchet nobody trusts. */
{
 const SMALL_TYPE_ON_IOS = 397;
 let found = 0;
 const worst = [];
 for(const file of files('apps/ios/MyThuso').filter(f => f.endsWith('.swift'))) {
  const n = (read(file).match(/\.font\(\.caption2?\b/g) ?? []).length;
  if(n) { found += n; worst.push([file, n]); }
 }
 if(found > SMALL_TYPE_ON_IOS) {
  worst.sort((a, b) => b[1] - a[1]);
  throw new Error(`iOS renders text below ThusoType.minimumRendered in ${found} places, and this ratchet allows ${SMALL_TYPE_ON_IOS}. .caption is 12 points and .caption2 is 11; the design's smallest declared size is 13. Use .thusoFont(ThusoType.caption), which scales the same way and starts at 13. Worst: ${worst.slice(0, 3).map(([f, n]) => `${f} (${n})`).join(', ')}.`);
 }
 if(found < SMALL_TYPE_ON_IOS) throw new Error(`iOS is down to ${found} places rendering text below ThusoType.minimumRendered, and this ratchet still says ${SMALL_TYPE_ON_IOS}. Lower it to ${found}${found ? '' : ' — or rather, delete this block, because it is spent'}. A ratchet nobody lowers is a ratchet that stops meaning anything.`);
}

/* Live well, and the seven things it may never draw.
   packages/catalog/wellbeing.json is the only feature in this product that talks to somebody about
   their own body with no clinician in the room, and its `neverSoften` names what that costs: no
   score, no grade, no target, no streak, no rank, no percentage, no unit. Every one of those is a
   normal, well-intentioned decision in any other product and a harmful one here — a streak that
   breaks punishes somebody for being ill, and a target nobody chose is somebody else's expectation
   wearing their name.
   So it is checked rather than asked for. The feature's own screens are read for a digit followed by
   a unit, for a percent sign, and for the words the contract forbids. */
{
 const wellbeing = JSON.parse(read('packages/catalog/wellbeing.json'));
 if(!wellbeing.refusals?.length) throw new Error('packages/catalog/wellbeing.json declares no refusals, and the refusals are the feature.');
 for(const habit of wellbeing.habits) {
  if(habit.unitless !== true) throw new Error(`The "${habit.id}" habit in wellbeing.json is not marked unitless. There is no field in Live well that takes a number, and that single decision is what makes the rest of it safe.`);
 }
 const forbidden = [/\bstreak\b/i, /\bscore\b/i, /\bgrade\b/i, /\btarget\b/i, /\brank(ing|ed)?\b/i, /\bleaderboard\b/i, /\bgoal weight\b/i, /\bcalorie/i, /\bstep count\b/i];
 const wellbeingSources = files('apps/web/src').concat(files('apps/ios/MyThuso')).concat(files('apps/android/app/src/main'))
  .filter(f => /(wellbeing|livewell|live-well)/i.test(f) && /\.(tsx?|swift|kt)$/.test(f));
 /* A GENERATED CARRIER IS THE CONTRACT IN ANOTHER LANGUAGE, AND THE CONTRACT MAY NAME WHAT IT
    REFUSES. Three of the ten refusals say "score", "grade" and "target" out loud — they have to,
    because the absence is the feature and a reader cannot see an absence — so WellbeingData.swift
    and WellbeingData.kt would fail the words check for carrying the very sentences that forbid
    them. They are compared byte for byte against emit-wellbeing.mjs a few hundred lines above, so
    nothing can be smuggled into one; what is skipped here is skipped by the banner the generator
    writes, not by a path somebody can add to. A SCREEN gets no such exemption. */
 const generatedCarrier = source => /^\/\/ Generated by scripts\/emit-/.test(source);
 const screens = wellbeingSources.filter(f => !generatedCarrier(read(f)));
 if(screens.length === wellbeingSources.length && wellbeingSources.length) throw new Error('Every Live well source now looks generated, so the words check is reading nothing. Either the screens were deleted or the exemption has swallowed them.');
 for(const file of screens) {
  /* The contract itself may name what it refuses; a screen may not. Comments come out first so a
     comment explaining why there is no streak is not read as a streak. */
  const code = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  for(const pattern of forbidden) {
   const hit = pattern.exec(code);
   if(hit) throw new Error(`${file} says "${hit[0]}". wellbeing.json's neverSoften forbids a score, a grade, a target, a streak, a rank, a percentage or a unit anywhere in Live well: a streak that breaks punishes somebody for being ill, and a target nobody chose is somebody else's expectation wearing their name. If the contract has changed, change it there first.`);
  }
  if(/\d\s*(kg|km|steps|kcal|cal|%|bpm|hours|hrs|mins?)\b/i.test(code)) throw new Error(`${file} renders a number with a unit. No field in Live well takes one — the habits are unitless and in the person's own words.`);
  /* THE WORDS CHECK ABOVE CANNOT SEE A KEYBOARD. A screen can be entirely free of the forbidden
     vocabulary and still hand somebody a number pad, and a field that opens a number pad has asked
     for a number however it is labelled — which is the single decision wellbeing.json says the
     safety of the whole feature rests on. Both platforms' spellings, because a rule that only
     holds on one phone is a rule that will be broken on the other. */
  const numberPad = /\.(numberPad|decimalPad|numbersAndPunctuation|asciiCapableNumberPad)\b|KeyboardType\.(Number|Decimal|Phone)\b|inputType="number/;
  if(numberPad.test(code)) throw new Error(`${file} opens a numeric keyboard. There is no field anywhere in Live well that takes a number — see wellbeing.json's habitsNote, which calls that the single decision the rest of the feature's safety rests on.`);
 }

 /* THE TEN SENTENCES ARE RENDERED, NOT SUMMARISED. Both Live well screens must read the refusals
    out of the generated contract rather than listing a selection of them, because a screen that
    types its own subset is a screen from which one of them can quietly go missing — and the one
    that goes missing will be whichever reads worst in a screenshot. */
 const liveWellScreens = [
  ['apps/ios/MyThuso/Features/LiveWellView.swift', 'WellbeingData.refusals', 'CapabilityNotice(of: WellbeingData.capability)'],
  ['apps/android/app/src/main/java/za/co/mythuso/ui/LiveWellScreens.kt', 'wellbeingRefusals', 'NotConnected(WellbeingData.capability)']
 ];
 for(const [file, renders, discloses] of liveWellScreens) {
  const source = read(file);
  if(!source.includes(renders)) throw new Error(`${file} no longer renders ${renders}. The refusals are the feature — wellbeing.json says so in its own first note — and a screen that has stopped reading them has started choosing between them.`);
  /* The disclosure is clinical-records and it is named through the contract rather than as a
     string, so the day that capability is connected the notice goes from both phones at once. */
  if(!source.includes(discloses)) throw new Error(`${file} no longer discloses the capability it depends on. wellbeing.json names clinical-records, and the honest thing that notice says is that nothing written here is held anywhere real.`);
 }

 /* And nothing outside the two generated carriers may type one of the sentences. A refusal typed
    into a screen is a refusal that can be edited without the contract knowing. */
 const carriers = ['apps/ios/MyThuso/Models/WellbeingData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/WellbeingData.kt'];
 const everywhere = files('apps/web/src').concat(files('apps/ios/MyThuso')).concat(files('apps/android/app/src/main'))
  .filter(f => /\.(tsx?|swift|kt)$/.test(f) && !carriers.includes(f));
 for(const file of everywhere) {
  const source = read(file);
  for(const refusal of wellbeing.refusals) {
   if(source.includes(refusal.sentence)) throw new Error(`${file} types the Live well refusal "${refusal.id}" word for word. It is in packages/catalog/wellbeing.json and generated into WellbeingData.swift and WellbeingData.kt; render it from there, or the day it is reworded there will be two versions of what MyThuso will not do.`);
  }
 }
}

/* ---- How a screen introduces itself -------------------------------------------------------

   packages/catalog/framing.json holds the two-tone headline the founder's prototype gives every
   phone frame. It is a contract because it was two copies: WorkspaceNavigation.framing on iOS and
   workspaceFraming on Android each carried the same four pairs, and each carried a comment saying
   the honest home was a file like that one. A headline is the first thing anybody reads on a screen
   and the cheapest thing in the product to change in a hurry, which is exactly why it needs one
   author.

   Two questions here, and the second is the one that makes the deletion permanent:

     1. Every role a native app can open a workspace for has a framing. A role without one falls
        through to the plain section heading — which is correct behaviour and a silent regression,
        so it is checked rather than relied on.
     2. Nothing types a lead or an accent line outside the generated carriers. */
{
 const framing = JSON.parse(read('packages/catalog/framing.json'));
 /* The roles are read out of the app rather than listed here. A list of four strings in this file
    would be a fifth copy of the thing the contract was written to stop being copied, and it would
    go stale the first time somebody adds a workspace. */
 const roleLine = /val workspaceRoles = listOf\(([^)]*)\)/.exec(read('apps/android/app/src/main/java/za/co/mythuso/ui/AccountScreens.kt'));
 if(!roleLine) throw new Error('workspaceRoles has moved out of apps/android/.../ui/AccountScreens.kt, so this check no longer knows which roles open a workspace.');
 const roles = [...roleLine[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
 if(!roles.length) throw new Error('workspaceRoles is empty, so either the workspaces are gone or the check has stopped reading them.');
 const framed = new Set(framing.framings.map(f => f.role).filter(Boolean));
 for(const role of roles) {
  if(!framed.has(role)) throw new Error(`packages/catalog/framing.json has no framing for the "${role}" workspace, and both apps open one. An unframed role gets the plain section heading instead of its own headline, which is a regression nobody would see in a diff.`);
 }
 /* Every section a role lands on must be one the contract has an opening line for, and no section
    may be described twice. The generator refuses the second case; this refuses the first, because a
    role that lands on an unnamed section shows a heading with no sentence under it and nothing says
    so. */
 const openingSections = new Set(framing.opening.map(o => o.section).filter(Boolean));
 for(const section of framing.sections) {
  if(openingSections.has(section.id)) throw new Error(`packages/catalog/framing.json describes the section "${section.id}" twice: once as a role's opening line and once in "sections". One screen, two descriptions, which is what this contract removes.`);
 }
 for(const one of framing.opening) {
  if(!one.line) throw new Error(`packages/catalog/framing.json has no opening line for the role "${one.role}". Every role shows one on the door it signs in through, and a missing one renders as an empty paragraph.`);
 }

 /* The sweep. Every sentence the contract owns — both halves of each headline, all six opening
    lines and all three section blurbs — looked for as a literal in every hand-written source of all
    three applications. The native half of this existed already; the web half is new, and it is the
    half that matters most, because the three partner blurbs lived in shells/StaffShell.tsx and in
    apps/ios/MyThuso/Features/WorkspaceView.swift at the same time, word for word, with the iOS
    comment above them admitting whose they were. */
 const framingCarriers = ['apps/ios/MyThuso/Models/FramingData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/FramingData.kt'];
 const framingSentences = [
  ...framing.framings.flatMap(f => [f.lead, f.accent]),
  ...framing.opening.map(o => o.line),
  ...framing.sections.map(section => section.blurb)
 ].filter(Boolean);
 const sources = files('apps/ios/MyThuso').concat(files('apps/android/app/src/main')).concat(files('apps/web/src'))
  .filter(f => /\.(swift|kt|ts|tsx)$/.test(f) && !framingCarriers.includes(f));
 for(const file of sources) {
  const source = read(file);
  for(const line of framingSentences) {
   /* Both quote styles: Swift and Kotlin use one, the web's source uses the other, and a sentence
      with an apostrophe in it is written with double quotes there. */
   if(source.includes(`"${line}"`) || source.includes(`'${line}'`)) throw new Error(`${file} types the framing line "${line}". It belongs to packages/catalog/framing.json — read it there, or on the phones read the generated FramingData. This is the copy that was deleted when the contract landed, growing back.`);
  }
 }
}

/* Streets, and the three things that make drawing them defensible.
   A tile request tells whoever serves it which square of Johannesburg somebody is looking at — for
   a patient that is roughly which suburb she is in, and roughly when a nurse came to her house.
   Nothing in this product had ever fetched a tile before, so nothing had ever had to say that.
   The map agent could not add these checks; scripts/ was not its territory. */
{
 const geo = JSON.parse(read('packages/catalog/geography.json'));
 const tiles = geo.rendering?.tiles, source = geo.rendering?.source, view = geo.window;
 if(!tiles || !source) throw new Error('packages/catalog/geography.json no longer declares a tile source and its terms. An endpoint, a licence and an attribution are the three things a map may not be drawn without.');

 /* 1. The zoom limit is the privacy control. One tile at maxZoom is the smallest area a request can
    reveal, and the sentence a reader is shown quotes it in metres — so it is recomputed here rather
    than trusted, and the two must agree. */
 const metres = Math.round(40_075_017 * Math.cos(Math.abs(view.centre.lat) * Math.PI / 180) / 2 ** view.maxZoom);
 if(Math.abs(metres - tiles.squareMetres) > 2) throw new Error(`geography.json says a tile at maxZoom ${view.maxZoom} covers ${tiles.squareMetres} m, and the arithmetic says ${metres} m. That figure is quoted to a patient to tell her how precisely a tile request locates her. Recompute it or change the zoom, but do not let them disagree.`);
 if(view.maxZoom > 15) throw new Error(`geography.json raises maxZoom to ${view.maxZoom}. At sixteen and above a reader can pick out an individual house, and no screen in this product has a reason to. The limit is the privacy control, not a performance one.`);

 /* 2. Off by default. A default is the setting nobody chooses, and a patient watching for a nurse is
    not deciding about a mapping vendor. Her own press is what starts the processing. */
 if(tiles.default !== 'off') throw new Error('geography.json turns tiles on by default. The request would then be made before the person has read the sentence describing it, and there is no operator agreement with the tile provider.');
 for(const key of ['offSentence','onSentence']) {
  if(!tiles[key]) throw new Error(`geography.json has no tiles.${key}. The switch that starts sending a viewport to a third party has to say so on the screen, beside itself, before it is pressed.`);
 }

 /* 3. The origin is allowed by the one entry that draws a map, and by no other. A content policy is
    the only thing standing between "we chose one tile host" and "a map can fetch from anywhere", and
    it is a second copy of the contract's own hostname.

    It used to be two entries: the patient's arrival screen and the Control Tower's dispatch board
    were separate builds. They are one now — the workspaces are lazily-imported chunks of the app
    entry rather than entries of their own — so the list shrank to one rather than the permission
    widening. What must not happen is a third name appearing here because a page wanted a map. */
 for(const entry of ['index.html','landing.html']) {
  if(!read(`apps/web/${entry}`).includes(source.host)) throw new Error(`apps/web/${entry} draws a map and its content policy does not allow ${source.host}. The tiles do not fail loudly — the map falls back to the schematic and nobody is told why.`);
 }
 for(const entry of ['status.html']) {
  if(existsSync(`apps/web/${entry}`) && read(`apps/web/${entry}`).includes(source.host)) throw new Error(`apps/web/${entry} allows the tile host and draws no map. An entry that can reach a tile server is an entry that can leak a viewport; only the one that needs it may.`);
 }
 /* And the attribution is a licence condition, not a courtesy. */
 for(const key of ['licence','attribution','attributionUrl']) {
  if(!source[key]) throw new Error(`geography.json's tile source has no ${key}. OpenStreetMap data is ODbL and the credit is a condition of using it, not a nicety.`);
 }
}

/* Every entry the build produces must be served, and must be verified by the deploy.
   `status.html` shipped unreachable: nginx had no location for it, so `/status` fell through the
   catch-all and answered with the *landing page* — under a 200, which is a wrong answer wearing a
   right one's status code. The deploy's own checks passed, because they read status codes and every
   missing path falls through to the same place.

   Nothing tied the two together, so nothing could have caught it. This does. A fifth entry was added
   to vite.config.ts and to nothing else, and the next one will be too. */
{
 const vite = read('apps/web/vite.config.ts');
 const conf = existsSync('deploy/nginx/mythuso.conf') ? read('deploy/nginx/mythuso.conf') : '';
 const script = existsSync('deploy/deploy.sh') ? read('deploy/deploy.sh') : '';
 const entries = [...vite.matchAll(/(\w+):\s*resolve\(import\.meta\.dirname,\s*'([^']+\.html)'\)/g)]
  .map(m => ({ name: m[1], file: m[2] }));
 if(entries.length < 2) throw new Error('scripts/check-boundaries.mjs can no longer read the entries out of apps/web/vite.config.ts, so the check that every entry is served is checking nothing.');
 for(const entry of entries) {
  if(conf && !conf.includes(entry.file)) throw new Error(`apps/web/vite.config.ts builds "${entry.file}" and deploy/nginx/mythuso.conf never names it. It will not 404 — it will fall through the catch-all and serve the landing page under a 200, which is how status.html shipped unreachable and how the deploy's own checks passed anyway.`);
  if(script && !script.includes(entry.file) && !new RegExp(`verify_entry[^\\n]*${entry.name}`).test(script)) throw new Error(`The deploy does not verify "${entry.file}" after publishing it. Every unserved path answers 200 with the wrong page, so a check that does not name this entry cannot tell whether it arrived.`);
 }

 /* And the dev server answers the same paths as nginx, including `/`.

    This is the third face of one defect. The first was an entry nginx had no location for; the
    second was `page.goto('/')` walking every patient journey at a path that serves the marketing
    page in production, which stood as a written-down debt for weeks because closing it meant editing
    twenty specs. Both were invisible while everything rendered. What makes them invisible is that a
    local environment answering differently from the deployed one does not fail — it misleads — so
    the only thing that can catch it is a check that reads both maps and compares them.

    Every entry must be reachable in the dev server's own path map, and every path that map claims
    must be a path nginx has a location for. */
 const devMap = vite.match(/const served: Record<string, string> = \{([^}]*)\}/);
 if(!devMap) throw new Error('scripts/check-boundaries.mjs can no longer read the dev server\'s pretty-path map out of apps/web/vite.config.ts. Without it nothing holds `npm run dev` to what nginx serves, which is how every patient journey came to be walked at a path that serves the landing page in production.');
 const devPaths = [...devMap[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => ({ path: m[1], file: m[2].replace(/^\//, '') }));
 for(const entry of entries) {
  if(!devPaths.some(p => p.file === entry.file)) throw new Error(`apps/web/vite.config.ts builds "${entry.file}" and its own dev server serves it at no path. Locally that entry falls through to index.html, so a person reviewing it — or a test walking it — sees the patient application instead and is told nothing.`);
 }
 for(const { path, file } of devPaths) {
  const location = path === '/' ? 'location = /' : `location ${path}/`;
  if(conf && !new RegExp(`location\\s*=?\\s*${path}(/|\\s)`).test(conf)) throw new Error(`The dev server serves ${file} at "${path}" and deploy/nginx/mythuso.conf has no ${location}. One of the two is wrong and the local one is the one nobody checks against production.`);
 }
}

/* The status page carries no framework.
   It is the page somebody opens when they suspect nothing works — on a metered connection, in a car
   park, having just been told by a screen that it does not book a visit. It was first written as a
   React component and 93% of what it shipped was react-dom: 65 kB gzipped to draw a list that never
   changes after it is drawn. It builds the DOM directly now and ships under five.

   Nothing on it is interactive, so there is nothing for a framework to do. This check exists because
   the easiest way to undo that is to import one component. */
if(existsSync('apps/web/src/status.ts')) {
 const status = read('apps/web/src/status.ts');
 if(/from\s+['"]react/.test(status)||/from\s+['"]react-dom/.test(status)) throw new Error('apps/web/src/status.ts imports React. The status page ships without a framework on purpose — it is the one page whose job is to load when everything else is failing, and react-dom was 93% of its weight. Build the nodes directly.');
 if(existsSync('apps/web/src/features/Status.tsx')) throw new Error('apps/web/src/features/Status.tsx is back. The status page renders without React; a .tsx component for it will pull the framework into the entry that exists to be small.');
 /* And it may not grow a shell. The design system and its own sheet, nothing else. */
 for(const bad of ['./App', './shells/', './features/', 'surface/app.css']) {
  if(status.includes(bad)) throw new Error(`apps/web/src/status.ts imports ${bad}. The status page takes core.css and its own sheet and stops — no shell, no feature modules, no app.css.`);
 }
}

/* Cancelling a visit.
   Both native apps promised on the booking confirmation that a visit may be cancelled up to two
   hours before it, and neither offered a cancel control. The web offered the control and never
   mentioned the window. The two hours lived as a hand-typed string in one Swift file and one Kotlin
   file with nothing to compare them against — which is why the drift check never saw it: there was
   no contract to drift from. These checks close that hole from both ends. */
const cancellation = JSON.parse(read('packages/catalog/cancellation.json'));
if(!(cancellation.window.hoursBefore > 0)) throw new Error('packages/catalog/cancellation.json declares no cancellation window. Both native apps promise one on the booking confirmation.');
/* The window, refused as a literal in hand-written source. This is the check the whole contract was
   written for. The two hours lived as a string in one Swift file and one Kotlin file, and nothing
   compared them to anything, so they could not drift — they could only both be wrong together, or
   one of them be changed and the other not noticed. Absence was the hole, the same shape as a
   contrast pair nobody declared.

   The generated files are skipped: they are allowed to contain it, because containing it is their
   job. Anywhere else it is a promise about a refund that no longer answers to the contract. */
const windowLiteral = new RegExp(`\\b${cancellation.window.hoursBefore} hours? before\\b`);
/* Web as well as native. The check walked only Swift and Kotlin when it was written, because those
   were the two files carrying the literal — but the promise is the product's, not a platform's, and
   the web was the last of the three to render the window at all. A check that stops at a language
   boundary is a check that stops where the next copy will appear. */
const carriesTheWindow = native.concat(files('apps/web/src').filter(f => /\.(tsx?|css)$/.test(f)));
for(const file of carriesTheWindow.filter(f => !/Data\.(swift|kt)$/.test(f))) {
 if(windowLiteral.test(read(file))) throw new Error(`${file} types out the cancellation window — "${cancellation.window.hoursBefore} hours before" — which packages/catalog/cancellation.json declares. Render it from the contract (Cancellation.windowSentence / CancellationData.windowSentence). A window typed into a screen is a promise about somebody's money that stops answering to the file that sets it, and it is how this one went wrong the first time.`);
}
/* A visit can always be cancelled. The window is not permission. */
if(!cancellation.always?.statement) throw new Error('cancellation.json no longer says a visit can always be cancelled. A product that refuses a cancellation has not prevented it — it has made somebody not answer the door.');
for(const id of ['before-window','inside-window','in-progress']) {
 if(!cancellation.states.some(st => st.id === id)) throw new Error(`The cancellation contract has lost the "${id}" state. All three are reachable and each says something different to the person cancelling.`);
}
if(!cancellation.states.find(st => st.id === 'inside-window') || cancellation.states.find(st => st.id === 'inside-window').refusesCancellation) {
 throw new Error('Cancelling inside the window is refused. It must not be: the alternative to letting somebody cancel late is a nurse arriving at a door nobody opens.');
}
/* The dangerous version of this file is one that quietly acquires a charge nobody agreed to. */
if(!cancellation.pendingDecision) throw new Error('cancellation.json no longer records that the late-cancellation charge is undecided. Removing the question is how a percentage nobody agreed to becomes a rule.');
const chargeWords = /(cancellation fee|late fee|forfeit|non-refundable|will be charged|charged \d|% of the)/i;
if(chargeWords.test(JSON.stringify(cancellation))) throw new Error('cancellation.json states a charge. What a patient pays for cancelling late is a commercial and legal question — section 47 of the Consumer Protection Act — and it is recorded as pending precisely so nobody writes it into a contract on a Tuesday.');
/* Money is the payments capability's sentence, not this file's. */
if(cancellation.money.capability !== 'payments') throw new Error('The cancellation contract no longer points at the payments capability for what happens to money, so its sentence would not disappear when a provider is connected.');

/* Glass, and the one thing that makes it checkable.
   A translucent surface has no colour of its own, so a contrast figure measured against it is a
   guess about whatever happens to be behind it. Every glass surface therefore resolves to a
   declared floor — the composite of the tint over the darkest point the ground may reach — and every
   ratio in the token file is measured against that. These checks keep that true.

   The founder asked for a glassy, futuristic feel. This is what lets a product that computes
   contrast on every build actually give him one. */
if(!tokens.glass) throw new Error('packages/design-tokens/tokens.json has no glass block. A frosted surface with no declared floor is a surface whose contrast nobody can compute.');
for(const key of ['tint','opacity','blurPx','floorToken']) {
 if(tokens.glass[key]===undefined) throw new Error(`The glass block has no "${key}". Without it the floor cannot be recomputed and checked.`);
}
if(!tokens.color[tokens.glass.floorToken]) throw new Error(`The glass block names "${tokens.glass.floorToken}" as its floor and no such colour exists.`);
/* The floor is not a taste. It is the tint composited over the darkest ground, and if somebody
   changes the opacity or the ground without recomputing it, every ratio measured against it becomes
   a number about a colour that is no longer on screen. */
{
 const rgb = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
 const tint = rgb(tokens.glass.tint), ground = rgb(tokens.color.glassFloorGround), a = tokens.glass.opacity;
 const expected = tint.map((c,i) => Math.round(c*a + ground[i]*(1-a)));
 const declared = rgb(tokens.color[tokens.glass.floorToken]);
 const off = expected.map((c,i) => Math.abs(c - declared[i]));
 if(Math.max(...off) > 1) throw new Error(`The declared glass floor ${tokens.color[tokens.glass.floorToken]} is not the tint at ${a} over ${tokens.color.glassFloorGround}, which computes to #${expected.map(c=>c.toString(16).padStart(2,'0')).join('')}. Recompute it, or every contrast figure measured against the floor is about a colour nothing renders.`);
}
/* The ground may not go darker than the floor it was measured from. */
{
 const lum = h => { const v = [1,3,5].map(i => { let c = parseInt(h.slice(i,i+2),16)/255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4); }); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
 const floorLum = lum(tokens.color.glassFloorGround);
 for(const name of ['auroraCool','auroraSage','auroraWarm']) {
  if(lum(tokens.color[name]) < floorLum - 0.0005) throw new Error(`The ground colour "${name}" is darker than glassFloorGround, so a glass panel over it composites darker than the floor every contrast figure was measured against. Either lighten it or make it the new floor and recompute.`);
 }
}
/* The fallback has to exist, because backdrop-filter is missing or too expensive on a great many of
   the handsets this product is for, and a frosted panel that falls back to transparent is a panel
   with text floating over a gradient. */
if(existsSync('apps/web/src/surface/glass.css')) {
 const glass = read('apps/web/src/surface/glass.css');
 if(!/@supports\s+not\s*\(/.test(glass)&&!/@supports\s*\(backdrop-filter/.test(glass)) throw new Error('apps/web/src/surface/glass.css uses no @supports guard for backdrop-filter. On a handset without it the frosted panels lose their background entirely and the text sits on the gradient.');
 if(!glass.includes('prefers-reduced-transparency')) throw new Error('glass.css does not answer prefers-reduced-transparency. A reader who has asked their system for less transparency has asked this product too.');
 if(!glass.includes('prefers-reduced-motion')) throw new Error('glass.css animates and does not answer prefers-reduced-motion.');
}

/* The motion system, and the four things that make it one rather than several.
 *
 * The curve and the durations were declared inside glass.css, which meant the web had a motion
 * system and the two native apps had whatever each had guessed. They are in tokens.json now and
 * generated into all three, so the first check is simply that nobody writes a second copy: an
 * easing curve or a duration typed into a stylesheet is the beginning of the drift this project
 * spends most of its boundary checks preventing.
 *
 * The rest is what a reader is owed. Reduced motion REMOVES rather than shortens — a 420ms entrance
 * run at 80ms is still a thing that moved — and the removal has to be !important because the sheet
 * is imported first and anything loaded after it would otherwise win on order alone. */
if(existsSync('apps/web/src/surface/motion.css')) {
 const motion = read('apps/web/src/surface/motion.css');
 const code = motion.replace(/\/\*[\s\S]*?\*\//g, '');
 if(!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(code)) throw new Error('apps/web/src/surface/motion.css is the motion system and does not answer prefers-reduced-motion. Everything it declares has to be removable.');
 const removal = code.slice(code.indexOf('prefers-reduced-motion'));
 for(const name of ['rise', 'm-press', 'm-light']) {
  if(!removal.includes(name)) throw new Error(`motion.css declares ".${name}" and its reduced-motion block never mentions it. A reader who asked for stillness would keep that one, which is how a removal becomes a partial removal nobody notices.`);
 }
 if(!/animation:\s*none\s*!important/.test(removal)||!/transition:\s*none\s*!important/.test(removal)) throw new Error('motion.css removes motion without !important. This sheet is imported first from core.css, so any later sheet setting a transition on the same selector beats it — a reduced-motion block a stylesheet loaded afterwards can overrule is a suggestion, not a removal.');
 /* The pointer light may only lift the ground. Every contrast figure measured against a frosted
    panel assumes the ground never goes darker than --glass-floor-ground; a light that could darken
    would quietly falsify all of them at whichever position the pointer happened to be. */
 const light = code.slice(code.indexOf('.m-light'), code.indexOf('.m-pause'));
 for(const colour of [...light.matchAll(/var\(--([a-z-]+)\)/g)].map(m=>m[1])) {
  if(colour.startsWith('t-')||colour==='ease-soft'||colour.startsWith('m-')) continue;
  if(colour!=='surface') throw new Error(`The pointer light paints --${colour}. It may paint --surface and nothing else: it is white so that it can only lift the ground and never lower it, which is the only reason --glass-floor stays true wherever the pointer goes.`);
 }
 /* A decorative animation that no control can reach is the defect the pause control exists to
    prevent, and it is invisible in a diff — the rule reads perfectly well on its own. */
 for(const rule of code.matchAll(/([^{}]*)\{[^{}]*animation:[^;}]*infinite[^;}]*/g)) {
  if(!rule[1].includes('[data-decor')) throw new Error(`motion.css runs an endless animation on "${rule[1].trim()}" without gating it on [data-decor='on']. Decorative motion that the pause control cannot reach is decorative motion nobody can stop.`);
 }
}
/* One curve, one set of durations, and nowhere else to type them. tokens.generated.css is the only
   file allowed to hold the literals; every stylesheet spends --ease-soft and --t-*. A cubic-bezier
   written into a component sheet is not a style choice, it is a second motion system starting — and
   the first one started exactly that way, three durations at a time, in a file two of the three
   platforms could not read. */
for(const sheet of [...designSheets,'apps/web/src/landing.css','apps/web/src/surface/motion.css','apps/web/src/surface/glass.css','apps/web/src/surface/patient.css','apps/web/src/surface/clinical.css','apps/web/src/surface/surface.css','apps/web/src/surface/door.css']) {
 if(!existsSync(sheet)) continue;
 const code = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
 const curve = code.match(/cubic-bezier\([^)]*\)/);
 if(curve) throw new Error(`${sheet} writes ${curve[0]}. The curve is motion.easeSoft in packages/design-tokens/tokens.json and arrives as --ease-soft; a second one typed into a stylesheet is how the web and the two native apps came to accelerate differently.`);
 const redeclared = code.match(/--(?:ease-soft|t-quick|t-settle|t-enter)\s*:/);
 if(redeclared) throw new Error(`${sheet} redeclares ${redeclared[0].trim()}. It is generated into tokens.generated.css from tokens.json, where iOS and Android read it too.`);
}

/* What may be written on sage.
   The sage ramp is a fill and charcoal is the only foreground measured against it — 11.11:1 on the
   lightest, 5.89 on the darkest. `faint` on paleSage computes 3.70 and fails, and the patient sweep
   found five places a sage fill would have inherited it: a lead panel's empty state, a highlighted
   module card, a featured plan, a selected choice row and a selected locale. Each was forced to
   charcoal by hand, which is the kind of fix that lasts until the next person adds a sixth.

   So it is checked. Any rule that paints a sage background may not also set a colour that is not
   charcoal, and may not leave one to be inherited from a lighter ground. */
/* The Care Studio tints are in this list beside the sage ramp, for the same reason and under the
   same sentence. studioLime measures 1.05 on studioPaper and 11.46 under ink; lilac and peach are
   9.04 and 8.92 under ink and clear nothing as text. So a rule that paints one of them owes a
   foreground, and that foreground is the ink — which is what the old rule said about charcoal, in a
   different palette. The accepted foregrounds grew by exactly the two studio inks; nothing else was
   loosened. */
const sageFills = /(--pale-sage|--soft-sage|--muted-sage|--sage-slate|--studio-lime|--studio-lilac|--studio-peach)\)/;
/* The inks that may be read on any of them. --studio-ink-deep has to be spelled out: the old test
   was /--ink\)/ and "var(--studio-ink-deep)" does not contain "--ink)". */
const inkForeground = /--charcoal|--ink\)|--studio-ink\)|--studio-ink-deep\)/;
/* A surface that paints sage must also set a colour, and that colour must be charcoal.
   The first version of this check only saw a rule that did both at once. It missed the real case:
   `.s-panel.lead` painted sage and set no colour, `.s-panel-head p` set faint and painted nothing,
   and faint landed on sage at 3.75:1 through inheritance across two rules that were each fine on
   their own. A guard that only reads one declaration at a time cannot see a failure that only
   exists where two of them meet — so a sage ground must now carry its own foreground down. */
for(const sheet of [...designSheets,'apps/web/src/landing.css','apps/web/src/surface/surface.css','apps/web/src/surface/patient.css','apps/web/src/surface/clinical.css','apps/web/src/surface/studio.css','apps/web/src/shells/shells.css']) {
 if(!existsSync(sheet)) continue;
 /* Comments stripped first. A CSS comment sitting above a rule is captured as part of that rule's
    selector by any regex this simple, so the error named a paragraph of prose instead of a class —
    and a repair scripted from that name edits the comment. Same whole-file mistake as the notice
    check, in a fourth language. */
 const sheetCode = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
 for(const rule of sheetCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const [, selector, body] = rule;
  if(!/background[^;]*:/.test(body)) continue;
  /* A charcoal gradient with a trace of sage mixed into it is a dark ground, not a sage one — its
     text is white, and forcing charcoal onto it would be the actual defect. So a declaration that
     names charcoal alongside the sage is not a sage surface. */
  const paintsSage = body.split(';').some(d =>
   /^\s*background/.test(d) && sageFills.test(d) && !/--charcoal|--studio-ink/.test(d));
  if(!paintsSage) continue;
  const colour = body.split(';').find(d => /^\s*color\s*:/.test(d));
  /* A surface only has to provide a foreground if something could be read on it. A pseudo-element
     overlay, and a bar declared shorter than the 13px type floor, cannot hold a word between them —
     requiring a colour there would be noise, and noise is how a check gets switched off. */
  /* A third thing that cannot hold a word: an icon disc. A rule that fixes both dimensions of a
     square and centres a single child has room for a glyph and for nothing else, and a glyph on
     this product is never the only thing saying what a control is — every one of them sits beside
     the words it repeats, which is why SC 1.4.11's 3:1 is not owed by it. That is what lets the
     brand's own green and orange be the glyph on a tint — 3.01 and 2.44, measured — while the rule
     below still refuses either of them as a label. It must still declare A foreground: a disc that
     sets none lets a colour arrive by inheritance, which is the failure this whole check exists
     for. */
  const glyphDisc = /place-items:\s*center/.test(body)
   && /(^|;)\s*width:\s*\d+px/.test(body) && /(^|;)\s*height:\s*\d+px/.test(body);
  const decorative = /::(before|after)/.test(selector)
   || (/height:\s*(\d+)px/.test(body) && Number(body.match(/height:\s*(\d+)px/)[1]) < 13);
  if(!colour && !decorative) throw new Error(`${sheet}: "${selector.trim().slice(0,60)}" paints an accent fill and sets no colour, so whatever a child inherits lands on it unmeasured — faint gets 3.75:1 on paleSage and fails, and studioLime is 1.05 under anything but the ink. Set the foreground on the surface that paints the fill — var(--charcoal) on a sage, var(--studio-ink) on a studio tint; a child cannot be relied on to remember. If nothing can be read on it, say so by giving it a height under the type floor or making it a pseudo-element.`);
  if(colour && !inkForeground.test(colour) && !glyphDisc) throw new Error(`${sheet}: "${selector.trim().slice(0,60)}" paints an accent fill and sets ${colour.trim()}. The inks are the only foregrounds measured against these ramps — faint on paleSage is 3.70 and fails, and nothing but studioInk is declared against studioLime. Everything read on an accent fill is charcoal or a studio ink.`);
 }
}

/* The five states a screen can be in, and why this is checked here rather than driven on a screen.
   loading, error, offline, denied and empty were reachable only through a StatePicker — a
   design-review control that shipped in the product surface, and the only way a test could see four
   of the five. Removing the picker would have taken the coverage with it: five states nothing can
   render are five states nobody maintains.

   So the assertion moves here, where it is stronger than it was. A gallery can satisfy "these five
   are reachable"; it cannot satisfy "each of these five says something specific and useful", and a
   source check cannot be quietly removed along with a UI control. What a browser still owns is the
   two states a real condition can produce — offline, and a failed request — and those are driven
   from the condition rather than from a button that pretends. */
const states=read('apps/web/src/components/States.tsx');
/* The declaration itself, not the file. Searching the whole file for 'denied' passes on a file that
   has deleted the state and kept a ternary mentioning it — which is exactly the shape a half-done
   removal leaves behind. */
const declared=states.match(/export const loadStates\s*=\s*\[([^\]]*)\]/)?.[1];
if(!declared) throw new Error('apps/web/src/components/States.tsx no longer declares a loadStates array, so nothing here knows which states a screen is meant to have.');
for(const state of ['ready','loading','error','offline','denied']) {
 if(!new RegExp(`'${state}'`).test(declared)) throw new Error(`apps/web/src/components/States.tsx no longer declares the "${state}" state. Every screen that will one day reach a clinical, payment or device integration needs all five designed before that integration lands, not improvised at three in the morning when it does.`);
}
/* Each one has to say something a person can act on, *in its own branch*. "Something went wrong"
   is the failure this catches: it tells a reader nothing and tells the care team nothing.

   Bound to the branch rather than to the file. Searching the whole file passes on a phrase that
   survives in a comment, or in a neighbouring state's copy — which is the same whole-file hole this
   check was rewritten once already to close, and it was still open one line below. The body
   expression is one nested ternary in state order, so each phrase must fall between its own test
   and the next one. */
const body=states.match(/const body\s*=([\s\S]*?);\n/)?.[1];
if(!body) throw new Error('apps/web/src/components/States.tsx no longer builds a `body` for its states, so there is nothing to check the wording of.');
const at=needle=>body.indexOf(needle);
for(const [state, must] of [['offline','stays available'],['denied','never blocks a visit'],['error','nothing was lost']]) {
 if(at(must)<0) throw new Error(`The "${state}" state no longer tells the reader what it means for them — the sentence containing "${must}" is gone from the body of the state block. A state that only names itself is a state that helps nobody.`);
}
if(!(at("'offline'")<at('stays available')&&at('stays available')<at("'denied'")&&at("'denied'")<at('never blocks a visit')&&at('never blocks a visit')<at('nothing was lost'))) {
 throw new Error('The state sentences are no longer in their own branches in apps/web/src/components/States.tsx — one of them has moved, so a reader who is offline may be reading the copy written for a refused permission. Each phrase must sit between its own state test and the next.');
}
if(!/export function EmptyState/.test(states)) throw new Error('EmptyState is gone from apps/web/src/components/States.tsx. Empty is the fifth state and the one a new account sees first.');
/* The picker that made four of these five reachable is a development control and is being removed
   from the product surface. The check that keeps it out lands with that removal rather than before
   it: a boundary check committed ahead of the change it describes is a red build with a promise
   attached, and this repository does not do promises. */

/* What MyThuso claims it can do.
   Every screen used to carry its own hand-typed "Design preview" or "Demonstration record" —
   sixty-odd sentences, three of them stacked above the first visit on a nurse's schedule, none of
   them attached to anything that would know when it stopped being true. They come from
   packages/catalog/capabilities.json now, and these checks are what make that worth doing.

   The failure this guards against is never a lie. It is somebody clearing a banner off a layout at
   eleven at night because the screenshot looked better without it. So a capability may be called
   connected only when it can point at something that exists and has nothing left blocking it. */
const capabilities=JSON.parse(read('packages/catalog/capabilities.json'));
for(const c of capabilities.capabilities) {
 if(!c.notice) throw new Error(`Capability "${c.id}" has no sentence to show while it is not connected. A screen that depends on it would then say nothing, which is the state this file exists to end.`);
 if(!c.surfaces?.length) throw new Error(`Capability "${c.id}" names no surfaces, so nothing can be checked against it.`);
 if(c.connected) {
  if(!c.evidence) throw new Error(`Capability "${c.id}" is marked connected and names no evidence. Connected is a claim about the world; it needs a file somebody can open.`);
  if(!existsSync(c.evidence)) throw new Error(`Capability "${c.id}" is marked connected and its evidence "${c.evidence}" does not exist. Something was deleted, or the claim was never true.`);
  if(c.blockedBy?.length) throw new Error(`Capability "${c.id}" is marked connected and still lists ${c.blockedBy.length} thing(s) blocking it, beginning "${c.blockedBy[0]}". Clear the list or clear the flag — a capability cannot be both.`);
 }
 /* The third state, and the four things that keep it from becoming the second one.
  *
  * `simulated` exists because the founder asked to walk the whole product end to end before any
  * supplier was signed. The honest way to give him that was a third state; marking these connected
  * would have taken the notice off every screen and told the status page a health service was live.
  *
  * The hazard of a simulator is precisely that it works. Somebody who has watched a payment go
  * through is one edit away from believing a payment provider exists. So four things are checked,
  * and each of them is the reason a different person would have got this wrong:
  *
  *  1. The state and the boolean may not disagree. `connected` is what removes every notice in the
  *     product, and it is left alone.
  *  2. A simulation declares what it refuses. A block with a supplier and a notice and no refusals
  *     is a fixture with a label on it; the refusals are the part that is worth reading.
  *  3. A simulated capability still lists everything blocking it. A simulator unblocks nothing —
  *     the SMS provider is still unsigned the day the simulated one works perfectly.
  *  4. Nothing simulated is reachable over the network, which the eleven feed routes enforce for
  *     real and this field records as an intention somebody would have to edit to break. */
 /* A fourth state since 14 September 2026, and it belongs to voice alone: `on-device` says the phone
    does the work and nothing is connected. It carries no simulation and it keeps its notice. */
 const STATES = ['absent', 'on-device', 'simulated', 'connected'];
 if(c.state === 'on-device') {
  if(c.id !== 'voice') throw new Error(`Capability "${c.id}" is marked on-device. That state was made for Gilbert's push-to-talk, where the phone's own recogniser does the work and nothing leaves it; another capability claiming it needs its own argument written into packages/catalog/capabilities.json first.`);
  if(!c.onDevice?.what || !c.onDevice?.whyNotConnected) throw new Error(`Capability "${c.id}" is on-device and does not say what runs on the device and why that is not connected. The state is a claim about where work happens, and a claim with no sentence is a softer word for connected.`);
  if(!c.blockedBy?.length || !c.notice) throw new Error(`Capability "${c.id}" is on-device and has dropped what blocks it or the notice it shows. Working on the phone unblocks nothing that needed a supplier.`);
  if(c.simulation) throw new Error(`Capability "${c.id}" is on-device and carries a simulation block. Nothing stands in for the recogniser; it is the phone's.`);
 }
 if(!STATES.includes(c.state)) throw new Error(`Capability "${c.id}" has state ${JSON.stringify(c.state)}, which is not one of ${STATES.join(', ')}. A capability with an unreadable state is one every screen guesses about.`);
 if(c.connected !== (c.state === 'connected')) throw new Error(`Capability "${c.id}" says state "${c.state}" and connected ${c.connected}. Those are the same fact written twice and they disagree, which is the drift the simulated state was introduced to survive.`);
 if(c.state === 'simulated') {
  const sim = c.simulation;
  if(!sim) throw new Error(`Capability "${c.id}" is marked simulated and carries no simulation block. Simulated is a claim that something answers; it needs to say what, and what it will not do.`);
  if(!sim.supplier || !sim.notice) throw new Error(`Capability "${c.id}"'s simulation names no supplier or no notice. The notice is what the screen renders instead of falling silent, and silence is the disclosure failure this state was built to avoid.`);
  if(!sim.refuses?.length) throw new Error(`Capability "${c.id}"'s simulation refuses nothing. A simulation that refuses nothing is a fixture with a label on it, and the refusals are the half worth reading.`);
  if(sim.reachableFromTheNetwork !== false) throw new Error(`Capability "${c.id}"'s simulation does not declare itself unreachable from the network. The eleven feed routes accept nothing and a simulated event enters in process; a simulator on a route is the condition somebody finds at two in the morning with a vendor on the phone.`);
  if(!c.blockedBy?.length) throw new Error(`Capability "${c.id}" is simulated and lists nothing blocking it. A simulator unblocks nothing — whoever it stands in for is still unsigned — and an empty blockedBy here is how a simulation quietly becomes a claim.`);
  if(!c.notice) throw new Error(`Capability "${c.id}" is simulated and has dropped the sentence it said while absent. Keep it: the day the simulator is removed the screen must have something true to say.`);
 }
}
/* Nothing here asks a device for anything.
   Neither app declares a single permission: no uses-permission in the Android manifest, no
   NS*UsageDescription on the iOS target. That is not an accident of scope, it is the strongest true
   sentence this product can say about itself, and several notices depend on it — "nothing here has a
   microphone" is a special case of "nothing here asks for anything".

   So the rule is a whitelist rather than a blacklist. Naming RECORD_AUDIO and the microphone key
   specifically, as the two checks below do, would let CAMERA or a location key land without the
   build noticing. A permission may exist only when a capability names it in requiresPermissions —
   which forces whoever wants it to write down which feature it serves, in the same file that holds
   what is blocking that feature and what the app currently tells people. Today the list is empty on
   both sides, and this check is here for the day it stops being.

   Raised by mythuso-58, which verified the silence was total before suggesting it. */
const permissionsFor=new Set(capabilities.capabilities.flatMap(c=>(c.requiresPermissions??[]).map(p=>typeof p==='string'?p:p.permission)));
/* Since voice named three, a permission is an object: the name, the platform it is declared on and the
   feature it serves. A bare name says nothing about why, which is the half this whitelist exists for. */
for(const c of capabilities.capabilities) for(const p of c.requiresPermissions??[]) {
 if(typeof p==='string'||!p.permission||!['ios','android'].includes(p.platform)||!p.serves) throw new Error(`Capability "${c.id}" names a permission without the platform it is declared on and the feature it serves (${JSON.stringify(p)}). The sentence saying why is the reason the whitelist asks.`);
}
const androidAsks=[...read('apps/android/app/src/main/AndroidManifest.xml').matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map(m=>m[1]);
const iosAsks=[...read('apps/ios/MyThuso.xcodeproj/project.pbxproj').matchAll(/INFOPLIST_KEY_(NS\w*UsageDescription)/g)].map(m=>m[1]);
for(const [platform,asks] of [['Android',androidAsks],['iOS',iosAsks]]) {
 for(const ask of asks) {
  if(!permissionsFor.has(ask)) throw new Error(`The ${platform} app asks the device for ${ask}, and no capability in packages/catalog/capabilities.json names it under requiresPermissions. Neither app has ever asked for anything, and more than one notice a person reads depends on that being true. If a feature needs it, say which feature — in the file that also holds what is blocking that feature.`);
 }
}

/* Two capabilities carry a neverSoften note, and both are checked rather than trusted, because both
   are the kind somebody removes to make a demo look better. */
const voice=capabilities.capabilities.find(c=>c.id==='voice');
if(!voice?.neverSoften) throw new Error('The voice capability has lost the note forbidding a listening affordance where nothing is listening. A control that looks like it is listening and is not is worse than no control, and on a health product it is the kind of worse that gets believed.');
if(voice.connected) throw new Error('packages/catalog/capabilities.json marks voice as connected. Gilbert\'s recognition runs on the phone and no speech provider is contracted, so the claim is false on all three platforms at once.');
if(voice.state!=='on-device') throw new Error(`The voice capability says state "${voice.state}". Gilbert listens, on the phone, in English, push-to-talk — which is on-device, and neither absent (it listens) nor connected (nothing answers from outside).`);
/* Gilbert, and what the microphone may and may not do. Rewritten on 14 September 2026.

   Until that day this block refused every microphone in the product: no audio API anywhere, no mic
   symbol, no word offering to listen. It was right, because nothing had been decided about listening.
   The founder has now decided — push-to-talk, English, on-device recognition only, no recording, no
   wake word, and no microphone on the web — so the blanket refusal is replaced by narrower ones that
   hold exactly that decision and nothing wider. They are in the bannered Gilbert section at the foot of
   this file. What stays here is the part that was never about the microphone: no hand-written native
   file types a capability's notice. */
const iosSources=native.filter(f=>f.startsWith('apps/ios/') && f.endsWith('.swift'));
const handWrittenIos=iosSources.filter(f=>!/Data\.swift$/.test(f));
/* Swift string literals, one line at a time. A literal cannot span a line without three quotes
   around it, so this cannot swallow a paragraph of prose, and a comment that quotes a rule — which
   the assistant's does, deliberately — has one quote per line and produces no literal at all. */
const swiftLiterals = source => [...source.matchAll(/"(?:[^"\\\n]|\\.)*"/g)].map(m=>m[0].slice(1,-1));
const flatten = text => text.replace(/\s+/g,' ').trim();
const contractSentences=capabilities.capabilities.flatMap(c=>[c.notice,c.neverSoften].filter(Boolean).map(flatten));
/* Android as well as iOS. This walked only Swift when it was written, because iOS was the only
   platform rendering these notices — Android has its own NotConnected now, and a check that stops
   at the platform it was written for stops exactly where the next typed copy appears. Kotlin string
   literals are the same shape as Swift's for this purpose: double-quoted, backslash-escaped.
   Raised by mythuso-58, who had the Android half open and could see the gap from there. */
const handWrittenNative = handWrittenIos.concat(
 native.filter(f => f.endsWith('.kt') && !/Data\.kt$/.test(f)));
for(const file of handWrittenNative) {
 for(const literal of swiftLiterals(read(file))) {
  const flat=flatten(literal);
  if(flat.length<40) continue;
  const typed=contractSentences.find(sentence=>flat.includes(sentence)||sentence.includes(flat));
  if(typed) throw new Error(`${file} types out a sentence that lives in packages/catalog/capabilities.json: "${flat.slice(0,72)}…". Render it from the contract instead — a typed copy cannot be switched off when the capability is connected, and the copy somebody types at eleven at night is always the softer one.`);
 }
}
/* The assistant screen on iOS, and the three things it must not stop doing: rendering the voice
   notice from the contract, keeping the sentence that silence is not safety beside the conversation,
   and answering Reduce Motion. */
const assistant='apps/ios/MyThuso/Features/AssistantView.swift';
if(!existsSync(assistant)) throw new Error(`${assistant} is missing. Gilbert is the surface the voice capability names, and a capability with no surface is a notice nobody reads.`);
const assistantSource=read(assistant);
if(!/CapabilityNotice\(/.test(assistantSource)) throw new Error(`${assistant} no longer renders CapabilityNotice, so whatever it now says about listening is its own sentence rather than the contract's.`);
if(!/"voice"/.test(assistantSource)) throw new Error(`${assistant} no longer names the voice capability, so what blocks it and the rule it is drawn to are no longer coming from packages/catalog/capabilities.json.`);
if(!/Gilbert\.silenceIsNotSafety/.test(assistantSource)) throw new Error(`${assistant} no longer renders silenceIsNotSafety. The emergency words are an unreviewed draft, and the sentence saying that a miss is not safety has to be on the screen before anybody needs it.`);
if(!/accessibilityReduceMotion/.test(assistantSource)) throw new Error(`${assistant} draws an animated shape without asking for Reduce Motion. A shape that breathes forever is exactly what that setting exists for, and slowing it is not answering it.`);

/* The emergency pathway is the one refusal here that is not about MyThuso, and it is the one that
   matters most: a person on that screen may be about to need an ambulance. */
const emergency=capabilities.capabilities.find(c=>c.id==='emergency');
if(!emergency?.neverSoften) throw new Error('The emergency capability has lost the note saying its ambulance number is shown whether or not anything is connected. That sentence is the reason the note exists.');
for(const number of ['10177','112']) if(!emergency.notice.includes(number)) throw new Error(`The emergency notice no longer names ${number}. In a real emergency that number is the only useful thing on the screen.`);
/* One place writes these sentences. A screen that types its own cannot be switched off with the
   others, and one of them will be wrong by the time anybody notices. */
for(const file of ['apps/web/src/components/NotConnected.tsx','apps/web/src/lib/capabilities.ts']) {
 if(!existsSync(file)) throw new Error(`${file} is missing. It is how a screen asks whether a capability is connected.`);
}
/* No screen writes its own. Sixty of these were hand-typed once, in slightly different words, three
   of them stacked above the first visit on a nurse's schedule. They come from the contract now, and
   this is what stops them coming back — which is not hypothetical: a shell written in parallel with
   the sweep reintroduced "Demonstration record · No live actions" into a new directory the sweep had
   never seen, and the words were false by the time they were typed. */
const inventedNotices=/(Design preview|Demonstration record|Fictional workspace|This feature is a UI preview|No real request will be sent|Role switching is for design review)/;
for(const dir of ['apps/web/src']) {
 if(!existsSync(dir)) continue;
 for(const file of files(dir)) {
  if(!file.endsWith('.tsx')&&!file.endsWith('.ts')) continue;
  /* Comments stripped first. Three files explain this history in prose — including the module that
     replaced the notices — and a check that fails on its own explanation is the whole-file search
     mistake for the third time tonight. What is searched is what a reader sees. */
  const code=read(file).replace(/\/\*[\s\S]*?\*\//g,'').split('\n').map(l=>l.replace(/(^|\s)\/\/.*$/,'')).join('\n');
  const found=code.match(inventedNotices);
  if(found) throw new Error(`${file} types its own preview notice ("${found[1]}"). That sentence belongs in packages/catalog/capabilities.json and reaches the screen through <NotConnected of="…"/>, so that when the thing it describes is connected the sentence disappears everywhere at once instead of being hunted down by hand.`);
 }
}
if(!read('apps/web/src/components/NotConnected.tsx').includes('noticeFor')) throw new Error('NotConnected no longer reads the contract, so what it renders is anybody\'s guess.');
/* Two class names are load-bearing outside the code that writes them: tests/states.spec.ts drives
   the offline and error states from real conditions and finds them by class, and it is the only
   thing that can prove those states are reachable at all — a source check passes just as happily
   when every call site is pinned to 'ready' forever. Renaming either silently turns that suite
   green-and-blind, which is worse than red. */
if(!/className=\{`not-connected/.test(read('apps/web/src/components/NotConnected.tsx'))) throw new Error('NotConnected no longer renders the class "not-connected". tests/states.spec.ts finds the not-connected state by that class, and a renamed selector does not fail that test — it stops testing.');
if(!/className=\{`state-block \$\{state\}`\}/.test(read('apps/web/src/components/States.tsx'))) throw new Error('StateBlock no longer renders "state-block <state>". tests/states.spec.ts finds .state-block.offline and .state-block.error that way, and those two assertions are the only proof in the suite that any of the five states can still be reached.');
void inventedNotices;

/* What an endless animation is allowed to move.
   A dead decorative component animated nine circles for weeks behind a screen that had stopped
   rendering it, and the cost was not the frames — it was four Playwright specs failing at random on
   whichever click happened to land while something was in flight. Playwright waits for an element's
   box to hold still across two animation frames before it will act on it, so the hazard is not
   motion, it is a *box that keeps changing*: width, height, top, left, margin, padding, inset.
   transform and opacity are composited and move nothing anything else is measured against.

   So an animation that runs forever may only touch the compositor. A finite one may do as it likes:
   it stops, and the wait ends with it. */
const composited = /^(transform|opacity|filter|background-position|background-size|box-shadow|color|background-color|border-color|stroke|fill|stroke-dashoffset)$/;
for(const sheet of [...designSheets,'apps/web/src/landing.css','apps/web/src/surface/studio.css','apps/web/src/map/map.css','apps/web/src/surface/motion.css']) {
 const css=read(sheet);
 const frames=new Map();
 for(const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) frames.set(match[1], match[2]);
 const endless=new Set();
 for(const match of css.matchAll(/animation:\s*([^;}]*infinite[^;}]*)/g)) {
  const name=match[1].trim().split(/\s+/).find(word=>frames.has(word));
  if(!name) throw new Error(`${sheet} has an endless animation whose keyframes are not in this file: "${match[1].trim()}". A rule pointing at keyframes nobody can find is a rule nobody can check.`);
  endless.add(name);
 }
 for(const name of endless) {
  for(const property of [...frames.get(name).matchAll(/([a-z-]+)\s*:/g)].map(m=>m[1])) {
   if(!composited.test(property)) throw new Error(`${sheet}: the endless animation "${name}" changes ${property}, which moves the element's box. Playwright waits for a box to hold still before it will click, so a forever-running box change is four flaky specs waiting to happen — it was, and finding that took two sessions. Animate transform or opacity, or give the animation an end.`);
  }
 }
 /* A keyframe block nobody plays is the state the bubbles were in for a week. */
 for(const name of frames.keys()) {
  if(!new RegExp(`animation[^;}]*\\b${name}\\b`).test(css)) throw new Error(`${sheet} defines @keyframes ${name} and nothing plays it. That is the state the hero bubbles were in while they were still running — delete it rather than leave it for somebody to wire back up.`);
 }
}

/* Where MyThuso works, and what a map of it is allowed to draw.
   Three copies of Johannesburg used to exist — one inside a React component, one inside a SwiftUI
   view, one inside a composable — and they had already drifted. There is one now, and these are the
   things that were wrong before somebody wrote them down.

   The privacy rules are not decoration. A home address beside a health service is not a location,
   it is a diagnosis with a doorstep, and the two checks that matter are that no coordinate is
   sharper than the contract declares and that no map can zoom close enough to pick out a house. */
const decimalsOf=n=>{const [,fraction='']=String(n).split('.');return fraction.length;};
for(const zone of geography.zones) {
 for(const [axis,value] of [['lat',zone.at.lat],['lng',zone.at.lng]]) {
  if(decimalsOf(value)>geography.precision.decimals) throw new Error(`Zone "${zone.id}" carries a ${axis} of ${value} — more decimal places than the ${geography.precision.decimals} this contract declares. Three decimals is enough to draw a suburb and not enough to find a door, which is the entire point of writing the number down.`);
 }
 if(zone.at.lng<16||zone.at.lng>33.5||zone.at.lat<-35.5||zone.at.lat>-22) throw new Error(`Zone "${zone.id}" is not in South Africa. packages/geo refuses that coordinate, so the zone would be a suburb no map could draw.`);
 if(!(zone.radiusKm>0)) throw new Error(`Zone "${zone.id}" has no working radius, so nothing can be inside it.`);
}
if(decimalsOf(geography.window.centre.lat)>geography.precision.decimals||decimalsOf(geography.window.centre.lng)>geography.precision.decimals) throw new Error('The map window centre is sharper than the precision this contract declares.');
if(geography.window.maxZoom>15) throw new Error(`The map may zoom to ${geography.window.maxZoom}. Above fifteen a reader can pick out an individual house, and no screen in this product has a reason to — the limit is the privacy control, not a performance one.`);
if(geography.window.minZoom>=geography.window.maxZoom) throw new Error('The map cannot zoom at all: its minimum is not below its maximum.');
for(const id of ['address-is-not-a-pin','nothing-leaves-for-a-tile','no-history-drawn']) {
 if(!geography.privacy.rules.some(r=>r.id===id)) throw new Error(`The geography contract has lost the privacy rule "${id}". These are the three that decide whether a map of a health service is safe to draw.`);
}
for(const rule of geography.privacy.rules) if(!rule.why) throw new Error(`Privacy rule "${rule.id}" states what happens and not why. A rule without its reasoning is a rule the next person deletes.`);
/* Every mark on a map has a name in the key, so a colour never carries meaning on its own. */
const markIds=new Set(geography.marks.map(m=>m.id));
for(const id of ['nurse-blocked','visit-waiting']) if(!markIds.has(id)) throw new Error(`The map key has no entry for "${id}". A dispatcher who cannot tell a blocked nurse from an available one will dispatch the blocked one.`);
/* The tile provider is a third party and its attribution is a licence condition, not a design
   choice. It is also the only text on that surface somebody would be tempted to shrink. */
if(!geography.rendering.attributionRequired) throw new Error('packages/catalog/geography.json no longer requires map attribution. That is a licence condition rather than a design decision.');
if(!read('apps/web/src/map/map.css').includes('font-size: 13px')) throw new Error('The map stylesheet no longer holds the attribution to the type scale, so the map is the one surface in the product with text below the floor the token file declares.');
/* A build with no tile token is a supported state. The moment the schematic goes, a missing key
   becomes a grey rectangle, and a controller who has seen one grey rectangle stops trusting the
   board at the moment they most need to believe it. */
if(!read('apps/web/src/map/LiveMap.tsx').includes('Schematic')) throw new Error('The web map has no rendering for a build without a tile token. That is not a failure state, it is the ordinary one — no token is committed to this repository.');
for(const file of ['apps/web/src/map/LiveMap.tsx','apps/web/src/lib/geography.ts']) {
 if(/pk\.eyJ/.test(read(file))) throw new Error(`${file} contains a Mapbox token. A key in source is a key in every fork of the repository; the token is read from the environment and its absence is a supported state.`);
}
/* No native app fetches a tile. Both draw the schematic, which is why neither declares a location
   permission and neither has a map vendor to be told anything. */
if(/android\.permission\.ACCESS_(FINE|COARSE)_LOCATION/.test(read('apps/android/app/src/main/AndroidManifest.xml'))) throw new Error('The Android manifest declares a location permission. Nothing in this build asks a device where it is — the positions are fictional and the map is drawn from a contract.');
if(/INFOPLIST_KEY_NSLocation/.test(read('apps/ios/MyThuso.xcodeproj/project.pbxproj'))) throw new Error('The iOS target declares a location usage description. Nothing in this build asks a device where it is.');

/* How a person reaches a doctor, and what may come out of it.
   The proposal sells no standalone video consultation — Thuso Doctor joins a visit, reads what was
   captured, or takes a booked counselling session — so the routes are checked against the service
   catalogue rather than against a price typed beside them. The route a patient does not buy carries
   no service id at all, and that is the point: a nurse who has to justify the cost of a second
   opinion will sometimes not ask for one. */
const serviceIds=new Set(catalogue.map(s=>s.id));
const freeRoutes=teleconsult.routes.items.filter(r=>r.serviceId===null);
if(!freeRoutes.length) throw new Error('Every way of reaching a doctor names a service to charge for. The doctor joining a nurse\'s visit must not: the visit is paid for already, and a call a nurse has to justify is a call a nurse will sometimes not make.');
for(const route of teleconsult.routes.items) {
 if(route.serviceId!==null&&!serviceIds.has(route.serviceId)) throw new Error(`Consultation route "${route.id}" names service "${route.serviceId}", which is not in packages/catalog/services.json. A route that names a price nobody sells is a route that will be sold at a number somebody typed.`);
 /* A route may describe what it costs. It may not state the figure: that lives in the catalogue. */
 const priced=[route.detail,route.patientWords].join(' ');
 for(const service of catalogue) if(new RegExp(`R\\s?${service.price}\\b`).test(priced)) throw new Error(`Consultation route "${route.id}" writes the price R${service.price} into its own words. A price lives in packages/catalog/services.json and everything else derives from it.`);
}
const review=teleconsult.routes.items.find(r=>r.live===false);
if(!review) throw new Error('Every consultation route is a live call. Most of what a doctor panel does is reading, and a review that can be called a consultation is a review that can be charged and recorded as one.');
/* A wait that cannot end is how somebody sits in a chair for an hour being told a doctor is coming. */
if(!(teleconsult.waitingRoom.maximumWaitMinutes>0)) throw new Error('The waiting room has no maximum wait. A queue with no exit is not a queue, it is a room.');
if(!teleconsult.waitingRoom.states.some(w=>w.id==='nobody-came')) throw new Error('The waiting room has no state for nobody arriving. That is the state it exists for.');
/* The sharpest refusal in the module, and the one most likely to be quietly relaxed by somebody who
   wants the demo to be more impressive. A medical certificate says a doctor was satisfied the person
   could not work; satisfying a doctor of that with nobody in the room is a question for the HPCSA
   rather than for this repository, and until it is answered the answer here is no. */
const certificate=teleconsult.issued.items.find(d=>d.id==='certificate');
if(!certificate) throw new Error('The consultation contract does not say whether a medical certificate can come out of a call. Silence on that question is the answer a demo will take.');
if(certificate.mayIssue) throw new Error('packages/catalog/teleconsult.json now lets a video call issue a medical certificate. Nothing in this repository has an HPCSA ruling that it may, and the sick-note visit in the catalogue is a visit precisely because somebody has to examine the patient.');
if(!teleconsult.issued.items.some(d=>d.mayIssue)) throw new Error('A consultation in this contract can produce nothing at all, which is not a consultation.');
for(const document of teleconsult.issued.items) {
 if(!document.mayIssue&&document.goesTo) throw new Error(`Issued document "${document.id}" may not be issued and still says where it goes. A refusal with a destination is a refusal somebody will route around.`);
 if(!document.limit) throw new Error(`Issued document "${document.id}" carries no limit. The valuable half of this contract is what it will not do.`);
}
/* The two refusals a patient actually hears, on all three platforms, word for word. */
for(const id of ['certificate-from-a-call','doctor-on-demand']) {
 const refusal=teleconsult.refusals.find(r=>r.id===id);
 if(!refusal) throw new Error(`The consultation contract has no refusal "${id}".`);
}

/* One identity check, one refusal sentence, three platforms — and the same code the nurse is asked
   for at the door, so a patient learns it once. */
const doorRefusal='That code doesn’t match this visit. Call the Control Tower before continuing.';
if(teleconsult.identity.failure!==doorRefusal) throw new Error('The teleconsultation identity refusal is not the nurse\'s. Two different sentences for the same failed code is two different products.');
if(!read(clinicalSources.web).includes(doorRefusal)) throw new Error('The visit-code refusal has moved in the nurse assessment, and the teleconsultation contract still quotes the old one.');
if(!read('apps/web/src/features/Clinical.tsx').includes("export const demoVisitCode = '482190'")) throw new Error('The demo visit code is no longer exported from apps/web/src/features/Clinical.tsx, so the teleconsultation screen has nowhere to read it from but a copy of its own.');
for(const [platform,paths] of Object.entries(teleconsultSources)) {
 const file=paths[0], source=paths.map(read).join('\n');
 if(!source.includes('482190')&&!source.includes('demoVisitCode')) throw new Error(`The ${platform} teleconsultation screen does not use the visit code the nurse asks for at the door (${file}). There is one identity check in MyThuso, and a second one invented for video is a second thing to get wrong.`);
 /* The refusal a lapsed doctor sees has to be the clinical queue's, which means asking the vetting
    table rather than writing a sentence. D-402's HPCSA registration is lapsed in the fixtures. */
 if(!source.includes('sign-clinical-review')) throw new Error(`The ${platform} teleconsultation screen does not ask the vetting table whether this doctor may consult (${file}). A doctor refused in different words by the queue and by the call believes neither.`);
}
/* Nobody is named in the contract. A participant carries a role into the vetting register and the
   screen resolves the party from there, so a registration number lives in one place. Naming the
   council is fine and necessary — "their HPCSA registration" is what the patient is told to look
   for. What may not appear is a person: a title with a name after it, or a credential in the format
   an issuing authority actually uses. */
const namedInContract=/(\bDr [A-Z]|\bSister [A-Z]|\bBrother [A-Z]|SANC \d|HPCSA [A-Z]{2}\d)/;
if(namedInContract.test(JSON.stringify(teleconsult))) throw new Error('packages/catalog/teleconsult.json names a clinician or a registration. Parties come from packages/catalog/vetting.json, or the roster becomes a second copy of the vetting record — and the copy is the one the patient reads.');
for(const p of teleconsult.participants) if(p.roleId&&!roleIds.has(p.roleId)) throw new Error(`Teleconsultation participant ${p.id} carries a vetted role nothing defines: ${p.roleId}`);


/* ---- Consent, and the log of who opened a record ----
   Consent is the one contract where a single wrong word is the whole failure: a purpose that is
   really compulsory presented as a choice, an optional consent that quietly costs somebody their
   care, or a version of the wording that carries an old agreement forward into a new one. All three
   are decisions written into packages/catalog/consent.json as data, so all three are checkable. */
const consent = JSON.parse(read('packages/catalog/consent.json'));
const consentBases = new Set(consent.lawfulBases.map(b => b.id));
const consentRoutes = new Set(consent.routes.map(r => r.id));
if(consentBases.size !== consent.lawfulBases.length) throw new Error('Duplicate lawful basis id in packages/catalog/consent.json');
for(const basis of consent.lawfulBases) if(!/section \d/.test(basis.authority)) throw new Error(`Lawful basis ${basis.id} does not point at a section somebody can go and read`);
const consentIds = new Set();
let requiredCount = 0, optionalCount = 0;
for(const purpose of consent.purposes) {
 if(consentIds.has(purpose.id)) throw new Error(`Duplicate consent purpose ${purpose.id}`);
 consentIds.add(purpose.id);
 if(!consentBases.has(purpose.lawfulBasis)) throw new Error(`Consent purpose ${purpose.id} names lawful basis ${purpose.lawfulBasis}, which is not in the register. Processing with no stated basis is what POPIA section 11 exists to stop.`);
 if(purpose.alsoRestsOn && !consentBases.has(purpose.alsoRestsOn)) throw new Error(`Consent purpose ${purpose.id} also rests on unknown basis ${purpose.alsoRestsOn}`);
 if(!purpose.ifRefused) throw new Error(`Consent purpose ${purpose.id} does not say what refusing it costs. A choice with no stated cost is not a choice anybody can make.`);
 if(!purpose.withdrawal) throw new Error(`Consent purpose ${purpose.id} does not say how it is withdrawn`);
 /* The invariant the whole required/optional split exists for. An optional consent that degrades
    care is a payment dressed as a choice. */
 if(purpose.required) { requiredCount++; if(!purpose.requiredBecause) throw new Error(`Consent purpose ${purpose.id} is required and does not say why`); }
 else { optionalCount++; if(purpose.degradesCare) throw new Error(`Consent purpose ${purpose.id} is optional and degrades care. ${consent.rules.optionalNeverDegradesCare}`); }
 let previousVersion = 0;
 for(const version of purpose.versions) {
  if(!(version.version > previousVersion)) throw new Error(`Consent purpose ${purpose.id} version ${version.version} does not follow ${previousVersion}`);
  previousVersion = version.version;
  if(!version.wording || !version.withdrawalWording) throw new Error(`Consent purpose ${purpose.id} version ${version.version} is missing its wording or the way out of it`);
  /* Written as data so that turning it on is a change somebody has to argue for in a contract,
     rather than a flag a hurried release quietly flips. */
  if(version.carriesOver) throw new Error(`Consent purpose ${purpose.id} version ${version.version} carries an earlier consent forward. ${consent.rules.newWordingDoesNotCarryOver}`);
 }
 for(const kept of purpose.retainedOnWithdrawal ?? []) {
  if(!consentBases.has(kept.basis)) throw new Error(`Consent purpose ${purpose.id} keeps "${kept.what}" on unknown ground ${kept.basis}. Anything kept after a withdrawal is kept on a stated ground or is not kept.`);
 }
}
if(!requiredCount) throw new Error('packages/catalog/consent.json lists no required purpose, so nothing separates the consents care depends on from the ones it does not');
if(!optionalCount) throw new Error('packages/catalog/consent.json lists no optional purpose. A consent screen on which everything is compulsory is a terms-of-service page.');
if(!consentRoutes.size) throw new Error('Consent has to record how it was taken; packages/catalog/consent.json lists no route');
for(const basis of consent.accessLog.bases) {
 if(!consentBases.has(basis)) throw new Error(`The access log may record basis ${basis}, which is not in the lawful-basis register`);
 /* A marketing consent is not a key to a record, and the one place that could go wrong is a list
    of bases somebody widened without thinking about what each of them opens. */
 if(/marketing/.test(basis)) throw new Error(`${basis} is a basis for sending somebody a message, not for opening their record. It must not be on the access log's list.`);
}
/* The sign-up screen separates the consents care depends on from the ones it does not, and the
   contract is where that split is decided. Two screens disagreeing about which consents are
   compulsory is the drift that turns an optional consent into a compulsory one on one platform. */
const onboardingConsents = read('apps/web/src/features/Onboarding.tsx').match(/\(\[\[[\s\S]*?\] as const\)\.map\(\(\[key, label, required\]\)/);
if(!onboardingConsents) throw new Error('apps/web/src/features/Onboarding.tsx no longer separates required consents from optional ones in a form this check can read');
const onboardingRequired = (onboardingConsents[0].match(/,\s*true\]/g) ?? []).length;
const onboardingOptional = (onboardingConsents[0].match(/,\s*false\]/g) ?? []).length;
if(onboardingRequired !== requiredCount) throw new Error(`Sign-up presents ${onboardingRequired} consents as required and packages/catalog/consent.json has ${requiredCount}. A purpose that is really required and is presented as a choice is a lie about a choice.`);
if(!onboardingOptional) throw new Error('Sign-up presents nothing as optional, so the separation it is supposed to demonstrate has gone');
/* The fingerprint is only proof if both sides take it of the same thing. The browser shows a
   person the digest of what is on their screen and the server stores the digest of what it recorded;
   if the two ever build that input differently the screen is showing a proof the register does not
   hold, which is worse than showing none. So the one line that builds it is compared, not trusted. */
const digestInput = 'JSON.stringify([purposeId, version.version, version.wording, version.withdrawalWording])';
for(const f of ['apps/web/src/lib/consent.ts', 'apps/api/src/consent/contract.ts']) {
 if(!read(f).includes(digestInput)) throw new Error(`${f} no longer builds the consent fingerprint from ${digestInput}. Both sides take the digest of the same thing or neither of them is proof of anything.`);
}
/* One set of words. The wording is what a recorded consent is a fingerprint of, so a second copy of
   it anywhere is a screen that can be edited out of step with the proof the server holds. */
const consentReaders = ['apps/web/src/lib/consent.ts', 'apps/api/src/consent/contract.ts'];
/* The import rather than the phrase: both files also mention the contract in their own comments,
   and a check satisfied by a comment is a check satisfied by a file that has stopped reading it. */
for(const f of consentReaders) if(!/import\s+\w+\s+from\s+['"][^'"]*packages\/catalog\/consent\.json['"]/.test(read(f))) throw new Error(`${f} must import packages/catalog/consent.json rather than restating it`);
const consentSources = [...files('apps/web/src'), ...files('apps/api/src'), ...files('apps/ios/MyThuso'), ...files('apps/android/app/src/main')]
 .filter(f => /\.(tsx?|swift|kt)$/.test(f));
for(const purpose of consent.purposes) for(const version of purpose.versions) {
 for(const f of consentSources) if(read(f).includes(version.wording)) throw new Error(`The wording of ${purpose.id} version ${version.version} is written out again in ${f}. It lives in packages/catalog/consent.json, because a recorded consent is a fingerprint of those exact words.`);
}
/* The two ledgers are append-only, exactly as the auth audit table is, and for a stronger reason:
   a withdrawal is a new line rather than an edit of the line that gave it, so "never consented" and
   "consented and then stopped" stay two different facts. */
const consentStore = read('apps/api/src/consent/store.ts');
for(const table of ['consent_decisions', 'record_access_log']) {
 if(new RegExp(`UPDATE ${table}|DELETE FROM ${table}`, 'i').test(consentStore)) throw new Error(`${table} must stay append-only`);
}
/* And the access log records that a record was opened, never what was in it. The forbidden column
   words are read from the contract rather than restated here, so widening the log means arguing
   with packages/catalog/consent.json first. */
const accessSchema = (consentStore.match(/CREATE TABLE[^;]*record_access_log[^;]+/i) ?? [])[0];
if(!accessSchema) throw new Error('apps/api/src/consent/store.ts no longer creates record_access_log');
for(const forbidden of consent.accessLog.forbiddenColumns) {
 if(new RegExp(`\\b\\w*${forbidden}\\w*\\s+(TEXT|BLOB|INTEGER|REAL|NUMERIC)`, 'i').test(accessSchema)) {
  throw new Error(`record_access_log has grown a "${forbidden}" column. An access log holding the contents of what was opened is a second copy of the record with weaker protection and a longer retention.`);
 }
}

/* The access log's own links, and the seal that makes them worth something.

   A plain SHA-256 chain in a table anybody can recompute proves nothing on its own — the value is
   entirely in the head of it being committed into the gate's keyed chain, which is on the other side
   of the protection boundary. So both halves are held here: the columns must exist, the seal must be
   something a caller cannot forget to pass, and the consent module must still be unable to reach the
   chain except through the two-method capability it is handed. */
for(const column of ['previous_hash', 'hash']) {
 if(!new RegExp(`\\b${column}\\s+TEXT`, 'i').test(accessSchema)) throw new Error(`record_access_log has lost its "${column}" column. Without the links the log is append-only and nothing more, and a row edited behind the service's back reads exactly like a row it wrote.`);
}
/* Read out of the statement rather than grepped for, using the same parser as the clinical check
   above: the `ALTER TABLE … ADD COLUMN seal_of TEXT` that upgrades an existing database would
   satisfy a grep while the schema a fresh one is created from had lost the column. */
const chainColumns = new Set((tablesIn(read('apps/api/src/protection/audit.ts')).find(t => t.name === 'protected_access_log')?.columns ?? []).map(c => c.toLowerCase()));
for(const column of ['seal_of', 'seal_head']) {
 if(!chainColumns.has(column)) throw new Error(`protected_access_log has lost its "${column}" column, so there is nowhere to commit the access log's head and its integrity rests on a digest anybody can recompute.`);
}
/* Not optional. A log whose head nothing commits to is a log anybody with the database file can
   rewrite quietly, and a dependency a caller may omit is one a caller will omit. */
if(!/\n seal: LogSeal;/.test(read('apps/api/src/consent/index.ts'))) throw new Error('RecordAccessLog must take a LogSeal it cannot be constructed without. See apps/api/src/protection/seal.ts.');
/* The boundary the whole arrangement rests on. The consent module may hold the seal; it may not
   hold the chain, because a module that can append to the chain can forge the seals it is supposed
   to be evidence against. */
for(const f of files('apps/api/src/consent')) {
 const source=read(f);
 /* The import, not the phrase — these files talk about the chain at length in their comments, and a
    check a comment can trip is the mistake the clinical-table check above was just cured of. */
 if(/from\s+['"][^'"]*protection\/(audit|crypto)/.test(source)) throw new Error(`${f} imports the audit chain or the crypto directly. The consent module is handed a LogSeal — commit this head, and nothing else — precisely so it cannot write into the chain its own log is sealed against.`);
 if(/import[^;]*\b(HashChainAudit|AuditChain)\b[^;]*from/.test(source)) throw new Error(`${f} imports the audit chain. It is given a LogSeal instead, and that is what keeps the key on the other side of the wall.`);
}
/* And a verification that sealed first would commit whatever it found, which is a verifier
   certifying the tampering it was asked to look for. */
const accessLogRoute = (read('apps/api/src/server.ts').match(/GET \/health\/access-log'[\s\S]*?\n  \}\);/) ?? [])[0];
if(!accessLogRoute) throw new Error('The service no longer offers GET /health/access-log, so nothing running verifies the log of who opened what');
if(/sealNow/.test(accessLogRoute)) throw new Error('GET /health/access-log seals before it verifies. A verifier that seals what it is looking at certifies the tampering it was asked to find.');


/* Substitution and chronic authorisation.

   Two routine events — a pharmacist hands over something other than what was written, and a repeat
   runs out — and the checks below exist because both are routine. A screen about a rare emergency
   gets read carefully; a screen about the thing that happens forty times a day is where a wrong
   default survives for years.

   The first three are the ones that would matter on their own.

   Nothing that must not be substituted may have been substituted. That is not a UI rule that a
   button happens to enforce, it is a property of the data, and a fixture that violates it is a
   demonstration of the wrong thing.

   A substitution never changes the molecule or the strength. What is dispensed has to contain both,
   written out, or it is a different medicine handed over under the same authority — which is
   prescribing, done by somebody who is not a prescriber.

   Nothing is handed over without words. Every item carries what is actually said to the patient,
   and a substituted one carries what is the same about it and what will look different, because
   "the tablet is white now, not pink" is the sentence that stops somebody taking a dose twice.

   The rest hold the shape of the authorisation — boxed by a date and by a quantity, ending in a
   review — and hold the four exceptions in section 22F of the Medicines and Related Substances Act
   101 of 1965 in the register, in the Act's own order, so that a tier cannot quietly appear in which
   a patient is not told. */
const dispensing = JSON.parse(read('packages/catalog/dispensing.json'));
const substitutionClassIds = new Set(dispensing.substitutionClasses.map(c => c.id));
const groundsById = new Map(dispensing.grounds.map(g => [g.id, g]));
const recordTypeIds = new Set(records.records.map(r => r.id));
for(const id of dispensing.recordTypes) {
 if(!recordTypeIds.has(id)) throw new Error(`packages/catalog/dispensing.json names record type "${id}", which packages/catalog/records.json does not define. A dispensing screen writing into a record type nobody catalogued is a record type nobody gated.`);
}
for(const ground of dispensing.grounds) {
 if(!substitutionClassIds.has(ground.class)) throw new Error(`Substitution ground "${ground.id}" falls into class "${ground.class}", which is not one of the three`);
}
/* The four exceptions in the Act, in the Act's own order. They are not decoration on the screen:
   they are the only lawful reasons an interchangeable medicine is not offered, and a register that
   has lost one of them is a register that permits a swap the Act does not. */
const SECTION_22F = [['patient-refused','22F(1)(a)'],['prescriber-forbade','22F(1)(b)'],['declared-not-substitutable','22F(1)(c)'],['price-is-higher','22F(1)(d)']];
const statutory = dispensing.grounds.filter(g => g.section);
if(statutory.length !== SECTION_22F.length) throw new Error(`packages/catalog/dispensing.json carries ${statutory.length} statutory substitution grounds. Section 22F has four exceptions, and a fifth one here is an exception somebody invented.`);
SECTION_22F.forEach(([id, section], index) => {
 const ground = statutory[index];
 if(ground.id !== id || ground.section !== section) throw new Error(`Statutory ground ${index + 1} must be ${id} at section ${section}. These are the four exceptions in section 22F of the Medicines and Related Substances Act 101 of 1965, and reordering or renaming one changes which swaps are lawful.`);
 if(ground.class !== 'must-not') throw new Error(`Section ${section} is an exception to the duty to substitute, so ${id} must fall into "must-not". Anything else turns an exception into a permission.`);
});
/* There is no tier in which a patient is not told. Section 22F makes telling a duty on every
   substitution, so a silent swap is outside this table rather than at the bottom of it — and the
   thing that keeps it outside is that every item, whatever happened to it, carries words. */
const substitutedItems = [];
for(const item of dispensing.prescription.items) {
 if(!substitutionClassIds.has(item.class)) throw new Error(`Prescription item ${item.id} is in class "${item.class}", which is not one of the three`);
 for(const ground of [item.ground, item.secondGround].filter(Boolean)) {
  if(!groundsById.has(ground)) throw new Error(`Prescription item ${item.id} names ground "${ground}", which the register does not define`);
 }
 if(!['substituted','as-written','refused-by-patient'].includes(item.outcome)) throw new Error(`Prescription item ${item.id} has an outcome nothing defines: ${item.outcome}`);
 if(item.class === 'must-not' && item.outcome === 'substituted') throw new Error(`Prescription item ${item.id} must not be substituted and was. That is not a display defect; it is the fixture demonstrating the thing the screen exists to refuse.`);
 if(!item.patientWords || item.patientWords.length < 80) throw new Error(`Prescription item ${item.id} has no words for the patient, or too few of them to be a sentence anybody could repeat at home. Nothing is handed over without being said.`);
 const needsReason = dispensing.substitutionClasses.find(c => c.id === item.class).needsWrittenReason;
 if(needsReason && !item.writtenReason) throw new Error(`Prescription item ${item.id} is a pharmacist's judgement with no written reason. A clinical decision nobody wrote down is a clinical decision nobody can be asked about.`);
 if(!needsReason && item.writtenReason) throw new Error(`Prescription item ${item.id} carries a written reason for a class that does not take one, which means the class and the item disagree about what kind of decision it was`);
 if(item.outcome !== 'substituted') continue;
 substitutedItems.push(item);
 /* The whole design of the feature. What is handed over has to be the same molecule at the same
    strength, written out, or the substitution has changed the prescription. */
 if(!item.dispensed.toLowerCase().includes(item.molecule.toLowerCase())) throw new Error(`Prescription item ${item.id} substitutes ${item.molecule} with "${item.dispensed}", which does not name the same molecule. A substitution that changes the medicine is prescribing.`);
 if(!item.dispensed.includes(item.strength)) throw new Error(`Prescription item ${item.id} substitutes ${item.strength} with "${item.dispensed}", which does not name the same strength. A substitution that changes the dose is prescribing.`);
 if(!item.sameness.length || !item.differences.length) throw new Error(`Prescription item ${item.id} was substituted without saying what is the same about it and what will look different. That sentence is how somebody avoids taking a dose twice.`);
}
if(!substitutedItems.length) throw new Error('No item on the demo prescription was substituted, so the screen demonstrates none of what it is for');
if(!dispensing.prescription.items.some(i => i.class === 'must-not')) throw new Error('No item on the demo prescription is one that must not be substituted, so the refusal that matters most is never shown');
if(!dispensing.prescription.items.some(i => i.outcome === 'refused-by-patient')) throw new Error('No item on the demo prescription was refused by the patient. Section 22F(1)(a) gives that refusal to the person swallowing the tablet, and a screen that never shows it exercised has not shown it exists.');
/* A substitution is not anonymous. The registration it is signed with is held to the same format
   the vetting register holds a pharmacist to, so a row of zeros here fails the build. */
const sapc = vetting.authorities.find(a => a.id === 'sapc');
const signature = dispensing.prescription.pharmacist.registration.replace(/^SAPC\s+/, '');
if(!new RegExp(sapc.pattern).test(signature)) throw new Error(`The pharmacist signing a substitution is registered as "${dispensing.prescription.pharmacist.registration}". ${sapc.hint} A substitution carries a real-looking registration or it teaches a reader that the number is decoration.`);
for(const id of ['prescriber','pharmacy']) {
 if(!read('apps/web/src/lib/vetting-fixtures.ts').includes(`'${dispensing.prescription[id]}'`)) throw new Error(`packages/catalog/dispensing.json names ${id} ${dispensing.prescription[id]}, who is not on the vetting register. The party dispensing and the party prescribing are vetted parties or the screen is gating on nothing.`);
}
/* The authorisation is boxed twice and ends in a review. The interval check is the one worth
   reading: a minimum gap longer than the supply is a guaranteed run-out, dressed as a safeguard. */
const auth = dispensing.authorisation;
if(auth.repeatsUsed >= auth.repeatsAuthorised) throw new Error(`Chronic authorisation ${auth.reference} has no repeats left, so the screen never shows one being asked for`);
if(!auth.validMonths || !auth.daysPerRepeat) throw new Error(`Chronic authorisation ${auth.reference} is not boxed by both a period and a quantity. A repeat that never expires is a prescription nobody is reviewing.`);
if(auth.minimumDaysBetween > auth.daysPerRepeat) throw new Error(`Chronic authorisation ${auth.reference} allows one collection every ${auth.minimumDaysBetween} days and supplies ${auth.daysPerRepeat} days at a time, so the patient runs out before they may collect. An interval longer than the supply is a gap with no medicine in it.`);
if(!auth.endsWith || !/review/i.test(auth.endsWith)) throw new Error(`Chronic authorisation ${auth.reference} does not end in a review. Ending in anything else is a renewal, and a renewal nobody looked at is what this feature exists to refuse.`);
if('expiresInDays' in auth || 'expiresOn' in auth) throw new Error(`Chronic authorisation ${auth.reference} writes down when it expires. It is authorised on a day for a number of months; the expiry is arithmetic on those two, and a third number is a third thing that can disagree about the day a repeat stops.`);
/* And that arithmetic is the same arithmetic on all three platforms. The month is the vetting
   module's month, so an authorisation and a credential that both run six months end together. */
const MONTH_IN_DAYS = '30.44';
/* The declaration, not the number anywhere in the file. All three of these files also explain the
   30.44-day month in a comment, and a check a comment can satisfy is a check that passes on a file
   which has stopped doing the thing. */
const monthDeclarations = {
 'apps/web/src/lib/dispensing.ts': /const DAYS_PER_MONTH = 30\.44;/,
 'apps/ios/MyThuso/Models/Dispensing.swift': /static let daysPerMonth = 30\.44\b/,
 'apps/android/app/src/main/java/za/co/mythuso/model/Dispensing.kt': /const val daysPerMonth = 30\.44\b/,
 'apps/web/src/lib/vetting.ts': /inMonths = \(months: number\) => inDays\(Math\.round\(months \* 30\.44\)\)/
};
for(const [f, declaration] of Object.entries(monthDeclarations)) {
 if(!declaration.test(read(f))) throw new Error(`${f} no longer works a period out from a ${MONTH_IN_DAYS}-day month. Three platforms computing an authorisation's expiry differently is three answers to when a repeat stops, and a credential that renews on a different month from the authorisation beside it expires on the wrong day.`);
}
/* Six rules, rendered word for word on all three platforms rather than paraphrased on any of them. */
const dispensingScreens = { web: 'apps/web/src/features/Dispensing.tsx', ios: 'apps/ios/MyThuso/Features/DispensingView.swift', android: 'apps/android/app/src/main/java/za/co/mythuso/ui/DispensingScreens.kt' };
for(const [platform, file] of Object.entries(dispensingScreens)) {
 const source = read(file);
 for(const rule of dispensing.rules) {
  if(!source.includes(rule.id)) throw new Error(`The ${platform} substitution screen does not render the rule "${rule.id}". These are promises made to a patient on three platforms at once.`);
 }
 for(const id of ['substitute-the-molecule','override-do-not-substitute']) {
  if(!source.includes(id)) throw new Error(`The ${platform} substitution screen does not render the refusal "${id}", which is the one an item that must not be substituted is left with instead of a control`);
 }
 /* A generated table is only worth having if it is the only one. */
 if(/(static let (substitutionClasses|grounds|refusals)\b|val (substitutionClasses|substitutionGrounds|dispensingRefusals)\s*[:=])/.test(source)) throw new Error(`${file} declares a substitution table of its own. That table is generated into DispensingData — the screen should read that one.`);
}
/* The prescription detail on all three platforms used to end by saying substitution and chronic
   authorisation were not modelled. They are, and the sentence that replaced it lives in one place
   rather than three, because three copies of it is exactly what went stale the first time. */
const orderScreens = { 'apps/web/src/features/Orders.tsx': 'crossReference', 'apps/ios/MyThuso/Features/OrdersView.swift': 'Dispensing.crossReference', 'apps/android/app/src/main/java/za/co/mythuso/ui/OrderScreens.kt': 'dispensingCrossReference' };
for(const [file, reference] of Object.entries(orderScreens)) {
 const source = read(file);
 if(!source.includes(reference)) throw new Error(`${file} no longer reads the substitution cross-reference from the contract. It is one sentence on three platforms, so it is written once.`);
 if(source.includes(dispensing.crossReference)) throw new Error(`${file} writes the substitution cross-reference out again rather than reading it. A second copy is a second thing to change.`);
}
for(const f of [...files('apps/web/src'), ...files('apps/ios/MyThuso'), ...files('apps/android/app/src/main')].filter(f => /\.(tsx?|swift|kt)$/.test(f))) {
 if(/chronic authorisations and substitution rules are not modelled/i.test(read(f))) throw new Error(`${f} still says substitution and chronic authorisation are not modelled. They are — packages/catalog/dispensing.json and the three screens built from it — and a preview that understates what it does is the same defect as one that overstates it.`);
}

/* Employer and sponsor programme administration.

   Two parties who pay for care and are told, in writing, that paying is not a permission. The
   checks below are about the one place that promise can quietly stop being true: an aggregate.

   An employer is shown counts of people, and a count of people is a disclosure about every person
   in it. So the first check is the one that would matter on its own — the suppression rule is run
   here, over the same fixtures the three apps run it over, and every group that ought to disappear
   has to actually disappear. A floor that is applied by whoever is drawing the table is a floor
   somebody can draw around.

   The second is the rule everybody leaves out: no report may leave exactly one group hidden, because
   one hidden group is the total minus the published ones. And the published groups must not add up
   to the total, which is the opposite of what a check on a report normally asserts and is the whole
   reason the other rules are not decorative.

   The rest hold the shape of the two parties: an employer's disclosure list must not contain a word
   that belongs to a person, a sponsor's statement must not name an amount of its own, and both
   parties' refusals must be the ones packages/catalog/vetting.json already attached to them. */
const programmes = JSON.parse(read('packages/catalog/programmes.json'));
const suppressionFloor = programmes.floor;
const suppressionReasonIds = new Set(programmes.suppressionReasons.map(r => r.id));
for(const id of ['below-floor','dominated','secondary']) {
 if(!suppressionReasonIds.has(id)) throw new Error(`packages/catalog/programmes.json has lost the suppression reason "${id}". A suppressed row that cannot say why it is suppressed is a blank, and a blank reads as an error somebody goes and asks about.`);
}
if(suppressionFloor.minimumCohort < 5) throw new Error(`A suppression floor of ${suppressionFloor.minimumCohort} people is not a floor. A department of four is not anonymous and neither is a shift of nine.`);
if(suppressionFloor.minimumSuppressed < 2) throw new Error('A report may not leave exactly one group hidden: one hidden group is the total minus the published ones. minimumSuppressed is what stops that, and below two it stops nothing.');
if(suppressionFloor.roundTo < 2) throw new Error('Published counts must be rounded. An exact count that moves by one between two reports names the person who moved it.');
if(suppressionFloor.dominanceCeiling <= 0.5 || suppressionFloor.dominanceCeiling >= 1) throw new Error(`A dominance ceiling of ${suppressionFloor.dominanceCeiling} is not a ceiling. It has to be above half — one answer covering the group — and below one, or it never fires.`);
/* The rule itself, run here over the same fixtures the three apps run it over. */
const roundOff = n => Math.round(n / suppressionFloor.roundTo) * suppressionFloor.roundTo;
const dominated = c => c.tookPart > 0 && Math.max(c.advisedToSeeADoctor, c.tookPart - c.advisedToSeeADoctor) / c.tookPart >= suppressionFloor.dominanceCeiling;
const employerIds = new Set(vetting.roles.filter(r => r.id === 'employer').map(r => r.id));
if(!employerIds.size) throw new Error('packages/catalog/vetting.json no longer has an employer role, so nothing in the programme contract is gated on anything');
let sawBelowFloor = false, sawDominated = false, sawSecondary = false;
for(const programme of programmes.programmes) {
 if(!read('apps/web/src/lib/vetting-fixtures.ts').includes(`'${programme.employer}'`)) throw new Error(`Programme ${programme.id} belongs to ${programme.employer}, who is not on the vetting register. A programme runs for a vetted employer or it runs for nobody.`);
 if(programme.cohorts.length < 3) throw new Error(`Programme ${programme.id} has ${programme.cohorts.length} groups, which is too few to demonstrate a suppression rule at all`);
 const rows = programme.cohorts.map(c => ({
  cohort: c,
  suppressedBy: c.tookPart < suppressionFloor.minimumCohort || c.eligible < suppressionFloor.minimumCohort ? 'below-floor' : dominated(c) ? 'dominated' : undefined
 }));
 for(const c of programme.cohorts) {
  if(c.tookPart > c.eligible) throw new Error(`Cohort ${c.id} in ${programme.id} has more people taking part than were eligible`);
  if(c.advisedToSeeADoctor > c.tookPart) throw new Error(`Cohort ${c.id} in ${programme.id} advised more people to see a doctor than took part`);
 }
 while(rows.some(r => r.suppressedBy) && rows.filter(r => r.suppressedBy).length < suppressionFloor.minimumSuppressed) {
  const next = rows.filter(r => !r.suppressedBy).sort((a, b) => a.cohort.tookPart - b.cohort.tookPart)[0];
  if(!next) break;
  next.suppressedBy = 'secondary';
 }
 for(const row of rows) {
  if(row.suppressedBy === 'below-floor') sawBelowFloor = true;
  if(row.suppressedBy === 'dominated') sawDominated = true;
  if(row.suppressedBy === 'secondary') sawSecondary = true;
  /* The check that matters. A group under the floor must not be reportable by any route. */
  if(!row.suppressedBy && (row.cohort.eligible < suppressionFloor.minimumCohort || row.cohort.tookPart < suppressionFloor.minimumCohort)) {
   throw new Error(`Cohort ${row.cohort.id} in ${programme.id} has fewer than ${suppressionFloor.minimumCohort} people and would be reported. A department of four is not anonymous, and a report that says so anyway names four people.`);
  }
 }
 const hidden = rows.filter(r => r.suppressedBy).length;
 if(hidden === 1) throw new Error(`Programme ${programme.id} would leave exactly one group hidden, which is the total minus the published ones. The secondary rule exists for this and has not fired.`);
 if(!hidden) throw new Error(`Programme ${programme.id} suppresses nothing, so it demonstrates none of the rule it exists to demonstrate`);
 /* And the published rows must not reconcile with the total. This is the opposite of what a check
    on a report usually asserts, and it is what makes the suppression above real rather than
    ornamental: if the parts summed to the whole, the hidden rows are one subtraction away. */
 const totalTookPart = roundOff(programme.cohorts.reduce((t, c) => t + c.tookPart, 0));
 const published = rows.filter(r => !r.suppressedBy).reduce((t, r) => t + roundOff(r.cohort.tookPart), 0);
 if(published === totalTookPart) throw new Error(`In programme ${programme.id} the groups shown add up to the total shown, so every suppressed group can be had by subtracting. The suppression is decorative.`);
}
if(!sawBelowFloor) throw new Error('No fixture group falls under the floor, so the floor is never seen to do anything');
if(!sawDominated) throw new Error('No fixture group is dominated by one answer, so the rule that catches "thirteen of fourteen" is never seen to do anything');
if(!sawSecondary) throw new Error('No fixture programme triggers secondary suppression, so the rule that stops a hidden group being worked out by subtraction is never demonstrated — and it is the one everybody leaves out');
/* An employer's disclosure list may not contain anything belonging to a person. The forbidden words
   are the ones a report grows by accident: a name, an identifier, a reading, a diagnosis. */
const PERSONAL = /\b(name|names|named|identity|id number|reading|readings|result|results|diagnosis|diagnoses|record|records)\b/i;
for(const item of programmes.employer.sees) {
 if(PERSONAL.test(item.what)) throw new Error(`An employer is shown "${item.what}", which is a fact about a person rather than a count of people. An employer never receives a named result, and that is not a setting.`);
}
for(const item of programmes.sponsor.sees) {
 if(PERSONAL.test(item.what)) throw new Error(`A sponsor is shown "${item.what}". Paying for care is not a permission: what they paid for is theirs to see, what was found is not.`);
}
for(const list of [programmes.employer.neverSees, programmes.sponsor.neverSees]) {
 if(list.length < 3) throw new Error('A "never sees" list of fewer than three entries is a disclaimer rather than a design');
}
/* A statement line names a service and nothing else. What it cost is that service's price in the
   catalogue — the same row the recipient would have been quoted from if she were paying herself,
   because a sponsored visit is not a different visit. */
for(const line of programmes.statement.lines) {
 if(!serviceById.has(line.service)) throw new Error(`A sponsor statement line names a service that is not in the catalogue: ${line.service}`);
 if('amount' in line) throw new Error(`A sponsor statement line carries its own amount. A sponsored visit costs what the visit costs in packages/catalog/services.json — there is no second place for that number.`);
}
const defaultLineDetail = programmes.sponsor.lineDetail.filter(c => c.isDefault);
if(defaultLineDetail.length !== 1 || defaultLineDetail[0].id !== 'amount-only') throw new Error('A sponsor\'s statement must default to an amount and a date. A line reading "sexual health screening" discloses more than most diagnoses do, and naming the service is the recipient\'s switch to flip rather than the default.');
/* The two refusals the vetting table already attached to these parties are the ones this feature
   has to hold, so they are read from there rather than restated here. */
const employerGrants = vetting.roles.find(r => r.id === 'employer').grants;
const sponsorGrants = vetting.roles.find(r => r.id === 'sponsor').grants;
if(!employerGrants.some(g => /never see who used it|access is never granted/i.test(g.refusal))) throw new Error('packages/catalog/vetting.json no longer promises that an employer may pay for care and never see who used it. That sentence is what the programme report is built to be true of.');
if(!sponsorGrants.some(g => /payment, not a permission/i.test(g.refusal))) throw new Error('packages/catalog/vetting.json no longer says a sponsorship is a payment and not a permission');
/* Seven rules and six refusals, rendered word for word on all three platforms. */
const programmeScreens = { web: 'apps/web/src/features/Programmes.tsx', ios: 'apps/ios/MyThuso/Features/ProgrammesView.swift', android: 'apps/android/app/src/main/java/za/co/mythuso/ui/ProgrammeScreens.kt' };
for(const [platform, file] of Object.entries(programmeScreens)) {
 const source = read(file);
 for(const rule of ['figures-do-not-reconcile','rounded-not-exact','taking-part-is-the-employees','paying-is-not-permission','leaving-does-not-unpublish']) {
  if(!source.includes(rule)) throw new Error(`The ${platform} programme screen does not render the rule "${rule}". These are promises made to an employee on three platforms at once.`);
 }
 for(const id of ['named-result','learn-who-declined','condition-employment','require-the-detail']) {
  if(!source.includes(id)) throw new Error(`The ${platform} programme screen does not render the refusal "${id}"`);
 }
 /* The suppression is done in the app, from unsuppressed counts, or it is done by whoever draws
    the table. The three reasoning modules are where it lives; a screen with its own copy of the
    floor is a screen that can be given a different one. */
 if(new RegExp(`minimumCohort\\s*[:=]\\s*${suppressionFloor.minimumCohort}\\b`).test(source)) throw new Error(`${file} writes the suppression floor out itself. The floor is in packages/catalog/programmes.json and the rule is applied in the reasoning module beside this screen.`);
}
const suppressors = ['apps/web/src/lib/programmes.ts','apps/ios/MyThuso/Models/Programmes.swift','apps/android/app/src/main/java/za/co/mythuso/model/Programmes.kt'];
/* The code, not the prose. Each of these files explains secondary suppression in a comment as well
   as doing it, and a check the comment satisfies would pass on a module that had stopped. So what is
   looked for is the value actually written onto a suppressed row, and the two thresholds actually
   read off the floor. */
const suppressionParts = [
 [/(["'])secondary\1/, 'the reason written onto a row hidden so that another cannot be worked out by subtracting'],
 [/dominanceCeiling/, 'the four-fifths dominance test'],
 [/roundTo/, 'rounding a published count'],
 [/minimumCohort/, 'the floor itself'],
 [/minimumSuppressed/, 'the rule that never leaves exactly one group hidden']
];
for(const f of suppressors) {
 const source = read(f);
 for(const [pattern, what] of suppressionParts) {
  if(!pattern.test(source)) throw new Error(`${f} no longer carries ${what}. All three platforms apply the whole suppression rule or an employer's report means something different on one of them — and the one it means something different on is the one somebody will ask for.`);
 }
}
/* And the generated tables carry the counts unsuppressed, because a pre-suppressed table would mean
   the rule lived in a generator and each app drew whatever it was handed — which is the arrangement
   in which somebody eventually asks for the unsuppressed version for a board pack. */
const smallest = programmes.programmes.flatMap(p => p.cohorts).sort((a, b) => a.tookPart - b.tookPart)[0];
for(const f of ['apps/ios/MyThuso/Models/ProgrammesData.swift','apps/android/app/src/main/java/za/co/mythuso/model/ProgrammesData.kt']) {
 if(!read(f).includes(`${smallest.eligible}, ${smallest.tookPart}, ${smallest.advisedToSeeADoctor}`) && !read(f).includes(`eligible: ${smallest.eligible}, tookPart: ${smallest.tookPart}`)) {
  throw new Error(`${f} does not carry the unsuppressed counts for cohort ${smallest.id}. Suppressing in the generator moves the rule out of the app that has to defend it.`);
 }
}

const SOS_ESTIMATE_RULE = 'estimate-says-when-it-does-not-know';
if(!sos.rules.some(r => r.id === SOS_ESTIMATE_RULE)) throw new Error(`packages/catalog/sos.json no longer carries the "${SOS_ESTIMATE_RULE}" rule. It is the one an interpreter's wait is held to as well.`);
/* ---- The interpreter -----------------------------------------------------------------------------

   packages/catalog/locales.json says what is owed to a Deaf patient. packages/catalog/interpreting.json
   is what carries it out, and the ten checks below are the parts of it that are worth failing a build
   over rather than reviewing by eye.

   The first three are about who an interpreter is. An interpreter hears an entire consultation —
   the history, the examination and the part the patient nearly did not say — so they are a vetted
   party like anybody else who comes into a house, and they are granted exactly one thing. A row that
   quietly acquired the clinical record would be the worst kind of drift here, because it would look
   like an improvement.

   The next three are about the wait. The rule is not new: packages/catalog/sos.json already holds an
   ambulance's arrival to it, under the same id. What is enforced here is that all three platforms
   can still answer "I do not know" — a function whose signature cannot return nothing is a function
   somebody will one day make return a number, and the number will be one a person plans a day off
   work around.

   The rest are about the refusals: that they are rendered rather than merely written down, that the
   accommodation cannot become chargeable, and that the accreditation route cannot start claiming a
   confirmation nobody gave — the same rule the locale table is held to. */
const interpreting = JSON.parse(read('packages/catalog/interpreting.json'));
const interpreterRole = vetting.roles.find(r => r.id === interpreting.roleId);
if(!interpreterRole) throw new Error(`The interpreting contract names a vetted role "${interpreting.roleId}" that packages/catalog/vetting.json does not have. An interpreter who is not on the vetting table is an unvetted person hearing a whole consultation.`);
if(!rosterParticipants.has(interpreting.participantId)) throw new Error(`The interpreting contract names a call participant "${interpreting.participantId}" the teleconsultation roster does not have. An interpreter added by a second mechanism is an interpreter nobody consented to.`);
if(interpreting.requirementId !== signLanguage.requirement.id) throw new Error(`The interpreting contract answers a requirement "${interpreting.requirementId}" and the sign-language accommodation raises "${signLanguage.requirement.id}". One of them is not the thing the other switches on.`);

/* An interpreter goes into a stranger's home and hears everything said in it. Three of these are
   what any other party entering a house is held to, and the fourth is this role's own: a
   confidentiality undertaking as its own check rather than a line inside a training record. */
for(const required of ['identity', 'police-clearance', 'sasl-accreditation', 'confidentiality-undertaking']) {
 if(!interpreterRole.checks.some(c => c.id === required)) throw new Error(`The ${interpreterRole.name} role has no "${required}" check. An interpreter hears the whole consultation and comes into the house to do it; the checks are the same ones everybody else who does either is held to.`);
}
/* The one that would look like an improvement. An interpreter interprets; they are not given the
   record, then or afterwards, and hearing a consultation is not reading one. */
const recordCapabilities = ['view-patient-summary', 'view-clinical-record', 'view-protected-record', 'view-results', 'write-clinical-note'];
for(const grant of interpreterRole.grants) {
 if(recordCapabilities.includes(grant.capability)) throw new Error(`The ${interpreterRole.name} role is granted "${grant.capability}". ${interpreting.refusals.find(r => r.id === 'interpreter-opens-the-record').sentence}`);
}

/* The wait, and the three signatures that have to be able to say they do not know. A function that
   cannot return nothing is a function that will be made to return something.

   The parameter list is spelled out in each pattern rather than wildcarded, because each of those
   three files quotes its own signature in the comment that explains it — and a check satisfied by
   the comment about a declaration is the check this file warns about twice already. */
const waitSignatures = [
 ['web', 'apps/web/src/lib/interpreting.ts', /export function firstFree\(mode:[\s\S]*?\): FreeSlot \| null \{/],
 ['ios', 'apps/ios/MyThuso/Models/Interpreting.swift', /static func firstFree\(mode:[\s\S]*?\) -> FreeSlot\? \{/],
 ['android', 'apps/android/app/src/main/java/za/co/mythuso/model/Interpreting.kt', /fun firstFree\(mode:[\s\S]*?\): FreeSlot\? =/]
];
for(const [platform,file,signature] of waitSignatures) {
 if(!existsSync(file)) throw new Error(`The ${platform} app has no interpreter availability model (${file}). The accommodation is not optional on one platform.`);
 if(!signature.test(read(file))) throw new Error(`${platform} (${file}) no longer has a firstFree that can return nothing. An estimate that cannot admit it does not know is an estimate that will be made up, and ${SOS_ESTIMATE_RULE} says the same thing about an ambulance.`);
}
/* And the generator writes down no wait at all. The hours are emitted; which one answers a request
   is worked out three times from them, so the arithmetic cannot quietly move into a build script. */
for(const file of emitInterpreting()) {
 if(/(nextFree|waitDays|firstFree)\b/.test(file.content)) throw new Error(`${file.path} carries a resolved wait. The generator emits free hours and never a conclusion, because a screen handed a number never has to decide whether it knows one.`);
}
/* The honest-estimate rule, in the words it already has elsewhere. Both contracts carry it under
   the same id on purpose: an estimate honest on one screen and confident on another is worse than
   either. */
if(!interpreting.rules.some(r => r.id === SOS_ESTIMATE_RULE)) throw new Error(`The interpreting contract does not carry the "${SOS_ESTIMATE_RULE}" rule that packages/catalog/sos.json carries for an ambulance's arrival. There is one rule about a number nobody can work out, and it applies to both.`);
for(const word of ['zero', 'not know']) {
 if(!interpreting.estimate.unknown.toLowerCase().includes(word) && !interpreting.estimate.unknownDetail.toLowerCase().includes(word)) {
  throw new Error(`The unknown-wait sentence no longer says what it will not do ("${word}"). It says it does not know, and it says it never shows zero, because both are things a reader has to be told rather than left to infer from a blank.`);
 }
}

/* The status word, in one place. "Held for an interpreter" is a literal in the Visit type because a
   status has to be a literal for the type to be worth anything; this is what stops there being two
   of them. */
if(!read('apps/web/src/lib/scheduling.ts').includes(`'${interpreting.hold.status}'`)) throw new Error(`The Visit type in apps/web/src/lib/scheduling.ts does not carry the status "${interpreting.hold.status}" from the interpreting contract. A held visit that cannot be typed is a held visit that gets dispatched.`);

/* Cancelling because MyThuso could not staff the accommodation is free, and it is MyThuso's
   cancellation. Both halves, because either one alone is the failure. */
if(interpreting.cancellation.fee !== 0) throw new Error(`Cancelling a visit held for an interpreter costs ${interpreting.cancellation.fee}. It costs nothing: the wait is not something the patient did.`);
if(interpreting.cancellation.attributedTo === 'patient' || /patient/i.test(interpreting.cancellation.attributedTo)) throw new Error('A visit cancelled because no interpreter was available is recorded against MyThuso. A service that files its own failures under the patient\'s name stops being able to see them.');
if(interpreting.cost.charged !== false) throw new Error('The interpreter contract makes the accommodation chargeable. An accommodation that is billed is a fee for being Deaf.');

/* Withdrawing the interpreter ends the consultation rather than continuing without one, and the
   roster is where it happens — the same participant, the same question, the same one action. */
if(interpreting.withdrawal.endsTheConsultation !== true) throw new Error('Withdrawing consent to the interpreter no longer ends the consultation. A consultation the patient cannot follow is not one they can consent to, so it stops and is rebooked.');
if(!read('apps/web/src/features/Teleconsult.tsx').includes('interpreterWithdrawal.endsTheConsultation')) throw new Error('The teleconsultation screen no longer ends the call when the interpreter is asked to leave. The rule is in packages/catalog/interpreting.json and the screen has to be the thing that obeys it.');

/* The refusals are the substance of this whole feature, and they are rendered on all three
   platforms rather than merely written down: a refusal nobody reads is a rule nobody follows, and
   the person who needs the reason is the relative in the room offering to interpret.

   The declaration, not the word — the same trap the clinical-language gate above avoids. A check
   that a file mentions "refusals" is satisfied by the comment at the top explaining why it used to
   render them. */
const interpreterSurfaces = [
 ['web', 'apps/web/src/features/Interpreting.tsx', /refusals\.map\(/],
 ['ios', 'apps/ios/MyThuso/Features/InterpretingView.swift', /ForEach\(Interpreting\.refusals\)/],
 ['android', 'apps/android/app/src/main/java/za/co/mythuso/ui/InterpretingScreens.kt', /interpretingRefusals\.forEach/]
];
for(const [platform,file,rendering] of interpreterSurfaces) {
 if(!existsSync(file)) throw new Error(`${platform} has no interpreter screen (${file}). The accommodation is not optional on one platform.`);
 if(!rendering.test(read(file))) throw new Error(`${platform} (${file}) no longer renders the refusals out of the contract. Making an option absent teaches nobody: the person who needs the reason is the family member offering to interpret.`);
}
/* And three of them are named on the call roster itself, which is the one place a relative is
   actually being offered as the answer. Both directions are checked, because the screen asks for
   them by id: an id the contract loses is a blank where the reason goes. */
const namedOnTheCall = ['family-as-interpreter', 'child-as-interpreter', 'written-english-instead'];
const callScreen = read('apps/web/src/features/Teleconsult.tsx');
for(const id of namedOnTheCall) {
 const refusal = interpreting.refusals.find(r => r.id === id);
 if(!refusal) throw new Error(`The teleconsultation roster asks for the refusal "${id}" and the interpreting contract no longer has it, so the screen would render a blank where the reason goes.`);
 if(!callScreen.includes(id)) throw new Error(`The teleconsultation roster no longer says "${refusal.title}". It is said there rather than only on the interpreter screen because the roster is where somebody would otherwise offer a relative.`);
}
/* Drafted until somebody says otherwise, in the same terms the locale table uses. A route presented
   as confirmed without a name, an organisation and a day is the failure this whole mechanism exists
   to prevent, and here it would be an interpreter refused on a number MyThuso guessed the shape of. */
const accreditation = interpreting.accreditation;
if(!vetting.authorities.some(a => a.id === accreditation.authorityId)) throw new Error(`The interpreting contract names an issuing authority "${accreditation.authorityId}" that the vetting register does not have`);
const accreditationConfirmed = accreditation.confirmedBy && accreditation.confirmedOrganisation && accreditation.confirmedOn;
if(!accreditationConfirmed && !accreditation.uncertainty) throw new Error(`The ${accreditation.short} accreditation route is not confirmed and does not say so. A drafted route that does not announce itself is exactly the claim the locale table is not allowed to make.`);
if(accreditationConfirmed && !accreditation.route) throw new Error(`The ${accreditation.short} accreditation route claims a confirmation without saying what was confirmed`);

/* ---- Three bodies of prose that were written more than once ------------------------------------

   Each of these was rendered to a person on three platforms and typed separately on each, and
   nothing compared the copies. That is the exact failure packages/catalog exists to prevent, and
   each was reported — in a comment, by the agent who had to type the second one — rather than
   fixed, because fixing it meant editing a file somebody else had open.

     1. The seven reading explanations, about 2,500 words, in apps/web/src/lib/explain.ts,
        Models/Explain.swift and model/Explain.kt. They are records.json's `explanations` now.
     2. Six arrival refusal sentences, in apps/web/src/lib/arrival.ts, Models/Arrival.swift and
        model/Arrival.kt — plus a seventh both native files had and the web did not. They are
        geography.json's, three as privacy rules and four as refusals.
     3. What the offline queue survives, written twice in different words about the same disk:
        Android's FileBook and the two iOS queue screens. That is capture.json's `durability`.

   What is checked here is in three layers, and they are different questions.

     · The contract holds together on its own terms: an explanation explains a reading that exists,
       points only at red flags the emergency contract has, and names no number.
     · The hand-written copies that have not been able to adopt it yet are held to every word of it
       while they wait, and their quarantine retires itself the day they stop needing it.
     · And nothing else on any platform types one of these sentences. That last one is the check
       this whole exercise was for: without it a fourth copy costs nothing to write. */

const explanations = records.explanations;
const explainedObservationIds = measures.map(m => m.id);
const explanationIds = explanations.entries.map(e => e.id);
/* Same seven, in the same order. The passport charts them in the observation order and the
   explanation screen lists them in this one; two orders that are allowed to differ will. */
if (explanationIds.join(',') !== explainedObservationIds.join(',')) throw new Error(`The reading explanations in packages/catalog/records.json are [${explanationIds.join(', ')}] against observations [${explainedObservationIds.join(', ')}]. Every reading a nurse takes is explained, in the order the charts read them, or a patient opens a chart with nothing under it.`);
const redFlagIds = new Set(sos.redFlags.conditions.map(c => c.id));
for (const entry of explanations.entries) {
 if (!entry.urgent.length) throw new Error(`The explanation for "${entry.id}" points at no urgent condition. Every reading has a version of itself that is an emergency, and a screen that lists none for one of the seven has quietly said there is none.`);
 for (const id of entry.urgent) {
  if (!redFlagIds.has(id)) throw new Error(`The explanation for "${entry.id}" sends a reader to the red flag "${id}", which packages/catalog/sos.json does not have. The urgent conditions are ids into that contract precisely so a screen can neither invent a red flag nor soften one; an id that resolves to nothing does both at once.`);
 }
 /* No number, anywhere in the prose. A reference range decides whether a reading is put in front of
    a doctor and it lives in the observations section one level up; a digit in a paragraph explaining
    a reading is how a range comes to have a second author who is a paragraph. */
 for (const field of ['measures', 'above', 'below', 'whatToDo']) {
  if (/\d/.test(entry[field])) throw new Error(`The "${field}" explanation for "${entry.id}" contains a digit. Every number a reading is judged against is in observations, in this same file, and the prose says "five minutes" and "a hundred" in words for exactly this reason.`);
 }
}
/* Ordinary causes first, and it is checkable rather than a matter of taste: the boring reason has to
   appear in the paragraph before the frightening one does. A rushed walk to the door before the
   first sign of high blood pressure; a fingertip before a diagnosis; when you last ate before the
   word diabetes. Reverse any of these three and the paragraph has become the thing it was written
   not to be. */
const ORDINARY_FIRST = [
 ['systolic', 'above', 'Walking to the door', 'the first sign of high blood pressure'],
 ['oxygen', 'below', 'nail varnish', 'less accurate on darker skin'],
 ['glucose', 'above', 'When you last ate', 'how diabetes is found']
];
for (const [id, field, ordinary, alarming] of ORDINARY_FIRST) {
 const text = explanations.entries.find(e => e.id === id)?.[field];
 if (!text) throw new Error(`packages/catalog/records.json has lost the "${field}" explanation for "${id}"`);
 const first = text.indexOf(ordinary);
 const second = text.indexOf(alarming);
 if (first < 0 || second < 0) throw new Error(`The "${field}" explanation for "${id}" no longer says both "${ordinary}" and "${alarming}". The ordinary cause is the one that is usually right, and it is the half that gets edited out.`);
 if (!(first < second)) throw new Error(`The "${field}" explanation for "${id}" puts "${alarming}" before "${ordinary}". Ordinary causes first: a person reading about their own blood pressure meets the frightening possibility after the boring one, or the boring one is never read at all.`);
}
/* The oximeter paragraph, which is the one entry in this contract with a published bias in it.
   Pulse oximeters have been found to read high on darker skin, and a South African health product
   that leaves that out has not made a small omission. */
const oxygenBelow = explanations.entries.find(e => e.id === 'oxygen').below;
for (const clause of ['darker skin', 'read higher than the truth']) {
 if (!oxygenBelow.includes(clause)) throw new Error(`The oxygen explanation no longer says "${clause}". A pulse oximeter reads less accurately on darker skin and has been found to read high; a reading contract for South Africa that drops that clause is a contract that will be believed on the wrong person.`);
}
/* Never a change to a medicine. The prose talks about a dose in exactly one place and refuses it
   there, and the provenance says so a second time in the reader's own words. Both are checked,
   because the sentence that goes missing is always the refusal rather than the advice. */
const doseMentions = explanations.entries.filter(e => /change the dose/i.test(e.whatToDo));
if (doseMentions.length !== 1) throw new Error(`${doseMentions.length} of the reading explanations talk about changing a dose. Exactly one does — the glucose entry, to refuse it — and every other one that starts is a screen giving advice about a medicine.`);
if (!/\bNever change the dose\b/.test(doseMentions[0].whatToDo)) throw new Error(`The "${doseMentions[0].id}" explanation mentions changing a dose without refusing it. Nothing on this screen is a reason to start, stop or change a medicine; that decision belongs to whoever prescribed it.`);
for (const [key, must] of [['neverChange', 'start, stop or change a medicine'], ['unreviewed', 'No clinician has reviewed this wording'], ['written', 'written text held inside the app']]) {
 if (!explanations.provenance[key]?.includes(must)) throw new Error(`The explanations' "${key}" provenance sentence no longer says "${must}". Generating this prose into Swift and Kotlin has not made it reviewed and has not made it software's opinion; the day either changes, somebody edits that sentence rather than letting a build edit it for them.`);
}

/* And the provenance is on the screen, on all three, rather than in the contract only. A refusal
   nobody reads has been made on nobody's behalf, and these two are the ones this move could most
   easily have retired by accident: generating prose into Swift and Kotlin makes it look official,
   and the sentences saying it is written by a person and read by no clinician are the correction.
   A platform that has adopted the contract says so by naming the generated data, and that counts —
   what is refused is a platform that quietly says neither. */
const explainReaders = ['apps/web/src/lib/explain.ts', 'apps/ios/MyThuso/Models/RecordsData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/RecordsData.kt'];
const readsTheExplanations = /Records\.explanations|Records\.explanationProvenance|recordExplanations|recordExplanationProvenance|\bprovenance\./;
const explainScreens = {
 web: files('apps/web/src').filter(f => /\.tsx?$/.test(f) && !explainReaders.includes(f)).map(read).join('\n'),
 ios: files('apps/ios/MyThuso').filter(f => /\.swift$/.test(f) && !explainReaders.includes(f)).map(read).join('\n'),
 android: files('apps/android/app/src/main').filter(f => /\.kt$/.test(f) && !explainReaders.includes(f)).map(read).join('\n')
};
for (const key of ['written', 'unreviewed']) {
 const sentence = explanations.provenance[key];
 for (const [platform, source] of Object.entries(explainScreens)) {
  if (!source.includes(sentence) && !readsTheExplanations.test(source)) throw new Error(`${platform} no longer says "${sentence.slice(0, 60)}…" anywhere a person would read it. ${explanations.provenanceWhy}`);
 }
}

/* ---- What the offline queue survives -----------------------------------------------------------

   Two fields per store, and the difference between them is the whole design. `survives`/`lostTo`
   are what is true of the store. `says` is what a screen renders. A durabilityPromise made in one place and
   not the other is either a screen with a gap in it or a store with a claim it cannot keep, and
   only holding both separately makes either visible. */
const durability = capture.durability;
const durabilityEventIds = new Set(durability.events.map(e => e.id));
if (durabilityEventIds.size !== durability.events.length) throw new Error('packages/catalog/capture.json names the same durability event twice');
const durabilityClaimed = new Set(durability.stores.flatMap(s => [...s.survives, ...s.lostTo]));
for (const id of durabilityEventIds) if (!durabilityClaimed.has(id)) throw new Error(`No store says anything about the durability event "${id}". An event nothing is measured against is vocabulary, not a contract.`);
const fileStores = durability.stores.filter(s => s.kind === 'file');
if (fileStores.length < 2) throw new Error('packages/catalog/capture.json describes fewer than two file-backed queues, so the check that made this contract worth writing — that two platforms writing to the same kind of disk make the same durabilityPromise — has nothing to compare');
/* The durabilityPromise, and it is one durabilityPromise. A nurse deciding whether to trust a phone with a morning's
   work is owed the same answer on both of them; the iOS list and the Android sentence say it in
   their own words and are held to saying the same thing. What loses it is allowed to differ, because
   Android gives a person a Clear storage button and iOS does not. */
const durabilityPromise = [...fileStores[0].survives].sort().join(', ');
for (const store of fileStores) {
 if ([...store.survives].sort().join(', ') !== durabilityPromise) throw new Error(`The file-backed store "${store.id}" survives ${[...store.survives].sort().join(', ')} and "${fileStores[0].id}" survives ${durabilityPromise}. Both are a JSON file in an app's own private storage on a phone. Two platforms that keep the same thing must durabilityPromise the same thing, or a nurse reading the two screens is reading two products.`);
 if (!store.lostTo.includes('delete')) throw new Error(`The file-backed store "${store.id}" does not say that deleting the app loses it. The operating system removes the file and nothing in either app can prevent that; a durability panel that leaves it out is the one that gets believed.`);
 if (!store.says.survives.length || !store.says.lostTo.length) throw new Error(`The store "${store.id}" says nothing on one side of the ledger. What it does not survive is said on the screen as plainly as what it does, or "your data is safe" is what a reader hears.`);
}
for (const store of durability.stores.filter(s => s.kind === 'memory')) {
 if (store.survives.some(id => id !== 'navigation')) throw new Error(`The in-memory store "${store.id}" claims to survive ${store.survives.join(', ')}. A module-level array and a Compose preview survive moving between screens and nothing else, and a memory store that claims more is the durabilityPromise this section exists to stop.`);
}
/* The web keeps less on purpose, and the reason is a check in this file rather than a preference.
   If the storage ban ever went, this would still be true and would then be a choice nobody made. */
const webStore = durability.stores.find(s => s.platform === 'web');
if (!webStore || webStore.kind !== 'memory') throw new Error("packages/catalog/capture.json describes a web queue that is not held in memory. Nothing in apps/web/src may write to the browser's local storage, session storage or IndexedDB — a preview must not leave a patient's readings on a borrowed machine — and this contract is not the place that exception gets written down.");
/* ---- And the other way a store fails a nurse ---------------------------------------------------

   A queue that survives everything in the list above can still be handed to a phone with no room
   left on it. `durability.writeFailures` is that: three ways the disk refuses, on the same two-field
   shape the stores use. Two of them were sentences inside Android's FileBook and nowhere else — the
   day iOS grew one it would have grown a second author for them — and the third was already a
   promise in this contract that no screen said in the contract's own words, which is why it points
   at quarantinedFile rather than restating it.

   The checks are about what the sentences must be true *about*, which is the part a word-for-word
   comparison cannot reach:

     · Every failure leaves `nothing-deleted` true. That is rules.queuedIsNotLost applied to the
       disk rather than to the network: never dropped to make a sync succeed has to mean never
       dropped to make a write succeed and never dropped to make a parse succeed, or the promise is
       only about the easy case.
     · No two failures leave the same set of outcomes true. Two sentences that describe the same
       aftermath are one sentence written twice, and the reason there are two here rather than one is
       exactly that a full disk is something the person holding the phone can clear and an
       unexplained refusal is not. Delete that difference and the check says so.
     · A failure that says the work is not on the disk must also say it is still on the screen, and
       that what was written before is untouched. A refusal that leaves neither of those true is not
       a refusal, it is corruption, and this contract has no sentence for that. */
const writeFailures = durability.writeFailures;
const outcomeNames = new Map(writeFailures.outcomes.map(o => [o.id, o.name]));
if (outcomeNames.size !== writeFailures.outcomes.length) throw new Error('packages/catalog/capture.json names the same write-failure outcome twice');
const claimedOutcomes = new Set(writeFailures.failures.flatMap(f => f.leaves));
for (const id of outcomeNames.keys()) if (!claimedOutcomes.has(id)) throw new Error(`No write failure in packages/catalog/capture.json leaves "${id}" true. An outcome nothing is measured against is vocabulary, not a contract — the same reason a durability event no store mentions is refused above.`);
const failureSentenceOf = failure => (failure.says ?? durability[failure.saysFrom]?.sentence);
const leftBy = new Map();
const saidBy = new Map();
for (const failure of writeFailures.failures) {
 for (const id of failure.leaves) if (!outcomeNames.has(id)) throw new Error(`The write failure "${failure.id}" leaves "${id}" true, which is not one of the outcomes durability.writeFailures declares.`);
 if (!failure.leaves.includes('nothing-deleted')) throw new Error(`The write failure "${failure.id}" does not leave nothing-deleted true. rules.queuedIsNotLost says a captured entry is never dropped to make a sync succeed; a disk failure that is allowed to drop one has found the exception that makes the rule a slogan.`);
 if (failure.leaves.includes('not-on-disk')) {
  for (const owed of ['held-in-memory', 'earlier-writes-intact']) {
   if (!failure.leaves.includes(owed)) throw new Error(`The write failure "${failure.id}" says the work is not on the disk without leaving ${owed} true. A nurse told her work did not reach the disk, and not told where it is or what happened to what was already there, has been told her work is gone.`);
  }
 }
 const shape = [...failure.leaves].sort().join(', ');
 if (leftBy.has(shape)) throw new Error(`The write failures "${leftBy.get(shape)}" and "${failure.id}" leave exactly ${shape} true. Two sentences describing one aftermath are one sentence written twice: what makes a full disk worth its own words is that the person holding the phone can clear it, and if that difference is gone so is the second sentence.`);
 leftBy.set(shape, failure.id);
 const sentence = failureSentenceOf(failure);
 if (!sentence) throw new Error(`The write failure "${failure.id}" says nothing. A refusal nobody is told about is a screen that stops working without explaining itself.`);
 if (saidBy.has(sentence)) throw new Error(`The write failures "${saidBy.get(sentence)}" and "${failure.id}" say the same sentence word for word. Two failures with one sentence between them are one failure, and the one being answered wrongly is the one a nurse is standing in.`);
 saidBy.set(sentence, failure.id);
 for (const id of failure.saidBy) {
  const store = durability.stores.find(s => s.id === id);
  if (!store) throw new Error(`The write failure "${failure.id}" is rendered by the store "${id}", which packages/catalog/capture.json does not have.`);
  if (store.kind !== 'file') throw new Error(`The write failure "${failure.id}" is rendered by "${id}", which is a ${store.kind} store. A store that never touches a disk cannot be refused by one, and a screen offering to explain a disk failure that cannot happen to it is a screen teaching a nurse to ignore it.`);
 }
}

/* What a screen says when the file it renamed aside is the only part of this that cannot be a shared
   literal: the new name is different on every phone. So new-name-on-screen is held as behaviour —
   each screen below must still be showing the name it set aside, and saying which file it was. */
const parseFailure = writeFailures.failures.find(f => f.leaves.includes('new-name-on-screen'));
if (!parseFailure) throw new Error('No write failure in packages/catalog/capture.json leaves new-name-on-screen true. A screen that says work was kept and cannot say where it was kept has asked to be believed rather than checked.');
for (const file of parseFailure.namesTheFileIn) {
 if (!existsSync(file)) throw new Error(`packages/catalog/capture.json says ${file} names the file it set aside, and that file does not exist.`);
 const source = read(file);
 if (!/setAside/.test(source) || !/(would|will) not parse/.test(source)) throw new Error(`${file} no longer tells the reader that a ledger which would not parse was kept, and what it is now called. That is the whole of new-name-on-screen: "${durability.quarantinedFile.sentence}" is a promise nobody can check unless the screen says where the work went.`);
}
/* And the store that keeps the file but has one screen that does not say so. Android's FileBook
   serves both ledgers, so a parse failure on the reading queue is renamed aside exactly as one on
   the visit queue is — and only the visit queue's screen says it. Recorded here rather than left to
   be found again, on the same self-retiring terms as PROSE_QUARANTINE: the day the reading screen
   starts naming the file, this line fails the build until somebody moves it up into the contract. */
const SILENT_ABOUT_QUARANTINE = [
 ['apps/android/app/src/main/java/za/co/mythuso/ui/CaptureScreens.kt', "Android's reading ledger quarantines an unreadable file through the same FileBook the visit queue uses and never tells the nurse it did. Add the note VisitQueueScreens.kt already draws, then add this file to namesTheFileIn in packages/catalog/capture.json and delete this line."]
];
for (const [file, todo] of SILENT_ABOUT_QUARANTINE) {
 if (!existsSync(file)) throw new Error(`SILENT_ABOUT_QUARANTINE names ${file}, which does not exist. A list of known gaps that outlives its files is a list nobody reads.`);
 if (/setAside/.test(read(file))) throw new Error(`${file} now names the file it set aside, so its entry in SILENT_ABOUT_QUARANTINE is spent: ${todo}`);
}
/* The same, for the two iOS file stores. Both can be handed a phone with no room left on it and
   neither has a sentence for it; the contract records that in `saidBy` and this records what to do
   about it, so the gap cannot quietly become the arrangement. */
const SILENT_ABOUT_WRITE_FAILURE = ['ios-capture-ledger', 'ios-visit-queue'];
const rendersAFailure = new Set(writeFailures.failures.flatMap(f => f.saidBy));
for (const id of SILENT_ABOUT_WRITE_FAILURE) {
 if (rendersAFailure.has(id)) throw new Error(`The store "${id}" now renders a write failure, so its line in SILENT_ABOUT_WRITE_FAILURE is spent. Delete it — a list of what is still missing that includes something already done is a list that stops being read.`);
}
for (const store of fileStores) {
 if (!rendersAFailure.has(store.id) && !SILENT_ABOUT_WRITE_FAILURE.includes(store.id)) throw new Error(`The file-backed store "${store.id}" renders none of the write failures and is not on the list of stores known to be silent about them. Either give it the contract's sentences or write it down beside the two that already have this gap; a third silence nobody recorded is how the first two happened.`);
}


/* ---- The sentences, and who is allowed to type them ---------------------------------------------

   `prosePlaces` is what no file outside the sources may carry. Everything in it is rendered to a
   person by at least one screen today, so a second copy is a second author. The contract's own
   reasoning — the notes, the whys, the two sentences no screen renders yet — is deliberately not in
   this list: forbidding prose nobody displays would fire on a comment quoting the rule it was
   written to obey, and that is a check somebody deletes rather than obeys. */
const arrivalRuleIds = ['only-on-the-day', 'no-doorstep-at-either-end', 'nothing-is-measured'];
const arrivalRefusalIds = ['nobody-on-the-way-yet', 'no-window-no-nurse', 'visit-behind-you', 'not-an-arrival-time'];
const geographyRule = id => {
 const rule = geography.privacy.rules.find(r => r.id === id);
 if (!rule) throw new Error(`packages/catalog/geography.json has lost the privacy rule "${id}", which the patient's arrival screen renders on three platforms`);
 return rule.statement;
};
const geographyRefusal = id => {
 const refusal = geography.refusals.find(r => r.id === id);
 if (!refusal) throw new Error(`packages/catalog/geography.json has lost the refusal "${id}", which the patient's arrival screen renders on three platforms`);
 return refusal.sentence;
};
const explanationProse = [
 ...explanations.entries.flatMap(e => [e.measures, e.above, e.below, e.whatToDo]),
 ...Object.values(explanations.provenance)
];
const arrivalProse = [...arrivalRuleIds.map(geographyRule), ...arrivalRefusalIds.map(geographyRefusal)];
/* The two refusals a screen renders today. The third failure's promise — quarantinedFile — is
   deliberately not here: no screen says it word for word, each says the new name instead, and
   forbidding a sentence nobody displays is the check that fires on a comment quoting the rule it was
   written to obey. What holds that third one is the behaviour check on namesTheFileIn above. */
const writeFailureProse = durability.writeFailures.failures.filter(f => f.saidBy.length).map(failureSentenceOf);
const storeRefusals = (...ids) => durability.writeFailures.failures.filter(f => f.saidBy.some(id => ids.includes(id))).map(failureSentenceOf);
const durabilityProse = [...durability.stores.flatMap(s => [s.where, ...s.says.survives, ...s.says.lostTo]), ...writeFailureProse];
const prosePlaces = [
 { body: 'the seven reading explanations', home: 'packages/catalog/records.json, under explanations', reader: 'Records.explanations on iOS, recordExplanations on Android, lib/explain.ts on the web', sentences: explanationProse },
 { body: "the patient's arrival refusals", home: 'packages/catalog/geography.json, under privacy.rules and refusals', reader: 'Geography.privacyRules and Geography.refusals on both native apps, lib/arrival.ts on the web', sentences: arrivalProse },
 { body: 'what the offline queue survives, and what it says when the disk refuses it', home: 'packages/catalog/capture.json, under durability and durability.writeFailures', reader: 'CaptureData.stores(on:) and CaptureData.writeFailure(_:) on iOS, CaptureData.stores(platform) and CaptureData.writeFailure(id) on Android', sentences: durabilityProse }
];
const PROSE_SOURCES = new Set([
 'packages/catalog/records.json', 'packages/catalog/geography.json', 'packages/catalog/capture.json',
 'scripts/check-boundaries.mjs', 'scripts/emit-records.mjs', 'scripts/emit-geography.mjs', 'scripts/emit-capture.mjs',
 'apps/ios/MyThuso/Models/RecordsData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/RecordsData.kt',
 'apps/ios/MyThuso/Models/GeographyData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/GeographyData.kt',
 'apps/ios/MyThuso/Models/CaptureData.swift', 'apps/android/app/src/main/java/za/co/mythuso/model/CaptureData.kt'
]);

/* Two helpers, because `where` is not rendered by every screen that renders the rest. Android's
   FileBook puts it under "Where it is" and the iOS visit queue puts it under its panel head; the
   iOS reading ledger and the web queue say nothing of the kind, and holding a file to a sentence it
   was never asked to display would be a quarantine that can only be satisfied by typing one in. */
function theStore(id) {
 const store = durability.stores.find(s => s.id === id);
 if (!store) throw new Error(`PROSE_QUARANTINE holds a file to the store "${id}", which packages/catalog/capture.json does not have`);
 return store;
}
const storeSays = (...ids) => ids.flatMap(id => [...theStore(id).says.survives, ...theStore(id).says.lostTo]);
const storeProse = (...ids) => ids.flatMap(id => [theStore(id).where, ...storeSays(id)]);

/* Quarantine, on the same terms packages/catalog/passport.json and the reference ranges use, and for
   the same reason: the hand-written files below cannot adopt the contract without being edited, and
   other people have those trees open. So each is held to every sentence it is responsible for, word
   for word, while it waits — a quarantined copy that is allowed to drift is worse than no contract
   at all, because it looks settled.

   And it retires itself. An entry whose file has *stopped* carrying any of its sentences is an error
   too, so the day a file switches to the generated data the build fails until its line is deleted
   from below. An exemption nobody can lose is how a rule stops being one. */
const PROSE_QUARANTINE = [
 { file: 'apps/android/app/src/main/java/za/co/mythuso/model/CaptureQueue.kt', held: [...storeProse('android-private-file', 'android-in-memory'), ...storeRefusals('android-private-file')], todo: 'let FileBook and MemoryBook read CaptureData.store("android-private-file") and ("android-in-memory"), and let refusalFor return CaptureData.writeFailure("disk-full") and ("write-refused")' },
 { file: 'apps/web/src/features/VisitQueue.tsx', held: storeSays('web-in-memory'), todo: 'render the web store out of lib/visit-queue.ts rather than as a list item' },
 /* Found by the check below rather than by anybody reading the file: the patient's arrival screen
    was typing nothing-is-measured itself, so that sentence existed four times and not three. The
    fix is one word — arrivalRefusals.nothingIsMeasured is exported from lib/arrival.ts for it — and
    it is left undone here because somebody else has this tree open. */
 ];
const quarantinedProse = new Map(PROSE_QUARANTINE.map(entry => [entry.file, entry]));
for (const { file, held, todo } of PROSE_QUARANTINE) {
 if (!existsSync(file)) throw new Error(`PROSE_QUARANTINE names ${file}, which does not exist (${todo}). A quarantine list that outlives its files is a list nobody reads.`);
 const source = read(file);
 const carried = held.filter(sentence => source.includes(sentence));
 if (!carried.length) throw new Error(`${file} no longer types any of the sentences it is quarantined for, so its entry in PROSE_QUARANTINE is spent: ${todo}. Delete the line — an exemption nobody can lose is how a rule stops being one.`);
 for (const sentence of held) {
  if (!source.includes(sentence)) throw new Error(`${file} is quarantined and has drifted from the contract: it no longer carries "${sentence.slice(0, 72)}…" word for word. Either ${todo} and delete its quarantine line, or keep the copy identical. A quarantine is a delay, not a licence to disagree.`);
 }
}

/* And the check the whole exercise was for. Native string nativeLiterals are read one at a time, so a
   comment quoting the rule it was written to obey is not a copy of it — the capability notices are
   held the same way, for the same reason. On the web a sentence is as often JSX text as a literal,
   so the whole file is searched; a web file that quotes one of these in a comment is carrying it
   too, and there is no reason for one to. */
for (const file of handWrittenNative) {
 if (quarantinedProse.has(file)) continue;
 const nativeLiterals = swiftLiterals(read(file)).map(flatten).filter(text => text.length >= 40);
 for (const { body, home, reader, sentences } of prosePlaces) {
  const typed = sentences.map(flatten).find(sentence => nativeLiterals.some(literal => literal.includes(sentence) || sentence.includes(literal)));
  if (typed) throw new Error(`${file} types out a sentence from ${body}: "${typed.slice(0, 72)}…". It lives in ${home} and reaches this app as ${reader}. This prose was written three times before it was a contract and nothing compared the copies; a fourth is how that starts again.`);
 }
}
for (const file of [...files('apps/web/src').filter(f => /\.tsx?$/.test(f)), ...files('tests').filter(f => /\.ts$/.test(f)), ...files('scripts').filter(f => /\.mjs$/.test(f)), ...files('packages/catalog')]) {
 if (PROSE_SOURCES.has(file) || quarantinedProse.has(file)) continue;
 const source = read(file);
 for (const { body, home, reader, sentences } of prosePlaces) {
  const typed = sentences.find(sentence => source.includes(sentence));
  if (typed) throw new Error(`${file} carries a sentence from ${body}: "${typed.slice(0, 72)}…". It lives in ${home} and is read from there — ${reader}. A screen, a test or a second contract holding its own copy is the drift packages/catalog exists to stop.`);
 }
}

/* A rule enforced by arithmetic rather than by copy, on all three platforms. A patient who can open
   an arrival screen a fortnight before her appointment and watch a nurse move around Johannesburg
   has been handed a tracking device, and no part of arranging a home visit needs one. The sentence
   only-on-the-day says so; what makes it true is that no path through any of these three modules
   reaches the on-the-day state unless the day difference is nought. */
const DAY_GUARDS = [
 ['apps/web/src/lib/arrival.ts', /if \(days !== 0\) return \{ state: 'another-day'/],
 ['apps/ios/MyThuso/Models/Arrival.swift', /guard days == 0 else \{ return \.anotherDay/],
 ['apps/android/app/src/main/java/za/co/mythuso/model/Arrival.kt', /if \(days != 0L\) return Arrival\.AnotherDay/]
];
for (const [file, guard] of DAY_GUARDS) {
 if (!guard.test(read(file))) throw new Error(`${file} no longer refuses to draw a nurse on any day but the day of the visit, or refuses it in a shape this check cannot see. That refusal is arithmetic and not a sentence: the state that draws her must be unreachable unless daysUntil returns nought, because a patient who can watch a nurse move around Johannesburg a fortnight early has been handed a tracking device.`);
}
/* ---- A figure a reader can disprove by looking at the screen under it ---------------------------

   A sweep found four of these in one night. The iOS Control Tower's strip said "Active visits 24"
   over a dispatch board holding three jobs and "Available nurses 18" over seven, and "1 severity
   high" over an incident list whose worst entry was Critical; the doctor's said twelve cases waiting
   above three. All four were typed beside a list that could have counted them, and all four were
   fixed by counting — on the two platforms the sweep reached. Three of them are still live in the
   Android strip, which is a thing this check found by being written rather than by anybody looking
   again, and which it now holds down with a number on it. Nothing stopped any of them coming back.
   This is the nothing.

   A metric that disagrees with the list beneath it is worse than no metric. It is not a cosmetic
   defect: it teaches a controller not to believe a number, and the moment that lesson takes is the
   moment somebody is deciding which of three visits to send the one free nurse to.

   WHAT THIS HOLDS, AND WHAT IT CANNOT. The invariant is "the figure equals the arithmetic over the
   rows the same section lists", and it is not decidable from here — three languages, and the rows
   are values in a program nobody has run. What *is* decidable is the shape all four lies had in
   common: the figure was a literal. So no literal digit may appear in a workspace's metric strip on
   any of the three platforms, and every exception is written down below with its reason. This check
   cannot tell you that a counted figure counts the right rows. It can tell you that nobody typed
   one, which is how all four of them happened and the only way any of them could have.

   The half it cannot reach is held by tests/workspace-counts.spec.ts, which opens the workspace,
   reads the strip and counts the board — the figure against the rows, in a browser, on both
   viewports. That is the stronger half, and it exists for the web alone because Playwright drives
   the web. On iOS and Android the shape check below is the whole of what is held here.

   TWO LISTS, AND THEY MEAN DIFFERENT THINGS. TYPED_FIGURES is a figure with no list beneath it to
   count: how many reviews a doctor finished today is not on a queue of what is waiting, and a week's
   earnings are the earnings screen's arithmetic rather than the schedule's. FIGURE_QUARANTINE is a
   figure that has a list and is typed anyway — a defect, with a number on it, ratcheted so that it
   cannot grow and cannot be quietly half-fixed. */
const METRIC_STRIPS = [
 { file: 'apps/web/src/shells/StaffShell.tsx', after: 'const metricsOf = ', what: "the staff shell's metric strip" },
 { file: 'apps/ios/MyThuso/Features/WorkspaceView.swift', after: 'static func figures(_ role: String)', what: "the iOS workspace's metric strip" },
 { file: 'apps/android/app/src/main/java/za/co/mythuso/ui/AccountScreens.kt', after: 'fun workspaceUrgency(role: String, store: PreviewStore)', what: "the Android workspace's metric strip" }
];
/* Per file rather than per string, because "18" is a doctor's finished reviews on one strip and was
   "Available nurses 18" over a board of seven on another. A blessing granted to a number rather than
   to a number in a place would have hidden one of the four lies this check was written for. */
/* THIS LIST IS EMPTY, AND THAT IS THE POINT OF IT. "18 reviewed today" and its "Median 4 m 10 s"
   came off the web with no figure at all: a productivity report on the doctor reading it, drawn over
   a queue that cannot count either. The two phones carried the same two sentences and they are gone
   the same way — the doctor's third figure is the longest wait now, which is the same queue sorted,
   and a reader can see which row it names. The nurse's week was the last honest entry here and it is
   counted too: Earnings.currentWeek.total on iOS and Android both, which is the contract's own
   arithmetic rather than a second answer kept beside the schedule.
   The list stays, with nothing in it. The check below fails on a blessing nobody uses, so an entry
   added here has to be argued for on the day it is added rather than inherited. */
const TYPED_FIGURES = [];
/* And the figures that do have a list under them and are typed anyway. The count is exact on
   purpose: a new one fails the build, and so does fixing one without bringing the number down, which
   is the only arrangement in which a list like this ever reaches nought. */
const FIGURE_QUARANTINE = [
 /* The web shell's three came off this list, and then the doctor's strip came off the screen: the
    three sections a clinician opens the app at are the workbench now, and the two boards that still
    carry a strip — the Control Tower's and the partner's collections and results — count it. What is
    left here is the one figure on a platform whose day has no list to count from. */
 ['apps/ios/MyThuso/Features/WorkspaceView.swift', 1,
  'the partner\'s "Next collection 11:15", which the web counts out of partnerCounts(). WorkspaceDay has no collections list for it to be counted from yet'],
];
/* The block a strip is written in, found by counting braces from its declaration rather than by a
   regex deciding for itself what a metric strip is. Comments come out first: a `why` explaining that
   a week's earnings are not the schedule's arithmetic contains an apostrophe, and an apostrophe in
   a comment opens a string literal in every naive lexer ever written, including this one. */
function metricBlock(source, after, file) {
 const start = source.indexOf(after);
 if (start < 0) throw new Error(`${file} no longer declares ${after.trim()}, so the check that keeps a workspace's figures counted rather than typed is reading nothing at all. A check that has quietly stopped looking is worse than one nobody wrote.`);
 const open = source.indexOf('{', start);
 let depth = 0;
 for (let i = open; i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  else if (source[i] === '}') { depth -= 1; if (!depth) return source.slice(open, i + 1); }
 }
 throw new Error(`${file}: the metric strip after ${after.trim()} has no closing brace this check can find`);
}
const uncommented = block => block.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
/* A counted figure has no digit in a literal: it is String(rows.count), an interpolation over one,
   or an expression. A typed one is a digit between quotes, which is what all four of them were.
 *
 * Finding those needs a scanner rather than a regular expression, and the reason is Kotlin. The
 * Android strip counts its figures now, and it says so like this:
 *
 *   "Read ${if (flagged == 1) "one flag" else "$flagged flags"}"
 *
 * A regex that matches quote-to-quote reads that as the literal `Read ${if (flagged == 1) `, sees a
 * 1 in it, and reports a typed figure in the one file that had just stopped typing them. The digit
 * is in the *expression*, which is exactly what a counted figure is made of.
 *
 * So the scanner walks the block and understands three things: a string literal, an interpolation
 * inside one — `${…}` in Kotlin and TypeScript, `\(…)` in Swift — and the fact that an interpolation
 * may contain further string literals. It yields the static text between interpolations, and it
 * recurses into the interpolations so a figure genuinely typed inside one is still caught: the hole
 * this could have left is `"${if (late) "24" else "3"}"`, and it does not leave it. */
function metricLiterals(block) {
 const source = uncommented(block);
 const out = [];
 let i = 0;
 const readString = quote => {
  let text = '';
  while (i < source.length) {
   const ch = source[i];
   /* Swift's interpolation opens with a backslash, so it has to be asked about before the escape
      rule below — otherwise \\( is read as an escaped bracket and the expression inside it is
      swallowed into the literal, digits and all. */
   if (ch === '\\' && source[i + 1] === '(') { i += 2; readExpression(')'); continue; }
   if (ch === '\\') { text += source.slice(i, i + 2); i += 2; continue; }
   if (ch === quote) { i += 1; out.push(text); return; }
   if (ch === '$' && source[i + 1] === '{') { i += 2; readExpression('}'); continue; }
   text += ch; i += 1;
  }
  out.push(text);
 };
 /* An interpolation ends at the closer that balances it, and the strings inside it are read as
    strings — which is what stops a quote in an expression from swallowing the rest of the file. */
 function readExpression(closer) {
  const opener = closer === '}' ? '{' : '(';
  let depth = 1;
  while (i < source.length) {
   const ch = source[i];
   if (ch === '"' || ch === "'" || ch === '`') { i += 1; readString(ch); continue; }
   if (ch === opener) depth += 1;
   else if (ch === closer) { depth -= 1; if (!depth) { i += 1; return; } }
   i += 1;
  }
 }
 while (i < source.length) {
  const ch = source[i];
  if (ch === '"' || ch === "'" || ch === '`') { i += 1; readString(ch); continue; }
  i += 1;
 }
 return out;
}
const blessedFigure = new Set(TYPED_FIGURES.map(([file, text]) => `${file} ${text}`));
const quarantinedFigures = new Map(FIGURE_QUARANTINE.map(([file, count, todo]) => [file, { count, todo }]));
const blessingUsed = new Set();
for (const { file, after, what } of METRIC_STRIPS) {
 const literals = metricLiterals(metricBlock(read(file), after, file));
 const typed = [];
 for (const text of literals) {
  if (!/\d/.test(text)) continue;
  if (blessedFigure.has(`${file} ${text}`)) { blessingUsed.add(`${file} ${text}`); continue; }
  typed.push(text);
 }
 const quarantine = quarantinedFigures.get(file);
 const list = typed.map(text => JSON.stringify(text)).join(', ');
 if (!quarantine) {
  if (typed.length) throw new Error(`${what} in ${file} types the figure ${list}. Count it from the rows the same section lists: a figure a reader can disprove by looking at the screen under it is worse than no figure, because it teaches a controller not to believe a number at the moment they most need to. If it genuinely has no list beneath it — reviews finished today, a week's earnings — add it to TYPED_FIGURES in scripts/check-boundaries.mjs with the reason it cannot be counted.`);
  continue;
 }
 if (typed.length > quarantine.count) throw new Error(`${what} in ${file} types ${typed.length} figures where FIGURE_QUARANTINE allows ${quarantine.count}: ${list}. The quarantine is a ratchet and it turns one way. Count the new one from the rows the section lists — ${quarantine.todo}.`);
 if (typed.length < quarantine.count) throw new Error(`${what} in ${file} types ${typed.length} figures where FIGURE_QUARANTINE still says ${quarantine.count}. Somebody has counted one of them properly: bring the number down, or delete the line once it reaches nought. A quarantine that outlives the defect is an exemption nobody can lose, which is how a rule stops being one.`);
}
for (const [file, text, why] of TYPED_FIGURES) {
 if (!blessingUsed.has(`${file} ${text}`)) throw new Error(`TYPED_FIGURES in scripts/check-boundaries.mjs excuses ${JSON.stringify(text)} in ${file} — ${why} — and that strip no longer carries it. Delete the line: a list of blessed exceptions longer than the exceptions is how the next typed figure gets waved through.`);
}


/* ---- The wall between the simulators and the network --------------------------------------------

   The whole value of `simulated` as a third state is that it did not require the eleven doors to
   grow a condition. feeds/index.ts spends a page arguing that a route which could accept under some
   condition is a route somebody eventually finds the condition for, late at night, with a vendor on
   the phone — and it made `decide` return a type with no acceptance variant so the condition cannot
   be written. A simulation flag on a route would have been exactly that condition.

   So the simulators sit beside the boundary rather than inside it, and this is what keeps them
   there: the HTTP layer may not reach the simulation directory at all. Not "should not" — the build
   fails, because the first person to want a demonstration over the wire will reach for exactly this
   import and it will look entirely reasonable at the time. */
const httpLayer = ['apps/api/src/server.ts', 'apps/api/src/feeds/index.ts', 'apps/api/src/feeds/contract.ts'];
for (const file of httpLayer) {
 const source = read(file);
 const reaches = /from\s+['"][^'"]*simulation[^'"]*['"]/.exec(source) ?? /import\s*\(\s*['"][^'"]*simulation/.exec(source);
 if (reaches) throw new Error(`${file} imports from the simulation directory (${reaches[0]}). Nothing a request can reach may touch a simulated supplier: the eleven feed routes accept nothing, and a simulated event enters in process through simulation/emit. An import here is how "accepts nothing" quietly becomes "accepts nothing unless".`);
}
/* And the simulators themselves may not answer for a capability the contract has not marked
   simulated, which is the same drift in the other direction: a stand-in behind a screen that is
   still telling a nurse nothing is connected. */
const simulationDir = 'apps/api/src/simulation';
if (existsSync(simulationDir)) {
 const simulatedIds = new Set(capabilities.capabilities.filter(c => c.state === 'simulated').map(c => c.id));
 for (const entry of readdirSync(simulationDir)) {
  if (!entry.endsWith('.ts') || entry === 'index.ts') continue;
  const source = read(`${simulationDir}/${entry}`);
  for (const [, claimed] of source.matchAll(/capability:\s*'([a-z-]+)'/g)) {
   if (!simulatedIds.has(claimed)) throw new Error(`${simulationDir}/${entry} simulates capability "${claimed}", which packages/catalog/capabilities.json does not mark simulated. A stand-in behind a screen still saying nothing is connected is worse than no stand-in: something answers and the screen denies it.`);
  }
 }
}

/* ---- The money and identity seams, and what a stand-in must not do ------------------------------

   ADDED BY THE MONEY-AND-IDENTITY AGENT. Kept in one block so a merge with the care/dispatch and
   fulfilment/safety seams is a matter of keeping all three.

   Three simulated suppliers stand behind the four capabilities that decide whether anybody can sign
   in, pay for a visit or be paid for one. The hazard with all three is the same and it is not that
   they lie — it is that they work. A person who has watched a payment go through end to end is one
   edit away from believing a payment provider exists, and the things that stop that being an
   accident are the refusals. So the refusals are checked here rather than admired in a JSON file:
   every sentence a capability writes down must be enforced by exactly one place in the simulators,
   and every place in the simulators must name exactly one sentence. */
const simulationFiles = existsSync(simulationDir)
 ? readdirSync(simulationDir).filter(entry => entry.endsWith('.ts')).map(entry => [`${simulationDir}/${entry}`, read(`${simulationDir}/${entry}`)])
 : [];

/* A simulator that could open a socket or a file is not a simulator any more. The wall check above
   stops the network reaching in; this stops it reaching out — and `node:fs` is on the list for a
   different reason, which is that `accounts` refuses to survive a restart and the only way to
   enforce that refusal is to have nowhere to survive in. */
const NOTHING_A_STAND_IN_MAY_REACH = /from\s+['"]node:(http|https|net|tls|dgram|child_process|fs|fs\/promises|worker_threads)['"]|\bfetch\s*\(/;
for (const [file, source] of simulationFiles) {
 const reaches = NOTHING_A_STAND_IN_MAY_REACH.exec(source);
 if (reaches) throw new Error(`${file} reaches ${reaches[0]}. A simulated supplier answers in process and nowhere else: it opens no socket, because a stand-in that can contact something is one configuration change away from contacting the thing it stands in for, and it writes no file, because "will not survive a restart" is only true of something with nowhere to survive in.`);
}

/* A card number, by shape, in the simulators or in the browser's door onto them — including in a
   comment. `payments` refuses to hold one "even a fictional one", and the way a first one arrives
   is never a decision: it is a test number somebody pasted into a fixture, and it is in the history
   for ever the moment it is committed. */
const PAN_SHAPED = /(?:\d[ -]?){13,19}/;
for (const [file, source] of [...simulationFiles, ['apps/web/src/lib/simulation.ts', read('apps/web/src/lib/simulation.ts')]]) {
 const found = PAN_SHAPED.exec(source);
 if (found) throw new Error(`${file} contains ${JSON.stringify(found[0].trim())}, which has the shape of a card number. The payments capability refuses to hold one, even a fictional one, and this service must never come into scope for PCI DSS by way of a fixture — a fixture is exactly how it would.`);
}

/* Every refusal enforced, and every enforcement naming exactly one refusal.
   `refusalSaying('<capability>', /fragment/)` is how a simulator says no in the contract's own words:
   the fragment selects, the sentence is returned. Two failures are possible and both are silent
   without this — a sentence added to the contract that nothing enforces, and a selector that has
   stopped matching because somebody reworded the sentence past it. */
/* Both of these read `capability: CAPABILITY` as well as `capability: 'booking'`, and that is not
   tidiness. Written to match only a quoted literal, they were silently vacuous for every simulator
   that names its capability once at the top of the file and refers to the constant — which is four
   of the thirteen, and they were the four with the most refusals between them. A check that has
   quietly stopped looking is worse than one nobody wrote, because the summary line at the bottom of
   this script goes on counting the ones it can still see and reads as though it saw them all.

   Found by the agent whose simulators were the invisible ones, reported rather than worked around. */
const declaredCapability = source => source.match(/const CAPABILITY\s*=\s*'([a-z-]+)'/)?.[1] ?? null;
const standingIn = new Set();
for (const [file, source] of simulationFiles) {
 const named = declaredCapability(source);
 const found = [...source.matchAll(/capability:\s*(?:'([a-z-]+)'|CAPABILITY\b)/g)]
  .map(m => m[1] ?? named).filter(Boolean);
 /* A simulator that names no capability at all is not covered by anything below, so it is refused
    here rather than skipped. index.ts and contract.ts are the plumbing and name none by design. */
 if (!found.length && !/\/(index|contract|suppliers|care)\.ts$/.test(file) && /Simulator\b/.test(source)) {
  throw new Error(`${file} declares a simulator and names no capability this check can resolve. Write \`capability: '<id>'\` or \`const CAPABILITY = '<id>'\` — a simulator whose capability cannot be read is a simulator none of the refusal checks below can see.`);
 }
 for (const id of found) standingIn.add(id);
}
const enforcements = [];
for (const [file, source] of simulationFiles) {
 const named = declaredCapability(source);
 /* The flags matter. Written without them this matched only `/…/)` and missed every `/…/i)`,
    which is how a simulator that does enforce a refusal reads as one that does not — and the fix
    for that false alarm would have been to delete the refusal. */
 for (const [, quoted, pattern, flags] of source.matchAll(/refusalSaying\(\s*(?:'([a-z-]+)'|CAPABILITY)\s*,\s*\/(.+?)\/([a-z]*)\)/g)) {
  enforcements.push({ file, id: quoted ?? named, pattern, flags });
 }
}
const refusesOf = id => capabilities.capabilities.find(c => c.id === id)?.simulation?.refuses ?? [];
for (const { file, id, pattern, flags } of enforcements) {
 const matched = refusesOf(id).filter(sentence => new RegExp(pattern, flags).test(sentence));
 if (matched.length !== 1) throw new Error(`${file} enforces refusalSaying('${id}', /${pattern}/), which matches ${matched.length} of the ${refusesOf(id).length} things that capability says it refuses to do. A selector matching none is a refusal that has quietly stopped being enforced — usually because the sentence was reworded — and one matching two is a refusal nobody can tell from another.`);
}
/* One refusal in these five is not its simulator's to enforce and could not be: a TypeScript module
   cannot declare an Android permission or an iOS usage description, and a module that tried would be
   working around the whitelist rather than honouring it. The build holds that one, and the exemption
   is written down here — with the check that actually holds it named, and asserted to still exist —
   rather than left as a silent hole in the loop below. There is exactly one, and adding a second is
   meant to feel like the decision it is. */
const HELD_BY_THE_BUILD = {
 'Declare a device permission on either native app.': 'and its own simulation refuses to declare one',
 /* The second, and it was a decision. The demo login replaced four sign-in screens on the founder's
    instruction, and what it refuses is that choosing a role is not being granted one — which no
    simulator can enforce, because the switcher never reaches a simulator. It is a control in a
    browser that renders a different component. So the build holds it: the door may not import the
    identity client, and it must carry the capability's own notice. */
 'Grant a role. The demo login chooses which workspace to draw; it authenticates nobody, and no workspace it opens is reached by having permission to.': 'the demo login grants nothing'
};

/* And the question in the other direction, which nothing was asking.
 *
 * Everything below walks the simulators and checks them against the contract. Nothing walked the
 * contract and checked it against the simulators — so `clinical-records` sat marked `simulated`
 * with nothing whatsoever behind it, and its screen told a patient "the controls around them are
 * real and are exercised against this data" while no simulator existed to exercise anything. A
 * false sentence on a clinical screen, produced by the state that was introduced to prevent exactly
 * that. The state may not run ahead of the work. */
for (const capability of capabilities.capabilities) {
 if (capability.state !== 'simulated') continue;
 if (!standingIn.has(capability.id)) throw new Error(`Capability "${capability.id}" is marked simulated in packages/catalog/capabilities.json and nothing in ${simulationDir} stands behind it. Its screens are rendering a simulation notice — a sentence saying something answers — with nothing answering. Build the simulator or put the state back to "absent"; a state is a claim, and this one is made on a screen.`);
}

for (const id of [...standingIn].sort()) {
 const refuses = refusesOf(id);
 if (!refuses.length) throw new Error(`Something in ${simulationDir} stands in for capability "${id}" and that capability lists nothing it refuses to do. A simulation that refuses nothing is a fixture with a label on it.`);
 for (const sentence of refuses) {
  /* The one refusal a TypeScript module could not enforce if it wanted to — a permission is
     declared in a manifest, not in a simulator — is held by the build instead, and the map above
     names the check that holds it. Skipped here rather than left to fail, and skipped by exact
     sentence so a reworded one stops being exempt the moment it is reworded. */
  if (Object.prototype.hasOwnProperty.call(HELD_BY_THE_BUILD, sentence)) continue;
  /* At least one, not exactly one: a refusal can have more than one way in — a card is refused at
     an authorisation and again at a reversal — and demanding a single site would push a simulator
     towards one entry point rather than towards refusing at each of them. It is the zero that is
     the defect. */
  const enforced = enforcements.filter(e => e.id === id && new RegExp(e.pattern).test(sentence));
  if (!enforced.length) {
   throw new Error(`Capability "${id}" says its simulation refuses to "${sentence}", and nothing in ${simulationDir} enforces it. A refusal written into the contract and enforced nowhere is a promise made in a file and kept in none, which is worse than not having written it — three platforms render that sentence.`);
  }
 }
}

/* The two numbers a one-time code is. apps/api/src/config.ts holds them for the real identity
   service; the simulator cannot read that file, because config.ts reaches node:crypto and the
   simulator is imported by the browser. So they are a copy, and a copy is checked — the same
   arrangement the native apps are under for every number they cannot read out of JSON. */
const codeFigures = [
 ['CODE_LENGTH', /export const CODE_LENGTH = (.+);/, 'codeLength', /codeLength:\s*(.+),/],
 ['CODE_LIFE_SECONDS', /export const CODE_LIFE_SECONDS = (.+);/, 'codeTtlSeconds', /codeTtlSeconds:\s*(.+),/]
];
const messagesSource = read('apps/api/src/simulation/messages.ts');
const configSource = read('apps/api/src/config.ts');
for (const [name, here, there, inConfig] of codeFigures) {
 const mine = here.exec(messagesSource);
 const theirs = inConfig.exec(configSource);
 if (!mine) throw new Error(`apps/api/src/simulation/messages.ts no longer declares ${name}. The simulated one-time code has to say how long it is and how long it lives, or it is not standing in for the identity service's own.`);
 if (!theirs) throw new Error(`apps/api/src/config.ts no longer declares limits.${there}, which apps/api/src/simulation/messages.ts is held to.`);
 if (mine[1].trim() !== theirs[1].trim()) throw new Error(`${name} is ${mine[1].trim()} in apps/api/src/simulation/messages.ts and limits.${there} is ${theirs[1].trim()} in apps/api/src/config.ts. A simulated code that is a different length or lives a different time from the real one is a preview of a sign-in nobody is building.`);
}

/* One door from the browser to the simulators, and one only. The web imports them rather than
   restating them — the whole reason the code somebody is shown and the code the tests hold can be
   the same code — and that is worth exactly as much as it is narrow. A second screen reaching past
   lib/simulation.ts is how a component starts calling `produce` with a shape nobody checks. */
for (const file of files('apps/web/src')) {
 if (file === 'apps/web/src/lib/simulation.ts') continue;
 const reaches = /from\s+['"][^'"]*api\/src\/simulation[^'"]*['"]/.exec(read(file));
 if (reaches) throw new Error(`${file} imports a simulated supplier directly (${reaches[0]}). Screens go through apps/web/src/lib/simulation.ts, which is the one place that turns a supplier's payload into what a screen renders and — the part that matters — has somewhere for every refusal to go.`);
}

/* And the status page reads the notice through the contract's own accessor. `capability.notice` is
   the sentence for a capability with nothing behind it; a simulated one has a different sentence and
   this is the page a funder reads. It is the exact failure the third state was introduced to
   prevent, on the one surface where it would be believed. */
if (/\bc\.notice\b/.test(read('apps/web/src/status.ts'))) {
 throw new Error('apps/web/src/status.ts renders capability.notice directly. A simulated capability has its own sentence and noticeFor() is what chooses between them — rendering the absent one would tell a reader nothing is connected while a stand-in answers, on the page that exists to be trusted about exactly that.');
}

/* ==== The fulfilment and safety seams, simulated ================================================
   ==== One block, so a merge with the money/identity and care/dispatch seams is one hunk. ========

   Five simulated suppliers: a pharmacy network, an interpreter roster, an acknowledgement channel,
   a screening model and an instrument. What is checked here is not that they work — a fixture that
   works is the easy half and it is also the hazard. What is checked is that each one refuses, in
   the contract's own words, everything its contract says it refuses.

   The strongest check in here is the last one of the first group: **every sentence in a
   capability's `simulation.refuses` must be looked up by its own simulator.** A refusal that is
   written down and not enforced is the shape of every readiness claim capabilities.json exists to
   refuse — it reads like a control and it is a paragraph. So the sentences and the code that
   enforces them are held together in both directions: no simulator may refuse in words the contract
   has stopped using, and no contract sentence may sit there unenforced. */
const SIMULATION_DIR = 'apps/api/src/simulation';
/* The five this block owns. Named rather than derived from "every simulated capability", because
   the other seams are landing in parallel and a check that fails on somebody else's unfinished work
   is a check that gets deleted. */
const FULFILMENT_AND_SAFETY = {
 dispensing: 'pharmacy.ts',
 interpreting: 'interpreters.ts',
 emergency: 'emergency.ts',
 screening: 'screening.ts',
 devices: 'instrument.ts'
};
const seamContract = JSON.parse(read('packages/catalog/feeds.json'));
const thisFile = read('scripts/check-boundaries.mjs');
for (const [sentence, evidence] of Object.entries(HELD_BY_THE_BUILD)) {
 /* Counted rather than found, because the map above is in this file too and `includes` would be
    satisfied by the exemption citing itself. Two occurrences: the citation, and the check it cites. */
 const occurrences = thisFile.split(evidence).length - 1;
 if (occurrences < 2) throw new Error(`"${sentence}" is exempted from its simulator on the grounds that this file enforces it, and the check that did has gone. An exemption whose evidence has been deleted is the refusal deleted with an extra step.`);
}
/* That the demo login grants nothing, held here because there is nothing else that could hold it.
 *
 * The switcher is a control in a browser that renders a different component. It never reaches the
 * identity service, never reaches a simulator, and has nothing to issue — which is exactly why its
 * refusal cannot be enforced where the other refusals are, and exactly why it is worth enforcing.
 * An auto login that quietly grew a session would look identical on the screen.
 *
 * Two things, both of them cheap and both of them the shape of the failure:
 *
 *   The door does not import the identity client. It cannot start a session it cannot reach, and a
 *   day when it can is a day somebody wired a picker to an authenticator.
 *
 *   The door renders the accounts capability's notice. Four sign-in screens carried it and this
 *   control replaced all four; a-demo-login-is-not-an-account says the notice moves with them, and
 *   a-simulation-says-so says no screen may be quieter for being simulated than for being absent.
 */
{
 const doorFiles = ['apps/web/src/features/DemoLogin.tsx', 'apps/web/src/lib/roles.ts'];
 for (const file of doorFiles) {
  if (!existsSync(file)) throw new Error(`${file} is gone, and the accounts capability is exempted from its simulator on the grounds that this file checks the demo login grants nothing. The door has to be somewhere this can read it.`);
  if (/from '[^']*\/auth'/.test(read(file))) throw new Error(`${file} imports the identity client. The contract says the demo login grants no role and authenticates nobody, and the whole reason the build can promise that rather than a simulator is that the door cannot reach an authenticator. A door that can start a session is a picker somebody has wired to one.`);
 }
 const door = read(doorFiles[0]);
 if (!/<NotConnected of="accounts"/.test(door)) throw new Error(`${doorFiles[0]} does not render the accounts capability's notice. It replaced four sign-in screens that each carried it, and a screen that stops speaking because something now answers is the disclosure failure capabilities.json exists to refuse — see a-demo-login-is-not-an-account.`);
 if (!capabilities.rules.some(r => r.id === 'a-demo-login-is-not-an-account')) throw new Error('packages/catalog/capabilities.json has lost the a-demo-login-is-not-an-account rule. It is the reasoning behind a door with no lock on it, and the only written record that removing four sign-in screens was a change to what ships rather than to what is claimed.');
}

for (const [capabilityId, file] of Object.entries(FULFILMENT_AND_SAFETY)) {
 const path = `${SIMULATION_DIR}/${file}`;
 if (!existsSync(path)) throw new Error(`${path} is missing, and packages/catalog/capabilities.json marks "${capabilityId}" simulated. A capability in the simulated state with nothing behind it is the third state used as a label, which is the one thing it was added not to be.`);
 const source = read(path);
 const capability = capabilities.capabilities.find(c => c.id === capabilityId);
 if (!capability) throw new Error(`packages/catalog/capabilities.json has no "${capabilityId}" capability, and ${path} stands behind it.`);
 /* That it is in the simulated state, carries a simulation block with a supplier and a notice, and
    refuses at least one thing, is already held further up this file for every capability at once.
    Not repeated here: a second copy of a check is a second thing to correct on the day the first is. */
 const refuses = capability.simulation?.refuses ?? [];
 /* The file has to say which capability it is, in a form this can read. */
 const declared = /const CAPABILITY = '([a-z-]+)'/.exec(source);
 if (!declared || declared[1] !== capabilityId) throw new Error(`${path} does not declare \`const CAPABILITY = '${capabilityId}'\`, so nothing can check its refusals against the contract's.`);

 /* Every sentence looked up, and every lookup finding exactly one sentence. Both directions. */
 const lookups = [...source.matchAll(/refusalSaying\(CAPABILITY,\s*\/(.+?)\/([a-z]*)\)/g)].map(m => new RegExp(m[1], m[2]));
 if (!lookups.length) throw new Error(`${path} never looks a refusal up out of packages/catalog/capabilities.json. A sentence typed into a TypeScript file is word for word only until somebody edits the contract.`);
 for (const pattern of lookups) {
  const matched = refuses.filter(sentence => pattern.test(sentence));
  if (matched.length !== 1) throw new Error(`${path} refuses on ${pattern}, which matches ${matched.length} of the "${capabilityId}" capability's refusal sentences. A refusal that matches none is one no screen renders; one that matches two is a simulator choosing between them.`);
 }
 for (const sentence of refuses) {
  if (HELD_BY_THE_BUILD[sentence]) continue;
  if (!lookups.some(pattern => pattern.test(sentence))) throw new Error(`The "${capabilityId}" simulation says it refuses to "${sentence}" and ${path} never enforces it. A refusal written down and not enforced reads like a control and is a paragraph — which is the shape of every readiness claim packages/catalog/capabilities.json exists to refuse.`);
 }

 /* A simulator that answers a feed must put its payload through the door it stands in front of.
    Eyeballing a JSON literal against a schema is how a simulator ends up teaching the product a
    shape no supplier will ever send. `devices` answers no feed — see the noSeam check below. */
 const feed = seamContract.feeds.find(f => f.capabilities.includes(capabilityId));
 if (feed) {
  if (!source.includes('mustPassTheSeam')) throw new Error(`${path} answers the ${feed.id} feed and never puts its payload through it. The check is not ceremony: the day the door's idea of a forbidden field and the simulator's idea of one drift apart, the simulator goes on producing a payload the real seam would turn away and the product gets built against it.`);
  if (!source.includes(`'${feed.id}'`)) throw new Error(`${path} does not name the "${feed.id}" feed it stands in front of.`);
 }
}

/* No radio, anywhere under here. The devices simulation refuses to open a Bluetooth or eSIM session
   and the honest form of that refusal is that there is nothing in this directory that could — the
   service has no dependencies, so the only way one arrives is a platform API named by hand. Matched
   on identifiers rather than on the word, because both file headers have to be able to say what
   they will not do. */
const RADIO_APIS = /\b(navigator\.bluetooth|requestDevice|BluetoothDevice|BluetoothAdapter|BluetoothGatt|CBCentralManager|CBPeripheral|EuiccManager|CTCellularPlanProvisioning|noble|bleno)\b/;
if (existsSync(SIMULATION_DIR)) {
 for (const entry of readdirSync(SIMULATION_DIR)) {
  if (!entry.endsWith('.ts')) continue;
  const found = RADIO_APIS.exec(read(`${SIMULATION_DIR}/${entry}`));
  if (found) throw new Error(`${SIMULATION_DIR}/${entry} names ${found[1]}. A simulated instrument that opens a radio session is not a simulated instrument, and the capability tells a nurse in its own words that no Bluetooth session is opened and no device is contacted.`);
 }
}

/* A capability whose simulation refuses to declare a permission may not name one. The whitelist
   above already refuses a permission no capability claims; this is the other end of it — the
   capability that promised not to ask cannot be the one that quietly starts. */
for (const capability of capabilities.capabilities) {
 const refusesPermissions = (capability.simulation?.refuses ?? []).some(sentence => /permission/i.test(sentence));
 if (refusesPermissions && (capability.requiresPermissions ?? []).length) {
  throw new Error(`Capability "${capability.id}" names ${capability.requiresPermissions.join(', ')} under requiresPermissions and its own simulation refuses to declare one. Both apps tell a person nothing here asks the device for anything, and that sentence is a special case of a silence that is currently total.`);
 }
}

/* `devices` has no feed route and this is where that stays true. feeds.json argues it out under
   noSeam: the seam is apps/api/src/capture/**, device binding is what is missing rather than a
   schema, and a second ingestion boundary beside the first would be two places to get the same
   thing wrong. So no feed may claim the capability and no simulator may name one for it. */
for (const noSeam of seamContract.noSeam) {
 const claimed = seamContract.feeds.find(feed => feed.capabilities.includes(noSeam.capability));
 if (claimed) throw new Error(`Feed "${claimed.id}" answers for "${noSeam.capability}", which packages/catalog/feeds.json says has no seam: ${noSeam.decision} Overruling that is a decision, not a schema change.`);
 if (!existsSync(SIMULATION_DIR)) continue;
 for (const entry of readdirSync(SIMULATION_DIR)) {
  if (!entry.endsWith('.ts')) continue;
  const source = read(`${SIMULATION_DIR}/${entry}`);
  if (new RegExp(`feed:\\s*['"]${noSeam.capability}['"]`).test(source)) throw new Error(`${SIMULATION_DIR}/${entry} registers a feed for "${noSeam.capability}", which has none. ${noSeam.why}`);
 }
}

/* ---- No journey types a sentence one of these five capabilities owns --------------------------

   This one is here because it was already broken and nobody could see it. When `capabilities.json`
   grew a third state, every simulated capability's screens started rendering the simulation sentence
   instead of the absent one — and the journeys had the absent sentence written out by hand. The
   suite was red on the base commit.

   It read green, which is the part worth writing down. `playwright.config.ts` reuses an existing
   server on 5173 rather than starting its own, and its own comment says why that switch exists: a
   worktree, a parallel agent, a review of one branch while another runs. A run in one checkout will
   happily test whatever tree started the server first, and a green suite that tested somebody else's
   code is worse than a red one. Set MYTHUSO_PORT when more than one checkout is live.

   So a journey asks the contract, through `tests/notices.ts`, exactly as the screens do. What is
   forbidden here is any clause of these five capabilities' notices — absent or simulated — typed
   into a spec. Clause rather than sentence, because the assertion that survived the first sweep was
   `/Nothing is sent/` against a notice that runs on for another eight words.

   Scoped to these five for the same reason the table above is: the other seams are landing in
   parallel, each fixing the journeys that assert its own capabilities, and a check covering all
   fifteen would fail on work that has not merged yet. */
const noticeReader = 'tests/notices.ts';
if (!existsSync(noticeReader)) throw new Error(`${noticeReader} is missing. It is how a journey asks what sentence a screen renders, instead of typing one that is right until a capability changes state.`);
for (const capabilityId of Object.keys(FULFILMENT_AND_SAFETY)) {
 const capability = capabilities.capabilities.find(c => c.id === capabilityId);
 const clauses = new Set(
  [capability.notice, capability.simulation?.notice].filter(Boolean)
   .flatMap(notice => notice.split(/[.,;:—]/).map(clause => clause.trim()).filter(clause => clause.length >= 15))
 );
 for (const file of readdirSync('tests').filter(name => name.endsWith('.ts') && name !== 'notices.ts')) {
  const source = read(`tests/${file}`);
  for (const clause of clauses) {
   if (!source.includes(clause)) continue;
   throw new Error(`tests/${file} types "${clause}", which is part of the "${capabilityId}" capability's notice. A journey that writes that sentence out is a journey that goes red the day the capability changes state and green the day somebody edits the spec instead of the screen — ask tests/notices.ts for it, the way the screens ask lib/capabilities.ts.`);
  }
 }
}

/* ---- The emergency seam, checked harder than the other four -----------------------------------

   This is the one capability where a convincing simulation is dangerous rather than merely
   misleading. 10177, 112 and 10111 reach real people. A person reading that screen may be about to
   need an ambulance, and a simulated acknowledgement — a partner id, a timestamp, the word
   "accepted" — is exactly the thing that would keep them looking at a phone instead of dialling. */
const emergencySimulator = read(`${SIMULATION_DIR}/emergency.ts`);
/* It refuses about the numbers before it works anything else out. If the state were read first, a
   caller who had shown nobody a number would get an argument about a state instead of a refusal —
   and a simulator that works out what it would have said before deciding whether to say it is one
   refactor away from saying it. */
const produceBody = emergencySimulator.slice(emergencySimulator.indexOf('function produce(request'));
const numbersFirst = produceBody.indexOf('until the real numbers have been shown');
const decidesAnything = Math.min(
 ...['const state =', 'const at =', 'const rand =', 'produced('].map(marker => {
  const at = produceBody.indexOf(marker);
  return at < 0 ? Number.MAX_SAFE_INTEGER : at;
 })
);
if (numbersFirst < 0) throw new Error(`${SIMULATION_DIR}/emergency.ts no longer refuses to answer until the real numbers have been shown. That refusal is the reason the file exists.`);
if (numbersFirst > decidesAnything) throw new Error(`${SIMULATION_DIR}/emergency.ts decides something before it asks whether the emergency numbers have been shown. The order is the refusal: nothing is worked out before they are on the screen, because a simulator that has already worked out its answer is one refactor away from returning it.`);
/* The two states it may never produce. Both are assertions about a vehicle in the world, neither is
   true, and neither can be made true by a fixture. The seam declares five and this takes two off. */
const acknowledgementFeed = seamContract.feeds.find(feed => feed.id === 'emergency-acknowledgement');
if (!acknowledgementFeed) throw new Error('packages/catalog/feeds.json no longer declares the emergency-acknowledgement seam.');
const stateField = acknowledgementFeed.accepts.find(accepted => accepted.field === 'state');
const producible = /PRODUCIBLE_STATES: readonly string\[\] = \[([^\]]*)\]/.exec(emergencySimulator)?.[1] ?? '';
const claims = /CLAIMS_AN_AMBULANCE: readonly string\[\] = \[([^\]]*)\]/.exec(emergencySimulator)?.[1] ?? '';
for (const claim of ['en-route', 'arrived']) {
 if (!stateField?.why.includes(claim)) throw new Error(`The emergency-acknowledgement seam no longer names "${claim}" among its states, and the simulator is written to refuse it by name.`);
 if (!claims.includes(`'${claim}'`)) throw new Error(`${SIMULATION_DIR}/emergency.ts no longer refuses to produce "${claim}". It is an assertion that a vehicle is moving toward a house, nothing is, and a screen showing that word next to an address is the failure this pathway is arranged against.`);
 if (producible.includes(`'${claim}'`)) throw new Error(`${SIMULATION_DIR}/emergency.ts can produce "${claim}". Nothing is coming, and a simulated acknowledgement saying it is, is the one defect on this pathway that costs somebody more than time.`);
}
/* And the screens. The ambulance block is rendered before the capability's own notice on all three,
   because on this one pathway the number outranks anything MyThuso has to say about itself —
   including the sentence saying the acknowledgement is simulated. The existing check above holds
   the block above anything MyThuso *sells*; this holds it above what MyThuso *says*. */
const emergencyNotices = {
 web: ['apps/web/src/features/Sos.tsx', '<EmergencyFirst/>', '<NotConnected of="emergency"/>'],
 ios: ['apps/ios/MyThuso/Features/SosView.swift', 'emergencyFirst', 'CapabilityNotice(of: "emergency")'],
 android: ['apps/android/app/src/main/java/za/co/mythuso/ui/SosScreens.kt', 'EmergencyFirst()', 'NotConnected("emergency")']
};
for (const [platform, [file, first, notice]] of Object.entries(emergencyNotices)) {
 const source = read(file);
 const noticeAt = source.indexOf(notice);
 if (noticeAt < 0) throw new Error(`The ${platform} emergency screen renders no capability notice (${file}). The acknowledgement behind it is simulated, and a screen that is quieter for being simulated than it was for being absent is the disclosure failure — silence, not a lie.`);
 if (source.indexOf(first) > noticeAt) throw new Error(`The ${platform} emergency screen puts the simulation notice above the ambulance number (${file}). Nothing MyThuso says about itself goes above 10177, and that includes saying it is not real.`);
}
/* Nothing composed reaches the one free-text field the seam has. `reason` is where a claim about an
   ambulance would arrive, so a stand-down carries the stand-down's own label out of sos.json and
   everything else carries nothing. */
if (!/reason = state === 'stood-down'/.test(emergencySimulator)) throw new Error(`${SIMULATION_DIR}/emergency.ts composes the free-text field on an emergency acknowledgement. That field is where "help is on the way" arrives; the only words allowed in it are ones packages/catalog/sos.json already wrote.`);

/* ---- The surfaces of these five, on all three platforms ---------------------------------------

   `a-simulation-says-so`: a simulated capability renders its notice wherever the absent one would
   have, and no screen may be quieter for being simulated than it was for being absent. The failure
   mode is not a screen that lies — it is a screen that stops speaking, because something answers now
   and nobody notices that what answers is a fixture.

   Four of these screens said nothing at all before this work: the Android prescription, dispensing,
   interpreting and kit surfaces, and both native emergency screens above. Each carried a generic
   design-preview badge, which is a different sentence about a different question — whether the data
   is real, not whether anything is behind it. */
const SIMULATED_SURFACES = [
 ['apps/web/src/features/Dispensing.tsx', '<NotConnected of="dispensing"'],
 ['apps/web/src/features/Orders.tsx', '<NotConnected of="dispensing"'],
 ['apps/web/src/features/Interpreting.tsx', '<NotConnected of="interpreting"'],
 ['apps/web/src/features/Booking.tsx', '<NotConnected of="interpreting"'],
 ['apps/web/src/features/Teleconsult.tsx', '<NotConnected of="interpreting"'],
 ['apps/web/src/features/Kit.tsx', '<NotConnected of="devices"'],
 ['apps/ios/MyThuso/Features/DispensingView.swift', 'CapabilityNotice(of: "dispensing")'],
 ['apps/ios/MyThuso/Features/OrdersView.swift', 'CapabilityNotice(of: "dispensing")'],
 ['apps/ios/MyThuso/Features/InterpretingView.swift', 'CapabilityNotice(of: "interpreting")'],
 ['apps/ios/MyThuso/Features/KitView.swift', 'CapabilityNotice(of: "devices")'],
 ['apps/android/app/src/main/java/za/co/mythuso/ui/DispensingScreens.kt', 'NotConnected("dispensing")'],
 ['apps/android/app/src/main/java/za/co/mythuso/ui/OrderScreens.kt', 'NotConnected("dispensing")'],
 ['apps/android/app/src/main/java/za/co/mythuso/ui/InterpretingScreens.kt', 'NotConnected("interpreting")'],
 ['apps/android/app/src/main/java/za/co/mythuso/ui/CaptureScreens.kt', 'NotConnected("devices")']
];
for (const [file, renders] of SIMULATED_SURFACES) {
 if (!read(file).includes(renders)) throw new Error(`${file} no longer renders ${renders}. A simulator stands behind that screen, and a screen that says nothing about it is the disclosure failure — silence rather than a lie, and the one nobody notices.`);
}

/* ---- The screening seam ------------------------------------------------------------------------

   An urgent screening result is a claim that somebody should stop and act, and the only list this
   product has of things worth stopping for is the eight conditions that end the questions on the
   emergency pathway. A simulator that could invent a ninth would be a screening layer deciding for
   itself what is worth an ambulance, which is the triage this product refuses to do. */
const screeningSimulator = read(`${SIMULATION_DIR}/screening.ts`);
if (!/sos\.redFlags\.conditions/.test(screeningSimulator)) throw new Error(`${SIMULATION_DIR}/screening.ts no longer reads its red flags out of packages/catalog/sos.json. An urgency naming something outside those eight is an urgency this product invented for itself.`);
if (!/records\.observations\.measures/.test(screeningSimulator)) throw new Error(`${SIMULATION_DIR}/screening.ts no longer reads the reference ranges out of packages/catalog/records.json. A range typed into a simulator is the eighth copy of a number that decides whether a reading reaches a doctor.`);

/* ---- The dispensing seam -----------------------------------------------------------------------

   Section 22F's four exceptions are exceptions to the duty to substitute. A simulator that let one
   of them through would have turned an exception into a permission, which is the sentence the
   substitution register itself is already held to. */
const pharmacySimulator = read(`${SIMULATION_DIR}/pharmacy.ts`);
if (!/ground\.class !== 'must-not'/.test(pharmacySimulator)) throw new Error(`${SIMULATION_DIR}/pharmacy.ts no longer decides what may be substituted from the class packages/catalog/dispensing.json puts the ground in. A second table of what may be swapped is a second thing to get wrong about the Act.`);
if (!/item\.molecule/.test(pharmacySimulator) || !/item\.strength/.test(pharmacySimulator)) throw new Error(`${SIMULATION_DIR}/pharmacy.ts no longer checks the dispensed item against the prescribed molecule and strength. Changing one of those is prescribing, done by somebody who is not a prescriber.`);


/* ---- The eleven doors that are all locked ------------------------------------------------------

   packages/catalog/feeds.json describes, for each capability blocked on a supplier nobody has
   signed, what would have to arrive, what the product does while it does not, what must be true
   before it may be switched on, and what must never arrive at all. apps/api serves a route per feed
   that refuses every payload.

   The checks below exist because a seam is only worth having if it cannot quietly become an
   integration. Two of them are the load-bearing ones:

     · A capability may not be marked connected while any switch-on condition of any feed serving it
       is unmet. This makes `connected: true` strictly harder to reach than it was — which is the
       right direction, and the opposite of what work like this usually does to a flag.
     · No feed may accept a field another feed refuses by name. If a field is dangerous enough to be
       refused at one door it does not become safe at another without somebody writing down why.
       Aliases are deliberately not part of that comparison: media-session legitimately needs the
       visit reference, which is exactly what a position feed must never carry, and the per-feed
       check below is what keeps those two facts apart. */
const feedContract = JSON.parse(read('packages/catalog/feeds.json'));
const feedCanonical = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const declaredTypes = new Set(feedContract.fieldTypes.map(t => t.id));
const capabilityById = new Map(capabilities.capabilities.map(c => [c.id, c]));
const feedIds = new Set();
const servedByAFeed = new Set();

for(const feed of feedContract.feeds) {
 if(feedIds.has(feed.id)) throw new Error(`Two feeds in packages/catalog/feeds.json are called "${feed.id}".`);
 feedIds.add(feed.id);
 if(feed.route !== `POST /feeds/${feed.id}`) throw new Error(`Feed "${feed.id}" declares the route "${feed.route}". The contract and the server would then disagree about the path, and the disagreement would be discovered by a vendor.`);
 if(!feed.capabilities?.length) throw new Error(`Feed "${feed.id}" serves no capability, so nothing decides what it says while it is not connected.`);
 for(const id of feed.capabilities) {
  if(!capabilityById.has(id)) throw new Error(`Feed "${feed.id}" names a capability "${id}" that packages/catalog/capabilities.json does not have.`);
  servedByAFeed.add(id);
 }
 if(!feed.capabilities.includes(feed.whileAbsent.noticeFrom)) throw new Error(`Feed "${feed.id}" renders the notice of "${feed.whileAbsent.noticeFrom}", which is not one of the capabilities it serves. A door that quotes somebody else's sentence tells a vendor about the wrong thing.`);
 /* What the product does while the supplier is absent is already right, and the contract points at
    it rather than describing it. A pointer at a file that has been deleted is a pointer at nothing. */
 for(const file of [...feed.derivedFrom, ...feed.whileAbsent.sample]) {
  if(!existsSync(file)) throw new Error(`Feed "${feed.id}" points at ${file}, which does not exist. The seam is derived from what the product already renders, and a derivation from a deleted file is a guess.`);
 }
 if(!feed.whileAbsent.unchanged) throw new Error(`Feed "${feed.id}" does not say what the product does today while nothing is connected.`);
 const acceptedNames = new Set();
 for(const accepted of feed.accepts) {
  if(!declaredTypes.has(accepted.type)) throw new Error(`Feed "${feed.id}" accepts "${accepted.field}" as a "${accepted.type}", which is not one of the types the contract declares.`);
  if(!accepted.why) throw new Error(`Feed "${feed.id}" accepts "${accepted.field}" and does not say why it is needed. A field nobody can justify is a field a vendor will fill with whatever they have.`);
  acceptedNames.add(feedCanonical(accepted.field));
 }
 if(!feed.beforeSwitchOn?.length) throw new Error(`Feed "${feed.id}" names nothing that must be true before it may be switched on, so connecting it would be a decision with no conditions on it.`);
 for(const condition of feed.beforeSwitchOn) {
  if(!condition.must || !condition.why) throw new Error(`Switch-on condition "${condition.id}" on feed "${feed.id}" does not say both what must be true and why.`);
  /* The same rule the capability's own evidence follows, one level down: met is a claim about the
     world, so it needs a file somebody can open. */
  if(condition.met && !condition.evidence) throw new Error(`Switch-on condition "${condition.id}" on feed "${feed.id}" is recorded as met and names no evidence. Met is a claim about the world; it needs a file somebody can open.`);
  if(condition.met && !existsSync(condition.evidence)) throw new Error(`Switch-on condition "${condition.id}" on feed "${feed.id}" is met and its evidence "${condition.evidence}" does not exist.`);
 }
 if(!feed.neverAccepts?.length) throw new Error(`Feed "${feed.id}" refuses nothing. The valuable half of a seam is what it will not take, and a feed with an empty list has not been thought about.`);
 for(const never of feed.neverAccepts) {
  if(!never.refusal || !never.why) throw new Error(`Feed "${feed.id}" refuses "${never.field}" without saying what is refused and why.`);
  if(!Array.isArray(never.also)) throw new Error(`Feed "${feed.id}" refuses "${never.field}" with no list of the other spellings of it. A tripwire that only catches one house style is not a tripwire.`);
  for(const spelling of [never.field, ...never.also]) {
   if(acceptedNames.has(feedCanonical(spelling))) throw new Error(`Feed "${feed.id}" both accepts and refuses "${spelling}". Every honest payload would be turned away, with a sentence about ${never.field}, which is the most confusing possible way for this to be wrong.`);
  }
 }
 if(feed.operator.determined) throw new Error(`Feed "${feed.id}" records the section 72 question as determined. A determination is about a named recipient in a named country and there is no recipient — if one has been signed, the answer belongs beside the contract rather than as a boolean here.`);
}
/* No feed accepts what another refuses by name. */
const refusedAnywhere = new Map();
for(const feed of feedContract.feeds) for(const never of feed.neverAccepts) refusedAnywhere.set(feedCanonical(never.field), { field: never.field, feed: feed.id });
for(const feed of feedContract.feeds) for(const accepted of feed.accepts) {
 const clash = refusedAnywhere.get(feedCanonical(accepted.field));
 if(clash) throw new Error(`Feed "${feed.id}" accepts "${accepted.field}", and feed "${clash.feed}" refuses the same field by name. A field dangerous enough to refuse at one door does not become safe at another without somebody writing down why.`);
}
/* Every capability is answered: served by a feed, or listed with the reason there is no seam. */
for(const capability of capabilities.capabilities) {
 const noSeam = feedContract.noSeam.find(n => n.capability === capability.id);
 if(!servedByAFeed.has(capability.id) && !noSeam) throw new Error(`Capability "${capability.id}" has neither a feed nor an entry in the noSeam list. Every one of them either has a shape somebody could send, or a written reason why it has not.`);
 if(servedByAFeed.has(capability.id) && noSeam) throw new Error(`Capability "${capability.id}" is both served by a feed and listed as having no seam.`);
 if(noSeam && (!noSeam.decision || !noSeam.why)) throw new Error(`The noSeam entry for "${capability.id}" does not say what was decided and why. "Not built" and "deliberately not built" look the same in a diff.`);
 /* The load-bearing one. Connected already needs evidence and an empty blockedBy; it now also needs
    every condition the seam wrote down, because those conditions are the specific things somebody
    would otherwise satisfy in their head at eleven at night. */
 if(capability.connected) {
  for(const feed of feedContract.feeds.filter(f => f.capabilities.includes(capability.id))) {
   for(const condition of feed.beforeSwitchOn) {
    if(!condition.met) throw new Error(`Capability "${capability.id}" is marked connected and the "${condition.id}" condition on feed "${feed.id}" is not met: ${condition.must}`);
   }
  }
 }
}
/* Nothing behind these routes may answer yes. */
for(const kind of feedContract.refusalKinds) {
 if(kind.http < 400) throw new Error(`Refusal kind "${kind.id}" answers ${kind.http}. Every one of these routes refuses, and a refusal that answers in the two hundreds is an acceptance somebody will read as one.`);
}
const feedModule = read('apps/api/src/feeds/index.ts');
if(/\bok:\s*true\b/.test(feedModule)) throw new Error('apps/api/src/feeds/index.ts has grown a success case. There is no adapter behind any of these routes: a payload that is accepted here is accepted into nothing, and the seam has become a claim.');
/* The routes are registered from the contract rather than written out, so a feed added next year
   cannot forget to be refused — and no feed path may be typed into the server by hand. */
const serverSource = read('apps/api/src/server.ts');
if(!serverSource.includes('`POST /feeds/${feed.id}`')) throw new Error('apps/api/src/server.ts no longer registers the feed routes from packages/catalog/feeds.json. A route written out by hand is a route the next feed does not get.');
for(const feed of feedContract.feeds) {
 if(serverSource.includes(`'POST /feeds/${feed.id}'`) || serverSource.includes(`"POST /feeds/${feed.id}"`)) throw new Error(`apps/api/src/server.ts types out the route for "${feed.id}". It comes from the contract, so that the contract is the only place a feed exists.`);
}
/* And no feed sentence is typed into the service. The refusal a vendor reads and the notice a
   patient reads are the same strings the contracts hold, for the same reason every other sentence
   in this repository is: a typed copy cannot be switched off when the thing it describes changes. */
const feedSentences = [
 ...feedContract.feeds.flatMap(f => f.neverAccepts.map(n => n.refusal)),
 ...feedContract.refusalKinds.map(k => k.sentence)
];
for(const file of ['apps/api/src/server.ts', 'apps/api/src/feeds/index.ts', 'apps/api/src/feeds/contract.ts']) {
 const source = read(file);
 for(const sentence of feedSentences) {
  if(source.includes(sentence)) throw new Error(`${file} types out a sentence that lives in packages/catalog/feeds.json: "${sentence.slice(0, 60)}…". Render it from the contract instead.`);
 }
}

/* ---- The one number in the service that is a proposal ------------------------------------------

   `limits.writesPerCallerPerWindow` is sixty and says beside itself that nobody arrived at it by
   watching anybody. `write_windows` is the material that would settle it, and the only reason it can
   be kept at all is that there is nobody in it — so that is checked rather than trusted. The clinical
   check next door asks whether a schema holds a reading; this asks whether a schema holds a person,
   which is the question that matters for a table whose whole justification is that it does not. */
const storeSource = read('apps/api/src/store.ts');
const windows = tablesIn(storeSource).find(table => table.name === 'write_windows');
if(!windows) throw new Error('apps/api/src/store.ts no longer creates write_windows, so nothing is counting what would settle the caller limit.');
for(const column of windows.columns) {
 if(/(subject|person|account|address|phone|route|agent|session)/i.test(column)) throw new Error(`write_windows has a "${column}" column. It is kept for ever and it is kept only because there is nobody in it — five integers about a fifteen-minute window, with nothing to join to anything. A column somebody could be identified by turns a measurement into a holding, and the holdings register says in the words a person reads that there is nothing here of theirs.`);
}
/* And the witness does not publish. What is absent in docs/PRIVACY-AND-SECURITY.md is a recipient —
   a notary, a regulator, a partner, a transparency log — and a recipient is an agreement rather than
   a function. A `fetch` appearing in this file would be somebody closing that gap by writing to a
   second box on the same account, which is the operator publishing to the operator. */
const witnessSource = read('apps/api/src/protection/witness.ts');
for(const reaching of ['fetch(', 'node:http', 'node:net', 'publishTo']) {
 if(witnessSource.includes(reaching)) throw new Error(`apps/api/src/protection/witness.ts has grown "${reaching}". It renders a statement and checks one back; it does not publish, and what is missing is a second organisation to hold the head rather than somewhere to send it. Publishing to a place MyThuso controls is a longer way of not publishing.`);
}
if(!/Nothing in this file publishes anything/.test(witnessSource)) throw new Error('apps/api/src/protection/witness.ts has lost the sentence saying it publishes nothing. The whole risk with this file is that it reads like the control it is only half of.');

/* ============================================================================================== */
/* ---- THE CARE AND DISPATCH SIMULATORS ---------------------------------------------------------
 *
 * Four simulated suppliers stand behind four of the eleven locked doors: a roster (booking),
 * positions (dispatch), answers from the thirteen authorities (credential-verification) and a
 * session broker (teleconsultation). They are the reason a person can walk the whole product before
 * anybody has signed anything, and they are therefore the reason somebody could come to believe it
 * is signed. What follows is what holds those two apart.
 *
 * Everything in this block is about apps/api/src/simulation and packages/catalog/roster.json. It is
 * one block on purpose: two other seams are growing checks in this file at the same time, and a
 * merge between three of them should be a choice about order rather than an argument about lines.
 * ============================================================================================== */

const careSimulationDir = 'apps/api/src/simulation';
const careSimulationFiles = files(careSimulationDir).filter(f => f.endsWith('.ts'));
/* The code of a file without the prose around it. Three of the checks below search for the name of a
   thing that must not appear, and every one of those names is written out in a header comment
   explaining why it must not — apps/api/src/simulation/index.ts says "Not Math.random" in the
   paragraph that says why, and sessions.ts says there is no getUserMedia in here. A check that could
   not tell an argument from an act would make the argument unwriteable, which is the wrong way round:
   the comment is the reason the rule exists. */
const careCode = file => read(file).split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');

/* The wall, widened.
 *
 * The check above under "The wall between the simulators and the network" asks three files —
 * server.ts and the two feed modules — whether they reach this directory, and it is right about why:
 * a route that could accept under some condition is a route somebody finds the condition for, late
 * at night, with a vendor on the phone.
 *
 * This asks the same question of every file in the service, because the import that breaks the wall
 * is never added to server.ts. It is added to something server.ts already imports — a store, a
 * config reader, an incident module — and the three-file version would not see it. Both are kept: a
 * named list says which files matter most, and this says that the answer is the same everywhere. */
for(const file of files('apps/api/src').filter(f => f.endsWith('.ts') && !f.startsWith(`${careSimulationDir}/`))) {
 const reaching = read(file).match(/from\s+'[^']*\/simulation\/[^']*'/);
 if(reaching) throw new Error(`${file} imports ${reaching[0]}, so a simulated supplier is reachable from the request path. Nothing behind the eleven feed routes may answer with a fixture: the routes accept nothing, and a simulated event enters in process through emit(), which is a different function with a different signature reviewed as the change it is. If a route needs one, that is the review — not this import.`);
}
/* And a simulator may not invent randomness of its own. A nurse who stands somewhere different on
   every run makes a test that cannot fail twice the same way and a demonstration nobody can repeat
   in front of an investor. seeded() is the only source there is. */
for(const file of careSimulationFiles) {
 if(/\bMath\.random\b/.test(careCode(file))) throw new Error(`${file} calls Math.random. Every simulator takes its seed from the thing it is simulating — a visit reference, a party id — so the same visit produces the same journey on every machine, for ever. seeded() in ${careSimulationDir}/index.ts is the only randomness in here.`);
}

/* Every refusal a simulated capability declares is enforced, by a simulator, in the contract's own
 * words — and none of those words is typed into the code.
 *
 * A refusal reaches a simulator as the *slug of the sentence's own words*, resolved at load through
 * refusalSaying(). That is what makes rewording a refusal in packages/catalog/capabilities.json a thing
 * somebody has to finish: the slug stops resolving, the module throws, and this check names the
 * sentence that moved. The alternative — a simulator going on refusing something in words nobody
 * says any more — is invisible from every screen in the product. */
const careSimulators = [
 ['booking', `${careSimulationDir}/roster.ts`],
 ['dispatch', `${careSimulationDir}/positions.ts`],
 ['credential-verification', `${careSimulationDir}/credentials.ts`],
 ['teleconsultation', `${careSimulationDir}/sessions.ts`]
];
for(const [id, file] of careSimulators) {
 if(!existsSync(file)) throw new Error(`${file} is gone, and packages/catalog/capabilities.json still says "${id}" is simulated. A capability whose state claims something answers while nothing does renders a simulation notice over a screen with no simulation under it, which is a worse sentence than the absent one it replaced.`);
 const capability = capabilities.capabilities.find(c => c.id === id);
 if(!capability) throw new Error(`packages/catalog/capabilities.json has no capability "${id}", and ${file} stands behind it.`);
 if(capability.state !== 'simulated') throw new Error(`Capability "${id}" is "${capability.state}" and ${file} is still standing behind it. A simulator behind a capability nobody has declared simulated renders no notice on any screen, and silence is the disclosure failure the third state was added to prevent.`);
 /* That every sentence this capability refuses is enforced by this file is no longer checked here.
    It is checked for all thirteen simulators at once, further up, off the `refusalSaying` call sites
    — and that check now reads `capability: CAPABILITY` and a regex flag, which it did not when this
    loop was written. Two checks over the same ground is two things to correct on the day the first
    one moves, and this was the weaker of them: it matched a slug literal, so converting these four
    files to the shared lookup would have made it pass by measuring nothing at all. */

}
/* And nowhere in the directory is one of those sentences a string. */
const careRefusalSentences = capabilities.capabilities.flatMap(c => c.simulation?.refuses ?? []);
for(const file of careSimulationFiles) {
 const source = careCode(file);
 for(const sentence of careRefusalSentences) {
  if(source.includes(sentence)) throw new Error(`${file} types out a refusal that lives in packages/catalog/capabilities.json: "${sentence}". Look it up with refusalSaying() — a typed copy goes on being refused in the old words after every screen has started saying the new ones.`);
 }
}

/* The session broker is a session object and never media.
 *
 * Neither native app declares a camera or a microphone permission, deliberately, and more than one
 * notice a person reads is a special case of that being true. The permissions whitelist above already
 * refuses an undeclared one on either platform; this is the other half, which is that the thing most
 * likely to want one is the simulator that makes a call appear to connect. A simulated session is a
 * session object — who joined, when, on which rung of the ladder — and there is no arrangement of
 * that which needs a device. */
const careMediaApis = /\b(getUserMedia|mediaDevices|MediaStream|MediaRecorder|RTCPeerConnection|AudioContext|AVCaptureDevice|AVAudioSession|SFSpeechRecognizer)\b/;
for(const file of careSimulationFiles) {
 const reaching = careCode(file).match(careMediaApis);
 if(reaching) throw new Error(`${file} reaches for ${reaching[0]}. ${capabilities.capabilities.find(c => c.id === 'teleconsultation').simulation.refuses[0]} A simulated session is a session object, and this build tells a patient it has never asked this device for the camera or the microphone.`);
}
const careTeleconsult = capabilities.capabilities.find(c => c.id === 'teleconsultation');
if(careTeleconsult.requiresPermissions?.length) throw new Error(`The teleconsultation capability names ${careTeleconsult.requiresPermissions.join(', ')} under requiresPermissions while it is simulated, which is what would let the manifest and the target declare it. ${careTeleconsult.simulation.refuses[1]} Declaring one is not a build step; it is a decision about pointing a camera at somebody in their own home, and what needs it is a media stack rather than a fixture.`);

/* ---- The simulated roster, held to the contracts it is derived from ---------------------------
 *
 * packages/catalog/roster.json is nine fictional people, and every interesting thing about them is a
 * refusal somewhere else: a zone geography.json does not have, a clearance that ran out, an
 * application half finished, a phone telling nobody anything, a fix wider than the suburb it would be
 * drawn in. Each of those has to stay reachable, because a refusal nothing can reach is a fixture
 * with a label on it — which is precisely what the simulated state exists to not be. */
const careRoster = JSON.parse(read('packages/catalog/roster.json'));
const careGeography = JSON.parse(read('packages/catalog/geography.json'));
const careScheduling = JSON.parse(read('packages/catalog/scheduling.json'));
const careServices = JSON.parse(read('packages/catalog/services.json'));
const careNurseRole = vetting.roles.find(r => r.id === 'nurse');
const careCheckIds = new Set(careNurseRole.checks.map(c => c.id));
const careScopes = new Set(careNurseRole.scope.options);
const careZoneNames = new Map(careGeography.zones.map(z => [z.name.toLowerCase(), z]));
const careSeenIds = new Set();
for(const nurse of careRoster.nurses) {
 if(careSeenIds.has(nurse.id)) throw new Error(`packages/catalog/roster.json holds ${nurse.id} twice.`);
 careSeenIds.add(nurse.id);
 for(const checkId of Object.keys(nurse.checks ?? {})) {
  if(!careCheckIds.has(checkId)) throw new Error(`${nurse.id} in packages/catalog/roster.json carries an exception for "${checkId}", which is not a check the nurse role has in packages/catalog/vetting.json. An exception nobody's role holds is a fixture the gate will never look at.`);
 }
 for(const scope of nurse.scope) {
  if(!careScopes.has(scope)) throw new Error(`${nurse.id} in packages/catalog/roster.json is scoped to "${scope}", which is not in the nurse role's scope of practice. A nurse is only ever dispatched inside it and the Control Tower cannot override that, so a scope the register does not have is a nurse cleared for nothing.`);
 }
}
/* Both sides of the coverage refusal, and both sides of the vetting one. */
if(!careRoster.nurses.some(n => careZoneNames.has(n.zone.toLowerCase()))) throw new Error('No nurse in packages/catalog/roster.json works in a zone packages/catalog/geography.json declares, so nobody can ever be offered and the roster is a list of refusals.');
if(!careRoster.nurses.some(n => !careZoneNames.has(n.zone.toLowerCase()))) throw new Error('Every nurse in packages/catalog/roster.json works inside phase one, so "Book outside a zone dispatch can reach" is a sentence nothing can reach. Coverage is one city and five zones, said out loud on the SOS screen, and the refusal is the half worth having.');
if(!careRoster.nurses.some(n => Object.values(n.checks ?? {}).some(c => (c.expiresInDays ?? 0) < 0))) throw new Error('No nurse in packages/catalog/roster.json has a check that has already run out, so the arithmetic that withdraws dispatch without anybody noticing first is never exercised. A lapsed clearance is the whole of what makes scheduled re-vetting real rather than a paragraph of copy.');
if(!careRoster.nurses.some(n => n.sharesPosition === false)) throw new Error('Every nurse in packages/catalog/roster.json is sharing a position, so the board can never say the difference between nobody-there and nobody-reporting — and a dispatcher who cannot see that difference reads the map as the first one.');
/* A fix wider than the suburb it would be drawn in is the position feed's sharpest switch-on
   condition, and it exists only if some declared poor fix actually exceeds some zone a nurse works
   in. */
const carePoorFix = careRoster.nurses.filter(n => n.fix === 'poor').map(n => careZoneNames.get(n.zone.toLowerCase())).filter(Boolean);
if(!carePoorFix.some(zone => careRoster.positions.poorFixMetres > zone.radiusKm * 1000)) throw new Error(`No nurse in packages/catalog/roster.json has a ${careRoster.positions.poorFixMetres}-metre fix in a suburb smaller than that, so a position is never refused for being wider than the zone it would be drawn in. That condition is the difference between a measurement and a decoration, and it has to be something somebody can open the app and see.`);
/* The shift is arithmetic over the hours the product offers rather than two times somebody typed, so
   what is checked is that the arithmetic still covers them. A nurse rostered off in the middle of a
   visit somebody was allowed to book is the failure a pair of typed times produces on the day a slot
   or a duration changes. */
/* ---- And nobody types a nurse's position again --------------------------------------------------
 *
 * The dispatch board carried five nurses with coordinates typed beside each row, the vetting console
 * carried nine of the same people with different fields, and lib/arrival.ts carried a tenth and said
 * in its own header that a second copy of a person is exactly the drift packages/catalog exists to
 * stop. All three read the roster now, and where each of them is standing is arithmetic on the
 * suburb she works in.
 *
 * The way that comes back is not a whole list reappearing — it is one row, added by somebody who
 * needed a pin somewhere specific and had a coordinate to hand. So what is refused is the pairing:
 * a party id and a decimal coordinate on the same line, anywhere but the contract. */
/* A coordinate in the shape one is actually written in. A bare decimal matches a timestamp's
   milliseconds and a price, so what is looked for is a latitude or a longitude being given a
   value — which is exactly how a typed pin appears and nothing else is. */
const careCoordinate = /\b(lat|lng|latitude|longitude)\b\s*[:=]\s*-?\d/i;
const carePartyIds = careRoster.nurses.map(nurse => nurse.id);
/* One file is quarantined and it is not an exemption. The SOS screen holds two on-call rotas with
   positions of their own, and it belongs to the emergency seam rather than to this one — it names
   the same parties the roster does and should read them from it, and that is somebody else's change
   to make. The entry fails the build on the day it stops typing one, so the quarantine cannot rot
   into a licence: whoever adopts the roster there deletes this line as part of doing it. */
const CARE_POSITION_QUARANTINE = [
 ['apps/web/src/features/Sos.tsx', "the two on-call rotas hold their own coordinates; read them from lib/roster.ts's placeOf"]
];
const careQuarantined = new Map(CARE_POSITION_QUARANTINE);
const careTypesAPosition = source => source.split('\n').some(line =>
 carePartyIds.some(id => line.includes(`'${id}'`) || line.includes(`"${id}"`)) && careCoordinate.test(line));
/* The web, and only the web, and that is a limit rather than an oversight.
   A test that posts a position at one of the eleven doors is testing a vendor's payload, and a
   payload is where a coordinate belongs — refusing one there would be refusing the shape the seam
   exists to describe. And both native dispatch boards hold sample coordinates of their own because
   there is nothing for them to read: packages/catalog/roster.json deliberately has no emitter, since
   generating a fictional workforce into Swift and Kotlin would put a list of people who do not exist
   into two shipped binaries for no reader. Their boards are sample data drawn from real suburbs and
   they say so; what this refuses is a second roster on the platform that has a real one. */
for(const file of files('apps/web/src').filter(f => /\.tsx?$/.test(f))) {
 const source = read(file);
 if(careQuarantined.has(file)) {
  if(!careTypesAPosition(source)) throw new Error(`CARE_POSITION_QUARANTINE in scripts/check-boundaries.mjs excuses ${file} — ${careQuarantined.get(file)} — and it no longer types one. Delete the line: an exemption nobody can lose is how a rule stops being one.`);
  continue;
 }
 for(const line of source.split('\n')) {
  const named = carePartyIds.find(id => line.includes(`'${id}'`) || line.includes(`"${id}"`));
  if(named && careCoordinate.test(line)) throw new Error(`${file} puts a coordinate on the same line as ${named}. Where a nurse is standing is arithmetic on the suburb packages/catalog/roster.json says she works in — lib/roster.ts on the web, simulation/positions.ts in the service — and a typed one is the row that drifts first, because nothing compares a number somebody chose against a number somebody else chose.`);
 }
}
for(const [file, todo] of CARE_POSITION_QUARANTINE) {
 if(!existsSync(file)) throw new Error(`CARE_POSITION_QUARANTINE names ${file}, which does not exist (${todo}). A quarantine list that outlives its files is a list nobody reads.`);
}
/* And the two screens that used to hold their own roster read the shared one. Deleting the import is
   how a second list starts, and it looks like a tidy-up at the time. */
for(const [file, why] of [
 ['apps/web/src/features/Dispatch.tsx', 'the Control Tower board'],
 ['apps/web/src/lib/arrival.ts', "the patient's arrival view"]
]) {
 if(!/from '\.\.?\/(lib\/)?roster'/.test(read(file))) throw new Error(`${file} no longer reads apps/web/src/lib/roster.ts, so ${why} has a roster of its own again. Nine people in four places is where this started: the console had their checks, the board had their coordinates, and the arrival view had one of them a third time.`);
}

const careMinutes = hhmm => Number(hhmm.split(':')[0]) * 60 + Number(hhmm.split(':')[1]);
const careSlots = careScheduling.offer.slots;
const careLongest = Math.max(...careServices.map(s => s.duration));
if(careRoster.shift.startsBeforeFirstSlotMinutes <= 0 || careRoster.shift.endsAfterLastVisitMinutes <= 0) throw new Error('packages/catalog/roster.json rosters a shift that starts on the first slot and ends on the last visit, so a nurse has no time to travel to either door.');
if(careMinutes(careSlots[careSlots.length - 1]) + careLongest + careRoster.shift.endsAfterLastVisitMinutes > 24 * 60) throw new Error(`The last slot packages/catalog/scheduling.json offers is ${careSlots[careSlots.length - 1]}, the longest visit packages/catalog/services.json sells is ${careLongest} minutes, and the shift would run past midnight. A shift that wraps a day is one the roster's arithmetic reports wrongly rather than refuses.`);

/* ==== Gilbert and voice ========================================================================
 *
 * Owned by the Gilbert and Voice build (Wave 1, 14 September 2026). Everything in this block is about
 * packages/catalog/assistant.json, the voice capability, the speech-transcript door and the three
 * places that implement Gilbert. It is one block on purpose, so that a merge with the other seams
 * growing checks in this file is a choice about order rather than an argument about lines.
 *
 * The founder's decision, which these checks hold and do not widen: voice in Release 1 is push-to-
 * talk, English, on-device recognition only; no audio is stored or written anywhere; the transcript
 * lives for the conversation and can be corrected before it is sent; no wake word; nothing is sent to
 * any external provider or language model; no clinical content is invented and urgency is never
 * lowered; and the web has no microphone. Each check below is one of those sentences made into a
 * failure, and each was proved to fire by breaking the source it guards.
 * ============================================================================================== */

const gilbertContract = JSON.parse(read('packages/catalog/assistant.json'));
const gilbertCanon = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
/* The code of a file without its prose. Several of these checks look for a name that must not appear,
   and the comments explaining why it must not appear name it. Block comments and whole-line comments
   are removed; a trailing comment survives, which errs towards failing rather than passing. */
const gilbertCode = source => source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');

/* ---- The contract says what the founder decided, and nothing wider --------------------------- */
const PULSE_ORDER = ['idle', 'listening', 'thinking', 'guiding', 'escalate', 'handover'];
if(gilbertContract.states.map(s => s.id).join() !== PULSE_ORDER.join()) throw new Error(`packages/catalog/assistant.json declares the Pulse states ${gilbertContract.states.map(s => s.id).join(', ')}. Section 15E.3 has six, in the order ${PULSE_ORDER.join(', ')}, and three platforms draw them from this list.`);
for(const state of gilbertContract.states) {
 for(const field of ['name', 'visual', 'meaning', 'cue', 'announcement', 'shownWhen']) if(!state[field]) throw new Error(`Pulse state "${state.id}" has no ${field}. A state a screen reader cannot announce in words is a state only sighted people are told about.`);
}
const webPulse = gilbertContract.states.filter(s => s.platforms.includes('web')).map(s => s.id);
if(webPulse.includes('listening') || webPulse.includes('thinking')) throw new Error(`packages/catalog/assistant.json lets the web show ${webPulse.filter(id => id === 'listening' || id === 'thinking').join(' and ')}. The web has no microphone in this release, so it has nothing to listen with and nothing to finish transcribing.`);
if(!/not a doctor/.test(gilbertContract.identity.whatItIsNot) || !/not a person/.test(gilbertContract.identity.whatItIsNot)) throw new Error('Gilbert\'s whatItIsNot no longer says it is not a doctor and not a person. "Your Thuso AI Doctor" is a product name, and the sentence that says so is the only thing stopping it being read as a qualification.');
const gilbertVoice = gilbertContract.voice;
const FOUNDER_DECIDED = { mode: 'push-to-talk', recognition: 'on-device', audioStored: false, transcriptLifetime: 'conversation', correctionBeforeSend: true, wakeWord: false, web: false, modelImprovementOffered: false };
for(const [key, value] of Object.entries(FOUNDER_DECIDED)) {
 if(gilbertVoice[key] !== value) throw new Error(`packages/catalog/assistant.json sets voice.${key} to ${JSON.stringify(gilbertVoice[key])}. The founder decided ${JSON.stringify(value)} on 14 September 2026, and widening it is a decision for the founder rather than an edit.`);
}
if(gilbertVoice.languages.length !== 1 || gilbertVoice.languages[0].id !== 'en' || !gilbertVoice.languages[0].recognitionLocales.every(locale => /^en-[A-Z]{2}$/.test(locale))) throw new Error('packages/catalog/assistant.json offers voice in a language other than English. No other language may be heard until a contracted South African provider exists and that language has passed its own clinical comprehension test — see the speech-transcript door in feeds.json.');
if(!Number.isInteger(gilbertVoice.maxListeningSeconds) || gilbertVoice.maxListeningSeconds < 5 || gilbertVoice.maxListeningSeconds > 60) throw new Error(`voice.maxListeningSeconds is ${gilbertVoice.maxListeningSeconds}. A tap must never leave a microphone open for long: the limit is what makes tap-to-start push-to-talk rather than an open microphone.`);
for(const field of ['howItWorks', 'beforePermission', 'unavailable', 'refused', 'failed', 'web', 'talkLabel', 'stopLabel', 'captionsLabel', 'correctLabel']) {
 if(!gilbertVoice.sentences[field]) throw new Error(`voice.sentences.${field} is missing from packages/catalog/assistant.json. Each of these is what a person is told at one moment of push-to-talk, and a platform with no sentence for a moment will type one.`);
}
const GILBERT_REFUSALS = ['no-diagnosis', 'no-prescription', 'never-lowers-an-emergency', 'no-invented-slot', 'no-audio-kept', 'listening-is-the-microphone', 'not-a-person', 'crisis-is-never-left-to-gilbert', 'silence-is-not-safety'];
for(const id of GILBERT_REFUSALS) {
 const found = gilbertContract.refusals.find(r => r.id === id);
 if(!found?.statement || !found?.why) throw new Error(`Gilbert has lost the refusal "${id}", or the sentence saying why. Three platforms render these word for word, and what Gilbert will not do is the half of it worth reading.`);
}

/* ---- The matcher: emergency words only raise, and nothing typed can differ by platform ---------- */
/* The terms have been their own versioned configuration since the founder's decision of 14 September 2026. */
const gilbertWords = JSON.parse(read(gilbertContract.matcher.emergencyTerms?.from ?? 'packages/catalog/gilbert-emergency-terms.json'));
if(gilbertWords.clinicalReview?.reviewedBy !== null && !gilbertWords.clinicalReview?.reviewedOn) throw new Error('The emergency terms are marked clinically reviewed with no date. A review is by somebody, on a day, of a version of the list.');
const PHRASE = /^[a-z0-9]+( [a-z0-9]+)*$/;
const seenWords = new Map();
for(const group of gilbertWords.groups) {
 if(group.condition === null ? !group.name : !sos.redFlags.conditions.some(c => c.id === group.condition)) throw new Error(`Emergency word group "${group.id}" maps to ${group.condition === null ? 'no condition and has no name' : `"${group.condition}", which sos.json does not have`}. Gilbert escalates using the red flags Thuso SOS already asks about, and invents none.`);
 for(const word of group.words) {
  /* Already in normal form, so a web regular expression, a Swift scalar loop and a Kotlin char loop
     cannot disagree about what the word is. */
  if(!PHRASE.test(word)) throw new Error(`Emergency word "${word}" in group "${group.id}" is not in normal form (lower-case letters and digits, single spaces). Normalisation runs on three platforms, and a word that depends on it to match is a word one of them may miss.`);
  if(seenWords.has(word)) throw new Error(`The emergency word "${word}" is in both "${seenWords.get(word)}" and "${group.id}".`);
  seenWords.set(word, group.id);
 }
}
for(const condition of sos.redFlags.conditions) {
 if(!gilbertWords.groups.some(g => g.condition === condition.id)) throw new Error(`No emergency word group raises the sos.json condition "${condition.id}" (${condition.name}). A person who types it to Gilbert would be told "I can't assess that" rather than shown the ambulance first.`);
}
const answerKinds = new Set(['situation', 'identity', 'voice', 'handover', 'emergency']);
for(const question of gilbertContract.questions) {
 if(!answerKinds.has(question.answer)) throw new Error(`Gilbert's question "${question.id}" answers with "${question.answer}", which no platform knows how to render.`);
 if(question.answer === 'situation' && !gilbertContract.situations.some(s => s.id === question.id)) throw new Error(`Gilbert's question "${question.id}" answers with a situation nobody wrote.`);
 if(!gilbertContract.questionGroups.some(g => g.id === question.group)) throw new Error(`Gilbert's question "${question.id}" is in a group that does not exist.`);
 for(const trigger of question.triggers) if(!PHRASE.test(trigger)) throw new Error(`Trigger "${trigger}" on "${question.id}" is not in normal form, so the three platforms could disagree about whether it matched.`);
}
for(const kind of ['emergency', 'handover']) {
 if(gilbertContract.questions.filter(q => q.answer === kind).length !== 1) throw new Error(`Gilbert has ${gilbertContract.questions.filter(q => q.answer === kind).length} questions answered with "${kind}". There is one way to an ambulance and one way to a nurse in the suggested questions, always.`);
}
if(gilbertContract.answers.emergency.state !== 'escalate') throw new Error('The emergency answer no longer puts the sphere in Escalate. An answer that shows the ambulance number in a calm glow has lowered its own urgency.');
if(!['guiding', 'escalate'].includes(gilbertContract.answers.unmatched.state)) throw new Error(`The unmatched answer is "${gilbertContract.answers.unmatched.state}". Anything Gilbert cannot assess gets an answer at least as prominent as an approved one.`);
for(const [where, numbers] of [['unmatched', gilbertContract.answers.unmatched.numbers], ['emergency', gilbertContract.answers.emergency.numbers]]) {
 if(numbers[0] !== 'ambulance' || !numbers.includes('mobile')) throw new Error(`Gilbert's ${where} answer does not lead with the ambulance and include 112 from a mobile.`);
}
if(!gilbertContract.silenceIsNotSafety.includes('{ambulance}')) throw new Error('silenceIsNotSafety no longer names the ambulance. The sentence is there for the person Gilbert failed to recognise, and what they need from it is the number.');
for(const run of read('packages/catalog/assistant.json').match(/\d{3,}/g) ?? []) {
 if(SA_EMERGENCY_NUMBERS.some(([, n]) => n === run)) throw new Error(`packages/catalog/assistant.json types the emergency number ${run}. It is sos.json's, filled in by token, so a wrong digit can only be wrong in one place.`);
}
/* The order that makes the matcher safe, in all three implementations: emergency words first. A
   platform that looked for a question first would answer "when is my nurse coming, my chest hurts"
   with a date. */
const GILBERT_MATCHERS = [
 ['web', 'apps/web/src/lib/assistant.ts', /export function send\(/, /emergencyGroupsIn\(words\)/, /questionFor\(words\)/],
 ['iOS', 'apps/ios/MyThuso/Models/Assistant.swift', /static func send\(/, /emergencyGroups\(in: words\)/, /question\(for: words\)/],
 ['Android', 'apps/android/app/src/main/java/za/co/mythuso/model/Assistant.kt', /fun send\(/, /emergencyGroups\(words\)/, /question\(words\)/]
];
for(const [platform, file, sendAt, emergencyCall, questionCall] of GILBERT_MATCHERS) {
 const code = gilbertCode(read(file));
 const start = code.search(sendAt);
 if(start < 0) throw new Error(`${file} has no send function, so ${platform} Gilbert cannot be read for the order it matches in.`);
 const body = code.slice(start);
 const raised = body.search(emergencyCall), asked = body.search(questionCall);
 if(raised < 0 || asked < 0 || raised > asked) throw new Error(`${file} looks for a question before it looks for an emergency word. On ${platform} a message that asks something ordinary and mentions a chest pain would be answered as the ordinary question.`);
}
/* No platform types a trigger or an emergency word. They are generated or read, and a typed one is a
   phrase one platform matches and the others do not. */
/* An id is not a phrase. "emergency" is an answer kind and a state as well as an emergency word, and a
   platform switching on the answer kind is reading the contract rather than typing a copy of it. */
const gilbertIds = new Set([...answerKinds, ...PULSE_ORDER, 'unmatched', ...gilbertContract.questions.map(q => q.id), ...gilbertContract.questionGroups.map(g => g.id), ...gilbertContract.situations.map(s => s.id), ...gilbertWords.groups.map(g => g.id), ...sos.emergency.numbers.map(n => n.id)]);
const gilbertPhrases = new Set([...seenWords.keys(), ...gilbertContract.questions.flatMap(q => q.triggers)].filter(phrase => !gilbertIds.has(phrase)));
const GILBERT_FILES = {
 web: ['apps/web/src/lib/assistant.ts', 'apps/web/src/features/Assistant.tsx', 'apps/web/src/components/AssistantLauncher.tsx'],
 ios: ['apps/ios/MyThuso/Models/Assistant.swift', 'apps/ios/MyThuso/Features/AssistantView.swift', 'apps/ios/MyThuso/Features/GilbertVoice.swift'],
 android: ['apps/android/app/src/main/java/za/co/mythuso/model/Assistant.kt', 'apps/android/app/src/main/java/za/co/mythuso/ui/GilbertScreens.kt', 'apps/android/app/src/main/java/za/co/mythuso/ui/GilbertVoice.kt']
};
for(const file of Object.values(GILBERT_FILES).flat()) {
 if(!existsSync(file)) throw new Error(`${file} is missing. Gilbert is built on all three platforms from one contract.`);
 for(const [, literal] of gilbertCode(read(file)).matchAll(/["'`]((?:[^"'`\\\n]|\\.)*)["'`]/g)) {
  if(gilbertPhrases.has(literal.trim().toLowerCase())) throw new Error(`${file} types the phrase "${literal}", which is a trigger or an emergency word in packages/catalog/assistant.json. Read it from the contract; a typed copy is a phrase one platform matches and the others do not.`);
 }
}

/* ---- The Pulse events: what may leave a conversation, and what never does -------------------- */
const PULSE_EVENTS = ['pulse.session.started', 'pulse.listening.started', 'pulse.utterance.finalised', 'pulse.thinking.started', 'pulse.device.highlight', 'pulse.guidance.presented', 'pulse.escalation.started', 'pulse.handover.completed'];
const ENGINES = ['core', 'access', 'pulse', 'care', 'clinical', 'safety', 'movement', 'trust', 'record', 'medicines', 'devices', 'money'];
const eventFieldTypes = new Set(feedContract.fieldTypes.map(t => t.id));
const liveGilbertEvents = gilbertContract.events.filter(e => !e.withdrawn);
if(liveGilbertEvents.map(e => e.type).join() !== PULSE_EVENTS.join()) throw new Error(`packages/catalog/assistant.json declares the live Pulse events ${liveGilbertEvents.map(e => e.type).join(', ')}. Section 15F.4 names eight, and the Contracts & Core architect's event shape expects exactly those.`);
/* Nothing a person said leaves the conversation, on any event. utterance.finalised carries the
   length, the channel and ids; the words stay on the device until consent and retention exist. */
/* Stems rather than names, because the words arrive under many: utteranceText, heardWords, rawTranscript. */
const NEVER_A_PAYLOAD = ['audio', 'transcript', 'utterance', 'text', 'words', 'heard', 'voiceprint', 'recording', 'embedding', 'diagnos', 'caption'];
/* A withdrawn version keeps the shape it was frozen with — that shape is why it was withdrawn — so the
   payload rules below are for live versions. Withdrawal itself is held by the events contract's own
   check: a day, a reason, the subscribers it had, an empty subscriber list and a later live version. */
for(const event of gilbertContract.events) {
 if(!Number.isInteger(event.version) || event.version < 1 || event.owner !== 'pulse' || !event.summary) throw new Error(`Pulse event "${event.type}@${event.version}" does not have a whole version, pulse as its owner and a summary.`);
 if(event.withdrawn) continue;
 if(!event.subscribers.length || event.subscribers.some(s => !ENGINES.includes(s))) throw new Error(`Pulse event "${event.type}" names subscribers ${event.subscribers.join(', ')}. Subscribers are engine ids: ${ENGINES.join(', ')}.`);
 if(event.subscribers.includes(event.owner)) throw new Error(`Pulse event "${event.type}" is subscribed to by its own owner. An engine that listens to itself has a function call, not an event.`);
 for(const field of event.payload) {
  if(!eventFieldTypes.has(field.type) || typeof field.required !== 'boolean' || !field.why) throw new Error(`Pulse event "${event.type}" carries "${field.field}" without a type from feeds.json's fieldTypes, a required flag and a reason.`);
  /* Which emergency group or which question is a fact about a person once a session is joined to one —
     a crisis group is a self-harm mention. A live event may say whether, never which. */
  if(['emergencygroups', 'groups', 'matchedquestion', 'questionid', 'conditions', 'condition'].includes(gilbertCanon(field.field))) throw new Error(`Pulse event "${event.type}@${event.version}" carries "${field.field}". A group id can be crisis and a question id is what somebody asked; joined to a person, either is a record of it. Carry a boolean — escalated, questionMatched — and never which.`);
  if(NEVER_A_PAYLOAD.some(stem => gilbertCanon(field.field).includes(stem)) || gilbertCanon(field.field) === 'value') throw new Error(`Pulse event "${event.type}" carries "${field.field}". No audio, no words a person said and no clinical value leaves a Gilbert conversation on an event.`);
  if(event.neverCarries.some(n => gilbertCanon(n.field) === gilbertCanon(field.field))) throw new Error(`Pulse event "${event.type}" both carries and refuses "${field.field}".`);
 }
 if(!event.neverCarries.every(n => n.field && n.why)) throw new Error(`Pulse event "${event.type}" refuses a field without saying why.`);
 if(!event.neverCarries.some(n => gilbertCanon(n.field).includes('audio'))) throw new Error(`Pulse event "${event.type}" does not refuse audio. Every one of the eight says so, because the one that forgets is the one somebody extends.`);
 if(!event.neverCarries.some(n => gilbertCanon(n.field) === 'transcript')) throw new Error(`Pulse event "${event.type}" does not refuse the transcript.`);
}

/* ---- The door a speech provider would one day knock on -------------------------------------- */
const speechDoor = feedContract.feeds.find(f => f.id === 'speech-transcript');
if(!speechDoor?.capabilities.includes('voice')) throw new Error('packages/catalog/feeds.json has no speech-transcript door serving the voice capability. The day a South African speech provider is contracted, what must be true first and what it must never send are already written down there.');
if(feedContract.noSeam.some(n => n.capability === 'voice')) throw new Error('feeds.json still lists voice under noSeam. Voice has a door now; the reason there was none was that nothing had been decided about listening, and the founder has decided.');
const speechRefuses = speechDoor.neverAccepts.flatMap(n => [n.field, ...n.also]).map(gilbertCanon);
for(const must of ['audio', 'audiourl', 'recording', 'voiceprint', 'speakerembedding', 'diagnosis']) {
 if(!speechRefuses.some(spelling => spelling === must || spelling.includes(must))) throw new Error(`The speech-transcript door does not refuse "${must}". A provider's defaults are to keep the audio and to add whatever else it can infer, and this is the list that turns those defaults away.`);
}
for(const must of ['a-data-processing-agreement-is-signed', 'hosting-is-south-african-or-approved', 'the-provider-keeps-no-audio', 'each-language-passes-a-clinical-comprehension-test', 'model-improvement-has-its-own-consent']) {
 if(!speechDoor.beforeSwitchOn.some(c => c.id === must)) throw new Error(`The speech-transcript door has lost the switch-on condition "${must}".`);
}

/* ---- Permissions: named, platform by platform, with the words a person is asked in ------------ */
const VOICE_PERMISSIONS = { NSMicrophoneUsageDescription: 'ios', NSSpeechRecognitionUsageDescription: 'ios', 'android.permission.RECORD_AUDIO': 'android' };
const voiceNamed = Object.fromEntries((voice.requiresPermissions ?? []).map(p => [p.permission, p.platform]));
if(JSON.stringify(Object.keys(voiceNamed).sort()) !== JSON.stringify(Object.keys(VOICE_PERMISSIONS).sort()) || Object.entries(VOICE_PERMISSIONS).some(([k, v]) => voiceNamed[k] !== v)) throw new Error(`The voice capability names ${Object.keys(voiceNamed).join(', ') || 'no permissions'}. Push-to-talk needs exactly the iOS microphone and speech recognition keys and Android's RECORD_AUDIO, each on its own platform, and nothing more.`);
const gilbertPbx = read('apps/ios/MyThuso.xcodeproj/project.pbxproj');
const appConfigs = gilbertPbx.split('\n').filter(line => /isa = XCBuildConfiguration/.test(line) && /PRODUCT_NAME = MyThuso;/.test(line));
if(appConfigs.length !== 2) throw new Error(`Found ${appConfigs.length} build configurations for the MyThuso app target rather than Debug and Release, so the usage descriptions cannot be checked.`);
for(const key of ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription']) {
 for(const config of appConfigs) {
  const declared = config.match(new RegExp(`INFOPLIST_KEY_${key} = "((?:[^"\\\\]|\\\\.)*)";`));
  if(!declared) throw new Error(`The MyThuso target's ${/name = (\w+)/.exec(config)?.[1]} configuration does not declare ${key}. iOS ends an app that asks for the microphone or speech recognition without one.`);
  if(declared[1] !== gilbertVoice.usageDescriptions[key]) throw new Error(`The MyThuso target asks for ${key} in the words "${declared[1]}", and packages/catalog/assistant.json says "${gilbertVoice.usageDescriptions[key]}". The sentence in the system's permission prompt is a promise, and it is the contract's.`);
 }
}
if(gilbertPbx.split('\n').some(line => /isa = XCBuildConfiguration/.test(line) && !/PRODUCT_NAME = MyThuso;/.test(line) && /UsageDescription/.test(line))) throw new Error('A build configuration other than the MyThuso app target declares a usage description.');
if((read('apps/android/app/src/main/AndroidManifest.xml').match(/android\.permission\.RECORD_AUDIO/g) ?? []).length !== 1) throw new Error('The Android manifest does not declare RECORD_AUDIO exactly once. Gilbert\'s push-to-talk needs it, and the voice capability names it.');

/* ---- iOS: the microphone lives in one file, asks for on-device recognition, and writes nothing -- */
const IOS_VOICE = 'apps/ios/MyThuso/Features/GilbertVoice.swift';
const IOS_SPEECH = /\b(AVAudioEngine|AVAudioSession|AVAudioApplication|SFSpeechRecognizer|SFSpeechAudioBufferRecognitionRequest|SFSpeechRecognitionTask|requestRecordPermission|installTap)\b|\bimport\s+(Speech|AVFAudio|AVFoundation)\b/;
const IOS_RECORDING = /\b(AVAudioRecorder|AVAudioFile|AVAssetWriter|ExtAudioFile\w*|AudioFileCreate\w*|AVCaptureDevice|AVCaptureSession)\b/;
for(const file of iosSources) {
 const code = gilbertCode(read(file));
 const recording = code.match(IOS_RECORDING);
 if(recording) throw new Error(`${file} reaches for ${recording[0]}. No recording of a voice is made or kept, on the phone or anywhere else — assistant.json's no-audio-kept refusal — and that is enforced by the API not being here at all.`);
 const speech = code.match(IOS_SPEECH);
 if(speech && file !== IOS_VOICE) throw new Error(`${file} reaches for ${speech[0]}. The microphone and the recogniser live in ${IOS_VOICE} and nowhere else, so there is one file to read to know when this app can hear.`);
}
const iosVoice = gilbertCode(read(IOS_VOICE));
if(!/requiresOnDeviceRecognition\s*=\s*true/.test(iosVoice) || /requiresOnDeviceRecognition\s*=\s*false/.test(iosVoice)) throw new Error(`${IOS_VOICE} does not set requiresOnDeviceRecognition = true. Without it Apple's recogniser sends the audio to Apple's servers whenever it thinks that would be better.`);
if(!/supportsOnDeviceRecognition/.test(iosVoice)) throw new Error(`${IOS_VOICE} never asks supportsOnDeviceRecognition. A phone that cannot recognise English offline must be told so in the contract's words, not have its request fail silently or go to a server.`);
const iosWrites = iosVoice.match(/\.write\(to:|FileManager|FileHandle|OutputStream|UserDefaults|NSKeyedArchiver/);
if(iosWrites) throw new Error(`${IOS_VOICE} reaches for ${iosWrites[0]}. Nothing Gilbert hears is written anywhere: the transcript lives for the conversation, in memory.`);
const iosInit = (iosVoice.match(/\binit\(\)[\s\S]*?\n    }/) ?? [''])[0];
if(/request(Authorization|RecordPermission)/.test(iosInit)) throw new Error(`${IOS_VOICE} asks for permission when it is created. The microphone is asked for the first time somebody taps to talk, after the contract's explanation, never when a screen opens.`);
for(const file of ['apps/ios/MyThuso/MyThusoApp.swift', 'apps/ios/MyThuso/Features/HomeView.swift']) {
 if(/GilbertListener|requestAuthorization|requestRecordPermission/.test(gilbertCode(read(file)))) throw new Error(`${file} touches Gilbert's listener or a permission request. Nothing is asked at launch or on the home screen; the Gilbert screen asks on first use.`);
}
/* The microphone and waveform symbols, only where Gilbert is. waveform.path.* is the ECG trace on the
   clinical charts and is a picture of a heartbeat. */
for(const file of iosSources) {
 if(file === assistant || file === IOS_VOICE) continue;
 for(const literal of swiftLiterals(read(file))) {
  if(/^(mic|waveform)(\.|$)/.test(literal) && !literal.startsWith('waveform.path')) throw new Error(`${file} draws the symbol "${literal}". A listening symbol belongs only on Gilbert's screen, where it is drawn only while voice is available. ${voice.neverSoften}`);
 }
}

/* ---- Android: on-device recogniser only, on 12 and later, and no recorder anywhere ----------- */
const ANDROID_ROOT = 'apps/android/app/src/main/java/za/co/mythuso';
const ANDROID_VOICE = `${ANDROID_ROOT}/ui/GilbertVoice.kt`;
for(const file of native.filter(f => f.endsWith('.kt'))) {
 const code = gilbertCode(read(file));
 const recorder = code.match(/\b(MediaRecorder|AudioRecord|MediaMuxer)\b/);
 if(recorder) throw new Error(`${file} reaches for ${recorder[0]}. No recording of a voice is made or kept; on Android that is enforced by the recorder APIs not being here at all.`);
 const speech = code.match(/\b(SpeechRecognizer|RecognitionListener|RecognizerIntent)\b/);
 if(speech && file !== ANDROID_VOICE) throw new Error(`${file} reaches for ${speech[0]}. Speech recognition lives in ${ANDROID_VOICE} and nowhere else.`);
 if(/RECORD_AUDIO/.test(code) && !/Data\.kt$/.test(file) && ![ANDROID_VOICE, `${ANDROID_ROOT}/ui/GilbertScreens.kt`].includes(file)) throw new Error(`${file} names RECORD_AUDIO. The permission is asked for by Gilbert's screen the first time somebody taps to talk, and nowhere else — never at launch.`);
}
const androidVoice = gilbertCode(read(ANDROID_VOICE));
for(const [needed, why] of [
 [/createOnDeviceSpeechRecognizer\(/, 'the recogniser must be the on-device one; createSpeechRecognizer may send audio to a server'],
 [/isOnDeviceRecognitionAvailable\(/, 'a phone without on-device English must be told so in the contract\'s words'],
 [/Build\.VERSION_CODES\.S\b/, 'below Android 12 there is no on-device recogniser, and voice is unavailable rather than routed elsewhere'],
 [/EXTRA_PREFER_OFFLINE/, 'the request asks for offline recognition explicitly']
]) if(!needed.test(androidVoice)) throw new Error(`${ANDROID_VOICE} does not contain ${needed.source}: ${why}.`);
const androidElsewhere = androidVoice.match(/createSpeechRecognizer\(|startActivity|FileOutputStream|openFileOutput|\bFile\(|getExternal\w*|SharedPreferences|DataStore/);
if(androidElsewhere) throw new Error(`${ANDROID_VOICE} reaches for ${androidElsewhere[0]}. Speech goes to the on-device recogniser and the words to the screen, and nothing else: no server recogniser, no recognition activity and nothing written down.`);

/* ---- The web: no way of hearing at all, and the orb's name is the contract's ---------------- */
const WEB_HEARING = /\b(getUserMedia|mediaDevices|webkitSpeechRecognition|SpeechRecognition|MediaRecorder|AudioContext|webkitAudioContext|AudioWorklet\w*|createMediaStreamSource)\b/;
for(const file of files('apps/web/src').filter(f => /\.(ts|tsx)$/.test(f))) {
 const code = gilbertCode(read(file));
 const hearing = code.match(WEB_HEARING);
 if(hearing) throw new Error(`${file} reaches for ${hearing[0]}. The web has no microphone in this release: a browser's speech recognition sends a voice to the browser's maker, and the founder decided Gilbert on the web is typed to. ${voice.neverSoften}`);
 if(/['"`]listening['"`]|\bListening\b|\b(tap|hold|press) to (talk|speak)\b/i.test(code)) throw new Error(`${file} says Listening, or offers to. Nothing on the web listens, so no word on it may say or imply that it does.`);
}
const launcherLabel = (read('apps/web/src/components/AssistantLauncher.tsx').match(/className="as-launcher" aria-label="([^"]+)"/) ?? [])[1];
if(launcherLabel !== gilbertContract.identity.callToAction) throw new Error(`The floating orb on the web is called "${launcherLabel}", and the contract's call to action is "${gilbertContract.identity.callToAction}". It is typed there only to keep the contract out of the patient's first load, and it is held to the contract here instead.`);
if(!/\{silenceIsNotSafety\}/.test(read('apps/web/src/features/Assistant.tsx')) || !/<NotConnected of="voice"\/>/.test(read('apps/web/src/features/Assistant.tsx'))) throw new Error('apps/web/src/features/Assistant.tsx no longer renders the voice notice and silenceIsNotSafety beside the conversation.');

/* ---- Wave 1 review fixes, 14 September 2026 ------------------------------------------------ */

/* The matcher reads word forms and reads everything. The fixtures in the contract are what every
   platform's tests run; this makes sure each platform's tests still do, and that the contract still
   says the things the fixes rest on. */
const readEverything = gilbertContract.matcher.readEverything;
if(!readEverything?.statement || !readEverything?.why || !readEverything.neverWithUnread?.includes('settled') || !readEverything.filler?.length) throw new Error('packages/catalog/assistant.json has lost matcher.readEverything, its reason, its filler list or "settled" from neverWithUnread. Without it a missed emergency word is followed by a calm answer, which is the defect the Wave 1 review found.');
if(!Number.isInteger(gilbertContract.matcher.maxGap) || gilbertContract.matcher.maxGap < 1) throw new Error('matcher.maxGap is missing or zero, so "my chest feels tight" no longer matches "chest tight".');
if(!gilbertContract.answers.unread?.sentence || gilbertContract.answers.unread.state === 'idle' || gilbertContract.answers.unread.numbers?.[0] !== 'ambulance') throw new Error('The unread answer is missing, calm, or does not lead with the ambulance. Words Gilbert could not read are exactly where a missed emergency is.');
const fixtureKinds = new Set(['emergency', 'answer', 'answer-and-unread', 'unmatched']);
if(!gilbertContract.fixtures?.stems?.length || !gilbertContract.fixtures?.messages?.length) throw new Error('packages/catalog/assistant.json has no shared fixtures, so nothing proves the three matchers agree.');
for(const fixture of gilbertContract.fixtures.messages) {
 if(!fixtureKinds.has(fixture.expect)) throw new Error(`Fixture "${fixture.says}" expects "${fixture.expect}", which no platform reports.`);
 if(fixture.question && !gilbertContract.questions.some(q => q.id === fixture.question)) throw new Error(`Fixture "${fixture.says}" names a question that does not exist.`);
 for(const group of fixture.groups ?? []) if(!gilbertWords.groups.some(g => g.id === group)) throw new Error(`Fixture "${fixture.says}" names an emergency group that does not exist.`);
}
for(const [file, needs, why] of [
 ['tests/assistant.spec.ts', /fixtures\.messages[\s\S]*fixtures\.stems|fixtures\.stems[\s\S]*fixtures\.messages/, 'the web runs the shared fixtures in Playwright'],
 ['apps/ios/MyThuso/Models/Assistant.swift', /static func selfTest\(\)[\s\S]*stemFixtures[\s\S]*messageFixtures/, 'iOS runs the shared fixtures in its debug self-test'],
 ['apps/ios/MyThusoUITests/AssistantTests.swift', /-GilbertSelfTest/, 'the iOS UI tests read the self-test'],
 ['apps/android/app/src/test/java/za/co/mythuso/GilbertFixturesTest.kt', /GilbertData\.stemFixtures[\s\S]*GilbertData\.messageFixtures/, 'Android runs the shared fixtures in a JVM test']
]) {
 if(!existsSync(file) || !needs.test(read(file))) throw new Error(`${file} no longer shows that ${why}. Three matchers that are never run against one list are three matchers that disagree about an emergency.`);
}

/* The descriptor never travels without its disclosure. */
const { descriptor, disclosure, descriptorLine } = gilbertContract.identity;
if(!descriptorLine?.includes(descriptor) || !descriptorLine.includes(disclosure) || !/not a person/.test(disclosure) || !/not a doctor/.test(disclosure)) throw new Error('identity.descriptorLine no longer carries "Your Thuso AI Doctor" together with the disclosure that Gilbert is not a person and not a doctor.');
for(const [file, bare] of [
 ...files('apps/web/src').filter(f => /\.(ts|tsx)$/.test(f)).map(f => [f, /\bidentity\.descriptor\b(?!Line)|\bdescriptor\s*\}/]),
 ...iosSources.filter(f => !/Data\.swift$/.test(f)).map(f => [f, /\bGilbert\.descriptor\b(?!Line)/]),
 ...native.filter(f => f.endsWith('.kt') && !/Data\.kt$/.test(f)).map(f => [f, /\bGilbertData\.descriptor\b(?!Line)/])
]) {
 if(bare.test(gilbertCode(read(file)))) throw new Error(`${file} shows or speaks Gilbert's descriptor on its own. ${gilbertContract.identity.descriptorRule}`);
}
for(const phrase of [descriptor]) {
 for(const file of [...files('apps/web/src').filter(f => /\.(ts|tsx)$/.test(f)), ...handWrittenNative]) {
  if(gilbertCode(read(file)).includes(phrase)) throw new Error(`${file} types "${phrase}". It is rendered from descriptorLine, which carries the disclosure; a typed copy is the name without the correction.`);
 }
}

/* The keyboard's microphone is the keyboard's. What the app controls is off, and the rest is said. */
const webPanel = read('apps/web/src/features/Assistant.tsx');
for(const input of webPanel.match(/<input\b[\s\S]*?\/>/g) ?? []) {
 for(const [attribute, why] of [[/spellCheck=\{false\}/, 'spell-check, which some browsers send to a server'], [/autoCorrect="off"/, 'autocorrect'], [/autoComplete="off"/, 'autocomplete history']]) {
  if(!attribute.test(input)) throw new Error(`apps/web/src/features/Assistant.tsx has a text field that leaves ${why} on. The contract says the web only reads what is typed.`);
 }
}
if(!/conversation\.webKeyboardNote/.test(webPanel)) throw new Error('apps/web/src/features/Assistant.tsx no longer says, beside the field, that a browser or keyboard dictation is theirs and not Gilbert\'s.');
const iosScreen = gilbertCode(read(assistant));
const iosFields = iosScreen.match(/TextField\([\s\S]*?(?=\n\s*\n|\n\s*(?:private |fileprivate |\}))/g) ?? [];
if(!iosFields.length || iosFields.some(field => !/\.autocorrectionDisabled\(true\)/.test(field))) throw new Error(`${assistant} has a text field without .autocorrectionDisabled(true).`);
if(!/Gilbert\.conversation\.keyboardNote/.test(iosScreen)) throw new Error(`${assistant} no longer says, beside the field, that the keyboard's microphone belongs to the keyboard and may send speech to its maker.`);
const androidScreen = gilbertCode(read(`${ANDROID_ROOT}/ui/GilbertScreens.kt`));
const androidFields = androidScreen.match(/OutlinedTextField\([\s\S]*?\n\s{12}\)/g) ?? [];
if(!androidFields.length || androidFields.some(field => !/keyboardOptions = plainKeyboard\(/.test(field)) || !/autoCorrectEnabled = false/.test(androidScreen)) throw new Error('apps/android/.../ui/GilbertScreens.kt has a text field that leaves autocorrection on.');
if(!/GilbertData\.conversation\.keyboardNote/.test(androidScreen)) throw new Error('apps/android/.../ui/GilbertScreens.kt no longer says, beside the field, that the keyboard\'s microphone belongs to the keyboard.');

/* iOS: Listening cannot outlive the microphone, and every request is made on-device by one helper. */
for(const notification of ['AVAudioSession.interruptionNotification', 'AVAudioSession.routeChangeNotification', 'AVAudioEngineConfigurationChange']) {
 if(!iosVoice.includes(notification)) throw new Error(`${IOS_VOICE} does not observe ${notification}. A call, Siri or a headset can take the microphone while the screen goes on saying Listening.`);
}
if(!/SceneNote\(text: Gilbert\.voice\.interrupted\)/.test(gilbertCode(read(assistant)))) throw new Error(`${assistant} no longer says why listening stopped when the phone took the microphone.`);
const constructions = [...iosVoice.matchAll(/SF\w*RecognitionRequest\s*\(/g)];
const helper = iosVoice.match(/static func onDeviceRequest\(\)[^{]*\{([\s\S]*?)\n    \}/);
if(/SFSpeechURLRecognitionRequest/.test(iosVoice)) throw new Error(`${IOS_VOICE} names SFSpeechURLRecognitionRequest. Nothing here recognises a file, because nothing here keeps one.`);
if(constructions.length !== 1 || !helper || !/SFSpeechAudioBufferRecognitionRequest\s*\(\)/.test(helper[1]) || !/requiresOnDeviceRecognition\s*=\s*true/.test(helper[1])) throw new Error(`${IOS_VOICE} constructs ${constructions.length} recognition request(s), or not inside onDeviceRequest() beside requiresOnDeviceRecognition = true. One helper makes every request, so none can be added that forgets.`);

/* Android: no speech activity, no speech action and no voice interaction, anywhere. */
const ANDROID_SPEECH_BYPASS = /\b(ACTION_RECOGNIZE_SPEECH|ACTION_WEB_SEARCH|ACTION_VOICE_SEARCH_HANDS_FREE|getVoiceDetailsIntent|VoiceInteraction\w*|ACTION_VOICE_COMMAND)\b|"[^"\n]*android\.speech[^"\n]*"/;
for(const file of native.filter(f => /\.(kt|xml)$/.test(f))) {
 const bypass = gilbertCode(read(file)).match(ANDROID_SPEECH_BYPASS);
 if(bypass) throw new Error(`${file} reaches for ${bypass[0]}. A recognition action starts whichever speech activity the phone has, which is usually a server; only the on-device recogniser in ${ANDROID_VOICE} may hear anybody.`);
}

/* Web: a file picker is a microphone too. */
for(const file of files('apps/web/src').filter(f => /\.(ts|tsx)$/.test(f))) {
 const code = gilbertCode(read(file));
 const picker = code.match(/<input\b[^>]*\bcapture\b[^>]*>|accept\s*[=:]\s*[{'"`][^}'"`]*\b(audio|video)\b/);
 if(picker) throw new Error(`${file} offers ${picker[0].slice(0, 60)}. A file input that accepts audio or captures from a device is a recorder, and the web has no microphone in this release.`);
}

/* One visit, one day. Gilbert answered "When is my nurse coming?" with the first day scheduling.json
   offers while the home card showed the visit actually booked — two dates for the same visit on the
   same phone. Every platform now writes Gilbert's visit with the home card's own formatter, from the
   same first booked visit, and none of them asks the calendar what it could offer instead. */
if(!gilbertContract.situations.find(s => s.id === 'visit')?.sentence.includes('{visitWhen}') || !gilbertContract.visitStates?.none || !gilbertContract.visitStates?.pending) throw new Error('packages/catalog/assistant.json no longer writes the visit situation from {visitWhen} with a sentence for nothing booked and for a nurse still being found. Gilbert would be naming a day the home card does not.');
for(const [file, from, why] of [
 ['apps/web/src/lib/assistant.ts', /shortWhenText\(visit\)/, 'the web matcher'],
 ['apps/ios/MyThuso/Models/Assistant.swift', /visit\.shortWhenText/, 'the iOS matcher'],
 ['apps/android/app/src/main/java/za/co/mythuso/model/Assistant.kt', /visit\.shortWhenText/, 'the Android matcher']
]) {
 const code = gilbertCode(read(file));
 if(/offeredDays/.test(code) || !from.test(code)) throw new Error(`${file} does not write Gilbert's visit with shortWhenText, or asks offeredDays for a day. ${why} must name the visit the home card names, written the way the home card writes it.`);
}
for(const [file, passes, why] of [
 ['apps/web/src/App.tsx', /<AssistantLauncher\b[^>]*visit=\{booked\[0\]\?\.visit/, 'the web shell must give Gilbert the booked visit the dashboard gets'],
 ['apps/web/src/features/Assistant.tsx', /send\(turns, draft, visit\)[\s\S]*|choose\(turns, question, visit\)/, 'the web panel must pass that visit to the matcher'],
 [assistant, /visit: store\.visits\.first\b/, 'the iOS screen must pass the store\'s first visit, which HomeView shows'],
 [`${ANDROID_ROOT}/ui/GilbertScreens.kt`, /store\.visits\.firstOrNull\(\)/, 'the Android sheet must pass the store\'s first visit, which the home shows']
]) {
 if(!passes.test(gilbertCode(read(file)))) throw new Error(`${file}: ${why}. Without it Gilbert and the home card read two different visits.`);
}

/* The emergency terms as a configuration, and the two founder decisions nobody re-litigates by edit.

   The version and the changelog move together. The changelog is replayed from nothing — every entry's
   added terms put in, every removed term taken out, and each removal must name a term that was there —
   and what it builds must be exactly the terms in the file, with the latest entry carrying that set's
   hash. So a term added, changed or deleted without a new entry and a version bump fails here, and so
   does a deletion nobody named. The shared fixtures in assistant.json still have to pass on all three
   matchers, which is what stops a change silencing a listed emergency. The false positives are the one
   list allowed to fail softly: the tests report them and nothing blocks on them. */
const termHash = lines => createHash('sha256').update([...lines].sort().join('\n')).digest('hex').slice(0, 16);
const termLines = groups => groups.flatMap(g => g.words.map(w => `${g.id}: ${w}`));
if(!Number.isInteger(gilbertWords.version) || gilbertWords.version < 1 || !gilbertWords.status || gilbertWords.acceptedBy?.role !== 'Founder' || !/^\d{4}-\d{2}-\d{2}$/.test(gilbertWords.acceptedBy?.on ?? '') || !gilbertWords.clinicalReview?.why) throw new Error('packages/catalog/gilbert-emergency-terms.json has lost its version, its status, who accepted it and when, or why its clinical review matters.');
const changelog = gilbertWords.changelog ?? [];
const built = new Set();
changelog.forEach((entry, index) => {
 if(entry.version !== index + 1 || !/^\d{4}-\d{2}-\d{2}$/.test(entry.on ?? '') || !entry.by || !entry.why || !Array.isArray(entry.added) || !Array.isArray(entry.removed)) throw new Error(`Changelog entry ${index + 1} of the emergency terms is not version ${index + 1} with a day, who made it by role, what was added, what was removed and why.`);
 for(const term of entry.removed) {
  if(!built.has(term)) throw new Error(`Emergency terms version ${entry.version} removes "${term}", which was not in the list it was removed from.`);
  built.delete(term);
 }
 for(const term of entry.added) {
  if(built.has(term)) throw new Error(`Emergency terms version ${entry.version} adds "${term}", which was already there.`);
  built.add(term);
 }
 if(entry.termsHash !== termHash(built)) throw new Error(`Emergency terms version ${entry.version} records the hash ${entry.termsHash}, and the list its changelog builds hashes to ${termHash(built)}.`);
});
const current = new Set(termLines(gilbertWords.groups));
const unrecorded = [...current].filter(term => !built.has(term));
const unnamedRemovals = [...built].filter(term => !current.has(term));
if(unrecorded.length || unnamedRemovals.length) throw new Error(`packages/catalog/gilbert-emergency-terms.json changed without a changelog entry: ${unrecorded.length ? `added ${unrecorded.join(', ')}` : ''}${unrecorded.length && unnamedRemovals.length ? '; ' : ''}${unnamedRemovals.length ? `removed ${unnamedRemovals.join(', ')} without naming them` : ''}. Raise the version, record the change, and put in the new list's hash, ${termHash(current)}.`);
if(changelog.at(-1)?.version !== gilbertWords.version) throw new Error(`The emergency terms say version ${gilbertWords.version} and the changelog ends at version ${changelog.at(-1)?.version}. The version and the changelog move together.`);
if(gilbertWords.falsePositives?.blocking !== false || !gilbertWords.falsePositives?.messages?.length) throw new Error('The emergency terms\' false positives are missing, or marked blocking. They are reported so an over-trigger can be tuned out, and never stop a build.');
/* Each platform must actually run the false positives through its matcher, not only mention them: a
   report that names the list and counts it without matching anything says nothing. */
for(const [file, reports] of [
 ['tests/assistant.spec.ts', /falsePositives\.messages\.filter\([\s\S]{0,120}?lib\.emergencyGroupsIn\(/],
 ['apps/ios/MyThusoUITests/AssistantTests.swift', /staticTexts\["gilbert-false-positives"\]/],
 ['apps/ios/MyThuso/Models/Assistant.swift', /falsePositiveFixtures\.filter\s*\{\s*!emergencyGroups\(in:/],
 ['apps/android/app/src/test/java/za/co/mythuso/GilbertFixturesTest.kt', /GilbertData\.falsePositiveFixtures\.filter\s*\{\s*Gilbert\.emergencyGroups\(/]
]) {
 if(!reports.test(read(file))) throw new Error(`${file} no longer reports the emergency terms' false positives. Nothing blocks on them, and nothing may silently stop saying them either.`);
}
const listening = gilbertContract.voice.listeningDecision;
if(listening?.decidedBy !== 'Founder' || listening.maxListeningSeconds !== gilbertContract.voice.maxListeningSeconds || listening.gesture !== gilbertContract.voice.gesture) throw new Error(`voice.maxListeningSeconds or voice.gesture no longer matches the founder's decision of ${listening?.on ?? '14 September 2026'} (${listening?.maxListeningSeconds} seconds, ${listening?.gesture}). Changing either is the founder's decision, recorded in listeningDecision, not an edit.`);
const descriptorDecision = gilbertContract.identity.descriptorDecision;
if(descriptorDecision?.decidedBy !== 'Founder' || descriptorDecision.value !== gilbertContract.identity.descriptorLine) throw new Error(`identity.descriptorLine no longer matches the founder's decision of ${descriptorDecision?.on ?? '14 September 2026'}: "${descriptorDecision?.value}". Changing it is the founder's decision, recorded in descriptorDecision, not an edit.`);

/* ---- Listening, in words, only from the contract ------------------------------------------ */
const LISTENING_WORDS = /\blisten(s|ing)?\b|\b(tap|hold|press|touch|swipe) to (speak|talk|record|dictate)\b|\bspeak now\b/i;
for(const file of handWrittenNative) {
 for(const literal of swiftLiterals(read(file))) {
  if(PULSE_ORDER.includes(literal)) continue; /* a state's id, which is the contract's own word, read by id */
  if(LISTENING_WORDS.test(literal)) throw new Error(`${file} types "${literal}". The words Listening and tap to talk are the contract's — the Listening state and voice.sentences in packages/catalog/assistant.json — and a typed copy is a listening affordance nobody can switch off with the rest.`);
 }
}

console.log(`Checked ${native.length} native source files: no WebViews. Web demo storage/content, native service catalogue, clinical reference ranges, locales, demo codes, hero banner copy and shared illustrations are consistent across web, iOS and Android. Design tokens, the vetting table — ${vetting.roles.length} roles, ${vetting.roles.reduce((t,r)=>t+r.checks.length,0)} checks and every refusal sentence — and the record contract — ${records.records.length} record types, ${records.consultation.sections.length} consultation sections and every summary — are generated into CSS, Swift and Kotlin, and every generated file matches its source. Coordinate refusals and the numbers an arrival estimate is built from agree across all three. No payout line names its own amount for a visit, and the share the public page advertises is the share the catalogue pays. On the emergency pathway the only numbers that exist are ${SA_EMERGENCY_NUMBERS.map(([, n]) => n).join(', ')}, the ${sos.redFlags.conditions.length} conditions that end the questions are all present, every one of the ${sos.failures.length} failures says what to do instead, every coverage area is a zone dispatch can reach, and all three screens show the ambulance number before anything MyThuso sells. No teleconsultation screen touches a camera or a microphone, the connection ladder never permits more on a worse line than on a better one, and not one of the ${teleconsult.outcomes.filter(o => !o.countsAsConsultation).length} encounter outcomes that is not a consultation may write an assessment, a plan or a charge. The consent contract — ${consent.purposes.length} purposes, ${requiredCount} of them required, ${consent.lawfulBases.length} lawful bases and every refusal, withdrawal and retention sentence — is read rather than restated by the web app and the service, both sides build the consent fingerprint from the same thing, sign-up marks exactly the ${requiredCount} required ones as required, both consent ledgers are append-only, and the access log has no column a reading could go in \u2014 it is refused by identifier now rather than by grepping the prose around a schema, so a table about access to clinical records may be called what it is. Every entry in that log hashes onto the one before it and its head is committed into the gate's keyed chain by a module the consent register holds two methods of and cannot otherwise reach. The locale contract — ${localeContract.locales.length} written languages over ${localeContract.keys.length} keys and ${localeContract.sets.length} sets — is generated into Swift and Kotlin and read directly by the web: every locale carries every key of every set it claims and nothing outside them, no locale is presented as reviewed without naming who read it and when, no string in it is a sentence out of a clinical contract, clinicalLocale() is present on all three platforms, and every language picker shows the reader that ${localeContract.locales.filter(l => l.review.state !== 'source').length} of them have been read by nobody who speaks them. ${signLanguage.short} is not in that list, its ${signLanguage.mustNeverHappen.length} refusals are rendered from the contract, and the interpreter it needs is the one already on the teleconsultation roster. That interpreter is now a vetted party with ${interpreterRole.checks.length} checks of their own and one capability, granted nothing that opens a record; ${interpreting.roster.length} of them carry hours rather than a conclusion, so all three platforms work out for themselves which hour answers a request and all three can still return nothing — a visit with no interpreter is held rather than dispatched and carries the contract's own word for it on all three, cancelling one costs ${interpreting.cancellation.fee} and is recorded against ${interpreting.cancellation.attributedTo} rather than the patient, and the ${interpreting.refusals.length} refusals — a family member, a child, English written at somebody — are on the screen rather than only in the file. Substitution is held to section 22F of the Medicines and Related Substances Act 101 of 1965: the four statutory exceptions are all in the register in the Act's own order, no item that must not be substituted was, no substitution changes the molecule or the strength, every one of the ${dispensing.prescription.items.length} items carries the words said to the patient, the pharmacist who signed one carries a registration in the format the vetting register holds them to, and the chronic authorisation is boxed by a period and a quantity, ends in a review, and writes its expiry down nowhere — all three platforms work it out from the same ${MONTH_IN_DAYS}-day month. An employer's programme report is suppressed here as well as in the three apps: no group under ${suppressionFloor.minimumCohort} people is reported, no group where one answer covers ${Math.round(suppressionFloor.dominanceCeiling * 100)}% of it is reported, no report leaves exactly one group hidden, and in none of the ${programmes.programmes.length} programmes do the published groups add up to the published total — because if they did, every suppression above could be undone by subtracting. Gilbert listens only where the founder said it may: the audio and speech APIs live in one file per phone, which asks for on-device recognition and writes nothing down, the web reaches for no way of hearing at all, no listening word is typed outside the contract, the ${gilbertWords.groups.length} emergency term groups of version ${gilbertWords.version} only ever raise and change only with a changelog entry, the screen renders the voice capability's notice from the contract rather than a sentence of its own, and none of the ${capabilities.capabilities.length} capabilities has its notice typed into a hand-written native file. The ingestion boundary is ${feedContract.feeds.length} doors and every one of them is locked: each names the capability whose sentence it answers with, points at the sample data that stands in for it, carries ${feedContract.feeds.reduce((t,f)=>t+f.beforeSwitchOn.length,0)} conditions that must be true before it may be switched on — every one of which a connected capability is now held to — and refuses ${feedContract.feeds.reduce((t,f)=>t+f.neverAccepts.length,0)} named fields it must never be sent, none of which any other feed accepts; every capability is either served by one or carries a written reason there is no seam, no route is typed into the server by hand, no refusal sentence is typed into the service, and nothing behind them answers in the two hundreds. The table that would settle whether the caller limit is the right number holds five integers per window and no column anybody could be identified by, and the health routes that read it answer the loopback by path rather than by method — which is now checked in both directions, because the first POST under that prefix would otherwise have been public. The chain witness renders a head to be carried off the machine and checks one back; it reaches no network and says on its own face that publishing is still absent. Colour contrast is computed rather than eyeballed: ${contrast.pairs.length} foreground/background pairs clear WCAG 2.2 AA, and ${contrast.knownFailures.length ? `each of the ${contrast.knownFailures.length} that do not is parked with a measured replacement that does` : 'none of them fails'}. Three bodies of prose that were written out once per platform are contracts now: the ${explanations.entries.length} reading explanations and their ${Object.keys(explanations.provenance).length} provenance sentences in records.json, where every urgent condition is a red flag sos.json actually has, no paragraph names a number, the ordinary cause is said before the frightening one and the oximeter still admits it reads high on darker skin; the ${arrivalProse.length} arrival refusals in geography.json, with the day of the visit enforced by arithmetic on all three platforms rather than by the sentence that describes it; and what the offline queue survives in capture.json, where ${fileStores.length} file-backed stores are held to one promise and the web's is held to keeping less. What a store says when the disk refuses it is a contract now too: ${writeFailures.failures.length} failures over ${outcomeNames.size} outcomes, no two of them leaving the same set true, every one of them leaving nothing deleted, none of them offered by a store with no disk to be refused by — and the ${SILENT_ABOUT_WRITE_FAILURE.length} file stores that have no sentence for a full phone and the one screen that quarantines a file without saying so are written down as gaps rather than left to be found again. Not one of those ${prosePlaces.reduce((total, place) => total + place.sentences.length, 0)} sentences is typed into a hand-written file outside the ${PROSE_QUARANTINE.length} quarantined copies waiting to adopt them, and each of those quarantines fails the build on the day it is no longer needed. And a workspace may not type the figure at the top of it: all ${METRIC_STRIPS.length} metric strips are read for a digit inside a literal, ${TYPED_FIGURES.length} figures are excused because no list on their screen could count them, and the ${FIGURE_QUARANTINE.reduce((total, [, count]) => total + count, 0)} that are typed over a list that could are ratcheted so that neither a new one nor a half-finished fix goes unnoticed. What that cannot see — whether a counted figure counts the right rows — is what tests/workspace-counts.spec.ts opens a browser for.`);

/* The money and identity seams report separately, as their own line, so that three agents adding
   simulators to three different seams are appending lines rather than editing one sentence. */
console.log(`${simulationFiles.filter(([f]) => !/\/(index|contract|suppliers|care)\.ts$/.test(f)).length} simulated suppliers stand behind ${[...standingIn].length} capabilities — ${[...standingIn].sort().join(', ')} — and each of them is held to what it will not do: every one of the ${[...standingIn].reduce((total, id) => total + refusesOf(id).length, 0)} refusals those capabilities write down is enforced in apps/api/src/simulation, in the contract's own words, chosen by a selector that matches exactly one sentence. None of them opens a socket or writes a file, none of them holds anything with the shape of a card number, the simulated one-time code is the length and the life apps/api/src/config.ts gives the real one, the browser reaches them through one module and the status page reads its notices through the accessor that knows about the third state.`);
/* The care and dispatch seams, in numbers. Its own line rather than a clause in the summary above,
   for the same reason its checks are their own block: three seams are being simulated at once and a
   sentence three people are editing is a sentence three people conflict over. */
console.log(`Four of them stand behind four of those doors and none of them is reachable from the request path: ${careRoster.nurses.length} fictional nurses over ${careZoneNames.size} suburbs, ${careSimulators.reduce((total, [id]) => total + capabilities.capabilities.find(c => c.id === id).simulation.refuses.length, 0)} refusals enforced in the contract's own words and typed into no simulator, a shift computed from the ${careSlots.length} hours the product offers and the ${careLongest}-minute longest visit it sells rather than from two times somebody wrote down, ${careRoster.nurses.filter(n => !careZoneNames.has(n.zone.toLowerCase())).length} nurses outside phase one and ${careRoster.nurses.filter(n => !n.sharesPosition).length} whose phone is telling nobody anything — so every one of those refusals is something a person can open the app and see. Nothing in the directory calls Math.random, nothing in it reaches for a camera or a microphone, and the teleconsultation capability still declares no permission for either app to ask for.`);

/* ─── The shop and the points ──────────────────────────────────────────────────────────────────
   Two contracts, one kernel, and a set of invariants that are worth more than the feature.

   A loyalty scheme bolted onto healthcare is a machine for producing quiet harms, and every one of
   them is a line of code somebody wrote for a good reason: a discount that happens to apply to a
   medicine, a points history that happens to name a condition, a tier that happens to correlate
   with a suburb, a nurse scoreboard that happens to feed dispatch. None of those arrives announced.
   They arrive as a helpful increment to something that already exists, which is why the checks
   below are about arithmetic and absence rather than about sentences. */
const shopContract = JSON.parse(read('packages/catalog/shop.json'));
const rewardsContract = JSON.parse(read('packages/catalog/rewards.json'));
const dispensingContract = JSON.parse(read('packages/catalog/dispensing.json'));

/* 1. Nothing in the shop is a medicine, checked three ways: the never-sold vocabulary, the absence
      of any field a medicine would need to describe itself, and the dispensing contract's own item
      list — because the pharmacy side of this product already knows what a medicine is called and
      the shop must not be allowed to disagree with it. */
const MEDICINE_FIELDS = ['treats', 'claims', 'indication', 'schedule', 'prescription', 'activeIngredient', 'strength'];
const dispensedNames = JSON.stringify(dispensingContract).toLowerCase();
for (const product of shopContract.products) {
 const haystack = `${product.id} ${product.name} ${product.does}`.toLowerCase();
 const word = shopContract.neverSold.find(w => haystack.includes(w.toLowerCase()));
 if (word) throw new Error(`The shop lists "${product.id}", which matches the never-sold word "${word}". Supplying medicine is a licensed activity under the Medicines and Related Substances Act 101 of 1965; this shop does not do it, and this check is what keeps that true as the catalogue grows.`);
 for (const field of MEDICINE_FIELDS) if (field in product) throw new Error(`The shop product "${product.id}" carries a "${field}" field. That is a field only a medicine needs, and a shop listing states what a thing does and never what it treats.`);
 if (dispensedNames.includes(`"${product.id}"`)) throw new Error(`The shop product "${product.id}" also appears in packages/catalog/dispensing.json. An item cannot be both something a pharmacist dispenses against a prescription and something a person puts in a basket.`);
}

/* 2. Section 18A of the Medicines and Related Substances Act 101 of 1965 — no medicine supplied
      under a bonus, rebate or incentive scheme. Two halves: no earning reason may be about taking
      or collecting a drug, and the kernel's own arithmetic must make a medicine earn and redeem
      nothing. The second half is checked by reading the engine, because a comment saying it does
      is not the same as a line doing it. */
const s18aReward = /\b(dose|script|refill|adherence|medicine|medication|course)\b/i;
for (const reason of rewardsContract.earnReasons) {
 if (s18aReward.test(`${reason.id} ${reason.name}`)) throw new Error(`The earning reason "${reason.id}" rewards something to do with medicine. Section 18A prohibits supplying a medicine according to a bonus, rebate or any other incentive scheme, and an adherence reward is one no matter which screen it is drawn on.`);
}
const commerceRewards = read('packages/commerce/rewards.ts');
if (!/isMedicine\(/.test(commerceRewards)) throw new Error('packages/commerce/rewards.ts no longer consults isMedicine(). Section 18A is enforced here by arithmetic — a medicine earning zero and redeeming zero — and without that call the shop is one listing away from an incentive scheme attached to a drug.');
if (!/refuse\('refused', 'no-points-on-medicine'\)/.test(commerceRewards)) throw new Error("packages/commerce/rewards.ts no longer refuses a redemption against a medicine with the contract's own sentence.");

/* 3. The ledger is not a clinical record. Every earning reason says what it discloses and what it
      never does, and the kernel writes that field rather than a caller's string — the one line
      below is the whole POPIA surface of this feature, because a points history is read casually,
      shown to family and screenshotted. */
for (const reason of rewardsContract.earnReasons) {
 if (!reason.discloses?.trim() || !reason.never?.trim()) throw new Error(`The earning reason "${reason.id}" does not say what it discloses and what it never does.`);
}
if (!/note: reason\.discloses/.test(commerceRewards)) throw new Error("packages/commerce/rewards.ts no longer writes the reason's own `discloses` sentence into the ledger. A free-text note here is where somebody would eventually write why the visit happened.");

/* 4. Points are not money, and the enforcement is an absence: there is no command that would pay
      anybody, so there is nothing to call by mistake. Checked against the command union itself. */
const commerceTypes = read('packages/commerce/types.ts');
const forbiddenCommands = /'(rewards\.withdraw|rewards\.transfer|order\.pay|order\.charge)'/;
if (forbiddenCommands.test(commerceTypes)) throw new Error('packages/commerce declares a command that pays, withdraws or transfers. A balance that can be cashed out is a deposit, and taking deposits is a licensed activity.');
if (/\b(card|pan|cvv|cvc|expiry)\b/i.test(commerceTypes)) throw new Error('packages/commerce/types.ts names a card field. No payment is taken anywhere in this repository.');

/* 5. A tier is decided by points and by nothing else. The contract lists its inputs exhaustively
      so that this check can be about a list rather than about a reader's judgement. */
if (rewardsContract.tierInputs.length !== 1 || !/points/i.test(rewardsContract.tierInputs[0])) throw new Error('packages/catalog/rewards.json lists more than one tier input. A tier quietly influenced by where somebody lives is redlining with a friendly name — in this country, an area code is a proxy for race.');
const PROTECTED = /\b(race|gender|sex|religion|hiv|status|disability|pregnan|age|nationality|language|suburb|income)\b/i;
for (const tier of rewardsContract.tiers) {
 if (PROTECTED.test(tier.benefit)) throw new Error(`The tier "${tier.id}" names a protected category in its benefit.`);
 if (/\bR\s?\d|\d\s?rand\b/i.test(tier.benefit)) throw new Error(`The tier "${tier.id}" names a currency amount. What a point is worth is randPerPoint and lives in one place.`);
}

/* 6. A tier buys convenience, never care. The words that would mean otherwise are refused in the
      benefit text, because "seen sooner" is the sentence this whole feature must never be able to
      say. */
const CLINICAL_BENEFIT = /\b(sooner|faster|priority|queue|triage|ahead|first in line|urgent)\b/i;
for (const tier of rewardsContract.tiers) {
 if (CLINICAL_BENEFIT.test(tier.benefit)) throw new Error(`The tier "${tier.id}" offers something about how quickly a person is seen. A balance that moves somebody up a clinical queue is care sold by loyalty rather than given by need.`);
}

/* 7. Recognition is not pay and must not reach dispatch or earnings. Checked as an absence across
      the whole kernel: the recognition track is worth no rand at any rate. */
const recognition = rewardsContract.tracks.find(t => t.id === 'recognition');
if (recognition?.redeemable !== false) throw new Error('The nurse recognition track has become redeemable. A nurse\'s income is settled entirely by packages/catalog/earnings.json; a second scoreboard that could be spent is a productivity target wearing a badge.');
const commerceSources = files('packages/commerce').filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
for (const file of commerceSources) {
 const source = read(file);
 if (/\b(payout|dispatch|nurseShare|earnings)\b/i.test(source)) throw new Error(`${file} names payouts, dispatch or earnings. The shop and the points may not reach either: money is packages/catalog/earnings.json and work allocation is the dispatch board.`);
}

/* 8. What a point is worth is stated once. No screen on any platform may restate it — the failure
      mode is the day randPerPoint changes and one screen keeps multiplying by the old number. */
const pointValueScreens = [...files('apps/web/src'), ...files('apps/ios/MyThuso'), ...files('apps/android/app/src/main')]
 .filter(f => /(shop|reward|points)/i.test(f) && /\.(tsx?|swift|kt)$/.test(f) && !/Data\.(swift|kt)$/.test(f));
for (const file of pointValueScreens) {
 const source = read(file);
 if (/\b0\.1\b/.test(source) && !/randPerPoint/.test(source)) throw new Error(`${file} contains the literal rate a point is worth without reading randPerPoint. That number lives in packages/catalog/rewards.json and everything else multiplies.`);
}

/* 9. Delivery reaches exactly as far as a home visit does. A shop that accepts an order it cannot
      fulfil has sold a person a wait, and the coverage list already exists. */
const geographyForShop = JSON.parse(read('packages/catalog/geography.json'));
const coverageNames = new Set(JSON.stringify(geographyForShop).toLowerCase().match(/[a-z]+/g));
const sandboxZones = read('packages/commerce/fixtures.ts').match(/SANDBOX_ZONES = \[([^\]]*)\]/)?.[1] ?? '';
for (const zone of sandboxZones.split(',').map(z => z.trim().replace(/^'|'$/g, '')).filter(Boolean)) {
 if (!coverageNames.has(zone.toLowerCase())) throw new Error(`The shop's sandbox delivers to "${zone}", which is not a coverage area in packages/catalog/geography.json. Delivery is held to the areas a nurse can reach.`);
}

/* 10. Every refusal in both contracts carries its reasoning, and every one of them is rendered by
       the web app rather than paraphrased there. The sentence is what a person reads; the reasoning
       is what stops the next person deleting it. */
for (const refusal of [...shopContract.refusals, ...rewardsContract.refusals]) {
 if (!refusal.sentence?.trim() || !refusal.why?.trim()) throw new Error(`The refusal "${refusal.id}" is missing its sentence or its reasoning.`);
 if (refusal.sentence.length > 200) throw new Error(`The refusal "${refusal.id}" is ${refusal.sentence.length} characters. A refusal a person cannot read in one breath is one they will not read.`);
}

console.log(`The shop sells ${shopContract.products.length} things over ${shopContract.categories.length} categories and not one of them is a medicine — checked against its own never-sold vocabulary, against the ${MEDICINE_FIELDS.length} fields only a medicine would need, and against the dispensing contract's own item list, so the shop cannot become a pharmacy by increments. Section 18A of the Medicines and Related Substances Act 101 of 1965 is arithmetic rather than intention: ${rewardsContract.earnReasons.length} earning reasons and none of them about a dose, a script or a refill, and a kernel that makes a medicine earn zero and redeem zero by consulting isMedicine() rather than by trusting the catalogue. The ledger is not a clinical record — every reason states what it discloses and what it never does, and the kernel writes that sentence rather than a caller's, so a points history says a visit happened and never what it was for. Points are not money, enforced by absence: no command withdraws, transfers, pays or charges, and no field in the kernel has the shape of a card. A tier has exactly ${rewardsContract.tierInputs.length} input, names no protected category and offers nothing about being seen sooner, because a balance that moves somebody up a clinical queue is care sold by loyalty rather than given by need. Nurse recognition is worth nothing at any rate, and no file in packages/commerce may even name a payout, dispatch or earnings. What a point is worth is written once, in randPerPoint, and ${pointValueScreens.length} screens across three platforms are read to make sure none of them has quietly written it down again.`);

/* ==== Plans & Pricing (Wave 1) ===================================================================

   Added by the Plans & Pricing lead on 14 September 2026, the day the founder confirmed that the
   Master Blueprint v4's MyThuso for Mom prices — R399, R749 and R1 299 a month — replace the single
   R249 Thuso Mom the preview carried. Self-contained, so it can be moved or merged without touching
   anything above it.

   A plan price is the number a child in the city is being asked to send home every month, and the
   ways it goes wrong here are all quiet ones: a phone that still says R249 because nobody regenerated
   it, a Thuso Band listed as included on a screen when no Band has been built, "priority SOS" read as
   a parent jumping a queue somebody more unwell is in, or a monthly price mistaken for medical-aid
   cover. Each is checked below, and each was proved to fire by breaking the source and restoring it. */
{
 const momContract = JSON.parse(read('packages/catalog/mom-plans.json'));
 const planModel = JSON.parse(read('packages/catalog/business-model.json'));
 const planCapabilities = new Map(JSON.parse(read('packages/catalog/capabilities.json')).capabilities.map(c => [c.id, c]));
 const stripped = file => read(file).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
 const android = 'apps/android/app/src/main/java/za/co/mythuso';

 /* 0. PlansData is generated, and is compared here rather than in the shared `generated` list above,
       so that this section stays in one piece when branches that also edit this file are merged. The
       comparison is the same one that list makes. It is made against both sources, because either the
       tiers or the business model's other subscription prices can leave the phones stale. */
 const { emitPlans } = await import('./emit-plans.mjs');
 for (const file of emitPlans()) {
  if (!existsSync(file.path)) throw new Error(`${file.path} has not been generated. Run: npm run plans`);
  for (const source of ['packages/catalog/mom-plans.json', 'packages/catalog/business-model.json']) {
   if (statSync(file.path).mtimeMs < statSync(source).mtimeMs) throw new Error(`${file.path} is older than ${source}. Run: npm run plans`);
  }
  if (read(file.path) !== file.content) throw new Error(`${file.path} is not what packages/catalog/mom-plans.json and packages/catalog/business-model.json generate. Either it was edited by hand — it says at the top not to be — or the generator changed. Run: npm run plans`);
 }

 /* 1. Three tiers, each priced once, in the one file. The business model's row names the tier file
       and carries no price of its own, so there is no second number for anything to agree with. */
 const TIERS = ['essential', 'plus', 'premium'];
 if (JSON.stringify(momContract.tiers.map(t => t.id)) !== JSON.stringify(TIERS)) throw new Error(`packages/catalog/mom-plans.json has tiers ${momContract.tiers.map(t => t.id).join(', ')}; the Blueprint confirmed ${TIERS.join(', ')}, in that order.`);
 const tierPrices = momContract.tiers.map(t => t.price);
 if (!tierPrices.every((p, i) => Number.isInteger(p) && p > 0 && (i === 0 || p > tierPrices[i - 1]))) throw new Error(`MyThuso for Mom's prices ${tierPrices.join(', ')} are not whole rands rising from Essential to Premium. A dearer tier that costs less is a typo somebody will be charged.`);
 const momRows = planModel.subscriptions.filter(s => s.tiersIn);
 if (momRows.length !== 1 || momRows[0].id !== 'mom' || momRows[0].tiersIn !== 'mom-plans.json') throw new Error('packages/catalog/business-model.json must have exactly one tiered subscription, `mom`, pointing at mom-plans.json. Tier prices read from a file nobody points at are prices nobody renders.');
 if (momRows[0].price !== null) throw new Error(`packages/catalog/business-model.json gives MyThuso for Mom a price of ${momRows[0].price} beside its three tiers. That is a second copy of a plan price, and the landing page will one day quote it.`);

 /* 2. No rendering types a plan price, on any platform, and every rendering reads the source. The old
       native screens wrote "R199 / month" as strings — the drift that would have kept R249 on both
       phones — so a rand amount beside any subscription price is refused in every plans file, and
       the files dedicated to MyThuso for Mom may not hold the tier numbers even bare. */
 const priced = [...new Set([...planModel.subscriptions.filter(s => s.price !== null).map(s => s.price), ...tierPrices])];
 const randPattern = price => new RegExp(`R\\s?${String(price).replace(/\B(?=(\d{3})+$)/g, '[\\s,]?')}(?![\\d])`);
 const planScreens = {
  /* The panel is a dynamic import. A static one grows the patient's first load for a screen most
     patients will not open that day, which is the cost CLAUDE.md says is paid by the people this is for. */
  'apps/web/src/features/Pages.tsx': [/import\('\.\/MomPlans'\)/, /<MomPlansPanel\/>/, /<NotConnected of="payments"\/>/],
  'apps/web/src/features/MomPlans.tsx': [/from '\.\.\/lib\/mom-plans'/, /<NotConnected of=\{g\.capability\}/],
  'apps/web/src/features/Landing.tsx': [/monthlyPrices\(/],
  'apps/web/src/features/Admin.tsx': [/subscriptionLines\(\)/],
  'apps/web/src/lib/mom-plans.ts': [/mom-plans\.json/],
  'apps/ios/MyThuso/Features/PassportView.swift': [/Plans\.subscriptions/, /MomPlansView\(\)/, /CapabilityNotice\(of: "payments"\)/],
  'apps/ios/MyThuso/Features/MomPlansView.swift': [/Plans\.mom\b/, /CapabilityNotice\(of: group\.capability\)/, /CapabilityNotice\(of: "payments"\)/],
  'apps/ios/MyThuso/Models/Plans.swift': [/PlanSubscription/],
  [`${android}/ui/AccountScreens.kt`]: [/planSubscriptions/, /MomPlanScreen\(\)/],
  [`${android}/ui/MomPlanScreens.kt`]: [/momPlan\b/, /NotConnected\(group\.capability\)/, /NotConnected\("payments"\)/],
  [`${android}/model/Plans.kt`]: [/PlanSubscription/]
 };
 const dedicated = /(MomPlans?|mom-plans|Plans)\.(tsx|ts|swift|kt)$|MomPlanScreens\.kt$/;
 for (const [file, reads] of Object.entries(planScreens)) {
  if (!existsSync(file)) throw new Error(`${file} is missing. It is one of the places a plan price is drawn, and a plans screen that has moved without this list is one nobody is checking.`);
  const code = stripped(file);
  for (const pattern of reads) if (!pattern.test(code)) throw new Error(`${file} no longer does ${pattern}. It is how that screen reads plan prices or the notices beside them from the contracts rather than from itself.`);
  for (const price of priced) {
   if (randPattern(price).test(code)) throw new Error(`${file} types a plan price, R${price}. Plan prices live in packages/catalog/business-model.json and packages/catalog/mom-plans.json, and reach a phone through scripts/emit-plans.mjs — a typed copy is the one that still says R249.`);
  }
  if (dedicated.test(file)) for (const price of tierPrices) {
   if (new RegExp(`(?<![\\w.])${price}(?![\\w.])`).test(code)) throw new Error(`${file} holds ${price}, a MyThuso for Mom tier price, as a literal. Read it from the tiers.`);
  }
 }
 /* And the plan it replaced is gone, rather than drawn beside the three. */
 const everyScreen = [...files('apps/web/src'), ...files('apps/ios/MyThuso'), ...files(`${android}`)].filter(f => /\.(tsx?|swift|kt)$/.test(f));
 for (const file of everyScreen) if (/\bThuso Mom\b/.test(stripped(file))) throw new Error(`${file} still names "Thuso Mom". The founder replaced that R249 plan with MyThuso for Mom on 14 September 2026; a screen offering both is offering a plan nobody sells.`);

 /* 3. Every inclusion names a capability that exists, or is marked available with evidence somebody
       can open. There is no third way for a line on a plan to be shown. */
 for (const tier of momContract.tiers) {
  const ids = new Set();
  for (const item of tier.includes) {
   if (ids.has(item.id)) throw new Error(`Tier "${tier.id}" lists "${item.id}" twice.`);
   ids.add(item.id);
   if (item.available) {
    if (!item.evidence || !existsSync(item.evidence)) throw new Error(`"${item.id}" on ${tier.name} is marked available and its evidence ${JSON.stringify(item.evidence)} is not a file that exists. Available is a claim about the world.`);
    continue;
   }
   if (!item.capability) throw new Error(`"${item.id}" on ${tier.name} names no capability and is not marked available with evidence. A plan line with neither is a promise with nothing beside it.`);
   if (!planCapabilities.has(item.capability)) throw new Error(`"${item.id}" on ${tier.name} depends on capability "${item.capability}", which packages/catalog/capabilities.json does not define — so no notice can be rendered beside it and the screen would stay silent.`);
  }
 }

 /* 4. A device that does not exist is never included. Each of MyThuso's own devices on a plan names
       the device and waits on thuso-devices; while that is not connected, no inclusion and no plans
       screen on any platform may use the word "included" — the heading says "would bring" — and
       every device line mentions nothing as bought. */
 const ownDevices = new Set(planModel.equipment.ownDevices.map(d => d.id));
 const devicesConnected = planCapabilities.get('thuso-devices')?.connected;
 for (const tier of momContract.tiers) for (const item of tier.includes) {
  if (/\b(Thuso Band|Thuso Home|Thuso Pod|dispenser|wearable)\b/i.test(item.text) && !item.device) throw new Error(`"${item.id}" on ${tier.name} names a device and does not say which of MyThuso's own devices it is, so nothing can hold it to whether that device exists.`);
  if (!item.device) continue;
  if (!ownDevices.has(item.device)) throw new Error(`"${item.id}" on ${tier.name} names device "${item.device}", which is not one of the own devices in packages/catalog/business-model.json.`);
  if (item.capability !== 'thuso-devices') throw new Error(`"${item.id}" on ${tier.name} is a device and depends on "${item.capability}" rather than thuso-devices, so the sentence saying the device has not been built would not be beside it.`);
  if (!devicesConnected && /\binclud/i.test(item.text)) throw new Error(`"${item.id}" on ${tier.name} calls a device that has not been built included. ${momContract.refusals.find(r => r.id === 'a-device-that-does-not-exist-is-not-included')?.sentence ?? ''}`);
 }
 /* Scoped to the plans code in the files that hold many screens. Pages.tsx also draws the nurse
    booking, whose "not included in this nurse booking" is true and about something else; a check that
    fails on the right word in the wrong screen gets switched off, and then it guards nothing. */
 const planSegment = {
  'apps/web/src/features/Pages.tsx': ['const planCopy', 'export function Privacy'],
  'apps/web/src/features/Landing.tsx': ['<section id="plans"', '<section id="nurses"'],
  'apps/web/src/features/Admin.tsx': ['function Growth', 'Thuso Screen packages'],
  'apps/ios/MyThuso/Features/PassportView.swift': ['struct PlansView', 'struct WalletView'],
  [`${android}/ui/AccountScreens.kt`]: ['private val planBlurb', '@Composable fun WalletScreen']
 };
 const plansCode = file => {
  const code = stripped(file), bounds = planSegment[file];
  if (!bounds) return code;
  const from = code.indexOf(bounds[0]), to = code.indexOf(bounds[1], from);
  if (from < 0 || to < 0) throw new Error(`${file} no longer has its plans code between "${bounds[0]}" and "${bounds[1]}", so this check cannot find what it guards. Move the markers with the code.`);
  return code.slice(from, to);
 };
 if (!devicesConnected) for (const file of Object.keys(planScreens)) {
  if (/\bincluded\b/i.test(plansCode(file))) throw new Error(`${file} says "included" on a plans screen while thuso-devices is not connected. A plan does not include a device that has not been built; it would bring one, with the notice beside it.`);
 }

 /* 5. No price buys clinical priority. Anything on a plan that speaks of priority must say it is
       undecided, and that sentence must refuse being seen ahead of somebody more unwell. Nothing else
       on the plan may speak of being faster or ahead at all. */
 const REQUIRED_REFUSALS = ['a-device-that-does-not-exist-is-not-included', 'no-plan-buys-a-place-ahead', 'a-plan-is-not-medical-aid', 'paying-is-not-seeing'];
 for (const id of REQUIRED_REFUSALS) if (!momContract.refusals.some(r => r.id === id && r.sentence?.trim())) throw new Error(`packages/catalog/mom-plans.json has lost the refusal "${id}". It is the half of this plan worth reading.`);
 for (const tier of momContract.tiers) for (const item of tier.includes) {
  if (/priorit/i.test(item.id + ' ' + item.text)) {
   if (!item.undecided || !/more unwell|ahead of/i.test(item.undecided)) throw new Error(`"${item.id}" on ${tier.name} speaks of priority without saying what it cannot mean. A plan price may buy faster contact, never a place ahead of somebody more unwell, and until that is written down it claims nothing.`);
  }
  if (/\b(faster|ahead of|jump|queue|first in line|before other)/i.test(item.text)) throw new Error(`"${item.id}" on ${tier.name} reads "${item.text}". ${momContract.refusals.find(r => r.id === 'no-plan-buys-a-place-ahead').sentence}`);
 }

 /* 6. A plan price never implies scheme cover. The words belong to the refusal that denies them and
       to nothing a person reads as what they are buying. */
 const sold = [momContract.payer.headline, momContract.payer.statement, momContract.addOns.statement, momContract.splitting.statement,
  ...momContract.addOns.items.map(a => a.name), ...momContract.tiers.flatMap(t => [t.name, t.cadence, ...t.includes.map(i => i.text)])];
 for (const line of sold) if (/\b(medical aid|medical scheme|scheme|cover(ed|s|age)?|insur\w*|claim\w*|benefit)\b/i.test(line)) throw new Error(`MyThuso for Mom says "${line}". ${momContract.refusals.find(r => r.id === 'a-plan-is-not-medical-aid').sentence}`);

 /* 7. The documents name the add-ons and price none of them, and neither does this. */
 for (const addOn of momContract.addOns.items) if ('price' in addOn) throw new Error(`The add-on "${addOn.id}" has a price. The Blueprint names it and does not price it; a number here would be one somebody invented.`);

 /* 8. The Blueprint's retained margin is cited, not derived from, and it has to sit inside the prices
       it is a margin on — below the dearest tier at the top and below the cheapest at the bottom. */
 const [retainLow, retainHigh] = momContract.economics.retainsPerParentMonthly;
 if (!(retainLow > 0 && retainLow < retainHigh && retainLow < Math.min(...tierPrices) && retainHigh < Math.max(...tierPrices))) throw new Error(`MyThuso for Mom retains R${retainLow}–R${retainHigh} a parent a month against prices of ${tierPrices.join(', ')}. A margin larger than the price it is taken from is arithmetic nobody should present to a funder.`);

 console.log(`MyThuso for Mom has ${momContract.tiers.length} tiers priced once, ${momContract.tiers.reduce((n, t) => n + t.includes.length, 0)} inclusions each beside the capability it waits on, and ${momContract.refusals.length} refusals — and no plans screen on any platform types a price.`);
}
/* ==== Engine Runtime & Core (Wave 3): packages/engines ==============================================

   Added by the Engine Runtime & Core lead. Self-contained; the one edit inside the Wave 2 API section is
   the engines-runtime:callers case in deriveCallers. The engines run on a development runtime that binds
   handlers to the frozen API contract and carries their events on a bus held to the event contract.
   What this block holds it to: the runtime refuses to start without its flag in the factory, serves
   loopback only and checks the Host header, and nothing in deploy/ names it; one engine's code never
   reaches another engine's directory or opens a database of its own; and a route marked built on the
   runtime names a handler file in its own engine's directory that registers exactly that route. */
{
 const runtimeSettings = JSON.parse(read('packages/catalog/apis.json')).engineRuntime;
 const { posix } = await import('node:path');
 const runtimeRefusalOf = id => runtimeSettings?.refusals?.find(x => x.id === id);
 const enginesFail = (id, detail) => { const r = runtimeRefusalOf(id); throw new Error(`${detail}${r ? ` ${r.statement} ${r.why}` : ''}`); };
 if (!runtimeSettings || runtimeSettings.package !== 'packages/engines' || runtimeSettings.flag !== 'MYTHUSO_ENGINES' || runtimeSettings.flagValue !== 'synthetic-data-only' || !Array.isArray(runtimeSettings.binderCannotAdmit) || !runtimeSettings.why?.trim()) throw new Error('packages/catalog/apis.json no longer describes the engine runtime: its package, its synthetic-data flag, the callers its binder cannot admit and why it exists.');
 for (const id of ['route-not-in-the-contract', 'route-withdrawn', 'route-belongs-to-another-engine', 'subscription-not-declared', 'engine-fault', 'field-of-the-wrong-type']) if (!runtimeRefusalOf(id)?.statement?.trim() || !runtimeRefusalOf(id)?.why?.trim()) throw new Error(`packages/catalog/apis.json#engineRuntime has lost the refusal "${id}", or its sentence or its reasoning.`);

 /* 1. Registered, zero-dependency, and every suite under src/ run — including each engine's domain tests. */
 const rootForEngines = JSON.parse(read('package.json'));
 if (!rootForEngines.workspaces.includes('packages/engines') || !/-w @mythuso\/engines/.test(rootForEngines.scripts.check) || !/-w @mythuso\/engines/.test(rootForEngines.scripts.test)) throw new Error('The root package.json no longer typechecks and tests packages/engines. A runtime whose refusals nobody has seen fire is a runtime that says yes.');
 const enginesPackage = JSON.parse(read('packages/engines/package.json'));
 if (enginesPackage.dependencies || enginesPackage.devDependencies) throw new Error('packages/engines declares dependencies; it is zero-dependency, like the services it stands in for.');
 if (enginesPackage.scripts?.test !== 'node --test "src/**/*.test.ts"') throw new Error('packages/engines no longer runs every src/**/*.test.ts, so an engine\'s domain suite could stop running without anybody noticing.');

 /* 2. Not a service: the flag in the factory, loopback and Host at the door, and nothing in deploy/. */
 const runtimeSource = read('packages/engines/src/runtime/runtime.ts');
 if (!/if \(options\.env\[settings\.flag\] !== settings\.flagValue\) throw new RuntimeRefusedToStart/.test(runtimeSource)) throw new Error(`createRuntime() in packages/engines/src/runtime/runtime.ts no longer refuses without ${runtimeSettings.flag}=${runtimeSettings.flagValue}, so importing the library skips the door the server goes through.`);
 const enginesServer = read('packages/engines/src/server.ts');
 if (!/const HOST = '127\.0\.0\.1'/.test(enginesServer) || !/server\.listen\(port, host\)/.test(enginesServer) || !/LOOPBACK\.has\(req\.socket\.remoteAddress/.test(enginesServer) || !/loopbackHosts\.has\(hostName\(req\.headers\.host\)\)/.test(enginesServer)) throw new Error('packages/engines/src/server.ts no longer binds to 127.0.0.1 and refuses a request that did not arrive on loopback, addressed to a loopback name.');
 for (const file of files('deploy')) if (/packages\/engines|@mythuso\/engines|MYTHUSO_ENGINES|npm run engines/.test(read(file))) throw new Error(`${file} names the development engine runtime. It answers with synthetic data, believes a role from a header, and is never deployed.`);

 /* 3. Store isolation. One module opens databases; an engine's code imports its own directory, the
       runtime's interface and the catalog, and nothing else — not another engine, not a package. */
 const engineIdsForRuntime = JSON.parse(read('packages/catalog/events.json')).engines.map(e => e.id);
 const engineSources = files('packages/engines/src').filter(f => f.endsWith('.ts'));
 let importsRead = 0;
 for (const file of engineSources) {
  const source = read(file);
  const [top] = posix.relative('packages/engines/src', file).split('/');
  /* The trail's own test opens the trail file to tamper with it, which is the point of the test. */
  const opensDatabase = /new DatabaseSync\(/.test(source) || /^import (?!type)[^;]*from 'node:sqlite'/m.test(source);
  if (opensDatabase && file !== 'packages/engines/src/runtime/store.ts' && file !== 'packages/engines/src/runtime/runtime.test.ts') throw new Error(`${file} opens a SQLite database itself. Only packages/engines/src/runtime/store.ts opens a store, and it hands each engine its own.`);
  if (engineIdsForRuntime.includes(top) && /_runtime_/.test(source)) throw new Error(`${file} names a _runtime_ table. The replay table in an engine's store is the binder's, and an engine that edits it can make a second charge look like a replay.`);
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)) {
   const spec = m[1] ?? m[2];
   importsRead++;
   if (spec.startsWith('node:')) continue;
   if (!spec.startsWith('.')) throw new Error(`${file} imports "${spec}". packages/engines is zero-dependency.`);
   const target = posix.normalize(posix.join(posix.dirname(file), spec));
   const [targetTop] = posix.relative('packages/engines/src', target).split('/');
   const inside = !target.startsWith('packages/engines/src/') ? null : targetTop;
   if (engineIdsForRuntime.includes(top)) {
    if (inside !== top && inside !== 'runtime' && !target.startsWith('packages/catalog/')) enginesFail('route-belongs-to-another-engine', `${file} imports ${target}. An engine's code reaches its own directory, the runtime and the catalog; another engine is reached through a route or an event, and its store not at all.`);
   } else if (top === 'runtime' && engineIdsForRuntime.includes(inside)) {
    throw new Error(`${file} imports ${target}. The runtime knows no engine by name; engines are discovered and bound.`);
   }
  }
 }

 /* 4. A route built on the runtime names a handler in its own engine's directory that registers it. */
 const { routes: routesForRuntime } = loadApis();
 const onRuntime = routesForRuntime.filter(r => r.status === 'built' && r.enforcedBy?.mechanism === runtimeSettings.mechanism);
 for (const r of onRuntime) {
  const where = `${routeKey(r)} in ${r.file}`;
  const directory = `packages/engines/src/${r.engine}/`;
  if (!r.evidence?.file?.startsWith(directory)) enginesFail('route-belongs-to-another-engine', `${where} is built on the engine runtime and its evidence is ${JSON.stringify(r.evidence?.file)}, not a file under ${directory}.`);
  if (!existsSync(r.evidence.file) || r.evidence.handler !== `'${routeKey(r)}'` || !read(r.evidence.file).includes(r.evidence.handler)) enginesFail('route-not-in-the-contract', `${where} is built on the engine runtime and ${r.evidence.file} does not register '${routeKey(r)}' by that exact key.`);
 }
 for (const r of routesForRuntime.filter(r => r.enforcedBy?.mechanism === runtimeSettings.mechanism && r.status !== 'built')) throw new Error(`${routeKey(r)} claims the engine runtime's enforcement and is not built.`);

 console.log(`The engine runtime refuses to start without ${runtimeSettings.flag}=${runtimeSettings.flagValue} in its factory, answers on loopback to a loopback Host only, and nothing in deploy/ names it. ${engineSources.length} source files under packages/engines/src read, ${importsRead} imports among them, and no engine reaches another engine's directory or opens a database; ${onRuntime.length} ${onRuntime.length === 1 ? 'route is' : 'routes are'} built on the runtime, each registered by exactly its key in its own engine's directory.`);
}
/* ==== end of Engine Runtime & Core (Wave 3) ========================================================= */
