/**
 * The consent contract, read rather than restated.
 *
 * ── What a consent is here ───────────────────────────────────────────────────────────────────
 *
 * Not a boolean on a person. A consent is a decision about *one version* of *one purpose*, taken on
 * a date, by a route, in words that can be produced afterwards. `packages/catalog/consent.json`
 * holds the purposes, their versions, the required/optional split, the refusal sentences and the
 * retention statements; web, iOS, Android and this service all read that one file, so there is one
 * set of words and no second copy to drift.
 *
 * ── Why the wording is fingerprinted rather than pointed at ──────────────────────────────────
 *
 * A stored consent that carries a foreign key to a wording row is a consent somebody can edit into
 * a consent to something else, afterwards, without touching the consent record at all. So what is
 * stored beside a decision is the SHA-256 of the exact string that was shown. If the catalogue's
 * wording is ever changed under a recorded consent, the hash stops matching and `verifyProof` says
 * so — which is the difference between evidence and an assertion.
 *
 * The digest is taken over a JSON array rather than over the strings joined by a separator, so no
 * arrangement of wording can be made to serialise the same way as a different one — and apps/web
 * builds the input the same way, which is a boundary check rather than a hope, because a proof the
 * browser shows and the server does not hold is worse than showing none.
 *
 * A hash is not a copy: it proves that *these* words were the ones shown, to anybody who still has
 * the words. The words are in a version-controlled contract file, which is where they can be
 * produced from. What it does not survive is the contract file being rewritten and the history
 * discarded, and that is stated rather than glossed over.
 *
 * ── Checked while the module loads ───────────────────────────────────────────────────────────
 *
 * The same discipline the gate and the intake contract use. A purpose with no lawful basis, an
 * optional purpose that admits to degrading care, a version list that is not strictly increasing,
 * or a version that claims to carry an earlier consent forward all stop the service rather than
 * being quietly ignored by it. A contract nobody validates is a contract three apps disagree about.
 *
 * Pure: describes and decides. It touches no database and holds no clock of its own.
 */
import { createHash } from 'node:crypto';
import catalogue from '../../../../packages/catalog/consent.json' with { type: 'json' };

/* ---- Shapes ----------------------------------------------------------------------------------- */

/** A consent is a permission. An acknowledgement is a record that somebody was told something. */
export type PurposeKind = 'consent' | 'acknowledgement';

/** What a person can do about a purpose, and every one of them is written down. */
export type Decision = 'given' | 'withdrawn' | 'refused';
export const DECISIONS: readonly Decision[] = ['given', 'withdrawn', 'refused'];

export type ConsentVersion = {
 version: number;
 /** Day offset from today, so the preview never goes stale. Negative is in the past. */
 effectiveDays: number;
 wording: string;
 withdrawalWording: string;
 change: string;
 /** Always false. See `newWordingDoesNotCarryOver`; the loader refuses anything else. */
 carriesOver: boolean;
 supersededBecause?: string;
 reconsent?: string;
 note?: string;
};

export type RetainedStatement = { what: string; because: string; basis: string };

export type ConsentPurpose = {
 id: string;
 name: string;
 kind: PurposeKind;
 required: boolean;
 requiredBecause?: string;
 lawfulBasis: string;
 alsoRestsOn?: string;
 /** Optional purposes must be false. The loader refuses an optional purpose that says otherwise. */
 degradesCare: boolean;
 ifRefused: string;
 withdrawal: string;
 withdrawable?: boolean;
 retainedOnWithdrawal: RetainedStatement[];
 versions: ConsentVersion[];
};

export type LawfulBasis = { id: string; name: string; authority: string; detail: string };
export type ConsentRoute = { id: string; name: string; detail: string };

