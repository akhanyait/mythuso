import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import vetting from '../../../packages/catalog/vetting.json' with { type: 'json' };
import { AccessGate, purposeMatrix, resolveState, standingOf, type ActorVetting, type CheckRecord, type ReleaseRecord } from '../src/protection/gate.ts';
import { HashChainAudit, memoryAuditStore } from '../src/protection/audit.ts';
import type { AccessRequest, Binding, RecordCrypto, Sealed } from '../src/protection/contract.ts';

const NOW = Date.UTC(2026, 8, 6, 9, 0, 0);
const IN_DATE = '2027-06-01';
const LAPSED = '2026-01-01';

/* A stand-in for the real RecordCrypto. It does no cryptography at all — what these tests are about
   is whether the gate reaches it, and under which binding. The one thing it does faithfully is
   refuse a binding that does not match, because that refusal is load-bearing. */
function fakeCrypto(onOpen: (binding: Binding) => void = () => {}): RecordCrypto {
 const same = (a: Binding, b: Binding) => a.recordType === b.recordType && a.recordId === b.recordId && a.field === b.field && a.subjectId === b.subjectId;
 return {
  seal: (plaintext, binding) => ({
   version: 1, wrappedKey: Buffer.alloc(0), iv: Buffer.alloc(0), tag: Buffer.alloc(0),
   ciphertext: Buffer.from(plaintext as string), binding
  }),
  open(sealed, binding) {
   onOpen(binding);
   if (!same(sealed.binding, binding)) throw new Error('binding mismatch');
   return sealed.ciphertext;
  },
  rewrap: sealed => sealed,
  blindIndex: (value, field) => `${field}:${value.length}`
 };
}

/** Every check the role carries, verified and in date, with the high-risk ones seconded. */
function cleared(roleId: string, overrides: Record<string, Partial<CheckRecord>> = {}): CheckRecord[] {
 const role = vetting.roles.find(candidate => candidate.id === roleId)!;
 return role.checks.map(check => ({
  checkId: check.id, state: 'verified' as const, expiresOn: IN_DATE,
  ...(check.risk === 'high' ? { secondedBy: 'reviewer-2' } : {}),
  ...overrides[check.id]
 }));
}

