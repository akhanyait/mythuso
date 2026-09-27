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
 * photograph is named by stem in the contract and turned into addresses here — two WebP widths for
 * a metered phone and a wide desk, and a fallback behind them.
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

/* The figure, since 28 September 2026. The founder called the hero's crops "cut and low quality",
   and they were: 585-pixel slivers of a composition whose right third is under two baked cards,
   cropped again by the page and upscaled on a desktop. The same people exist as transparent cut-outs
   at 1122×1402, and scripts/prepare-banners.py takes those — and, for the one slide that has no
   cut-out, the walking couple at native size from the part of the frame nothing is baked over.

   The pixel size of each is written here because an <img> without width and height moves the whole
   first screen when the picture arrives, and a type cannot read a PNG header. It is not a second
   copy of anything a person decides: scripts/check-boundaries.mjs reads the source's own header in
   packages/banners and fails the build when this table disagrees with it, and the same check holds
   `cutout` to whether that source has an alpha channel.

   `srcSet` is two widths: 640 for a phone, where the figure stands about 200 CSS pixels wide and 640
   still covers a three-times screen, and the native width for a desktop. `fallback` is for a browser
   that cannot decode WebP — a PNG for a cut-out, because a JPEG has no transparency and the figure
   would arrive in a white box, and a JPEG for the photograph. */
type Figure = { width: number; height: number; cutout: boolean };
const figures: Record<string, Figure> = {
 'care-that-comes-to-you': { width: 1122, height: 1402, cutout: true },
 'for-your-family': { width: 1122, height: 1402, cutout: true },
 'everyday-wellbeing': { width: 720, height: 830, cutout: false },
 'for-the-nurses': { width: 1122, height: 1402, cutout: true }
};
export const figureFor = (slide: HeroSlide) => {
 const { width, height, cutout } = figures[slide.photograph];
 const stem = `/banners/hero-${slide.photograph}`;
 return {
  width, height, cutout,
  srcSet: `${stem}-640.webp 640w, ${stem}-${width}.webp ${width}w`,
  fallback: `${stem}.${cutout ? 'png' : 'jpg'}`
 };
};

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
