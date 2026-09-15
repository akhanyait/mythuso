/**
 * Whether a request is carrying a card number, by the digits and by the name.
 *
 * ── Why the first two versions were both wrong ───────────────────────────────────────────────
 *
 * The first stripped everything but digits and looked for thirteen in a row, and a dated visit
 * reference with an attempt number after it became a card. The second read the value as written with
 * single spaces and dashes between digits, and missed dots, slashes, double and non-breaking spaces,
 * full-width and Arabic-Indic digits, a number sent as a JSON number, anything nested five deep, and a
 * field called ccnum — while still refusing ordinary references whose dates and hours ran to thirteen
 * digits. Both asked one question, "is this long enough", which is not the question.
 *
 * ── What is asked now ────────────────────────────────────────────────────────────────────────
 *
 * Every string and number at any depth is normalised — any Unicode decimal digit to its ASCII value —
 * and split into runs of digits joined by separators, which are dropped. A run is a card number only if
 * it has thirteen to nineteen digits and passes the Luhn check every issued card number passes. A
 * thirteen-digit run that starts with a valid date is a South African identity number, which uses the
 * same check digit, and is not a card: refusing a person's identity number as a card would tell them
 * the wrong thing about what they sent. A field whose name is on the declared list of card names is
 * refused whatever it holds. A reference field is judged as one value, not as free text, so the date
 * inside a reference cannot be read as the start of a card number.
 */
import { canonical, cardSpellings, money } from './contract.ts';

/* The zero of each decimal digit block this detector reads; every Unicode decimal digit block runs zero
   to nine consecutively from its zero. */
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810, 0xff10];

export function asciiDigits(text: string): string {
 let out = '';
 for (const ch of text) {
  const cp = ch.codePointAt(0)!;
  const zero = DIGIT_ZEROS.find(z => cp >= z && cp <= z + 9);
  out += zero === undefined ? ch : String(cp - zero);
 }
 return out;
}

/* A separator is anything a person puts between groups of card digits: spaces of every width, dots,
   dashes of every length, slashes, underscores and middle dots. A letter or a colon ends a run. */
const RUN = /\d(?:[\s.\-/_·•‐‑‒–—]*\d)*/gu;

export function luhn(digits: string): boolean {
 let sum = 0;
 for (let i = 0; i < digits.length; i += 1) {
  let d = Number(digits[digits.length - 1 - i]);
  if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
  sum += d;
 }
 return digits.length > 0 && sum % 10 === 0;
}

const looksLikeIdNumber = (digits: string) => {
 if (digits.length !== 13) return false;
 const month = Number(digits.slice(2, 4)), day = Number(digits.slice(4, 6));
 return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

export const isCardNumber = (digits: string) => digits.length >= 13 && digits.length <= 19 && luhn(digits) && !looksLikeIdNumber(digits);

/* How a person writes a card number when they write it in groups: fours with a shorter last group, or
   American Express's four, six and five. A dated reference joins its digits as four, two, two, four and
   one — a date and an hour — and one such reference in ten passes Luhn by chance, so the grouping is
   what tells them apart. Digits with no separators at all are judged by their length and check digit. */
const cardGrouping = (run: string) => {
 const groups = run.split(/\D+/).filter(Boolean);
 if (groups.length === 1) return true;
 const sizes = groups.map(g => g.length);
 const last = sizes[sizes.length - 1]!;
 if (sizes.slice(0, -1).every(n => n === 4) && last >= 1 && last <= 4) return true;
 return sizes.length === 3 && sizes[0] === 4 && sizes[1] === 6 && (sizes[2] === 5 || sizes[2] === 4);
};

const runsIn = (text: string) => [...asciiDigits(text).matchAll(RUN)].map(m => m[0]).filter(cardGrouping).map(run => run.replace(/\D/g, ''));

/** Every declared spelling of a field that holds a card number: the payment-result door's and Money's own. */
export const cardFieldNames = new Set([...cardSpellings, ...money.cardFieldNames.map(canonical)]);

const isReferenceField = (key: string | null) => key !== null && /(Ref|Refs)$/.test(key);

const numberDigits = (value: number | bigint) =>
 typeof value === 'bigint' ? (value < 0n ? -value : value).toString() : Number.isFinite(value) ? Math.abs(value).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }) : '';

export function carriesACard(value: unknown): boolean {
 const seen = new WeakSet<object>();
 const stack: { key: string | null; value: unknown }[] = [{ key: null, value }];
 while (stack.length) {
  const { key, value: at } = stack.pop()!;
  if (key !== null && cardFieldNames.has(canonical(key))) return true;
  if (typeof at === 'string') {
   if (isReferenceField(key)) {
    /* A reference is one value. Only a reference made of nothing but a card number is one. */
    const whole = asciiDigits(at);
    if (/^[\d\s.\-/_·•‐‑‒–—]+$/u.test(whole) && isCardNumber(whole.replace(/\D/g, ''))) return true;
   } else if (runsIn(at).some(isCardNumber)) return true;
  } else if (typeof at === 'number' || typeof at === 'bigint') {
   if (isCardNumber(numberDigits(at))) return true;
  } else if (at !== null && typeof at === 'object') {
   if (seen.has(at)) continue;
   seen.add(at);
   if (Array.isArray(at)) for (const item of at) stack.push({ key, value: item });
   else for (const [k, v] of Object.entries(at as Record<string, unknown>)) stack.push({ key: k, value: v });
  }
 }
 return false;
}
