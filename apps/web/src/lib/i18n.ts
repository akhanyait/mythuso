import { createContext, useContext } from 'react';
/* Localisation scaffold. The shell, navigation and primary calls to action are translated.
   Clinical copy stays in English until it has been reviewed by a South African clinical
   language panel — a mistranslated instruction is a safety problem, not a polish problem. */
export const locales = [
 { code: 'en-ZA', label: 'English', native: 'English' },
 { code: 'zu-ZA', label: 'isiZulu', native: 'isiZulu' },
 { code: 'st-ZA', label: 'Sesotho', native: 'Sesotho' },
 { code: 'af-ZA', label: 'Afrikaans', native: 'Afrikaans' }
] as const;
export type LocaleCode = typeof locales[number]['code'];
type Dictionary = Record<string, string>;
const en: Dictionary = {
 'nav.section': 'YOUR CARE', 'nav.Overview': 'Overview', 'nav.Book a nurse': 'Book a nurse', 'nav.My visits': 'My visits',
 'nav.Health Passport': 'Health Passport', 'nav.My family': 'My family', 'nav.Care plans': 'Care plans',
 'nav.Thuso Wallet': 'Thuso Wallet', 'nav.Explore MyThuso': 'Explore MyThuso', 'nav.Privacy & settings': 'Privacy & settings',
 'shell.greeting': 'Hello, Lerato', 'shell.greetingSub': 'Here for you. And the people you love.',
 'shell.tagline': 'Help. Health. Home.', 'shell.preview': 'Interactive design preview',
 'shell.previewNote': 'Fictional data · No live care or payments', 'shell.workspaces': 'Preview workspaces',
 'shell.breadcrumb': 'Your care', 'shell.help': 'Help & support', 'shell.personal': 'Personal account',
 'shell.language': 'Language', 'shell.skip': 'Skip to content', 'shell.nextVisit': 'Your next visit', 'tab.Home': 'Home', 'tab.Book care': 'Book care', 'tab.Visits': 'Visits', 'tab.Passport': 'Passport', 'tab.More': 'More',
 'cta.book': 'Book a nurse', 'cta.passport': 'Open my passport', 'cta.allVisits': 'All visits',
 'cta.gotIt': 'Got it', 'cta.back': 'Back', 'cta.close': 'Close dialog',
 'hero.title': 'Feel better.|Right at home.', 'hero.body': 'A caring nurse. A doctor’s expertise. All from the comfort of your home.',
 'hero.trust': 'Registered nurses', 'hero.price': 'Visits from R249',
 'slide1.title': 'Care that|comes to you.', 'slide1.body': 'Trusted home healthcare in just a few taps.', 'slide1.cta': 'Get care now',
 'slide1.trust1': 'At home', 'slide1.trust2': 'Trusted care', 'slide1.trust3': 'For the people you love', 'slide1.caption': 'Same care. Closer to home.',
 'slide2.title': 'Your health.|One safe place.', 'slide2.body': 'Visits, records and support — all in MyThuso.', 'slide2.cta': 'Open Thuso Pass',
 'slide2.trust1': 'Trusted care', 'slide2.trust2': 'For you and your loved ones', 'slide2.trust3': 'Healthier tomorrows', 'slide2.caption': 'Care connects us.',
 'slide3.title': 'Feel better.|Right at home.', 'slide3.body': 'Nurse-led care, delivered to your door.', 'slide3.cta': 'Book a nurse',
 'slide3.trust1': 'Trusted professionals', 'slide3.trust2': 'Personalised care', 'slide3.trust3': 'Safe & convenient', 'slide3.caption': 'Quality care, where you are.'
};
const dictionaries: Record<LocaleCode, Dictionary> = {
 'en-ZA': en,
 'zu-ZA': {
  'nav.section': 'UKUNAKEKELWA KWAKHO', 'nav.Overview': 'Uhlolojikelele', 'nav.Book a nurse': 'Bhukha umhlengikazi', 'nav.My visits': 'Ukuvakashelwa kwami',
  'nav.Health Passport': 'Iphasiphothi Yezempilo', 'nav.My family': 'Umndeni wami', 'nav.Care plans': 'Izinhlelo zokunakekelwa',
  'nav.Thuso Wallet': 'Isikhwama se-Thuso', 'nav.Explore MyThuso': 'Hlola i-MyThuso', 'nav.Privacy & settings': 'Ubumfihlo nezilungiselelo',
  'shell.greeting': 'Sawubona, Lerato', 'shell.greetingSub': 'Silapha ngenxa yakho. Nangenxa yabantu obathandayo.',
  'shell.tagline': 'Usizo. Impilo. Ikhaya.', 'shell.preview': 'Isibonelo sedizayini esisebenzayo',
  'shell.previewNote': 'Idatha eqanjiwe · Akukho ukunakekelwa noma inkokhelo yangempela', 'shell.workspaces': 'Buka izindawo zokusebenza',
  'shell.breadcrumb': 'Ukunakekelwa kwakho', 'shell.help': 'Usizo nokusekelwa', 'shell.personal': 'I-akhawunti yomuntu siqu',
  'shell.language': 'Ulimi', 'shell.skip': 'Yeqela kokuqukethwe', 'shell.nextVisit': 'Ukuvakashelwa kwakho okulandelayo', 'tab.Home': 'Ikhaya', 'tab.Book care': 'Bhukha', 'tab.Visits': 'Ukuvakashelwa', 'tab.Passport': 'Iphasiphothi', 'tab.More': 'Okuningi',
  'cta.book': 'Bhukha umhlengikazi', 'cta.passport': 'Vula iphasiphothi yami', 'cta.allVisits': 'Konke ukuvakashelwa',
  'cta.gotIt': 'Ngiyezwa', 'cta.back': 'Emuva', 'cta.close': 'Vala ibhokisi',
  'hero.title': 'Zizwe ungcono.|Ekhaya.', 'hero.body': 'Umhlengikazi onendaba. Ulwazi lukadokotela. Konke usekhaya.',
  'hero.trust': 'Abahlengikazi ababhalisiwe', 'hero.price': 'Ukuvakashelwa kusukela ku-R249',
  'slide1.title': 'Ukunakekelwa|okuza kuwe.', 'slide1.body': 'Ukunakekelwa kwezempilo okwethembekile ekhaya, ngokuthinta nje.', 'slide1.cta': 'Thola usizo manje',
  'slide1.trust1': 'Ekhaya', 'slide1.trust2': 'Ukunakekelwa okwethembekile', 'slide1.trust3': 'Kubantu obathandayo', 'slide1.caption': 'Ukunakekelwa okufanayo. Eduze nekhaya.',
  'slide2.title': 'Impilo yakho.|Indawo eyodwa ephephile.', 'slide2.body': 'Ukuvakashelwa, amarekhodi nokusekelwa — konke ku-MyThuso.', 'slide2.cta': 'Vula i-Thuso Pass',
  'slide2.trust1': 'Ukunakekelwa okwethembekile', 'slide2.trust2': 'Kuwe nabathandekayo bakho', 'slide2.trust3': 'Ikusasa elinempilo', 'slide2.caption': 'Ukunakekelwa kuyasihlanganisa.',
  'slide3.title': 'Zizwe ungcono.|Ekhaya.', 'slide3.body': 'Ukunakekelwa okuholwa umhlengikazi, kulethwa emnyango wakho.', 'slide3.cta': 'Bhukha umhlengikazi',
  'slide3.trust1': 'Ochwepheshe abethembekile', 'slide3.trust2': 'Ukunakekelwa okwakho', 'slide3.trust3': 'Kuphephile futhi kulula', 'slide3.caption': 'Ukunakekelwa okusezingeni, lapho ukhona.'
 },
 'st-ZA': {
  'nav.section': 'TLHOKOMELO YA HAO', 'nav.Overview': 'Kakaretso', 'nav.Book a nurse': 'Behela mooki', 'nav.My visits': 'Diketelo tsa ka',
  'nav.Health Passport': 'Phasepoto ya Bophelo', 'nav.My family': 'Lelapa la ka', 'nav.Care plans': 'Merero ya tlhokomelo',
  'nav.Thuso Wallet': 'Sepache sa Thuso', 'nav.Explore MyThuso': 'Hlahloba MyThuso', 'nav.Privacy & settings': 'Lekunutu le ditlhophiso',
  'shell.greeting': 'Dumela, Lerato', 'shell.greetingSub': 'Re teng bakeng sa hao. Le batho bao o ba ratang.',
  'shell.tagline': 'Thuso. Bophelo. Lehae.', 'shell.preview': 'Ponelopele ya moralo e sebetsang',
  'shell.previewNote': 'Datha ya boiqapelo · Ha ho tlhokomelo kapa tefo ya nnete', 'shell.workspaces': 'Sheba dibaka tsa mosebetsi',
  'shell.breadcrumb': 'Tlhokomelo ya hao', 'shell.help': 'Thuso le tshehetso', 'shell.personal': 'Akhaonto ya motho ka mong',
  'shell.language': 'Puo', 'shell.skip': 'Tlolela ho dikahare', 'shell.nextVisit': 'Ketelo ya hao e latelang', 'tab.Home': 'Lehae', 'tab.Book care': 'Behela', 'tab.Visits': 'Diketelo', 'tab.Passport': 'Phasepoto', 'tab.More': 'Tse ding',
  'cta.book': 'Behela mooki', 'cta.passport': 'Bula phasepoto ya ka', 'cta.allVisits': 'Diketelo tsohle',
  'cta.gotIt': 'Ke utlwile', 'cta.back': 'Morao', 'cta.close': 'Kwala lebokose',
  'hero.title': 'Ikutlwe hantle.|Hae.', 'hero.body': 'Mooki ya nang le kgathallo. Tsebo ya ngaka. Tsohle o le hae.',
  'hero.trust': 'Baoki ba ngodisitsweng', 'hero.price': 'Diketelo ho tloha ho R249',
  'slide1.title': 'Tlhokomelo e tlang|ho wena.', 'slide1.body': 'Tlhokomelo ya bophelo ya lehae e tshepahalang, ka ho tobetsa ha se kae.', 'slide1.cta': 'Fumana tlhokomelo hona joale',
  'slide1.trust1': 'Lehae', 'slide1.trust2': 'Tlhokomelo e tshepahalang', 'slide1.trust3': 'Bakeng sa bao o ba ratang', 'slide1.caption': 'Tlhokomelo e tshwanang. Haufi le lehae.',
  'slide2.title': 'Bophelo ba hao.|Sebaka se le seng se sireletsehileng.', 'slide2.body': 'Diketelo, direkoto le tshehetso — tsohle ho MyThuso.', 'slide2.cta': 'Bula Thuso Pass',
  'slide2.trust1': 'Tlhokomelo e tshepahalang', 'slide2.trust2': 'Bakeng sa hao le ba lelapa', 'slide2.trust3': 'Bokamoso bo phetseng hantle', 'slide2.caption': 'Tlhokomelo ea re kopanya.',
  'slide3.title': 'Ikutlwe hantle.|Hae.', 'slide3.body': 'Tlhokomelo e etelletsweng ke mooki, e tliswa monyako wa hao.', 'slide3.cta': 'Behela mooki',
  'slide3.trust1': 'Ditsebi tse tshepahalang', 'slide3.trust2': 'Tlhokomelo ya hao', 'slide3.trust3': 'E bolokehile ebile e bonolo', 'slide3.caption': 'Tlhokomelo e ntle, moo o leng teng.'
 },
 'af-ZA': {
  'nav.section': 'JOU SORG', 'nav.Overview': 'Oorsig', 'nav.Book a nurse': 'Bespreek ’n verpleegster', 'nav.My visits': 'My besoeke',
  'nav.Health Passport': 'Gesondheidspaspoort', 'nav.My family': 'My gesin', 'nav.Care plans': 'Sorgplanne',
  'nav.Thuso Wallet': 'Thuso-beursie', 'nav.Explore MyThuso': 'Verken MyThuso', 'nav.Privacy & settings': 'Privaatheid en instellings',
  'shell.greeting': 'Hallo, Lerato', 'shell.greetingSub': 'Hier vir jou. En vir die mense vir wie jy lief is.',
  'shell.tagline': 'Hulp. Gesondheid. Huis.', 'shell.preview': 'Interaktiewe ontwerpvoorskou',
  'shell.previewNote': 'Fiktiewe data · Geen lewende sorg of betalings nie', 'shell.workspaces': 'Bekyk werkruimtes',
  'shell.breadcrumb': 'Jou sorg', 'shell.help': 'Hulp en ondersteuning', 'shell.personal': 'Persoonlike rekening',
  'shell.language': 'Taal', 'shell.skip': 'Spring na inhoud', 'shell.nextVisit': 'Jou volgende besoek', 'tab.Home': 'Tuis', 'tab.Book care': 'Bespreek', 'tab.Visits': 'Besoeke', 'tab.Passport': 'Paspoort', 'tab.More': 'Meer',
  'cta.book': 'Bespreek ’n verpleegster', 'cta.passport': 'Open my paspoort', 'cta.allVisits': 'Alle besoeke',
  'cta.gotIt': 'Verstaan', 'cta.back': 'Terug', 'cta.close': 'Sluit dialoog',
  'hero.title': 'Voel beter.|Tuis.', 'hero.body': '’n Sorgsame verpleegster. ’n Dokter se kundigheid. Alles van die gemak van jou huis af.',
  'hero.trust': 'Geregistreerde verpleegsters', 'hero.price': 'Besoeke vanaf R249',
  'slide1.title': 'Sorg wat na|jou toe kom.', 'slide1.body': 'Betroubare tuisgesondheidsorg met net ’n paar tikke.', 'slide1.cta': 'Kry sorg nou',
  'slide1.trust1': 'By die huis', 'slide1.trust2': 'Betroubare sorg', 'slide1.trust3': 'Vir die mense vir wie jy lief is', 'slide1.caption': 'Dieselfde sorg. Nader aan die huis.',
  'slide2.title': 'Jou gesondheid.|Een veilige plek.', 'slide2.body': 'Besoeke, rekords en ondersteuning — alles in MyThuso.', 'slide2.cta': 'Open Thuso Pass',
  'slide2.trust1': 'Betroubare sorg', 'slide2.trust2': 'Vir jou en jou geliefdes', 'slide2.trust3': 'Gesonder môres', 'slide2.caption': 'Sorg verbind ons.',
  'slide3.title': 'Voel beter.|Tuis.', 'slide3.body': 'Verpleegster-gelei sorg, tot by jou deur.', 'slide3.cta': 'Bespreek ’n verpleegster',
  'slide3.trust1': 'Betroubare professionele', 'slide3.trust2': 'Persoonlike sorg', 'slide3.trust3': 'Veilig en gerieflik', 'slide3.caption': 'Kwaliteitsorg, waar jy ook al is.'
 }
};
export const LocaleContext = createContext<LocaleCode>('en-ZA');
export function useT() {
 const code = useContext(LocaleContext);
 return (key: keyof typeof en) => dictionaries[code][key] ?? en[key] ?? String(key);
}
export const useLocaleCode = () => useContext(LocaleContext);
