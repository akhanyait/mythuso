import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emitTokens } from './emit-tokens.mjs';
import { emitVetting } from './emit-vetting.mjs';
import { emitRecords } from './emit-records.mjs';
import { emitEarnings } from './emit-earnings.mjs';
import { emitSos } from './emit-sos.mjs';
import { emitTeleconsult } from './emit-teleconsult.mjs';
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
 { source: 'packages/catalog/locales.json', command: 'npm run locales', files: emitLocales() },
 { source: 'packages/catalog/dispensing.json', command: 'npm run dispensing', files: emitDispensing() },
 { source: 'packages/catalog/programmes.json', command: 'npm run programmes', files: emitProgrammes() },
 { source: 'packages/catalog/interpreting.json', command: 'npm run interpreting', files: emitInterpreting() },
 { source: 'packages/catalog/scheduling.json', command: 'npm run scheduling', files: emitScheduling() },
 { source: 'packages/catalog/geography.json', command: 'npm run geography', files: emitGeography() },
 { source: 'packages/catalog/capabilities.json', command: 'npm run capabilities', files: emitCapabilities() },
 { source: 'packages/catalog/cancellation.json', command: 'npm run cancellation', files: emitCancellation() },
 { source: 'packages/catalog/passport.json', command: 'npm run passport', files: emitPassport() },
 { source: 'packages/catalog/capture.json', command: 'npm run capture', files: emitCapture() }
];
for(const {source,command,files} of generated) {
 for(const file of files) {
  if(!existsSync(file.path)) throw new Error(`${file.path} has not been generated from ${source}. Run: ${command}`);
  if(statSync(file.path).mtimeMs<statSync(source).mtimeMs) throw new Error(`${file.path} is older than ${source}. Run: ${command}`);
  if(read(file.path)!==file.content) throw new Error(`${file.path} is not what ${source} generates. Either it was edited by hand — it says at the top not to be — or the generator changed. Run: ${command}`);
 }
}

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
 if(/(static let (capabilities|authorities|roles|scopes)\b|val vetting(Capabilities|Authorities|Roles|Scopes)\s*[:=])/.test(source)) throw new Error(`${file} declares a vetting table of its own. That table is generated into VettingData — the app should read that one.`);
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
if(/android\.permission\.(CAMERA|RECORD_AUDIO)/.test(read('apps/android/app/src/main/AndroidManifest.xml'))) throw new Error('The Android manifest declares a camera or microphone permission. The teleconsultation screens tell the patient neither is declared.');
if(/INFOPLIST_KEY_NS(Camera|Microphone)UsageDescription/.test(read('apps/ios/MyThuso.xcodeproj/project.pbxproj'))) throw new Error('The iOS target declares a camera or microphone usage description. The teleconsultation screens tell the patient neither is declared.');
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

