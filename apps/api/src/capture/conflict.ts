/**
 * The four disagreements, detected from the envelope and never from the reading.
 *
 * ── The rule that shapes every line of this file ─────────────────────────────────────────────
 *
 * `conflictsAreNotMerged`: nothing is auto-merged and nothing is auto-discarded. A timestamp does not
 * win a clinical disagreement; a clinician does. So nothing here *resolves* anything. Each function
 * looks at facts the server can establish on its own and returns a conflict or null, and the
 * catalogue — not this file — says who settles it. Exactly one of the four says `server`, and it is
 * the one about clocks, which is the only one of the four that is not a clinical question.
 *
 * That distinction is worth stating in the negative, because it is the tempting shortcut in every
 * sync engine ever written: the retake is *not* automatically the better reading, the later
 * timestamp is *not* automatically the truth, and last-write-wins over two blood pressures is a
 * silent clinical decision taken by a comparison operator.
 *
 * ── Detected without opening anything ────────────────────────────────────────────────────────
 *
 * All four fall out of the envelope. A duplicate is two entries landing on the same slot of the same
 * record; a stale write is the record having moved past what the device saw; a clock conflict is
 * arithmetic on two numbers; a lapsed capturer is the vetting register read at two moments. Not one
 * of them needs the payload, which is why this can be built while the payload cannot.
 *
 * Pure: facts in, conflicts out. No database, no clock, no gate.
 */
import { conflictDetail, conflictName, resolverOf, type ConflictKind, type DetectedConflict, type RecordStanding, type Settlement } from './contract.ts';
import { describeDuration, type Skew } from './ordering.ts';

const raise = (kind: ConflictKind, finding: string): DetectedConflict => ({
 kind,
 name: conflictName(kind),
 detail: conflictDetail(kind),
 resolution: resolverOf(kind),
 finding,
 settledAt: null,
 settledBy: null,
 settledAs: null
});