function harness(options: { actors?: ActorVetting[]; releases?: ReleaseRecord[]; onOpen?: (binding: Binding) => void } = {}) {
 const actors = new Map((options.actors ?? [
  { actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse') },
  { actorId: 'doctor-1', roleId: 'doctor', records: cleared('doctor') },
  { actorId: 'operator-1', roleId: 'operator', records: cleared('operator') },
  { actorId: 'courier-1', roleId: 'courier', records: cleared('courier') },
  { actorId: 'admin-1', roleId: 'admin', records: cleared('admin') }
 ]).map(actor => [actor.actorId, actor] as const));
 const key = (release: { subjectId: string; recordType: string; recordId: string; actorId: string }) =>
  `${release.subjectId}|${release.recordType}|${release.recordId}|${release.actorId}`;
 const releases = new Map((options.releases ?? []).map(release => [key({ ...release, actorId: release.grantedTo }), release] as const));
 const chain = new HashChainAudit(memoryAuditStore(), randomBytes(32), () => NOW);
 const gate = new AccessGate({
  crypto: fakeCrypto(options.onOpen), audit: chain, now: () => NOW,
  vetting: { find: actorId => actors.get(actorId) ?? null },
  releases: { find: query => releases.get(key(query)) ?? null }
 });
 return { gate, chain, actors, releases };
}

const ask = (over: Partial<AccessRequest> = {}): AccessRequest => ({
 actorId: 'nurse-1', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment',
 recordType: 'consultation', recordId: 'C-1', subjectId: 'patient-1', field: 'notes', ...over
});

/* ---- The happy path, so the refusals below mean something --------------------------------- */
describe('a cleared nurse on a visit', () => {
 test('opens the record she is attending', () => {
  const { gate, chain } = harness();
  const outcome = gate.access(ask());
  assert.ok(outcome.allowed);
  assert.equal(outcome.broke, false);
  const verified = chain.verify();
  assert.ok(verified.intact);
  assert.equal(verified.length, 1);
 });
});

/* ---- 1. Capability -------------------------------------------------------------------------- */
describe('the capability stage', () => {
 test('a record type the catalogue has never heard of is refused', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ recordType: 'gossip' }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'capability');
  assert.match(outcome.reason, /no record type "gossip"/);
 });
 test('a purpose nobody declared is refused', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ purpose: 'curiosity' as AccessRequest['purpose'] }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'purpose');
  assert.match(outcome.reason, /section 13/);
 });
 test('a capability that is not in the vetting catalogue is refused', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ capability: 'read-everything' }));
  assert.ok(!outcome.allowed);
  assert.match(outcome.reason, /no capability "read-everything"/);
 });
 test('a request that does not say who is asking is refused', () => {
  const { gate } = harness();
  assert.equal(gate.access(ask({ actorId: '  ' })).allowed, false);
  assert.equal(gate.access(ask({ subjectId: '' })).allowed, false);
  assert.equal(gate.access(ask({ recordId: '' })).allowed, false);
 });
 test('a capability that does not open this kind of record is refused', () => {
  /* view-billing opens an invoice. Pointing it at a diagnosis is not a permission question. */
  const { gate } = harness();
  const outcome = gate.access(ask({ capability: 'view-billing', recordType: 'diagnosis' }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'capability');
  assert.match(outcome.reason, /Diagnoses is opened by view-clinical-record\. view-billing does not open it\./);
 });
 test('a role that is never granted the capability is refused in the catalogue\'s own words', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ capability: 'view-billing', recordType: 'invoice', purpose: 'billing' }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.reason, 'A Registered nurse is never granted this.');
 });
 test('a write the catalogue has not described is refused rather than guessed at', () => {
  /* records.json says what opens a record; only `referral` says what writes one. Until the rest is
     filled in, a write has no rule, and no rule means no. */
  const { gate } = harness();
  assert.equal(gate.access(ask({ capability: 'write-clinical-note' })).allowed, false);
  const referral = gate.access(ask({ actorId: 'doctor-1', actorRole: 'doctor', capability: 'refer-patient', recordType: 'referral', field: 'reason' }));
  assert.ok(referral.allowed);
 });
});

/* ---- 2. Vetting standing -------------------------------------------------------------------- */
describe('vetting standing, resolved on every read', () => {
 test('a stored "verified" that has run out is lapsed, not verified', () => {
  assert.equal(resolveState({ checkId: 'police-clearance', state: 'verified', expiresOn: LAPSED }, NOW), 'lapsed');
  assert.equal(resolveState({ checkId: 'police-clearance', state: 'verified', expiresOn: IN_DATE }, NOW), 'verified');
  assert.equal(resolveState({ checkId: 'police-clearance', state: 'verified', expiresOn: '2026-10-01' }, NOW), 'expiring');
  assert.equal(resolveState({ checkId: 'police-clearance', state: 'verified' }, NOW), 'verified');
 });
 test('a nurse whose clearance lapsed this morning is refused, and told which one', () => {
  const { gate } = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { 'police-clearance': { expiresOn: LAPSED } }) }] });
  const outcome = gate.access(ask());
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'vetting-standing');
  assert.match(outcome.reason, /^Police clearance lapsed\./);
  assert.match(outcome.reason, /It is not a directory a nurse may browse\.$/, 'the catalogue sentence, used as written');
 });
 test('an expiry three weeks out still passes — she is dispatchable today, and told about it', () => {
  const { gate } = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { indemnity: { expiresOn: '2026-09-20' } }) }] });
  assert.equal(gate.access(ask()).allowed, true);
 });
 test('a high-risk check one reviewer waved through does not count', () => {
  const { gate } = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { 'sanc-registration': { secondedBy: undefined } }) }] });
  const outcome = gate.access(ask());
  assert.ok(!outcome.allowed);
  assert.match(outcome.reason, /SANC registration still needs a second reviewer/);
 });
 test('a check nobody has submitted blocks, and the catalogue supplies the sentence', () => {
  const { gate } = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse', { qualifications: { state: 'outstanding' } }) }] });
  const outcome = gate.access(ask());
  assert.ok(!outcome.allowed);
  assert.equal(outcome.reason, 'The clinical record opens for the visit being attended. It is not a directory a nurse may browse.');
 });
 test('a suspended party is refused with the reason they were suspended for', () => {
  const { gate } = harness({ actors: [{ actorId: 'nurse-1', roleId: 'nurse', records: cleared('nurse'), suspended: true, suspendedReason: 'An incident is under investigation.' }] });
  assert.equal(gate.access(ask()).allowed, false);
  assert.match((gate.access(ask()) as { reason: string }).reason, /under investigation/);
 });
 test('somebody nobody has vetted is refused rather than assumed', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ actorId: 'nurse-nobody-knows' }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'vetting-standing');
 });
 test('a role that was claimed rather than vetted is refused', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ actorId: 'nurse-1', actorRole: 'doctor', capability: 'prescribe' }));
  assert.ok(!outcome.allowed);
 });
 test('standingOf reports every blocking check, not only the first', () => {
  const standing = standingOf({
   actorId: 'nurse-1', roleId: 'nurse',
   records: cleared('nurse', { 'police-clearance': { expiresOn: LAPSED }, indemnity: { state: 'in-review' } })
  }, NOW);
  assert.equal(standing.cleared, false);
  assert.deepEqual(standing.lapsed, ['Police clearance']);
  assert.deepEqual(standing.blocking, ['Professional indemnity']);
 });
});

