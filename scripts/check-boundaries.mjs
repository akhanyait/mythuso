import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emitTokens } from './emit-tokens.mjs';
import { emitVetting } from './emit-vetting.mjs';
import { emitRecords } from './emit-records.mjs';
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
 { source: 'packages/catalog/records.json', command: 'npm run records', files: emitRecords() }
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

console.log(`Checked ${native.length} native source files: no WebViews. Web demo storage/content, native service catalogue, clinical reference ranges, locales, demo codes, hero banner copy and shared illustrations are consistent across web, iOS and Android. Design tokens, the vetting table — ${vetting.roles.length} roles, ${vetting.roles.reduce((t,r)=>t+r.checks.length,0)} checks and every refusal sentence — and the record contract — ${records.records.length} record types, ${records.consultation.sections.length} consultation sections and every summary — are generated into CSS, Swift and Kotlin, and every generated file matches its source. Coordinate refusals and the numbers an arrival estimate is built from agree across all three.`);