const day = (at: number): string => new Date(at).toISOString().slice(0, 10);
const moment = (at: number): string => new Date(at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/* ---- The device clock ------------------------------------------------------------------------- */

/**
 * Two ways a clock declares itself, and both are the server's to settle.
 *
 * The first is drift beyond tolerance, measured on the batch. The second is narrower and harder to
 * argue with: an entry the device dates *after* the moment the server received it. Nothing captured
 * in the past can be stamped in the future, so that one is wrong however small it is, and it is not
 * covered by the tolerance — a device seven seconds fast produces it while sitting comfortably
 * inside five minutes.
 */
export function clockConflict(skew: Skew, believedCapturedAt: number, receivedAt: number): DetectedConflict | null {
 const ahead = believedCapturedAt > receivedAt;
 if (!skew.beyondTolerance && !ahead) return null;
 const finding = ahead
  ? `The device dated this ${describeDuration(believedCapturedAt - receivedAt)} after the moment the server received it, which cannot be right. ${skew.sentence} The receipt time orders it and the device's time is kept beside it as what the device believed.`
  : `${skew.sentence} The receipt time orders this entry and the device's time is kept beside it as what the device believed, which is the whole of what the server settles here — the reading itself is untouched.`;
 return raise('clock-skew', finding);
}

/* ---- Two readings, one slot -------------------------------------------------------------------- */

/** What the ledger already holds on the same slot of the same record. Never the reading, only its place. */
export type Sibling = { entryId: string; seq: number; receivedAt: number; settledAs: Settlement | null };

/**
 * The same slot of the same record, filled twice.
 *
 * "One observation in one visit" is the record binding: same record type, same record, same subject,
 * same field. Usually it is a retake after a doubtful first reading, which is good practice and not
 * a mistake — so both are kept, and a clinician says which stands. What is refused here is the
 * temptation to decide that on arrival order.
 *
 * An entry whose earlier sibling a clinician has already settled as superseded or not-filed is not
 * in conflict with it: that decision was taken by a person, with their name on it, and re-raising it
 * would mean a clinician's answer being asked again every time the device retried.
 */
export function duplicateConflict(siblings: readonly Sibling[]): DetectedConflict | null {
 const live = siblings.filter(sibling => sibling.settledAs === null || sibling.settledAs === 'stands');
 if (!live.length) return null;
 const earlier = live.map(sibling => `${sibling.entryId} (${sibling.seq} in the order, received ${moment(sibling.receivedAt)})`).join(', ');
 return raise('duplicate-observation',
  `This record already holds an entry on the same slot: ${earlier}. Both are kept. A clinician says which stands; the other stays visible as superseded rather than being deleted, and neither is merged into the other.`);
}

/* ---- The record moved on ------------------------------------------------------------------------ */

/**
 * The record changed while the entry was queued.
 *
 * Two shapes, and the closed one is the more serious. A record that has been signed or cancelled is
 * one somebody has taken responsibility for as it stood; adding to it afterwards, silently, hours
 * later, from a phone that was in a queue, would change what that person signed without telling
 * them. A version that has merely moved is milder — somebody else wrote to the record in the
 * meantime — but it is still not the record the device was looking at, so it is a person's decision
 * rather than an overwrite.
 */
export function staleWriteConflict(sawRecordVersion: number, standing: RecordStanding): DetectedConflict | null {
 if (standing.state !== 'open') {
  return raise('stale-write',
   `This record was ${standing.state === 'signed' ? 'signed' : 'cancelled'} on ${day(standing.changedAt)}, after the device queued this entry. It is not applied silently after the fact: what was ${standing.state} is what somebody took responsibility for, and adding to it needs a decision by a person rather than by an arrival.`);
 }
 if (standing.version > sawRecordVersion) {
  return raise('stale-write',
   `The device was working from version ${sawRecordVersion} of this record and it is now at version ${standing.version}, last changed ${day(standing.changedAt)}. Somebody wrote to it while this entry was queued, so it is held rather than applied over work the device never saw.`);
 }
 return null;
}

/* ---- The capturer's standing --------------------------------------------------------------------- */

/**
 * What the server can say about the capturer's standing at two moments.
 *
 * `atCapture` is the honest weak spot of the whole feature and it is named rather than smoothed over:
 * it is today's evidence rows re-resolved against a past date, not a record of what the register
 * actually said that day. See the note on this in capture/index.ts.
 */
export type CapturerStanding = {
 /** Which of the role's checks have lapsed as at the moment of sync. */
 lapsedNow: readonly string[];
 clearedNow: boolean;
 /** Whether the same evidence, resolved at the time the device claims, would have cleared her. */
 clearedAtBelief: boolean;
 believedCapturedAt: number;
 /** Whether the claimed capture time falls inside the window the server can vouch for. */
 corroborated: boolean;
 /** The device's previous successful contact, and this one. Null where it has never been seen. */
 window: { from: number | null; to: number };
};

/**
 * The nurse whose clearance lapsed between capture and sync.
 *
 * The reading was taken while she was cleared, so it is not discarded — and it is not filed on her
 * authority alone either. Both halves of that sentence are refusals of something tempting: dropping
 * the entry would throw away real clinical work because of a certificate renewal, and accepting it
 * would let anybody with an expired clearance file whatever they liked by putting yesterday's date
 * on it.
 *
 * What the server contributes is the evidence for the decision rather than the decision. It says
 * which checks have lapsed and when, what the device claims about the capture time, and — the part
 * that matters — whether it can vouch for that claim at all. The claim is corroborated only where it
 * falls between the device's previous successful contact and this one, which is a window the server
 * observed itself. Outside that window the claim is the device's word about its own clock, which
 * `deviceClockIsNotTruth` says is exactly what may not be treated as a fact.
 *
 * It is never settled here. A lapsed clearance is a question about authority, and authority is not
 * something arithmetic hands out.
 */
export function lapsedCapturerConflict(standing: CapturerStanding): DetectedConflict | null {
 if (standing.clearedNow) return null;
 if (!standing.clearedAtBelief) return null;
 const lapsed = standing.lapsedNow.length ? standing.lapsedNow.join(' and ') : 'The capturer\'s standing';
 const window = standing.window.from === null
  ? 'This server has no earlier contact from this device to bound the claim with, so there is nothing to corroborate it against.'
  : standing.corroborated
   ? `The claim falls between this device's previous contact at ${moment(standing.window.from)} and this one, which is a window this server observed, so the claim is consistent with what the server saw.`
   : `The claim falls outside the window between this device's previous contact at ${moment(standing.window.from)} and this one, so the server cannot corroborate it and it rests on the device's own clock.`;
 return raise('vetting-lapsed',
  `${lapsed} has lapsed as at this sync, and the same evidence resolved at the time the device claims — ${moment(standing.believedCapturedAt)} — would have cleared her. ${window} `
  + 'The entry is neither discarded nor filed: a clinician decides whether it stands on the capturer\'s standing at the time, and the standing at capture is reconstructed from the evidence held today rather than from a record of what the register said that day.');
}
