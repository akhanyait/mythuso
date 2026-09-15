import { useSyncExternalStore } from 'react';
import { HOUR, MINUTE, type Refusal } from '../../../../packages/engines/src/trust/domain/contract.ts';
import { standingOf } from '../../../../packages/engines/src/trust/domain/register.ts';
import { answerAtTheDoor, issueCode, tryCode, type DoorCheck, type TryAnswer } from '../../../../packages/engines/src/trust/domain/door.ts';
import { complaintQueue, decideComplaint, noticesFor, openComplaint, receiveComplaint, type Complaint, type QueueRow } from '../../../../packages/engines/src/trust/domain/complaints.ts';
import { startShift, type ShiftStart } from '../../../../packages/engines/src/trust/domain/shift-starts.ts';
import { adminOnDuty, trustSettingsNow } from './settings';

/* Verify in service in the web preview: the door checks, the complaints and today's shift starts, in memory.
 *
 * Every rule is the Trust engine's. This file holds what the engine's store would hold and hands each act to
 * packages/engines/src/trust/domain, which says whether it is allowed and in which words it is not. Nothing is
 * persisted — this app may not keep anything about a patient or a nurse — so a reload forgets every code,
 * complaint and shift, which is true of the preview and would be a defect in the product.
 *
 * THE NURSE'S PHONE IS HELD HERE TOO. On the engine a code is answered to the nurse once and only an HMAC is kept.
 * The preview has no second device, so the digits the nurse workspace shows are held in this tab's memory beside
 * the check, and the patient's screen in the same tab is told only whether what she typed matches them. That is a
 * simulation of two phones, and the nurse's panel says so in the contract's words.
 *
 * THE SETTINGS IN FORCE, READ ONCE. A code is shown, a complaint received and a shift started with
 * trustSettingsNow(), and each keeps what it was handed, so a change on the Configuration tab reaches the next one
 * and never one already under way. No minute, try or hour is typed here.
 *
 * THE QUEUE AND THE BOARD ARE SEEDED BY RUNNING THE ENGINE AT EARLIER TIMES. The complaint past its window and the
 * shifts started this morning are acts the domain accepted hours before the page opened, so their ages are
 * arithmetic on the rules rather than rows typed into a table.
 */
type State = {
 readonly checks: Readonly<Record<string, DoorCheck>>;
 readonly digits: Readonly<Record<string, string>>;
 readonly complaints: readonly Complaint[];
 readonly shifts: readonly ShiftStart[];
};
export type Failed = { readonly ok: false; readonly refusal: Refusal };

let state: State | undefined;
let serial = 1;
const listeners = new Set<() => void>();
const next = (prefix: string) => `${prefix}-preview-${serial++}`;

const accepted = <T>(result: { ok: true; value: T } | Failed): T => {
 if (!result.ok) throw new Error(`The seeded Verify preview was refused by the engine: ${result.refusal.statement}`);
 return result.value;
};

function seed(now: number): State {
 const settings = trustSettingsNow();
 const complaints = [
  accepted(receiveComplaint({ complaintRef: next('complaint'), partyRef: 'N-201', appointmentRef: 'VIS-0031', categoryCode: 'late-or-missed', whatHappened: 'She arrived well after the window and nobody phoned to say she was running late.', undeclared: [], complainantRole: 'patient', complainantRef: null }, standingOf('N-201'), settings, now - (settings.complaintReviewHours + 6) * HOUR)),
  accepted(receiveComplaint({ complaintRef: next('complaint'), partyRef: 'N-206', appointmentRef: 'VIS-0034', categoryCode: 'conduct', whatHappened: 'She would not wait for my daughter to arrive before she started.', undeclared: [], complainantRole: 'caregiver', complainantRef: null }, standingOf('N-206'), settings, now - 3 * HOUR))
 ];
 const shifts = [
  accepted(startShift({ shiftStartRef: next('shift'), partyRef: 'N-201', undeclared: [] }, standingOf('N-201'), settings, now - 150 * MINUTE)),
  accepted(startShift({ shiftStartRef: next('shift'), partyRef: 'N-206', undeclared: [] }, standingOf('N-206'), settings, now - 40 * MINUTE))
 ];
 return { checks: {}, digits: {}, complaints, shifts };
}