/* ---- 3. Purpose ----------------------------------------------------------------------------- */
describe('purpose limitation, POPIA section 13', () => {
 test('a billing purpose does not reach a clinical record', () => {
  const { gate } = harness();
  const outcome = gate.access(ask({ actorId: 'doctor-1', actorRole: 'doctor', purpose: 'billing' }));
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'purpose');
  assert.match(outcome.reason, /A billing purpose does not reach Consultations/);
  assert.match(outcome.reason, /section 13/);
 });
 test('nothing clinical is in the billing matrix at all', () => {
  for (const recordType of purposeMatrix.billing) {
   assert.ok(['medical-aid', 'claim', 'authorisation', 'invoice', 'payment', 'audit'].includes(recordType), `${recordType} should not be reachable for billing`);
  }
 });
 test('a dispatch purpose reaches an address and a service, and nothing else', () => {
  const { gate } = harness();
  const address = gate.access(ask({ actorId: 'operator-1', actorRole: 'operator', capability: 'view-patient-summary', purpose: 'dispatch', recordType: 'patient', field: 'address' }));
  assert.ok(address.allowed);
  const allergies = gate.access(ask({ actorId: 'operator-1', actorRole: 'operator', capability: 'view-patient-summary', purpose: 'dispatch', recordType: 'allergy' }));
  assert.ok(!allergies.allowed);
  assert.equal(allergies.blockedBy[0], 'purpose');
  assert.deepEqual([...purposeMatrix.dispatch].sort(), ['appointment', 'caregiver', 'facility', 'household', 'patient', 'provider', 'transport']);
 });
 test('every purpose reaches something, and only treatment and subject access reach a protected category', () => {
  const protectedTypes = ['maternal-health', 'social-support'];
  for (const [purpose, reachable] of Object.entries(purposeMatrix)) {
   assert.ok(reachable.size > 0, `${purpose} reaches nothing`);
   const reachesProtected = protectedTypes.some(type => reachable.has(type));
   assert.equal(reachesProtected, purpose === 'treatment' || purpose === 'subject-access', `${purpose} and protected categories`);
  }
 });
});

