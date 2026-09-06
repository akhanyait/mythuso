import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const catalogue=JSON.parse(read('packages/catalog/services.json'));
const nativeCatalogues=['apps/ios/MyThuso/Models/CareService.swift','apps/android/app/src/main/java/za/co/mythuso/model/CareModels.kt'];
for(const f of nativeCatalogues) {
 const source=read(f);
 for(const s of catalogue) if(!source.includes(`"${s.id}"`)||!source.includes(`"${s.name}"`)||!source.includes(String(s.price))) throw new Error(`Native catalogue drift: ${s.id} in ${f}`);
}

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
const demoCodes = [['240924','sign-up verification code',Object.values(onboardingSources)],
                   ['482190','visit code',Object.values(clinicalSources)],
                   ['8001015009087','sample identity number',Object.values(onboardingSources)]];
for(const [code,label,paths] of demoCodes) for(const f of paths) if(!read(f).includes(code)) throw new Error(`Demo ${label} ${code} is missing from ${f}`);
console.log(`Checked ${native.length} native source files: no WebViews. Web demo storage/content, native service catalogue, clinical reference ranges, locales and demo codes are consistent across web, iOS and Android.`);
