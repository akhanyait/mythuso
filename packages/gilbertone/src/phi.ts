/* Sensitive-detail detection for South African patterns, before anything else is done with a
   message.

   A message that carries an identity number, a phone number, an email address or a medical aid
   number is answered before it is classified, and the API's audit line keeps the redacted text
   rather than the original. The patterns are deliberately narrow: this detector decides whether a
   sentence is refused and what an audit line keeps, so a false positive costs somebody their
   sentence and a false negative puts a number in a log, and both mistakes are measured in the
   tests rather than eyeballed.

   The identity-number pattern is the one place a shape alone is not enough: a bare run of digits
   is a date on a form, a reference number or a parcel tracking code far more often than it is a
   person's identity number, so a thirteen-digit run is flagged only when it passes the Luhn check
   every South African identity number ends with. RegExp objects carry a lastIndex once /g has run
   on them, so every function here builds a fresh regular expression per call: the same call twice
   must give the same answer. */

export interface PHIPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const PHI_PATTERNS: readonly PHIPattern[] = Object.freeze([
  {
    name: "sa-id-number",
    pattern: /\b\d{13}\b/g,
    replacement: "[ID REDACTED]",
  },
  {
    name: "phone-intl",
    pattern: /\+27\s?\d[\d\s]{7,10}/g,
    replacement: "[PHONE REDACTED]",
  },
  {
    name: "phone-local",
    pattern: /\b0[1-9]\d[\d\s]{7,9}\b/g,
    replacement: "[PHONE REDACTED]",
  },
  {
    name: "email",
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    replacement: "[EMAIL REDACTED]",
  },
  {
    name: "medical-aid",
    pattern: /\b[A-Z]{2,5}\d{6,12}\b/g,
    replacement: "[MEDICAL AID REDACTED]",
  },
]);

/* The Luhn check, over the digits as they stand. Every South African identity number is built so
   that this sum lands on a multiple of ten; a thirteen-digit number that fails it is some other
   number, and refusing to treat it as an identity number is the honest reading. */
export function luhnValid(value: string): boolean {
  if (!value) return false;
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const code = value.charCodeAt(index) - 48;
    if (code < 0 || code > 9) return false;
    let digit = code;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const matchesList = (
  pattern: PHIPattern,
  text: string,
): Array<{ pattern: PHIPattern; match: string }> => {
  /* A fresh expression per call: the shared one may be mid-scan from an earlier caller. */
  const fresh = new RegExp(pattern.pattern.source, pattern.pattern.flags);
  const found: Array<{ pattern: PHIPattern; match: string }> = [];
  for (const match of text.matchAll(fresh)) {
    /* The one pattern whose shape is not enough on its own. */
    if (pattern.name === "sa-id-number" && !luhnValid(match[0])) continue;
    found.push({ pattern, match: match[0] });
  }
  return found;
};

/** Whether any sensitive pattern is present in the text. */
export function containsPHI(text: string): boolean {
  return PHI_PATTERNS.some((pattern) => matchesList(pattern, text).length > 0);
}

/** Every detected item, in the order the patterns are listed. */
export function detectPHI(
  text: string,
): Array<{ name: string; match: string }> {
  return PHI_PATTERNS.flatMap((pattern) =>
    matchesList(pattern, text).map((found) => ({
      name: found.pattern.name,
      match: found.match,
    })),
  );
}

/** The text with every detected item replaced by its pattern's token. */
export function redactPHI(text: string): string {
  let redacted = text;
  for (const pattern of PHI_PATTERNS) {
    const fresh = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    redacted = redacted.replace(fresh, (match) =>
      pattern.name === "sa-id-number" && !luhnValid(match)
        ? match
        : pattern.replacement,
    );
  }
  return redacted;
}