/* ---- 4. Protected categories ---------------------------------------------------------------- */
describe('a protected category', () => {
 const request = ask({
  actorId: 'doctor-1', actorRole: 'doctor', capability: 'view-protected-record',
  recordType: 'maternal-health', recordId: 'MH-7', field: 'outcome'
 });
 const release = (over: Partial<ReleaseRecord> = {}): ReleaseRecord => ({
  subjectId: 'patient-1', recordType: 'maternal-health', recordId: 'MH-7', grantedTo: 'doctor-1', ...over
 });
 test('is refused to a treating doctor with no release, in the catalogue\'s own words', () => {
  const { gate } = harness();
  const outcome = gate.access(request);
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'protected-category');
  assert.equal(outcome.reason, 'A protected category is released by the patient, entry by entry. It is never opened by a scope, however senior the nurse.');
 });
 test('opens when the patient released that entry to that person', () => {
  const { gate } = harness({ releases: [release()] });
  assert.equal(gate.access(request).allowed, true);
 });
 test('a release for one entry does not open the next one', () => {
  const { gate } = harness({ releases: [release()] });
  assert.equal(gate.access({ ...request, recordId: 'MH-8' }).allowed, false);
 });
 test('a release to one person does not open it for a colleague', () => {
  const { gate } = harness({ releases: [release({ grantedTo: 'doctor-2' })] });
  assert.equal(gate.access(request).allowed, false);
 });
 test('a withdrawn release is closed, and a lapsed one closes itself', () => {
  assert.equal(harness({ releases: [release({ withdrawnAt: '2026-08-01T00:00:00.000Z' })] }).gate.access(request).allowed, false);
  assert.equal(harness({ releases: [release({ expiresOn: LAPSED })] }).gate.access(request).allowed, false);
  assert.equal(harness({ releases: [release({ expiresOn: IN_DATE })] }).gate.access(request).allowed, true);
 });
 test('seniority is not a release', () => {
  /* The whole sentence in one test: a doctor is more senior than a nurse and gets exactly as far. */
  const { gate } = harness();
  assert.equal(gate.access(request).allowed, false);
  assert.equal(gate.access({ ...request, actorId: 'nurse-1', actorRole: 'nurse' }).allowed, false);
 });
 test('the patient reads their own without asking anybody for a release', () => {
  const { gate } = harness();
  const outcome = gate.access({ ...request, actorId: 'patient-1', actorRole: 'patient', purpose: 'subject-access' });
  assert.ok(outcome.allowed);
 });
 test('subject access is the person reading their own record, and nobody else', () => {
  const { gate } = harness();
  const outcome = gate.access({ ...request, actorId: 'guardian-9', actorRole: 'guardian', purpose: 'subject-access' });
  assert.ok(!outcome.allowed);
  assert.match(outcome.reason, /Reading somebody else's is a different request/);
 });
});

/* ---- 5. Break-glass ------------------------------------------------------------------------- */
describe('break-glass', () => {
 const emergency = ask({
  actorId: 'courier-1', actorRole: 'courier', capability: 'view-patient-summary',
  purpose: 'emergency', recordType: 'emergency-card', recordId: 'EC-1', field: 'bloodGroup'
 });
 test('with no reason it is a back door with a label on it, and is refused', () => {
  const { gate } = harness();
  const outcome = gate.access({ ...emergency, reason: '   ' });
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'break-glass');
  assert.match(outcome.reason, /back door with a label on it/);
 });
 test('with a reason it overrides the capability the role does not hold', () => {
  const { gate, chain } = harness();
  const outcome = gate.access({ ...emergency, reason: 'Collapsed at the door, unresponsive, ambulance called.' });
  assert.ok(outcome.allowed);
  assert.equal(outcome.broke, true, 'the emergency route is a break-glass whether or not the grant existed');
  assert.ok(chain.verify().intact);
 });
 test('it is never silent: the entry is marked, and carries the reason typed at the time', () => {
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  const gate = new AccessGate({
   crypto: fakeCrypto(), audit: chain, now: () => NOW,
   vetting: { find: actorId => actorId === 'courier-1' ? { actorId, roleId: 'courier', records: cleared('courier') } : null },
   releases: { find: () => null }
  });
  gate.access({ ...emergency, reason: 'Collapsed at the door, unresponsive.' });
  const written = store.rows[0]!;
  assert.equal(written.event, 'access.break-glass');
  assert.equal(written.broke, true);
  assert.equal(written.reason, 'Collapsed at the door, unresponsive.');
 });
 test('it does not override vetting standing — an emergency is when somebody would try', () => {
  const { gate } = harness({ actors: [{ actorId: 'courier-1', roleId: 'courier', records: cleared('courier', { 'police-clearance': { expiresOn: LAPSED } }) }] });
  const outcome = gate.access({ ...emergency, reason: 'Unresponsive.' });
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'vetting-standing');
 });
 test('it never reaches a protected category', () => {
  const { gate } = harness();
  const outcome = gate.access({ ...emergency, actorId: 'doctor-1', actorRole: 'doctor', capability: 'view-protected-record', recordType: 'maternal-health', recordId: 'MH-7', reason: 'Unresponsive.' });
  assert.ok(!outcome.allowed);
  assert.equal(outcome.blockedBy[0], 'protected-category');
  assert.match(outcome.reason, /nobody needs a protected category to resuscitate them/);
 });
 test('and a release does not open one to it either', () => {
  const { gate } = harness({ releases: [{ subjectId: 'patient-1', recordType: 'maternal-health', recordId: 'MH-7', grantedTo: 'doctor-1' }] });
  const outcome = gate.access({ ...emergency, actorId: 'doctor-1', actorRole: 'doctor', capability: 'view-protected-record', recordType: 'maternal-health', recordId: 'MH-7', reason: 'Unresponsive.' });
  assert.equal(outcome.allowed, false);
 });
});