/* Nothing renders below the smallest size the design declares, and iOS does — 422 times.
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
 const SMALL_TYPE_ON_IOS = 422;
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

 /* 3. The origin is allowed by exactly the two entries that draw a map, and by no other. A content
    policy is the only thing standing between "we chose one tile host" and "a map can fetch from
    anywhere", and it is a second copy of the contract's own hostname. */
 for(const entry of ['index.html','staff.html']) {
  if(!read(`apps/web/${entry}`).includes(source.host)) throw new Error(`apps/web/${entry} draws a map and its content policy does not allow ${source.host}. The tiles do not fail loudly — the map falls back to the schematic and nobody is told why.`);
 }
 for(const entry of ['landing.html','admin.html','status.html']) {
  if(existsSync(`apps/web/${entry}`) && read(`apps/web/${entry}`).includes(source.host)) throw new Error(`apps/web/${entry} allows the tile host and draws no map. An entry that can reach a tile server is an entry that can leak a viewport; only the two that need it may.`);
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
  const decorative = /::(before|after)/.test(selector)
   || (/height:\s*(\d+)px/.test(body) && Number(body.match(/height:\s*(\d+)px/)[1]) < 13);
  if(!colour && !decorative) throw new Error(`${sheet}: "${selector.trim().slice(0,60)}" paints an accent fill and sets no colour, so whatever a child inherits lands on it unmeasured — faint gets 3.75:1 on paleSage and fails, and studioLime is 1.05 under anything but the ink. Set the foreground on the surface that paints the fill — var(--charcoal) on a sage, var(--studio-ink) on a studio tint; a child cannot be relied on to remember. If nothing can be read on it, say so by giving it a height under the type floor or making it a pseudo-element.`);
  if(colour && !inkForeground.test(colour)) throw new Error(`${sheet}: "${selector.trim().slice(0,60)}" paints an accent fill and sets ${colour.trim()}. The inks are the only foregrounds measured against these ramps — faint on paleSage is 3.70 and fails, and nothing but studioInk is declared against studioLime. Everything read on an accent fill is charcoal or a studio ink.`);
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
 const STATES = ['absent', 'simulated', 'connected'];
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
const permissionsFor=new Set(capabilities.capabilities.flatMap(c=>c.requiresPermissions??[]));
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
if(voice&&!voice.neverSoften) throw new Error('The voice capability has lost the note forbidding a microphone affordance. A control that looks like it is listening and is not is worse than no control, and on a health product it is the kind of worse that gets believed.');
if(voice?.connected) throw new Error('packages/catalog/capabilities.json marks voice as connected. Neither native app declares a microphone permission — deliberately — so this claim is false on both platforms at once.');
/* Declaring a microphone anywhere would make the voice notice a lie, so the manifest and the target
   are checked here as well as under teleconsultation, where the same permissions are refused for a
   different reason. Two features now depend on that silence. */
if(/android\.permission\.RECORD_AUDIO/.test(read('apps/android/app/src/main/AndroidManifest.xml'))) throw new Error('The Android manifest declares RECORD_AUDIO. Both the teleconsultation contract and the voice capability tell a person nothing here has a microphone.');
if(/INFOPLIST_KEY_NSMicrophoneUsageDescription/.test(read('apps/ios/MyThuso.xcodeproj/project.pbxproj'))) throw new Error('The iOS target declares a microphone usage description. Both the teleconsultation contract and the voice capability tell a person nothing here has a microphone.');
/* The assistant, and the three things it may never grow.

   There is a screen in the iOS app that draws a soft luminous shape and changes it with what the
   app knows. It is the visual language the founder asked for and it is the exact shape of a lie
   somebody could tell by accident: a blob that pulses beside a rounded rectangle reads as a voice
   assistant to almost everybody, and this product has no speech model, no microphone permission on
   either platform, and no answer yet for what would happen to a recording of a person describing a
   symptom. The contract's own words for that are in `voice.neverSoften`, and they are a rule rather
   than advice, so they are checked rather than trusted.

   Three things are asserted, and each of them is a different way the same defect arrives.

   The sentence is rendered, never typed. A screen that types its own version of a notice cannot be
   switched off with the others when an integration lands, and the copy that gets typed is always
   the softer one. So no hand-written native source may carry a capability's notice as a string of
   its own — the string literals are read out of the file and compared with the contract, which
   leaves a comment free to quote the rule it is written to.

   Nothing reaches for audio, and nothing draws a microphone. The API check is the same one the
   teleconsultation screens are held to; the symbol check is the one this feature adds, because the
   hazard here is not a media stack, it is an SF Symbol. `waveform.path.*` is allowed through: that
   is the ECG trace on the Health Passport's heart-rate chart and it is a picture of a heartbeat.

   And nothing offers to listen in words. A control's label is the last place a listening affordance
   hides once the glyphs are gone. */
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
/* An SF Symbol name is a string literal, so the two questions are asked of the same list: does any
   iOS source name a microphone or an audio meter, and does any of them reach for a capture API. */
const listeningSymbol=/^(mic|waveform)(\.|$)/;
const audioApis=/\b(AVAudioRecorder|AVAudioEngine|AVAudioSession|AVAudioApplication|SFSpeechRecognizer|SFSpeechAudioBufferRecognitionRequest|AVCaptureDevice|requestRecordPermission)\b|\bimport\s+(Speech|AVFAudio)\b/;
for(const file of iosSources) {
 const source=read(file);
 if(audioApis.test(source)) throw new Error(`${file} reaches for audio capture. Neither native app declares a microphone permission — deliberately — and packages/catalog/capabilities.json tells a person "nothing here has a microphone". An app holding a recorder handle while saying that is lying to the patient rather than to the reviewer.`);
 for(const literal of swiftLiterals(source)) {
  if(!listeningSymbol.test(literal)) continue;
  /* The one exception, and it is not an audio symbol: waveform.path.ecg is the heartbeat trace on
     the Health Passport's chart. */
  if(literal.startsWith('waveform.path')) continue;
  throw new Error(`${file} draws the symbol "${literal}". ${voice.neverSoften}`);
 }
}
const offersToListen=/\b(tap|hold|press|touch|swipe) to (speak|talk|record|dictate)\b|^listening[.…!]*$|\b(start|stop) listening\b|\bi(?:'m| am) listening\b|\bspeak now\b/i;
for(const file of handWrittenIos) {
 for(const literal of swiftLiterals(read(file))) {
  if(offersToListen.test(literal.trim())) throw new Error(`${file} offers to listen, in words: "${literal}". ${voice.neverSoften}`);
 }
}
/* The screen itself, and the two things it must not stop doing: asking the contract for its notice,
   and naming the capability whose refusals it renders. Deleting either leaves a beautiful shape
   with nothing underneath it saying what it is. */
const assistant='apps/ios/MyThuso/Features/AssistantView.swift';
if(!existsSync(assistant)) throw new Error(`${assistant} is missing. The assistant is the surface the voice capability names, and a capability with no surface is a notice nobody reads.`);
const assistantSource=read(assistant);
if(!/CapabilityNotice\(/.test(assistantSource)) throw new Error(`${assistant} no longer renders CapabilityNotice, so whatever it now says about being unconnected is its own sentence rather than the contract's.`);
if(!/"voice"/.test(assistantSource)) throw new Error(`${assistant} no longer names the voice capability, so the three things blocking it and the rule it is drawn to are no longer coming from packages/catalog/capabilities.json.`);
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
const TYPED_FIGURES = [
 ['apps/web/src/shells/StaffShell.tsx', '18', "How many reviews this doctor finished today. The queue lists what is waiting, not what is done, so there is no row on the screen to count — the honest alternatives are this or no figure."],
 ['apps/web/src/shells/StaffShell.tsx', 'Median 4 m 10 s', 'Its chip, and the same fact: a median over reviews that are no longer on the screen.'],
 ['apps/ios/MyThuso/Features/WorkspaceView.swift', '18', 'The same finished-review count, on the same reasoning.'],
 ['apps/ios/MyThuso/Features/WorkspaceView.swift', 'Median 4 m 10 s', 'The same chip.'],
 ['apps/ios/MyThuso/Features/WorkspaceView.swift', '598', "The same week's earnings, and the comment above it in that file says so."]
];
/* And the figures that do have a list under them and are typed anyway. The count is exact on
   purpose: a new one fails the build, and so does fixing one without bringing the number down, which
   is the only arrangement in which a list like this ever reaches nought. */
const FIGURE_QUARANTINE = [
 /* The web shell's three came off this list: features/Workspaces.tsx exports reviewQueueCounts()
    now and the doctor's strip counts its own queue, the way the Control Tower's and the partner's
    already did. What is left is the one figure on a platform whose day has no list to count from. */
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
 'Declare a device permission on either native app.': 'and its own simulation refuses to declare one'
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

console.log(`Checked ${native.length} native source files: no WebViews. Web demo storage/content, native service catalogue, clinical reference ranges, locales, demo codes, hero banner copy and shared illustrations are consistent across web, iOS and Android. Design tokens, the vetting table — ${vetting.roles.length} roles, ${vetting.roles.reduce((t,r)=>t+r.checks.length,0)} checks and every refusal sentence — and the record contract — ${records.records.length} record types, ${records.consultation.sections.length} consultation sections and every summary — are generated into CSS, Swift and Kotlin, and every generated file matches its source. Coordinate refusals and the numbers an arrival estimate is built from agree across all three. No payout line names its own amount for a visit, and the share the public page advertises is the share the catalogue pays. On the emergency pathway the only numbers that exist are ${SA_EMERGENCY_NUMBERS.map(([, n]) => n).join(', ')}, the ${sos.redFlags.conditions.length} conditions that end the questions are all present, every one of the ${sos.failures.length} failures says what to do instead, every coverage area is a zone dispatch can reach, and all three screens show the ambulance number before anything MyThuso sells. No teleconsultation screen touches a camera or a microphone, the connection ladder never permits more on a worse line than on a better one, and not one of the ${teleconsult.outcomes.filter(o => !o.countsAsConsultation).length} encounter outcomes that is not a consultation may write an assessment, a plan or a charge. The consent contract — ${consent.purposes.length} purposes, ${requiredCount} of them required, ${consent.lawfulBases.length} lawful bases and every refusal, withdrawal and retention sentence — is read rather than restated by the web app and the service, both sides build the consent fingerprint from the same thing, sign-up marks exactly the ${requiredCount} required ones as required, both consent ledgers are append-only, and the access log has no column a reading could go in \u2014 it is refused by identifier now rather than by grepping the prose around a schema, so a table about access to clinical records may be called what it is. Every entry in that log hashes onto the one before it and its head is committed into the gate's keyed chain by a module the consent register holds two methods of and cannot otherwise reach. The locale contract — ${localeContract.locales.length} written languages over ${localeContract.keys.length} keys and ${localeContract.sets.length} sets — is generated into Swift and Kotlin and read directly by the web: every locale carries every key of every set it claims and nothing outside them, no locale is presented as reviewed without naming who read it and when, no string in it is a sentence out of a clinical contract, clinicalLocale() is present on all three platforms, and every language picker shows the reader that ${localeContract.locales.filter(l => l.review.state !== 'source').length} of them have been read by nobody who speaks them. ${signLanguage.short} is not in that list, its ${signLanguage.mustNeverHappen.length} refusals are rendered from the contract, and the interpreter it needs is the one already on the teleconsultation roster. That interpreter is now a vetted party with ${interpreterRole.checks.length} checks of their own and one capability, granted nothing that opens a record; ${interpreting.roster.length} of them carry hours rather than a conclusion, so all three platforms work out for themselves which hour answers a request and all three can still return nothing — a visit with no interpreter is held rather than dispatched and carries the contract's own word for it on all three, cancelling one costs ${interpreting.cancellation.fee} and is recorded against ${interpreting.cancellation.attributedTo} rather than the patient, and the ${interpreting.refusals.length} refusals — a family member, a child, English written at somebody — are on the screen rather than only in the file. Substitution is held to section 22F of the Medicines and Related Substances Act 101 of 1965: the four statutory exceptions are all in the register in the Act's own order, no item that must not be substituted was, no substitution changes the molecule or the strength, every one of the ${dispensing.prescription.items.length} items carries the words said to the patient, the pharmacist who signed one carries a registration in the format the vetting register holds them to, and the chronic authorisation is boxed by a period and a quantity, ends in a review, and writes its expiry down nowhere — all three platforms work it out from the same ${MONTH_IN_DAYS}-day month. An employer's programme report is suppressed here as well as in the three apps: no group under ${suppressionFloor.minimumCohort} people is reported, no group where one answer covers ${Math.round(suppressionFloor.dominanceCeiling * 100)}% of it is reported, no report leaves exactly one group hidden, and in none of the ${programmes.programmes.length} programmes do the published groups add up to the published total — because if they did, every suppression above could be undone by subtracting. The assistant draws a shape and never a microphone: no iOS source names a mic or a waveform symbol, reaches for an audio capture API or offers in words to listen, the screen renders the voice capability's notice from the contract rather than a sentence of its own, and none of the ${capabilities.capabilities.length} capabilities has its notice typed into a hand-written native file. The ingestion boundary is ${feedContract.feeds.length} doors and every one of them is locked: each names the capability whose sentence it answers with, points at the sample data that stands in for it, carries ${feedContract.feeds.reduce((t,f)=>t+f.beforeSwitchOn.length,0)} conditions that must be true before it may be switched on — every one of which a connected capability is now held to — and refuses ${feedContract.feeds.reduce((t,f)=>t+f.neverAccepts.length,0)} named fields it must never be sent, none of which any other feed accepts; every capability is either served by one or carries a written reason there is no seam, no route is typed into the server by hand, no refusal sentence is typed into the service, and nothing behind them answers in the two hundreds. The table that would settle whether the caller limit is the right number holds five integers per window and no column anybody could be identified by, and the health routes that read it answer the loopback by path rather than by method — which is now checked in both directions, because the first POST under that prefix would otherwise have been public. The chain witness renders a head to be carried off the machine and checks one back; it reaches no network and says on its own face that publishing is still absent. Colour contrast is computed rather than eyeballed: ${contrast.pairs.length} foreground/background pairs clear WCAG 2.2 AA, and ${contrast.knownFailures.length ? `each of the ${contrast.knownFailures.length} that do not is parked with a measured replacement that does` : 'none of them fails'}. Three bodies of prose that were written out once per platform are contracts now: the ${explanations.entries.length} reading explanations and their ${Object.keys(explanations.provenance).length} provenance sentences in records.json, where every urgent condition is a red flag sos.json actually has, no paragraph names a number, the ordinary cause is said before the frightening one and the oximeter still admits it reads high on darker skin; the ${arrivalProse.length} arrival refusals in geography.json, with the day of the visit enforced by arithmetic on all three platforms rather than by the sentence that describes it; and what the offline queue survives in capture.json, where ${fileStores.length} file-backed stores are held to one promise and the web's is held to keeping less. What a store says when the disk refuses it is a contract now too: ${writeFailures.failures.length} failures over ${outcomeNames.size} outcomes, no two of them leaving the same set true, every one of them leaving nothing deleted, none of them offered by a store with no disk to be refused by — and the ${SILENT_ABOUT_WRITE_FAILURE.length} file stores that have no sentence for a full phone and the one screen that quarantines a file without saying so are written down as gaps rather than left to be found again. Not one of those ${prosePlaces.reduce((total, place) => total + place.sentences.length, 0)} sentences is typed into a hand-written file outside the ${PROSE_QUARANTINE.length} quarantined copies waiting to adopt them, and each of those quarantines fails the build on the day it is no longer needed. And a workspace may not type the figure at the top of it: all ${METRIC_STRIPS.length} metric strips are read for a digit inside a literal, ${TYPED_FIGURES.length} figures are excused because no list on their screen could count them, and the ${FIGURE_QUARANTINE.reduce((total, [, count]) => total + count, 0)} that are typed over a list that could are ratcheted so that neither a new one nor a half-finished fix goes unnoticed. What that cannot see — whether a counted figure counts the right rows — is what tests/workspace-counts.spec.ts opens a browser for.`);

/* The money and identity seams report separately, as their own line, so that three agents adding
   simulators to three different seams are appending lines rather than editing one sentence. */
console.log(`${simulationFiles.filter(([f]) => !/\/(index|contract|suppliers|care)\.ts$/.test(f)).length} simulated suppliers stand behind ${[...standingIn].length} capabilities — ${[...standingIn].sort().join(', ')} — and each of them is held to what it will not do: every one of the ${[...standingIn].reduce((total, id) => total + refusesOf(id).length, 0)} refusals those capabilities write down is enforced in apps/api/src/simulation, in the contract's own words, chosen by a selector that matches exactly one sentence. None of them opens a socket or writes a file, none of them holds anything with the shape of a card number, the simulated one-time code is the length and the life apps/api/src/config.ts gives the real one, the browser reaches them through one module and the status page reads its notices through the accessor that knows about the third state.`);
/* The care and dispatch seams, in numbers. Its own line rather than a clause in the summary above,
   for the same reason its checks are their own block: three seams are being simulated at once and a
   sentence three people are editing is a sentence three people conflict over. */
console.log(`Four of them stand behind four of those doors and none of them is reachable from the request path: ${careRoster.nurses.length} fictional nurses over ${careZoneNames.size} suburbs, ${careSimulators.reduce((total, [id]) => total + capabilities.capabilities.find(c => c.id === id).simulation.refuses.length, 0)} refusals enforced in the contract's own words and typed into no simulator, a shift computed from the ${careSlots.length} hours the product offers and the ${careLongest}-minute longest visit it sells rather than from two times somebody wrote down, ${careRoster.nurses.filter(n => !careZoneNames.has(n.zone.toLowerCase())).length} nurses outside phase one and ${careRoster.nurses.filter(n => !n.sharesPosition).length} whose phone is telling nobody anything — so every one of those refusals is something a person can open the app and see. Nothing in the directory calls Math.random, nothing in it reaches for a camera or a microphone, and the teleconsultation capability still declares no permission for either app to ask for.`);
