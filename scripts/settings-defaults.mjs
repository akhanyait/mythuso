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
 * WHAT A PHONE MAY BE HANDED. `as` names it, and a default that is not that is refused here rather than
 * written as something a phone would misread:
 *   positive  a whole number above nought, or with list a list of them — the field-safety timings, Care's
 *             offer expiry, the thread's longest message
 *   count     a whole number of nought or more — the hours a thread stays open after its visit
 *   boolean   true or false, one of the setting's allowed values — photos in a thread
 *   choice    a word that is one of the setting's allowed values — the named-nurse fallback
 *   roles     role ids, each once and at least one — who answers a handover
 *   windows   a rota of { post, days, from, to } — the handover desk's hours
 * An emitter that needs another kind extends this function, so the refusal and the sentence stay in one place.
 */
const HHMM = /^([01]\d|2[0-4]):[0-5]\d$/;

export function settingDefault(source, contract, key, { list = false, as = 'positive' } = {}) {
 const setting = contract.settings?.items?.find(item => item.key === key);
 if (!setting) throw new Error(`${source} has no setting "${key}" in its settings block.`);
 const entry = setting.default;
 if (!entry || !('decidedBy' in entry)) throw new Error(`${source} setting ${key} has lost its decidedBy. A default nobody decided must say so.`);
 const decided = entry.decidedBy !== null;
 if (decided ? !(String(entry.decidedBy).trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.decidedOn ?? '')) : !(entry.proposedBy?.trim() && entry.proposedBecause?.trim())) {
  throw new Error(`${source} setting ${key} ${decided ? 'says it was decided without naming who decided it and on what day' : 'is a proposal that does not say who proposed it and why'}.`);
 }
 const value = entry.value;
 const allowed = (setting.allowed ?? []).map(choice => choice.value);
 const fits = {
  positive: () => (list ? value : [value]),
  count: () => [value],
  boolean: () => [value],
  choice: () => [value],
  roles: () => value,
  windows: () => value
 }[as];
 if (!fits) throw new Error(`${source} setting ${key} asks to be written for a phone as "${as}", which scripts/settings-defaults.mjs does not know.`);
 const values = fits();
 const wrong = !Array.isArray(values) || !values.length || !{
  positive: () => values.every(v => Number.isInteger(v) && v > 0),
  count: () => values.every(v => Number.isInteger(v) && v >= 0),
  boolean: () => values.every(v => typeof v === 'boolean' && (!allowed.length || allowed.includes(v))),
  choice: () => values.every(v => typeof v === 'string' && allowed.includes(v)),
  roles: () => values.every(v => typeof v === 'string' && v.trim()) && new Set(values).size === values.length,
  windows: () => values.every(w => typeof w?.post === 'string' && Array.isArray(w.days) && w.days.length && HHMM.test(w.from) && HHMM.test(w.to) && w.from < w.to)
 }[as]();
 if (wrong) {
  const kind = { positive: list ? 'a list of whole numbers above nought' : 'a whole number above nought', count: 'a whole number of nought or more', boolean: 'one of its allowed true or false values', choice: 'one of its allowed choices', roles: 'at least one role, each once', windows: 'a rota of windows that each end after they start' }[as];
  throw new Error(`${source} setting ${key} must be ${kind} to be written for a phone.`);
 }
 const whose = decided ? `Decided by the ${entry.decidedBy}.` : 'A proposal nobody has decided.';
 return { value, note: `${whose} A default an admin may change on the web; this app has no admin surface and uses it as written here.` };
}
