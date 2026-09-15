/* The chain of custody: the patient authorises one collector, the collector collects the bag sealed at dispense,
 * and hands it over at the door against the patient's PIN.
 *
 * WHAT A COLLECTION KEEPS. The PIN's expiry, the window and the attempt limit are settings an admin changes
 * (./settings.ts). An authorisation reads them once, when the patient authorises, and keeps them: a PIN shown at
 * nine keeps the expiry it was shown with, and an admin who shortens the window at ten reaches the next patient,
 * never this one.
 *
 * WHAT IS REFUSED, AND IN WHAT ORDER. A driver is refused a Schedule 5 or 6 bag when the patient names them and
 * again when they try to collect, from the schedule the prescription carries and never one the carrier declares.
 * At the door the order is the order of what is already true: a bag handed over or a collection voided says so
 * first, then the person holding it must be the one the patient chose, then time (the window, then the PIN),
 * then the seal — a broken seal voids the delivery whatever PIN is given — and only then the PIN. A wrong PIN is
 * counted, and the count is handed back as a write the refusal keeps; the PIN that uses the last attempt voids the
 * collection in its own sentence.
 *
 * THE PIN ITSELF IS NEVER HERE. An authorisation holds a salt and a digest, and a hand-over is handed whether the
 * PIN matched, so this file cannot print a PIN, log one or compare one badly.
 */
import { collectorRoles, done, mayCarry, refused, type Result } from './contract.ts';
import type { Prescription } from './prescriptions.ts';

export type Terms = { readonly settingsVersion: number; readonly pinLifetimeMs: number; readonly windowMs: number; readonly pinAttempts: number };
export type Authorisation = {
 readonly authorisationRef: string; readonly prescriptionRef: string; readonly collectorRef: string; readonly collectorRole: string;
 readonly pinSalt: string; readonly pinDigest: string; readonly authorisedAt: number; readonly pinExpiresAt: number; readonly windowEndsAt: number;
 readonly pinAttempts: number; readonly settingsVersion: number;
};
export type Collection = {
 readonly collectionRef: string; readonly authorisationRef: string; readonly prescriptionRef: string; readonly collectorRef: string;
 readonly collectorRole: string; readonly sealRef: string; readonly collectedAt: number; readonly handedOverAt: number | null;
};
export type Attempt = { readonly outcome: 'wrong-pin' | 'broken-seal'; readonly byRef: string; readonly at: number };

/** Why a collection has ended without a hand-over, or null while it may still be handed over. */
export function voidedBy(attempts: readonly Attempt[], authorisation: Authorisation): 'broken-seal' | 'pin-attempts-exhausted' | null {
 if (attempts.some(a => a.outcome === 'broken-seal')) return 'broken-seal';
 return attempts.filter(a => a.outcome === 'wrong-pin').length >= authorisation.pinAttempts ? 'pin-attempts-exhausted' : null;
}

export type AuthoriseInput = { readonly authorisationRef: string; readonly collectorRef: string; readonly collectorRole: string; readonly pinSalt: string; readonly pinDigest: string };
/** The last authorisation for this prescription, and whether its collection was voided. */
export type Previous = { readonly authorisation: Authorisation | undefined; readonly voided: boolean };

export function authorise(p: Prescription, input: AuthoriseInput, who: { readonly ref: string | null }, previous: Previous, terms: Terms, now: number): Result<Authorisation> {
 if (!who.ref) return refused('unnamed-caller');
 if (who.ref !== p.subjectRef) return refused('not-your-prescription');
 if (!collectorRoles.includes(input.collectorRole)) return refused('collector-role-not-allowed');
 if (!mayCarry(input.collectorRole, p.scheduleCode)) return refused('schedule-five-six-by-driver');
 const live = previous.authorisation && !previous.voided && now < previous.authorisation.windowEndsAt;
 if (p.deliveredAt !== null || live) return refused('collection-under-way');
 return done({
  authorisationRef: input.authorisationRef, prescriptionRef: p.prescriptionRef, collectorRef: input.collectorRef, collectorRole: input.collectorRole,
  pinSalt: input.pinSalt, pinDigest: input.pinDigest, authorisedAt: now,
  /* The PIN never outlives the window; the settings rule refuses a lifetime longer than it, and this holds either way. */
  pinExpiresAt: now + Math.min(terms.pinLifetimeMs, terms.windowMs), windowEndsAt: now + terms.windowMs,
  pinAttempts: terms.pinAttempts, settingsVersion: terms.settingsVersion
 });
}

