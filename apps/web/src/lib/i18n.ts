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
 'shell.language': 'Language', 'shell.skip': 'Skip to content',
 'cta.book': 'Book a nurse', 'cta.passport': 'Open my passport', 'cta.allVisits': 'All visits',
 'cta.gotIt': 'Got it', 'cta.back': 'Back', 'cta.close': 'Close dialog',
 'hero.title': 'Feel better.|Right at home.', 'hero.body': 'A caring nurse. A doctor’s expertise. All from the comfort of your home.',
 'hero.trust': 'Registered nurses', 'hero.price': 'Visits from R249'
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
  'shell.language': 'Ulimi', 'shell.skip': 'Yeqela kokuqukethwe',
  'cta.book': 'Bhukha umhlengikazi', 'cta.passport': 'Vula iphasiphothi yami', 'cta.allVisits': 'Konke ukuvakashelwa',
  'cta.gotIt': 'Ngiyezwa', 'cta.back': 'Emuva', 'cta.close': 'Vala ibhokisi',
  'hero.title': 'Zizwe ungcono.|Ekhaya.', 'hero.body': 'Umhlengikazi onendaba. Ulwazi lukadokotela. Konke usekhaya.',
  'hero.trust': 'Abahlengikazi ababhalisiwe', 'hero.price': 'Ukuvakashelwa kusukela ku-R249'
 },
 'st-ZA': {
  'nav.section': 'TLHOKOMELO YA HAO', 'nav.Overview': 'Kakaretso', 'nav.Book a nurse': 'Behela mooki', 'nav.My visits': 'Diketelo tsa ka',
  'nav.Health Passport': 'Phasepoto ya Bophelo', 'nav.My family': 'Lelapa la ka', 'nav.Care plans': 'Merero ya tlhokomelo',
  'nav.Thuso Wallet': 'Sepache sa Thuso', 'nav.Explore MyThuso': 'Hlahloba MyThuso', 'nav.Privacy & settings': 'Lekunutu le ditlhophiso',
  'shell.greeting': 'Dumela, Lerato', 'shell.greetingSub': 'Re teng bakeng sa hao. Le batho bao o ba ratang.',
  'shell.tagline': 'Thuso. Bophelo. Lehae.', 'shell.preview': 'Ponelopele ya moralo e sebetsang',
  'shell.previewNote': 'Datha ya boiqapelo · Ha ho tlhokomelo kapa tefo ya nnete', 'shell.workspaces': 'Sheba dibaka tsa mosebetsi',
  'shell.breadcrumb': 'Tlhokomelo ya hao', 'shell.help': 'Thuso le tshehetso', 'shell.personal': 'Akhaonto ya motho ka mong',
  'shell.language': 'Puo', 'shell.skip': 'Tlolela ho dikahare',
  'cta.book': 'Behela mooki', 'cta.passport': 'Bula phasepoto ya ka', 'cta.allVisits': 'Diketelo tsohle',
  'cta.gotIt': 'Ke utlwile', 'cta.back': 'Morao', 'cta.close': 'Kwala lebokose',
  'hero.title': 'Ikutlwe hantle.|Hae.', 'hero.body': 'Mooki ya nang le kgathallo. Tsebo ya ngaka. Tsohle o le hae.',
  'hero.trust': 'Baoki ba ngodisitsweng', 'hero.price': 'Diketelo ho tloha ho R249'
 },
 'af-ZA': {
  'nav.section': 'JOU SORG', 'nav.Overview': 'Oorsig', 'nav.Book a nurse': 'Bespreek ’n verpleegster', 'nav.My visits': 'My besoeke',
  'nav.Health Passport': 'Gesondheidspaspoort', 'nav.My family': 'My gesin', 'nav.Care plans': 'Sorgplanne',
  'nav.Thuso Wallet': 'Thuso-beursie', 'nav.Explore MyThuso': 'Verken MyThuso', 'nav.Privacy & settings': 'Privaatheid en instellings',
  'shell.greeting': 'Hallo, Lerato', 'shell.greetingSub': 'Hier vir jou. En vir die mense vir wie jy lief is.',
  'shell.tagline': 'Hulp. Gesondheid. Huis.', 'shell.preview': 'Interaktiewe ontwerpvoorskou',
  'shell.previewNote': 'Fiktiewe data · Geen lewende sorg of betalings nie', 'shell.workspaces': 'Bekyk werkruimtes',
  'shell.breadcrumb': 'Jou sorg', 'shell.help': 'Hulp en ondersteuning', 'shell.personal': 'Persoonlike rekening',
  'shell.language': 'Taal', 'shell.skip': 'Spring na inhoud',
  'cta.book': 'Bespreek ’n verpleegster', 'cta.passport': 'Open my paspoort', 'cta.allVisits': 'Alle besoeke',
  'cta.gotIt': 'Verstaan', 'cta.back': 'Terug', 'cta.close': 'Sluit dialoog',
  'hero.title': 'Voel beter.|Tuis.', 'hero.body': '’n Sorgsame verpleegster. ’n Dokter se kundigheid. Alles van die gemak van jou huis af.',
  'hero.trust': 'Geregistreerde verpleegsters', 'hero.price': 'Besoeke vanaf R249'
 }
};
export const LocaleContext = createContext<LocaleCode>('en-ZA');
export function useT() {
 const code = useContext(LocaleContext);
 return (key: keyof typeof en) => dictionaries[code][key] ?? en[key] ?? String(key);
}
export const useLocaleCode = () => useContext(LocaleContext);