export const RULES = catalogue.rules;
export const WHY = catalogue.why;
export const NOT_ADVICE = catalogue.notAdvice;
export const LAWFUL_BASES: readonly LawfulBasis[] = catalogue.lawfulBases;
export const ROUTES: readonly ConsentRoute[] = catalogue.routes;
export const PURPOSES: readonly ConsentPurpose[] = catalogue.purposes as readonly ConsentPurpose[];
export const ACCESS_LOG = catalogue.accessLog;

const BY_ID = new Map(PURPOSES.map(purpose => [purpose.id, purpose] as const));
const BASIS_IDS = new Set(LAWFUL_BASES.map(basis => basis.id));
const ROUTE_IDS = new Set(ROUTES.map(route => route.id));

export const purposeById = (id: string): ConsentPurpose | undefined => BY_ID.get(id);
export const isRoute = (id: string): boolean => ROUTE_IDS.has(id);
export const isLawfulBasis = (id: string): boolean => BASIS_IDS.has(id);
export const basisById = (id: string): LawfulBasis | undefined => LAWFUL_BASES.find(basis => basis.id === id);
/** The bases an access may be recorded under. A subset: `s69-direct-marketing` opens no record. */
export const ACCESS_BASES: readonly string[] = ACCESS_LOG.bases;

/** The purposes a person must hold before MyThuso can deliver care at all. */
export const requiredPurposes = (): readonly ConsentPurpose[] => PURPOSES.filter(purpose => purpose.required);
/** Everything else. Refusing any of these is worth nothing to MyThuso, and the contract says so. */
export const optionalPurposes = (): readonly ConsentPurpose[] => PURPOSES.filter(purpose => !purpose.required);

/** The version in force. The last one, because the loader has already checked they ascend. */
export const currentVersion = (purpose: ConsentPurpose): ConsentVersion => purpose.versions[purpose.versions.length - 1]!;
export const versionOf = (purpose: ConsentPurpose, version: number): ConsentVersion | undefined =>
 purpose.versions.find(candidate => candidate.version === version);

/**
 * The fingerprint of what was shown.
 *
 * Over the wording *and* the withdrawal sentence, because "what you agreed to" and "what you were
 * told you could do about it afterwards" are both part of what makes a consent informed, and a
 * platform that could quietly edit the second one has edited the consent.
 *
 * The purpose id and the version number are in the digest too, so the same sentence appearing under
 * two purposes does not produce one proof that fits both.
 */
export function wordingHash(purposeId: string, version: ConsentVersion): string {
 return createHash('sha256')
  .update(JSON.stringify([purposeId, version.version, version.wording, version.withdrawalWording]))
  .digest('hex');
}

/** Does this stored proof still match the words the catalogue holds? See the note at the top. */
export function verifyProof(purposeId: string, version: number, hash: string): boolean {
 const purpose = purposeById(purposeId);
 const wording = purpose ? versionOf(purpose, version) : undefined;
 return !!wording && wordingHash(purposeId, wording) === hash;
}

/** The effective date of a version, resolved against a clock rather than frozen into the file. */
export const effectiveAt = (version: ConsentVersion, now: number): number => now + version.effectiveDays * 86_400_000;

/* ---- Checked while this module loads ---------------------------------------------------------
   The same rule the gate applies to its purpose matrix and the intake contract applies to its
   conflicts: a contract that has drifted out of step with the code stops the service rather than
   being ignored by it. Three app surfaces render these sentences, so a purpose this module cannot
   describe is a screen showing a choice the server will not honour. */