/* ---- The audit entry ------------------------------------------------------------------------ */
describe('the audit entry', () => {
 test('is written for a refusal as well as a success — the refused attempt is the interesting one', () => {
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  const gate = new AccessGate({
   crypto: fakeCrypto(), audit: chain, now: () => NOW,
   vetting: { find: actorId => actorId === 'nurse-1' ? { actorId, roleId: 'nurse', records: cleared('nurse') } : null },
   releases: { find: () => null }
  });
  gate.access(ask());
  gate.access(ask({ capability: 'view-billing', recordType: 'invoice', purpose: 'billing' }));
  gate.access(ask({ recordType: 'gossip' }));
  assert.equal(store.rows.length, 3);
  assert.equal(store.rows[0]!.allowed, true);
  assert.equal(store.rows[1]!.allowed, false);
  assert.equal(store.rows[1]!.reason, 'A Registered nurse is never granted this.');
  assert.deepEqual(store.rows[2]!.blockedBy, ['capability']);
  assert.ok(chain.verify().intact);
 });
 test('names the record and never carries what was in it', () => {
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  const gate = new AccessGate({
   crypto: fakeCrypto(), audit: chain, now: () => NOW,
   vetting: { find: actorId => ({ actorId, roleId: 'nurse', records: cleared('nurse') }) },
   releases: { find: () => null }
  });
  const secret = 'Blood group O negative, penicillin anaphylaxis';
  const sealed = fakeCrypto().seal(secret, { recordType: 'consultation', recordId: 'C-1', field: 'notes', subjectId: 'patient-1' });
  const revealed = gate.reveal(ask(), sealed);
  assert.ok(revealed.ok);
  assert.equal(revealed.value.toString('utf8'), secret);
  const written = JSON.stringify(store.rows);
  assert.ok(!written.includes('O negative'), 'an audit log holding the value is a second copy of the record with weaker protection');
  assert.ok(!written.includes('penicillin'));
  assert.equal(store.rows[0]!.recordType, 'consultation');
  assert.equal(store.rows[0]!.recordId, 'C-1');
  assert.equal(store.rows[0]!.field, 'notes');
  assert.equal(store.rows[0]!.subjectId, 'patient-1');
  assert.equal(store.rows[0]!.actorId, 'nurse-1');
  assert.equal(store.rows[0]!.purpose, 'treatment');
 });
});

