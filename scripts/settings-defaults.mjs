/* One way every emitter writes a setting's default into Swift and Kotlin.
 *
 * Neither native app has an admin surface or reaches a settings route, so each uses a setting's default
 * as the contract gives it, generated rather than typed. What a phone is told about that number is the
 * same on every engine: whether somebody decided it or it is still a proposal, and that an admin may
 * change it on the web. So this is the only code that reads a default for a phone and the only place the
 * sentence is written, and an emitter asks it rather than reading default.value itself.
 *
 * It refuses, before two apps are told either, a default that says it was decided without naming who and
 * on what day, and a proposal that does not say who proposed it and why. The rest of the shape — bounds,
 * guardrails, the changelog — is scripts/check-boundaries.mjs's, on every build.
 *
 * Numbers only, today: the four field-safety timings and Care's offer expiry are whole minutes above
 * nought. An emitter that needs another type for a phone extends this function, so the refusal and the
 * sentence stay in one place.
 */
export function settingDefault(source, contract, key, { list = false } = {}) {
 const setting = contract.settings?.items?.find(item => item.key === key);
 if (!setting) throw new Error(`${source} has no setting "${key}" in its settings block.`);
 const entry = setting.default;
 if (!entry || !('decidedBy' in entry)) throw new Error(`${source} setting ${key} has lost its decidedBy. A default nobody decided must say so.`);
 const decided = entry.decidedBy !== null;
 if (decided ? !(String(entry.decidedBy).trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.decidedOn ?? '')) : !(entry.proposedBy?.trim() && entry.proposedBecause?.trim())) {
  throw new Error(`${source} setting ${key} ${decided ? 'says it was decided without naming who decided it and on what day' : 'is a proposal that does not say who proposed it and why'}.`);
 }
 const values = list ? entry.value : [entry.value];
 if (!Array.isArray(values) || !values.length || !values.every(v => Number.isInteger(v) && v > 0)) {
  throw new Error(`${source} setting ${key} must be ${list ? 'a list of whole numbers' : 'a whole number'} above nought to be written for a phone.`);
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 return { value: entry.value, note: `${whose} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}
