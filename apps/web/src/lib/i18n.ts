import { createContext, useContext } from 'react';
import contract from '../../../../packages/catalog/locales.json';
/* Localisation — the reasoning. The words are in packages/catalog/locales.json and nowhere else.
 *
 * This file used to be one of three hand-typed copies of the same table, and the only thing holding
 * the three together was a check that asked whether each of them mentioned each locale code. That
 * check could not see a key translated here and forgotten on iOS, and it did not: when the table
 * moved into the contract, isiZulu called vetting two different things on the two native apps.
 * Swift and Kotlin are generated from the contract now by scripts/emit-locales.mjs; the web reads it
 * directly, because a browser can.
 *
 * Two rules are worth reading before adding anything here.
 *
 * A locale carries whole *sets* of keys. Every locale carries the shell — navigation, the tab bar,
 * the preview notices and the primary calls to action. Only four carry the hero banner and the
 * vetting console. A key a locale does not carry falls back to English, and which sets it carries
 * is declared in the contract so a reader can be told rather than left to discover it.
 *
 * Clinical wording is never translated by this module. A reference range, a dose, an observation
 * label and a refusal sentence out of a clinical contract stay in English until a clinician who
 * reads the language has reviewed them, and that is structural rather than a promise: there is no
 * clinical key in the contract for a translator to fill in, and clinicalLocale() below is what a
 * screen asks when it renders contract text. A mistranslated instruction is a safety problem.
 */

export type LocaleCode = string;
export type StringKey = string;

const reviewStates = Object.fromEntries(contract.reviewStates.map(state => [state.id, state]));

export const locales = contract.locales.map(locale => ({
 code: locale.code,
 label: locale.label,
 native: locale.native,
 sets: locale.sets as string[],
 /* Flattened onto the locale because every surface that offers a language has to show this. A
    review state a screen has to go and look up is a review state a screen will forget to show. */
 reviewLabel: reviewStates[locale.review.state].label,
 reviewNotice: reviewStates[locale.review.state].notice,
 reviewed: reviewStates[locale.review.state].reviewed,
 clinicallyReviewed: locale.clinicalReview.state !== 'none'
}));

export const sets = contract.sets;
export const clinicalRule = contract.clinicalRule;
export const signLanguage = contract.signLanguage;
export const fallbackRule = contract.fallback;
export const translationHonesty = contract.honesty;

const dictionaries = contract.strings as Record<string, Record<string, string>>;
const english = dictionaries['en-ZA'];

export const LocaleContext = createContext<LocaleCode>('en-ZA');

/* A key the chosen locale does not carry falls back to English. A key the contract does not carry
   at all falls back to the readable half of its own name — "nav.Language & access" renders as
   "Language & access" rather than as a dotted identifier, because a screen label nobody has put in
   the contract yet is a gap in the translation, not a gap in the sentence the reader is owed. */
export function t(key: StringKey, code: LocaleCode): string {
 return dictionaries[code]?.[key] ?? english[key] ?? key.slice(key.indexOf('.') + 1);
}
export function useT() {
 const code = useContext(LocaleContext);
 return (key: StringKey) => t(key, code);
}
export const useLocaleCode = () => useContext(LocaleContext);

/* The locale clinical copy is rendered in, which is not the locale the reader chose unless a
   clinician who reads that language has signed the review off in the contract. Nothing in the app
   can set that flag; it is a name, a registration number and a date in packages/catalog/locales.json
   or it is not true. Today it returns en-ZA for every locale except English, and the language dialog
   says so rather than letting somebody find out from a dose. */
export function clinicalLocale(code: LocaleCode): LocaleCode {
 return locales.find(locale => locale.code === code)?.clinicallyReviewed ? code : 'en-ZA';
}
export const useClinicalLocale = () => clinicalLocale(useContext(LocaleContext));
/* The set a locale is missing is a fact about the product, not an error. `missingSets` is what the
   language dialog reads to tell somebody choosing isiXhosa that the landing banner will be in
   English before they choose it. */
export function missingSets(code: LocaleCode) {
 const locale = locales.find(l => l.code === code);
 return contract.sets.filter(set => !locale?.sets.includes(set.id));
}