for (const purpose of PURPOSES) {
 const where = `packages/catalog/consent.json purpose "${purpose.id}"`;
 if (purpose.kind !== 'consent' && purpose.kind !== 'acknowledgement') {
  throw new Error(`${where} is a "${purpose.kind}", which is neither a consent nor an acknowledgement. The distinction is the whole of anAcknowledgementIsNotAConsent and this module will not guess it.`);
 }
 if (!BASIS_IDS.has(purpose.lawfulBasis)) throw new Error(`${where} names lawful basis "${purpose.lawfulBasis}", which is not in the register. Processing with no stated basis is what POPIA section 11 exists to stop.`);
 if (purpose.alsoRestsOn && !BASIS_IDS.has(purpose.alsoRestsOn)) throw new Error(`${where} also rests on "${purpose.alsoRestsOn}", which is not in the register.`);
 if (!purpose.ifRefused?.trim()) throw new Error(`${where} does not say what refusing it costs. A choice with no stated cost is not a choice anybody can make.`);
 if (!purpose.withdrawal?.trim()) throw new Error(`${where} does not say how it is withdrawn. Withdrawal has to be as easy as giving it, and a purpose that cannot say how is one nobody can leave.`);
 /* The invariant the whole required/optional split exists for. An optional consent that degrades
    care is a payment dressed as a choice, and it is refused here rather than in a code review. */
 if (!purpose.required && purpose.degradesCare) {
  throw new Error(`${where} is optional and admits to degrading care. ${RULES.optionalNeverDegradesCare}`);
 }
 if (purpose.required && !purpose.requiredBecause?.trim()) {
  throw new Error(`${where} is required and does not say why. ${RULES.requiredIsNamedNotImplied}`);
 }
 if (!purpose.versions.length) throw new Error(`${where} has no versions, so there is nothing anybody could consent to.`);
 let previous = 0;
 for (const version of purpose.versions) {
  if (!(version.version > previous)) throw new Error(`${where} version ${version.version} does not follow ${previous}. Versions ascend, and the last one is the one in force.`);
  previous = version.version;
  if (!version.wording?.trim()) throw new Error(`${where} version ${version.version} has no wording, and a fingerprint of nothing proves nothing.`);
  if (!version.withdrawalWording?.trim()) throw new Error(`${where} version ${version.version} does not say what the person was told they could withdraw.`);
  /* Written as data so that turning it on is a change to the contract somebody has to argue for,
     rather than a flag a hurried release quietly flips. */
  if (version.carriesOver) throw new Error(`${where} version ${version.version} claims to carry an earlier consent forward. ${RULES.newWordingDoesNotCarryOver}`);
 }
 for (const retained of purpose.retainedOnWithdrawal) {
  if (!BASIS_IDS.has(retained.basis)) throw new Error(`${where} keeps "${retained.what}" on basis "${retained.basis}", which is not in the register. Anything kept after a withdrawal is kept on a stated ground or is not kept.`);
  if (!retained.because?.trim()) throw new Error(`${where} keeps "${retained.what}" without telling the person why.`);
 }
 /* A withdrawable purpose with nothing to say about what survives is either wrong or has not been
    thought about. `processing-notice` is the one exception and declares itself unwithdrawable. */
 if (purpose.withdrawable !== false && purpose.kind === 'consent' && !purpose.retainedOnWithdrawal.length) {
  throw new Error(`${where} can be withdrawn and says nothing is kept afterwards. If that is true it has to be said in those words; ${RULES.withdrawalIsNotDeletion}`);
 }
}
if (!requiredPurposes().length) throw new Error('packages/catalog/consent.json lists no required purpose, so nothing separates the consents care depends on from the ones it does not.');
if (!optionalPurposes().length) throw new Error('packages/catalog/consent.json lists no optional purpose. A consent screen on which everything is compulsory is a terms-of-service page.');
for (const basis of ACCESS_BASES) {
 if (!BASIS_IDS.has(basis)) throw new Error(`The access log may record basis "${basis}", which is not in the lawful-basis register.`);
}
for (const rule of ['consentIsToAVersion', 'withdrawalIsNotDeletion', 'optionalNeverDegradesCare', 'aRefusedAccessIsRecordedToo', 'theAccessLogIsNotTheSignInLog'] as const) {
 if (!RULES[rule]?.trim()) throw new Error(`packages/catalog/consent.json has lost the rule "${rule}". These are promises made to people on three platforms at once.`);
}
