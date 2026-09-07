/**
 * Erasing an account: the grace period, the tombstone, and what the audit log keeps.
 *
 * ── Why it waits ─────────────────────────────────────────────────────────────────────────────
 *
 * Seven days between asking and being erased. Long enough for somebody who did not mean it — or
 * whose phone was taken with them signed in — to notice and stop it. Short enough that "when is it
 * gone" is answered in a week rather than a quarter. The wait is announced when the request is
 * made; a countdown nobody was told about is not a grace period, it is a delay.
 *
 * ── Why the row survives ─────────────────────────────────────────────────────────────────────
 *
 * The account is emptied rather than deleted. Two reasons, both in personalData.ts in the words
 * that go to the person:
 *
 *   · It is the proof the request was carried out, and when. Demonstrating that is a POPIA duty,
 *     and it cannot be demonstrated from an absence.
 *   · It keeps the account id reserved. The append-only audit log names people by id, and if that
 *     id could ever be handed to somebody else, every line written before the erasure would quietly
 *     start reading as though it were about the new person.
 *
 * ── Why the tombstone is not a phone number ──────────────────────────────────────────────────
 *
 * The number column is unique, so an erased account cannot simply be blanked — the second erasure
 * would collide with the first. What goes in is `erased-<id>@erased.invalid`. Unique by
 * construction, and unreachable twice over: `.invalid` is reserved by RFC 2606 and can never be
 * registered by anyone, and it is not a phone number at all, so `normalisePhone` can never produce
 * it from anything a person could type. No sign-in can ever match it and no SMS can ever be aimed
 * at it — which is the point, because a tombstone that could be dialled is a person who was told
 * they were gone and still gets messages.
 *
 * ── What this deliberately does not do ───────────────────────────────────────────────────────
 *
 * It writes nothing to the audit table except a new line, and it deletes nothing from it. The log
 * is append-only by contract and the boundary check fails the build if that stops being true; an
 * erasure that rewrote history would take the one thing that makes the log evidence with it. So an
 * entry written before the erasure still carries the mobile number, the register says so plainly,
 * and nothing written afterwards is linked to the person. That is a real limit, not a design
 * flourish, and the honest place for it is the answer sent to the data subject.
 */
import { createHash } from 'node:crypto';
import { limits } from './config.ts';
import { dueBy, erasureSummary, HOLDINGS } from './personalData.ts';
import type { Caller } from './identity.ts';
import type { Store } from './store.ts';

const DAY = 86_400_000;
export const GRACE_DAYS = limits.erasureGraceDays;
export const eraseAfter = (from: number): number => from + GRACE_DAYS * DAY;

/** Unique, unroutable, and not a number anyone could dial. See the note above. */
export const tombstone = (personId: string): string => `erased-${personId}@erased.invalid`;
export const isTombstone = (phone: string): boolean => phone.endsWith('@erased.invalid');

export type ErasurePlan = {
 requestedAt: number;
 /** Nothing is deleted before this. Told to the person when they ask. */
 eraseAfter: number;
 /** The thirty-day POPIA clock, which runs from the request and not from the deletion. */
 respondBy: number;
 holdings: typeof HOLDINGS;
 summary: string;
};

export class Erasure {
 readonly #store: Store;
 readonly #now: () => number;
 constructor(store: Store, now: () => number = () => Date.now()) {
  this.#store = store;
  this.#now = now;
 }

 /** What would happen, said before anything happens. */
 plan(at: number = this.#now()): ErasurePlan {
  return { requestedAt: at, eraseAfter: eraseAfter(at), respondBy: dueBy(at), holdings: HOLDINGS, summary: erasureSummary() };
 }

 request(personId: string, caller?: Caller): ErasurePlan {
  const at = this.#now();
  const plan = this.plan(at);
  this.#store.requestErasure({ personId, requestedAt: at, eraseAfter: plan.eraseAfter, cancelledAt: null, completedAt: null });
  /* Every session goes now rather than in seven days. Somebody who asked to be erased because their
     phone was taken is asking, in the only words the interface gives them, to be signed out. */
  this.#store.revokeSessionsForPerson(personId, at);
  this.#audit('account.erasure.requested', personId, caller, `carried out after ${GRACE_DAYS} days`);
  return plan;
 }

 /** Stop it, any time before the grace period runs out. */
 cancel(personId: string, caller?: Caller): boolean {
  const request = this.#store.findErasureRequest(personId);
  if (!request || request.cancelledAt !== null || request.completedAt !== null) return false;
  this.#store.cancelErasureRequest(personId, this.#now());
  this.#audit('account.erasure.cancelled', personId, caller, null);
  return true;
 }

 pending(personId: string) {
  const request = this.#store.findErasureRequest(personId);
  return request && request.cancelledAt === null && request.completedAt === null ? request : null;
 }

 /** Erasures whose grace period has run out. The sweep asks; nothing here runs on a timer. */
 due(at: number = this.#now()): string[] {
  return this.#store.erasuresDue(at).map(request => request.personId);
 }

 /**
  * Carry one out.
  *
  * Returns false when there is nothing to do — an account already erased, or a request somebody
  * cancelled — so that running the sweep twice is not two erasures and not an error either.
  */
 carryOut(personId: string, caller?: Caller): boolean {
  const person = this.#store.findPersonById(personId);
  if (!person || isTombstone(person.phone)) return false;
  const at = this.#now();
  this.#store.erasePerson(personId, person.phone, tombstone(personId), at);
  /* The id is recorded and the number is not. The line has to say the erasure happened; repeating
     the number here would put back exactly what was just removed. */
  this.#audit('account.erased', personId, caller, 'name, sessions, sign-in codes and second factor removed');
  return true;
 }

 #audit(event: string, personId: string, caller: Caller | undefined, detail: string | null) {
  this.#store.appendAudit({
   at: this.#now(), event, personId, phone: null, detail,
   address: caller?.address ?? null,
   agentHash: caller ? createHash('sha256').update(caller.agent).digest('hex').slice(0, 16) : null
  });
 }
}