export function collect(p: Prescription, authorisation: Authorisation | undefined, existing: Collection | undefined, input: { readonly collectionRef: string; readonly sealRef: string }, who: { readonly ref: string | null; readonly role: string }, now: number): Result<{ readonly collection: Collection; readonly prescription: Prescription }> {
 if (!who.ref) return refused('unnamed-caller');
 if (!authorisation || authorisation.prescriptionRef !== p.prescriptionRef) return refused('no-authorisation');
 if (who.ref !== authorisation.collectorRef || who.role !== authorisation.collectorRole) return refused('not-the-authorised-collector');
 if (!mayCarry(who.role, p.scheduleCode)) return refused('schedule-five-six-by-driver');
 if (now >= authorisation.windowEndsAt) return refused('authorisation-lapsed');
 if (existing) return refused('already-collected');
 if (p.dispensedAt === null || p.sealRef === null) return refused('not-dispensed');
 if (input.sealRef !== p.sealRef) return refused('seal-does-not-match');
 const collection: Collection = {
  collectionRef: input.collectionRef, authorisationRef: authorisation.authorisationRef, prescriptionRef: p.prescriptionRef,
  collectorRef: who.ref, collectorRole: who.role, sealRef: input.sealRef, collectedAt: now, handedOverAt: null
 };
 return done({ collection, prescription: { ...p, collectedAt: now } }, [
  { key: 'delivery.collected@1', payload: { collectionRef: collection.collectionRef, collectedByRole: who.role, sealRef: collection.sealRef } }
 ]);
}

export type Handover = { readonly result: Result<{ readonly collection: Collection; readonly prescription: Prescription }>; readonly keep: Attempt | null };

export function handOver(c: Collection, p: Prescription, authorisation: Authorisation, attempts: readonly Attempt[], input: { readonly pinMatches: boolean; readonly sealIntact: boolean }, who: { readonly ref: string | null }, now: number): Handover {
 const no = (id: string, keep: Attempt | null = null): Handover => ({ result: refused(id), keep });
 if (!who.ref) return no('unnamed-caller');
 if (c.handedOverAt !== null) return no('already-handed-over');
 if (voidedBy(attempts, authorisation)) return no('collection-voided');
 if (who.ref !== c.collectorRef) return no('not-the-authorised-collector');
 if (now >= authorisation.windowEndsAt) return no('authorisation-lapsed');
 if (now >= authorisation.pinExpiresAt) return no('pin-expired');
 if (!input.sealIntact) return no('broken-seal', { outcome: 'broken-seal', byRef: who.ref, at: now });
 if (!input.pinMatches) {
  const wrong = attempts.filter(a => a.outcome === 'wrong-pin').length + 1;
  return no(wrong >= authorisation.pinAttempts ? 'pin-attempts-exhausted' : 'wrong-pin', { outcome: 'wrong-pin', byRef: who.ref, at: now });
 }
 const handed: Collection = { ...c, handedOverAt: now };
 return {
  result: done({ collection: handed, prescription: { ...p, deliveredAt: now } }, [
   { key: 'delivery.handed_over@1', payload: { collectionRef: c.collectionRef, sealIntact: true } }
  ]),
  keep: null
 };
}

/** How many wrong PINs a collector may still enter before the bag goes back. */
export const attemptsLeft = (attempts: readonly Attempt[], authorisation: Authorisation): number =>
 Math.max(0, authorisation.pinAttempts - attempts.filter(a => a.outcome === 'wrong-pin').length);