/* ---- reveal: the only route to plaintext ---------------------------------------------------- */
describe('reveal', () => {
 const sealedNote = (over: Partial<Binding> = {}): Sealed => fakeCrypto().seal('the note itself', {
  recordType: 'consultation', recordId: 'C-1', field: 'notes', subjectId: 'patient-1', ...over
 });

 test('no code path reaches plaintext without an audit entry already written', () => {
  /* Asserted from inside the crypto: by the time anything can decrypt, the chain has the entry.
     A gate that decides after it opens has already leaked. */
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  let sawEntryFirst = false;
  const gate = new AccessGate({
   crypto: fakeCrypto(() => { sawEntryFirst = store.rows.length === 1 && store.rows[0]!.allowed === true; }),
   audit: chain, now: () => NOW,
   vetting: { find: actorId => ({ actorId, roleId: 'nurse', records: cleared('nurse') }) },
   releases: { find: () => null }
  });
  const revealed = gate.reveal(ask(), sealedNote());
  assert.ok(revealed.ok);
  assert.ok(sawEntryFirst, 'the entry has to exist before the bytes do');
 });

 test('a refused request never reaches the crypto at all', () => {
  let opened = 0;
  const { gate } = harness({ onOpen: () => { opened += 1; } });
  const refused = gate.reveal(ask({ capability: 'view-billing', recordType: 'invoice', purpose: 'billing' }), sealedNote());
  assert.equal(refused.ok, false);
  assert.equal(opened, 0);
 });

 test('an outcome is not a ticket: reveal decides again rather than accepting a previous yes', () => {
  const { gate, chain } = harness();
  const allowed = gate.access(ask());
  assert.ok(allowed.allowed);
  /* The same actor, holding a genuine yes for the consultation, asking for a protected category. */
  const refused = gate.reveal(ask({ actorId: 'doctor-1', actorRole: 'doctor', capability: 'view-protected-record', recordType: 'maternal-health', recordId: 'MH-7', field: 'outcome' }), sealedNote());
  assert.equal(refused.ok, false);
  const verified = chain.verify();
  assert.ok(verified.intact);
  assert.equal(verified.length, 2, 'both the yes and the no are written down');
 });

 test('it will not open a value without being told which field it is', () => {
  let opened = 0;
  const { gate } = harness({ onOpen: () => { opened += 1; } });
  const outcome = gate.reveal({ ...ask(), field: undefined }, sealedNote());
  assert.equal(outcome.ok, false);
  assert.equal(opened, 0);
 });

 test('the binding comes from the request, so another patient\'s ciphertext does not open', () => {
  /* The structural part. Even holding the bytes and a request the gate says yes to, the value that
     belongs to a different row fails to authenticate rather than opening as this row's. */
  const { gate } = harness();
  const other = sealedNote({ recordId: 'C-2', subjectId: 'patient-2' });
  const outcome = gate.reveal(ask(), other);
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /altered, or they belong to a different row/.test(outcome.reason));
 });

 test('a value that fails to open is written down as its own kind of event', () => {
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  const gate = new AccessGate({
   crypto: fakeCrypto(), audit: chain, now: () => NOW,
   vetting: { find: actorId => ({ actorId, roleId: 'nurse', records: cleared('nurse') }) },
   releases: { find: () => null }
  });
  gate.reveal(ask(), sealedNote({ recordId: 'C-2' }));
  assert.equal(store.rows.length, 2);
  assert.equal(store.rows[0]!.event, 'access.allowed');
  assert.equal(store.rows[1]!.event, 'reveal.failed');
  assert.equal(store.rows[1]!.allowed, false);
  assert.ok(chain.verify().intact);
 });

 test('the gate hands back no way to open anything itself', () => {
  const { gate } = harness();
  assert.deepEqual(Object.keys(gate), [], 'the crypto is a private field, not a property somebody can reach');
  const outcome = gate.access(ask());
  assert.deepEqual(Object.keys(outcome).sort(), ['allowed', 'auditId', 'broke'], 'the outcome carries a decision, not key material');
 });
});

