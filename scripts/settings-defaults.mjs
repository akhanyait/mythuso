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
 * The types a phone is written today: whole minutes above nought (the four field-safety timings and Care's
 * offer expiry), a list of them, a role list from the vetting register (Care's scope settings), and on or
 * off (whether an Encounter entry counts as signed). An emitter that needs another type for a phone extends
 * this function, so the refusal and the sentence stay in one place.
 *
 * WHY A PHONE IS TOLD WHETHER THE DEFAULT WAS REVIEWED, AND NOTHING ELSE ABOUT A REVIEW. A phone uses the
 * default and never the value an admin puts in force on the web, so the only value it can honestly describe
 * is the default. `unreviewed` is true while the contract's default waits on a clinical review and names no
 * reviewer; a phone shows "not clinically reviewed" beside what that default affects, and stops showing it
 * the day a reviewed default is written into the contract and emitted again — never because a doctor
 * confirmed a value on the web that the phone is not using.
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
 if (setting.type === 'roleList') {
  if (!Array.isArray(entry.value) || !entry.value.length || !entry.value.every(role => typeof role === 'string' && /^[a-z][a-z-]*$/.test(role))) {
   throw new Error(`${source} setting ${key} must name at least one role, each a vetting register id, to be written for a phone.`);
  }
 } else if (setting.type === 'boolean') {
  if (typeof entry.value !== 'boolean') throw new Error(`${source} setting ${key} must be true or false to be written for a phone.`);
 } else {
  const values = list ? entry.value : [entry.value];
  if (!Array.isArray(values) || !values.length || !values.every(v => Number.isInteger(v) && v > 0)) {
   throw new Error(`${source} setting ${key} must be ${list ? 'a list of whole numbers' : 'a whole number'} above nought to be written for a phone.`);
  }
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 const unreviewed = Boolean(setting.reviewRequired) && !(entry.reviewedBy?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn ?? ''));
 const review = setting.reviewRequired ? (unreviewed ? ' Not clinically reviewed.' : ` Clinically reviewed by the ${entry.reviewedBy} on ${entry.reviewedOn}.`) : '';
 return { value: entry.value, unreviewed, note: `${whose}${review} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}
