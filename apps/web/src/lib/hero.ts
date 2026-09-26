import contract from '../../../../packages/catalog/hero.json';
/* The hero banner — the reasoning, with no screen attached to it.
 *
 * packages/catalog/hero.json is the design. The founder supplied four finished 1774×887
 * compositions and asked for the pieces loose, so every word of every slide is in that file and
 * none of it is in this one: an eyebrow, a two-tone headline, a paragraph, a call to action, three
 * trust marks and two floating cards, plus the two lines every slide carries. What this module does
 * is the three things a contract of words cannot do for itself.
 *
 * IT NAMES A PICTURE FOR A SLIDE. A contract of sentences knows nothing about a crop, so the
 * photograph is named by stem in the contract and turned into an address here — WebP first for a
 * metered connection, the .jpg the same crop was published as behind it.
 *
 * IT TURNS A DESTINATION INTO A DOOR. `action.goes` is one of four words. Where each of them leads
 * is a property of this application's addresses rather than of the banner, and it is written once
 * here so that a slide cannot promise a screen that does not exist — `sectionFor` returns a page
 * name the patient shell actually navigates to, and lib/roles.ts turns it into a parameter.
 *
 * IT DRAWS NO ICON AND NO COLOUR. Both are names in the contract, so that three platforms each use
 * the set they already have. The mapping from a name to a glyph belongs to the screen; what belongs
 * here is the list of names, so a name added to the contract with nothing drawing it is a type
 * error rather than a blank disc.
 *
 * WHAT IT MUST NOT ACQUIRE. A sentence. If a slide needs a word that is not below, it goes in
 * packages/catalog/hero.json and arrives here — a banner half in a contract and half in a component
 * is the state this file exists to end. */

export type HeroTint = 'peach' | 'mint';
export type HeroIcon = 'nurse' | 'stethoscope' | 'passport' | 'family' | 'message' | 'plaster'
 | 'walking' | 'apple' | 'moon' | 'calendar' | 'clinical' | 'handover' | 'home' | 'lock' | 'leaf';
export type HeroDestination = 'app' | 'family' | 'live-well' | 'nurse';

export type HeroMark = { icon: HeroIcon; lines: readonly string[] };
export type HeroCard = { at: 'top' | 'foot'; icon: HeroIcon; tint: HeroTint; title: string; lines: readonly string[] };
export type HeroSlide = {
 id: string;
 eyebrow: string;
 headline: { lead: string; accent: string };
 body: string;
 action: { label: string; goes: HeroDestination };
 photograph: string;
 marks: readonly HeroMark[];
 cards: readonly HeroCard[];
};

export const slides = contract.slides as readonly HeroSlide[];
/* The two lines every slide carries. They are standing rather than per-slide on purpose, and the
   contract says why: a sentence declaring that nobody in these photographs is a MyThuso nurse is
   not something a rotation may carry off the screen. */
export const standing = contract.standing;
/* The third standing line, as a template. It says who comes and what it costs, under the headline
   on every slide, and the one word it does not carry is the number: {price} is filled by the page
   from the lowest launch price in packages/catalog/services.json, because a price typed into a
   sentence in a JSON file is still a second copy of a price. */
export const priceLine = (price: string) => standing.priceLine.replace('{price}', price);

/* The photograph, WebP first. scripts/render-illustrations.mjs publishes both from the one crop in
   packages/banners, and the .jpg stays as the fallback for a browser that cannot decode the other —
   which is the same ladder the cut-outs already use, for the same reason: this page is read on
   mid-range Android handsets on metered data, and the four photographs are about 140 kB as WebP
   against about 290 kB as JPEG. */
export const photographWebp = (slide: HeroSlide) => `/banners/${slide.photograph}.webp`;
export const photographJpeg = (slide: HeroSlide) => `/banners/${slide.photograph}.jpg`;

/* Where each of the four calls to action leads.
 *
 * `app` is the product's front door and carries no parameter, which is what the bare address means.
 * `nurse` is a role, and a role has been a link since the four entries became one. The other two
 * are sections of the patient application — a slide that says "Explore family care" and lands a
 * reader on somebody's home screen has not kept the one promise it made — so they name the page the
 * patient shell navigates to and lib/roles.ts writes it into the address.
 *
 * Returning the page NAME rather than an href is deliberate: App.tsx routes by that string, so a
 * section renamed there without being renamed here fails to compile rather than opening the wrong
 * screen. */
const sections: Record<HeroDestination, string | null> = {
 app: null,
 family: 'My family',
 'live-well': 'Live well',
 nurse: null
};
export const sectionFor = (goes: HeroDestination) => sections[goes];
export const roleFor = (goes: HeroDestination) => goes === 'nurse' ? 'nurse' : null;
