import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emitTokens } from './emit-tokens.mjs';
import { emitVetting } from './emit-vetting.mjs';
import { emitRecords } from './emit-records.mjs';
import { emitEarnings } from './emit-earnings.mjs';
import { emitSos } from './emit-sos.mjs';
import { emitTeleconsult } from './emit-teleconsult.mjs';
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
 for(const s of catalogue.filter(s=>s.phase===1)) if(!source.includes(`"${s.id}"`)||!source.includes(`"${s.name}"`)||!source.includes(String(s.price))) throw new Error(`Native catalogue drift: ${s.id} in ${f}`);
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

/* Clinical reference ranges, locales and demo verification codes are duplicated across three
   native codebases. Drift between them is a clinical-safety problem, not a cosmetic one, so it
   is checked rather than trusted. */
const clinicalSources = {
 web: 'apps/web/src/features/Clinical.tsx',
 ios: 'apps/ios/MyThuso/Features/AssessmentView.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/ui/ClinicalScreens.kt'
};
const expectedRanges = [['systolic',90,140],['diastolic',60,90],['pulse',50,100],['respiratory',12,20],['temperature',36.1,37.5],['oxygen',95,100],['glucose',4,7.8]];
for(const [platform,file] of Object.entries(clinicalSources)) {
 const source=read(file);
 for(const [id,low,high] of expectedRanges) {
  const line=source.split('\n').find(l=>l.includes(`'${id}'`)||l.includes(`"${id}"`));
  if(!line) throw new Error(`Missing observation '${id}' in the ${platform} assessment (${file})`);
  const numbers=(line.match(/\d+(\.\d+)?/g)||[]).map(Number);
  if(!numbers.includes(low)||!numbers.includes(high)) throw new Error(`Reference range drift for '${id}' in ${platform}: expected ${low}–${high} in ${file}`);
 }
}
const localeSources = {
 web: 'apps/web/src/lib/i18n.ts',
 ios: 'apps/ios/MyThuso/Models/Localisation.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/model/Localisation.kt'
};
for(const [platform,file] of Object.entries(localeSources)) {
 const source=read(file);
 for(const code of ['en-ZA','zu-ZA','st-ZA','af-ZA']) if(!source.includes(code)) throw new Error(`Locale ${code} is missing from ${platform} (${file})`);
}
const onboardingSources = {
 web: 'apps/web/src/features/Onboarding.tsx',
 ios: 'apps/ios/MyThuso/Features/OnboardingView.swift',
 android: 'apps/android/app/src/main/java/za/co/mythuso/ui/OnboardingScreens.kt'
};
const idValidators = ['apps/web/src/features/Onboarding.tsx','apps/ios/MyThuso/Models/Localisation.swift','apps/android/app/src/main/java/za/co/mythuso/model/Localisation.kt'];
for(const file of idValidators) if(!/check digit/.test(read(file))) throw new Error(`Identity-number check-digit validation is missing from ${file}`);
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
 const derived = [`apps/web/public/banners/${name}-cutout.png`,
                  `apps/ios/MyThuso/Assets.xcassets/Banner${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('')}.imageset/${name}-cutout.png`,
                  `apps/android/app/src/main/res/drawable-nodpi/banner_${name.replace(/-/g, '_')}.png`];
 for (const f of derived) {
  if (!existsSync(f)) throw new Error(`Hero cut-out ${name} has not been distributed to ${f}. Run: node scripts/render-illustrations.mjs`);
  if (statSync(f).mtimeMs < statSync(source).mtimeMs) throw new Error(`${f} is older than ${source}. Run: node scripts/render-illustrations.mjs`);
 }
}
const heroSources = { web: 'apps/web/src/lib/i18n.ts', ios: 'apps/ios/MyThuso/Models/Localisation.swift', android: 'apps/android/app/src/main/java/za/co/mythuso/model/Localisation.kt' };
const heroCallsToAction = ['Get care now', 'Open Thuso Pass', 'Book a nurse', 'Thola usizo manje', 'Fumana tlhokomelo hona joale', 'Kry sorg nou'];
for (const [platform, file] of Object.entries(heroSources)) {
 const source = read(file);
 for (const cta of heroCallsToAction) if (!source.includes(cta)) throw new Error(`Hero banner call to action "${cta}" is missing from ${platform} (${file})`);
}
/* The identity service holds a name and a mobile number. That is personal information, not the
   special personal information that health data is, which is the only reason it can exist ahead of
   the controls in docs/PRIVACY-AND-SECURITY.md. If a clinical table appears here, that reasoning
   has quietly stopped being true. */