const current = (): State => (state ??= seed(Date.now()));
const set = (next: State) => { state = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useVerifyInService = () => useSyncExternalStore(subscribe, current, current);

/* ── The door ─────────────────────────────────────────────────────────────────────────────────────── */

const randomDigits = (count: number): string => {
 const values = new Uint32Array(count);
 crypto.getRandomValues(values);
 return Array.from(values, value => String(value % 10)).join('');
};

export type Shown = { readonly ok: true; readonly digits: string; readonly expiresAt: number; readonly attemptsAllowed: number };
/** The nurse shows a code for a visit. Only the preview keeps the digits, and only to play the nurse's phone. */
export function showDoorCode(appointmentRef: string, partyRef: string, digitCount: number, now = Date.now()): Shown | Failed {
 const s = current();
 const issued = issueCode(s.checks[appointmentRef], { appointmentRef, partyRef, digest: 'preview', nonce: next('nonce') }, standingOf(partyRef), trustSettingsNow(), now);
 if (!issued.ok) return issued;
 const digits = randomDigits(digitCount);
 set({ ...s, checks: { ...s.checks, [appointmentRef]: issued.value }, digits: { ...s.digits, [appointmentRef]: digits } });
 return { ok: true, digits, expiresAt: issued.value.code!.expiresAt, attemptsAllowed: issued.value.code!.attemptsAllowed };
}
export const shownDigits = (appointmentRef: string): string | null => current().digits[appointmentRef] ?? null;
export const doorCheckOf = (appointmentRef: string): DoorCheck | undefined => current().checks[appointmentRef];

export function checkDoorCode(appointmentRef: string, typed: string, now = Date.now()): { readonly ok: true; readonly value: TryAnswer } | Failed {
 const s = current();
 const check = s.checks[appointmentRef];
 const matches = Boolean(check?.code) && typed.replace(/\s+/g, '') === s.digits[appointmentRef];
 const tried = tryCode(check, matches, check?.code ? standingOf(check.code.partyRef) : null, now);
 if (!tried.ok) return tried;
 set({ ...s, checks: { ...s.checks, [appointmentRef]: tried.value.check } });
 return { ok: true, value: tried.value };
}

export function answerDoor(appointmentRef: string, answer: string, now = Date.now()): { readonly ok: true; readonly verified: boolean; readonly incidentRaised: boolean } | Failed {
 const s = current();
 const answered = answerAtTheDoor(s.checks[appointmentRef], { appointmentRef, answer }, now);
 if (!answered.ok) return answered;
 set({ ...s, checks: { ...s.checks, [appointmentRef]: answered.value.check } });
 return { ok: true, verified: answered.value.verified, incidentRaised: answered.value.incidentRaised };
}

/* ── Complaints ───────────────────────────────────────────────────────────────────────────────────── */

export function sendComplaint(input: { partyRef: string; appointmentRef: string; categoryCode: string; whatHappened: string }, now = Date.now()): { readonly ok: true; readonly complaint: Complaint } | Failed {
 const s = current();
 const received = receiveComplaint({ complaintRef: next('complaint'), ...input, undeclared: [], complainantRole: 'patient', complainantRef: null }, standingOf(input.partyRef), trustSettingsNow(), now);
 if (!received.ok) return received;
 set({ ...s, complaints: [...s.complaints, received.value] });
 return { ok: true, complaint: received.value };
}

export const complaintQueueNow = (now = Date.now()): QueueRow[] => complaintQueue(current().complaints, now);
const reviewer = () => adminOnDuty();
export function openComplaintAsReviewer(complaintRef: string): { readonly ok: true; readonly complaint: Complaint } | Failed {
 const opened = openComplaint(current().complaints.find(c => c.complaintRef === complaintRef), reviewer());
 return opened.ok ? { ok: true, complaint: opened.value } : opened;
}
export function decideAsReviewer(complaintRef: string, outcomeCode: string, reason: string, now = Date.now()): { readonly ok: true } | Failed {
 const s = current();
 const decided = decideComplaint(s.complaints.find(c => c.complaintRef === complaintRef), { outcomeCode, reason, byRef: reviewer(), undeclared: [] }, now);
 if (!decided.ok) return decided;
 set({ ...s, complaints: s.complaints.map(c => (c.complaintRef === complaintRef ? decided.value : c)) });
 return { ok: true };
}
export const noticesAbout = (partyRef: string) => noticesFor(current().complaints, partyRef);

/* ── Shift starts ─────────────────────────────────────────────────────────────────────────────────── */

export const shiftStartsNow = (): readonly ShiftStart[] => [...current().shifts].sort((a, b) => b.startedAt - a.startedAt);
export const nameOf = (partyRef: string): string => standingOf(partyRef)?.name ?? partyRef;