/* ---- protect: the only route in ------------------------------------------------------------- */
describe('protect', () => {
 const vetting = (over: Partial<AccessRequest> = {}): AccessRequest => ask({
  actorId: 'admin-1', actorRole: 'admin', capability: 'review-vetting', purpose: 'vetting',
  recordType: 'vetting-evidence', recordId: 'E-1', subjectId: 'nurse-1', field: 'document.v1', ...over
 });

 test('seals against the binding the gate decided about, not one the caller supplied', () => {
  /* The write-side of what reveal() closes on the read side. A caller passes a request and bytes,
     never a binding, so a document cannot be sealed against a record the caller has no authority
     over and then opened there ever afterwards. */
  const { gate } = harness();
  const sealed = gate.protect(vetting(), 'a certificate');
  assert.ok(sealed.ok);
  assert.deepEqual(sealed.sealed.binding, {
   recordType: 'vetting-evidence', recordId: 'E-1', field: 'document.v1', subjectId: 'nurse-1'
  });
 });

 test('refuses everything a read would refuse, and writes the refusal down', () => {
  const { gate, chain } = harness();
  const wrongRole = gate.protect(vetting({ actorId: 'nurse-1', actorRole: 'nurse' }), 'x');
  assert.equal(wrongRole.ok, false);
  assert.ok(!wrongRole.ok && /never granted/.test(wrongRole.reason));

  const unvetted = gate.protect(vetting({ actorId: 'ghost' }), 'x');
  assert.equal(unvetted.ok, false);

  const noField = gate.protect(vetting({ field: undefined }), 'x');
  assert.equal(noField.ok, false);
  assert.ok(!noField.ok && /has to name the field/.test(noField.reason));
  assert.ok(chain.verify().intact);
  assert.equal(chain.verify().length, 3, 'three refusals, three entries');
 });

 test('break-glass reads and never writes', () => {
  /* An override nobody reviewed until afterwards is not a way to add a record to somebody's file. */
  const { gate } = harness();
  const outcome = gate.protect(vetting({ purpose: 'emergency', reason: 'Unresponsive.' }), 'x');
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && /a record with no accountable author/.test(outcome.reason));
 });

 test('a seal is its own event in the log, not another read', () => {
  const store = memoryAuditStore();
  const chain = new HashChainAudit(store, randomBytes(32), () => NOW);
  const gate = new AccessGate({
   crypto: fakeCrypto(), audit: chain, now: () => NOW,
   vetting: { find: actorId => ({ actorId, roleId: 'admin', records: cleared('admin') }) },
   releases: { find: () => null }
  });
  gate.protect(vetting(), 'a certificate');
  gate.access(vetting());
  assert.equal(store.rows[0]!.event, 'record.sealed');
  assert.equal(store.rows[1]!.event, 'access.allowed');
  assert.ok(!JSON.stringify(store.rows).includes('a certificate'), 'the log names the field, never the value');
 });
});

/* ---- The workforce record type -------------------------------------------------------------- */
describe('vetting evidence in the catalogue', () => {
 test('only the vetting and subject-access purposes reach it', () => {
  for (const [purpose, reachable] of Object.entries(purposeMatrix)) {
   assert.equal(reachable.has('vetting-evidence'), purpose === 'vetting' || purpose === 'subject-access',
    `${purpose} and a nurse's police clearance`);
  }
  assert.deepEqual([...purposeMatrix.vetting], ['vetting-evidence'],
   'a vetting purpose reaches the evidence and nothing about a patient');
 });

 test('a dispatcher with a patient summary capability cannot reach it', () => {
  /* It lives in the care-network area, which dispatch does reach — the capability is what keeps it
     out, and that is the narrower limit of the two. */
  const { gate } = harness();
  const outcome = gate.access(ask({
   actorId: 'operator-1', actorRole: 'operator', capability: 'view-patient-summary',
   purpose: 'dispatch', recordType: 'vetting-evidence', recordId: 'E-1', subjectId: 'nurse-1', field: 'document.v1'
  }));
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.blockedBy[0], 'capability');
 });

 test('the nurse it is about reads it as herself, and a purpose is still required', () => {
  const { gate } = harness();
  const hers = gate.access(ask({
   actorId: 'nurse-1', actorRole: 'nurse', capability: 'review-vetting', purpose: 'subject-access',
   recordType: 'vetting-evidence', recordId: 'E-1', subjectId: 'nurse-1', field: 'document.v1'
  }));
  assert.ok(hers.allowed);
  const somebodyElses = gate.access(ask({
   actorId: 'nurse-1', actorRole: 'nurse', capability: 'review-vetting', purpose: 'subject-access',
   recordType: 'vetting-evidence', recordId: 'E-2', subjectId: 'nurse-2', field: 'document.v1'
  }));
  assert.equal(somebodyElses.allowed, false);
  assert.ok(!somebodyElses.allowed && /reading somebody else's is a different request/i.test(somebodyElses.reason));
 });
});
