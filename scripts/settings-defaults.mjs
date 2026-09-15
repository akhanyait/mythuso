/* One way every emitter writes a setting's default into Swift and Kotlin.
 *
 * Neither native app has an admin surface or reaches a settings route, so each uses a setting's default
 * as the contract gives it, generated rather than typed. What a phone is told about that value is the
 * same on every engine: whether somebody decided it or it is still a proposal, and that an admin may
 * change it on the web. So this is the only code that reads a default for a phone and the only place the
 * sentence is written, and an emitter asks it rather than reading default.value itself.
 *
 * It refuses, before two apps are told either, a default that says it was decided without naming who and
 * on what day, and a proposal that does not say who proposed it and why. The rest of the shape — bounds,
 * guardrails, the changelog — is scripts/check-boundaries.mjs's, on every build.
 *
 * Minutes, counts, cents and percentages are whole numbers above nought, as the field-safety timings and
 * Care's offer expiry are. Money's settings added the rest a phone needs on 15 September 2026: wording
 * that is never empty, an on-or-off, one of a few named choices, and a record of whole numbers and
 * choices changed together. A roleList or a rota is not written for a phone, because a phone never acts
 * on who may change something. settingBounds gives a phone the range an admin may set a number within,
 * for a screen that shows it, from the same place.
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
 if (NUMBERS.has(setting.type) || (setting.type === 'list' && NUMBERS.has(setting.of))) {
  const values = list ? value : [value];
  if (!Array.isArray(values) || !values.length || !values.every(v => Number.isInteger(v) && v > 0)) {
   throw new Error(`${source} setting ${key} must be ${list ? 'a list of whole numbers' : 'a whole number'} above nought to be written for a phone.`);
  }
 } else if (setting.type === 'boolean') {
  if (typeof value !== 'boolean') throw new Error(`${source} setting ${key} must be true or false to be written for a phone.`);
 } else if (setting.type === 'enum' || setting.type === 'text') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${source} setting ${key} must be wording that is not empty to be written for a phone.`);
 } else if (setting.type === 'record') {
  if (!isRecord(value) || !Object.values(value).every(v => Number.isInteger(v) || typeof v === 'boolean' || (typeof v === 'string' && v.trim()))) {
   throw new Error(`${source} setting ${key} must be a record of whole numbers, choices and on-or-offs to be written for a phone.`);
  }
 } else {
  throw new Error(`${source} setting ${key} is a ${setting.type}, which is not written for a phone.`);
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 return { value, note: `${whose} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}

/** The lowest and highest an admin may set a number to, for a phone that shows the range beside it. */
export function settingBounds(source, contract, key) {
 const bounds = settingOf(source, contract, key).bounds;
 if (!Number.isInteger(bounds?.lowest?.value) || !Number.isInteger(bounds?.highest?.value) || bounds.lowest.value > bounds.highest.value) {
  throw new Error(`${source} setting ${key} has no bounds of two whole numbers, lowest first, to be written for a phone.`);
 }
 return { lowest: bounds.lowest.value, highest: bounds.highest.value };
}