if(existsSync('apps/api/src')) {
 const clinical=/\b(observation|diagnos|prescription|medication|clinical|patient_record|vital|symptom|allerg)/i;
 for(const f of files('apps/api/src')) {
  const source=read(f);
  for(const statement of source.match(/CREATE TABLE[^;]+/gi)??[]) {
   if(clinical.test(statement)) throw new Error(`The identity service has grown a clinical table in ${f}. Health data is special personal information: work through docs/PRIVACY-AND-SECURITY.md before this ships.`);
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
 { source: 'packages/catalog/teleconsult.json', command: 'npm run teleconsult', files: emitTeleconsult() }
];
for(const {source,command,files} of generated) {
 for(const file of files) {
  if(!existsSync(file.path)) throw new Error(`${file.path} has not been generated from ${source}. Run: ${command}`);
  if(statSync(file.path).mtimeMs<statSync(source).mtimeMs) throw new Error(`${file.path} is older than ${source}. Run: ${command}`);
  if(read(file.path)!==file.content) throw new Error(`${file.path} is not what ${source} generates. Either it was edited by hand — it says at the top not to be — or the generator changed. Run: ${command}`);
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
const observationIds=(read('apps/web/src/features/Clinical.tsx').match(/id: '([a-z]+)'/g)??[]).map(m=>m.slice(5,-1));
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
const dispatchSource=read('apps/web/src/features/Dispatch.tsx');
for(const area of sos.coverage.areas) {
 if(!dispatchSource.includes(`name: '${area}'`)) throw new Error(`Thuso SOS claims to cover ${area}, which is not a zone on the dispatch board. A coverage list drawn optimistically is a person waiting at a window.`);
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

console.log(`Checked ${native.length} native source files: no WebViews. Web demo storage/content, native service catalogue, clinical reference ranges, locales, demo codes, hero banner copy and shared illustrations are consistent across web, iOS and Android. Design tokens, the vetting table — ${vetting.roles.length} roles, ${vetting.roles.reduce((t,r)=>t+r.checks.length,0)} checks and every refusal sentence — and the record contract — ${records.records.length} record types, ${records.consultation.sections.length} consultation sections and every summary — are generated into CSS, Swift and Kotlin, and every generated file matches its source. Coordinate refusals and the numbers an arrival estimate is built from agree across all three. No payout line names its own amount for a visit, and the share the public page advertises is the share the catalogue pays. On the emergency pathway the only numbers that exist are ${SA_EMERGENCY_NUMBERS.map(([, n]) => n).join(', ')}, the ${sos.redFlags.conditions.length} conditions that end the questions are all present, every one of the ${sos.failures.length} failures says what to do instead, every coverage area is a zone dispatch can reach, and all three screens show the ambulance number before anything MyThuso sells. No teleconsultation screen touches a camera or a microphone, the connection ladder never permits more on a worse line than on a better one, and not one of the ${teleconsult.outcomes.filter(o => !o.countsAsConsultation).length} encounter outcomes that is not a consultation may write an assessment, a plan or a charge. The consent contract — ${consent.purposes.length} purposes, ${requiredCount} of them required, ${consent.lawfulBases.length} lawful bases and every refusal, withdrawal and retention sentence — is read rather than restated by the web app and the service, both sides build the consent fingerprint from the same thing, sign-up marks exactly the ${requiredCount} required ones as required, both consent ledgers are append-only, and the access log has no column a reading could go in.`);
