/* One way every emitter writes a setting's default into Swift and Kotlin.
 *
 * Neither native app has an admin surface or reaches a settings route, so each uses a setting's default
 * as the contract gives it, generated rather than typed. What a phone is told about that default is the
 * same on every engine: whether somebody decided it or it is still a proposal, that an admin may change it
 * on the web, and — for a setting that waits on a clinical review — whether that default was reviewed. So
 * this is the only code that reads a default for a phone and the only place the sentence is written, and
 * an emitter asks it rather than reading default.value itself.
 *
 * It refuses, before two apps are told either, a default that says it was decided without naming who and
 * on what day, and a proposal that does not say who proposed it and why. The rest of the shape — bounds,
 * guardrails, the changelog — is scripts/check-boundaries.mjs's, on every build.
 *
 * The types a phone is written today: whole minutes, counts, cents and percentages above nought (the four
 * field-safety timings, Care's offer expiry and the doctor's fee), a list of them, a role list from the
 * vetting register (Care's scope settings), on or off (whether an Encounter entry counts as signed, whether
 * the doctor's fee is confirmed), and — for Money's settings — wording that is never empty, one of a few
 * named choices, and a record of whole numbers and choices changed together. A rota is not written for a
 * phone. An emitter that needs another type for a phone extends this function, so the refusal and the
 * sentence stay in one place. settingBounds gives a phone the range an admin may set a number within, for
 * a screen that shows it, from the same place.
 *
 * WHY A PHONE IS TOLD WHETHER THE DEFAULT WAS REVIEWED, AND NOTHING ELSE ABOUT A REVIEW. A phone uses the
 * default and never the value an admin puts in force on the web, so the only value it can honestly describe
 * is the default. `unreviewed` is true while the contract's default waits on a clinical review and names no
 * reviewer; a phone shows "not clinically reviewed" beside what that default affects, and stops showing it
 * the day a reviewed default is written into the contract and emitted again — never because a doctor
 * confirmed a value on the web that the phone is not using.
 */
const NUMBERS = new Set(['minutes', 'count', 'moneyCents', 'percentage']);
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

function settingOf(source, contract, key) {
 const setting = contract.settings?.items?.find(item => item.key === key);
 if (!setting) throw new Error(`${source} has no setting "${key}" in its settings block.`);
 return setting;
}

export function settingDefault(source, contract, key, { list = false } = {}) {
 const setting = settingOf(source, contract, key);
 const entry = setting.default;
 if (!entry || !('decidedBy' in entry)) throw new Error(`${source} setting ${key} has lost its decidedBy. A default nobody decided must say so.`);
 const decided = entry.decidedBy !== null;
 if (decided ? !(String(entry.decidedBy).trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.decidedOn ?? '')) : !(entry.proposedBy?.trim() && entry.proposedBecause?.trim())) {
  throw new Error(`${source} setting ${key} ${decided ? 'says it was decided without naming who decided it and on what day' : 'is a proposal that does not say who proposed it and why'}.`);
 }
 const value = entry.value;
 if (setting.type === 'roleList') {
  if (!Array.isArray(value) || !value.length || !value.every(role => typeof role === 'string' && /^[a-z][a-z-]*$/.test(role))) {
   throw new Error(`${source} setting ${key} must name at least one role, each a vetting register id, to be written for a phone.`);
  }
 } else if (setting.type === 'boolean') {
  if (typeof value !== 'boolean') throw new Error(`${source} setting ${key} must be true or false to be written for a phone.`);
 } else if (setting.type === 'enum' || setting.type === 'text') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${source} setting ${key} must be wording that is not empty to be written for a phone.`);
 } else if (setting.type === 'record') {
  if (!isRecord(value) || !Object.values(value).every(v => Number.isInteger(v) || typeof v === 'boolean' || (typeof v === 'string' && v.trim()))) {
   throw new Error(`${source} setting ${key} must be a record of whole numbers, choices and on-or-offs to be written for a phone.`);
  }
 } else if (NUMBERS.has(setting.type) || (setting.type === 'list' && NUMBERS.has(setting.of))) {
  const values = list ? value : [value];
  if (!Array.isArray(values) || !values.length || !values.every(v => Number.isInteger(v) && v > 0)) {
   throw new Error(`${source} setting ${key} must be ${list ? 'a list of whole numbers' : 'a whole number'} above nought to be written for a phone.`);
  }
 } else {
  throw new Error(`${source} setting ${key} is a ${setting.type}, which is not written for a phone.`);
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 const unreviewed = Boolean(setting.reviewRequired) && !(entry.reviewedBy?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn ?? ''));
 const review = setting.reviewRequired ? (unreviewed ? ' Not clinically reviewed.' : ` Clinically reviewed by the ${entry.reviewedBy} on ${entry.reviewedOn}.`) : '';
 return { value, unreviewed, note: `${whose}${review} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}

/** The lowest and highest an admin may set a number to, for a phone that shows the range beside it. */
export function settingBounds(source, contract, key) {
 const bounds = settingOf(source, contract, key).bounds;
 if (!Number.isInteger(bounds?.lowest?.value) || !Number.isInteger(bounds?.highest?.value) || bounds.lowest.value > bounds.highest.value) {
  throw new Error(`${source} setting ${key} has no bounds of two whole numbers, lowest first, to be written for a phone.`);
 }
 return { lowest: bounds.lowest.value, highest: bounds.highest.value };
}
