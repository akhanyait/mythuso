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
 * WHAT A PHONE MAY BE HANDED, by the setting's own type, and a default that is not that is refused here
 * rather than written as something a phone would misread:
 *   minutes, count, moneyCents, percentage   a whole number above nought, or with list a list of them — the
 *             field-safety timings, Care's offer expiry, the thread's longest message; a count whose setting
 *             allows nought may be nought — the hours a thread stays open after its visit
 *   roleList  role ids from the vetting register, each once and at least one — Care's scope settings, who
 *             answers a handover
 *   boolean   true or false, one of its allowed values if it names them — whether an Encounter entry counts
 *             as signed, photos in a thread
 *   enum      a word that is one of its allowed values — the named-nurse fallback
 *   schedule  a rota of { post, days, from, to }, each window ending after it starts — the handover desk
 * An emitter that needs another type for a phone extends this function, so the refusal and the sentence
 * stay in one place.
 *
 * WHY A PHONE IS TOLD WHETHER THE DEFAULT WAS REVIEWED, AND NOTHING ELSE ABOUT A REVIEW. A phone uses the
 * default and never the value an admin puts in force on the web, so the only value it can honestly describe
 * is the default. `unreviewed` is true while the contract's default waits on a clinical review and names no
 * reviewer; a phone shows "not clinically reviewed" beside what that default affects, and stops showing it
 * the day a reviewed default is written into the contract and emitted again — never because a doctor
 * confirmed a value on the web that the phone is not using.
 */
const HHMM = /^([01]\d|2[0-4]):[0-5]\d$/;

export function settingDefault(source, contract, key, { list = false } = {}) {
 const setting = contract.settings?.items?.find(item => item.key === key);
 if (!setting) throw new Error(`${source} has no setting "${key}" in its settings block.`);
 const entry = setting.default;
 if (!entry || !('decidedBy' in entry)) throw new Error(`${source} setting ${key} has lost its decidedBy. A default nobody decided must say so.`);
 const decided = entry.decidedBy !== null;
 if (decided ? !(String(entry.decidedBy).trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.decidedOn ?? '')) : !(entry.proposedBy?.trim() && entry.proposedBecause?.trim())) {
  throw new Error(`${source} setting ${key} ${decided ? 'says it was decided without naming who decided it and on what day' : 'is a proposal that does not say who proposed it and why'}.`);
 }
 const allowed = (setting.allowed ?? []).map(choice => choice.value);
 if (setting.type === 'roleList') {
  if (!Array.isArray(entry.value) || !entry.value.length || new Set(entry.value).size !== entry.value.length || !entry.value.every(role => typeof role === 'string' && /^[a-z][a-z-]*$/.test(role))) {
   throw new Error(`${source} setting ${key} must name at least one role, each once and each a vetting register id, to be written for a phone.`);
  }
 } else if (setting.type === 'boolean') {
  if (typeof entry.value !== 'boolean' || (allowed.length && !allowed.includes(entry.value))) throw new Error(`${source} setting ${key} must be true or false, and one of its allowed values, to be written for a phone.`);
 } else if (setting.type === 'enum') {
  if (typeof entry.value !== 'string' || !allowed.includes(entry.value)) throw new Error(`${source} setting ${key} must be one of its allowed choices to be written for a phone.`);
 } else if (setting.type === 'schedule') {
  if (!Array.isArray(entry.value) || !entry.value.length || !entry.value.every(w => typeof w?.post === 'string' && Array.isArray(w.days) && w.days.length && HHMM.test(w.from) && HHMM.test(w.to) && w.from < w.to)) {
   throw new Error(`${source} setting ${key} must be a rota of windows that each end after they start to be written for a phone.`);
  }
 } else {
  const least = setting.type === 'count' && setting.positive === false ? 0 : 1;
  const values = list ? entry.value : [entry.value];
  if (!Array.isArray(values) || !values.length || !values.every(v => Number.isInteger(v) && v >= least)) {
   throw new Error(`${source} setting ${key} must be ${list ? 'a list of whole numbers' : 'a whole number'} ${least ? 'above nought' : 'of nought or more'} to be written for a phone.`);
  }
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 const unreviewed = Boolean(setting.reviewRequired) && !(entry.reviewedBy?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn ?? ''));
 const review = setting.reviewRequired ? (unreviewed ? ' Not clinically reviewed.' : ` Clinically reviewed by the ${entry.reviewedBy} on ${entry.reviewedOn}.`) : '';
 return { value: entry.value, unreviewed, note: `${whose}${review} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}
