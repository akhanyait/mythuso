import { useEffect, useState } from 'react';
import contract from '../../../../packages/catalog/interpreting.json';
import { isoIn, offeredDays, slots as offeredSlots, type Visit } from './scheduling';
import { roleById } from './vetting';
/* The South African Sign Language accommodation — the reasoning, not the screen.
 *
 * packages/catalog/locales.json already said what is owed to a Deaf patient: a booking that will
 * not complete without an interpreter, a nurse told before she leaves, an interpreter named on the
 * call roster, and six things that must never happen. It said, at the bottom, that none of it was
 * built. This is the half that makes it arithmetic.
 *
 * Three things in here are the feature.
 *
 * Who a free interpreter is. The roster carries hours, not conclusions: each interpreter's free
 * hours are day offsets into the same five-day window packages/catalog/scheduling.json offers, and
 * `firstFree` walks them in order. The generator writes out the hours and no wait at all, so the
 * question "when could somebody actually be there" is answered three times from the same numbers
 * rather than once in a build script.
 *
 * What a wait is when there is not one. `firstFree` returns null, and null is a value the screen
 * has to render — with the contract's own sentence, saying it does not know and why. It does not
 * fall back to the day that was asked for, it does not print a dash and it never prints zero. That
 * rule is not new here: packages/catalog/sos.json carries it under the same id for an ambulance's
 * arrival, and an estimate that is honest on one screen and confident on another is worse than
 * either.
 *
 * What a visit without one is. Not a visit. `resolve` returns a hold rather than a confirmation,
 * and there is no branch in this module that produces a dispatchable visit with the requirement on
 * and no interpreter against it — which is the whole reason the decision is a function rather than
 * a flag somebody sets on a screen.
 *
 * The requirement itself is deliberately not a prop. It travels with the account: it is set once,
 * in the language dialog, and the booking flow, the call roster and the access screen all have to
 * see the same answer without four screens passing it to each other through a component tree that
 * has nothing to do with it. It is held in memory for the length of the session and nowhere else —
 * no browser storage of any kind, nothing written down — because this preview must not persist
 * anything about a patient, and a communication requirement is a fact about a person.
 *
 * Nothing here contacts an interpreter, holds a real visit or books anybody's time. */

export const requirementId = contract.requirementId;
export const roleId = contract.roleId;
export const participantId = contract.participantId;
export const accreditation = contract.accreditation;
export const modes = contract.modes;
export const roster = contract.roster;
export const hold = contract.hold;
export const estimate = contract.estimate;
export const cancellation = contract.cancellation;
export const withdrawal = contract.withdrawal;
export const cost = contract.cost;
export const rules = contract.rules;
export const refusals = contract.refusals;
export const labels = contract.labels;
export const notYetBuilt = contract.notYetBuilt;

export type InterpretingMode = typeof modes[number];
export type Interpreter = typeof roster[number];
export type InterpretingRule = typeof rules[number];
export type InterpretingRefusal = typeof refusals[number];

export const modeById = (id: string) => modes.find(m => m.id === id)!;
export const ruleById = (id: string) => rules.find(r => r.id === id)!;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
export const interpreterById = (id: string) => roster.find(i => i.id === id);
/* The vetting row, resolved rather than restated. An interpreter's checks are the register's
   business; this module only ever asks the register what they are. */
export const interpreterRole = () => roleById(roleId);

/* ---- The requirement, which lives on the account -----------------------------------------------
   One value, one set of listeners, no storage. A Deaf patient sets it once; every screen that has
   to behave differently reads it from here rather than being handed it. */
let required = false;
const listeners = new Set<(value: boolean) => void>();
export function setSaslRequired(value: boolean) {
 required = value;
 for (const listener of listeners) listener(value);
}
export const saslRequired = () => required;
export function useSaslRequirement(): [boolean, (value: boolean) => void] {
 const [value, setValue] = useState(required);
 useEffect(() => { listeners.add(setValue); setValue(required); return () => { listeners.delete(setValue); }; }, []);
 return [value, setSaslRequired];
}

/* ---- Availability ------------------------------------------------------------------------------
   The offered window is scheduling's, not a second copy of it: five days from tomorrow, the same
   nine hours. An interpreter free on the sixth day is an interpreter this function cannot see, and
   `estimate.horizonNote` is what says so on the screen. */
export type FreeSlot = { interpreter: Interpreter; iso: string; slot: string; dayOffset: number };

export function availability(mode: string, from: Date = new Date()): FreeSlot[] {
 /* The days this app actually offers a visit on, asked of scheduling rather than counted here. An
    offset that falls outside them is an interpreter free on a day nobody can book. */
 const offered = new Set(offeredDays(from).map(day => day.iso));
 const free: FreeSlot[] = [];
 for (const interpreter of roster) {
  if (interpreter.mode !== mode) continue;
  for (const day of interpreter.free) {
   const iso = isoIn(new Date(from.getTime() + day.dayOffset * 86_400_000));
   if (!offered.has(iso)) continue;                           // free beyond the window we can see
   for (const slot of day.slots) {
    if (!offeredSlots.includes(slot)) continue;               // an hour the app does not offer
    free.push({ interpreter, iso, slot, dayOffset: day.dayOffset });
   }
  }
 }
 return free.sort((a, b) => (a.iso === b.iso ? a.slot.localeCompare(b.slot) : a.iso.localeCompare(b.iso)));
}

/** Is somebody free at exactly this hour, on this day, in this mode? */
export function freeAt(mode: string, iso: string, slot: string, from: Date = new Date()): FreeSlot | null {
 return availability(mode, from).find(f => f.iso === iso && f.slot === slot) ?? null;
}

/* The first free hour at or after the one that was asked for — and null when there is not one.
 *
 * The return type is the point of this function. A signature that cannot say "I do not know" is a
 * signature that will one day be made to return something, and the something will be a number a
 * person plans a day off work around. scripts/check-boundaries.mjs fails the build if this
 * function, or its Swift and Kotlin counterparts, stops being able to return nothing. */
export function firstFree(mode: string, iso: string, slot: string, from: Date = new Date()): FreeSlot | null {
 const after = (f: FreeSlot) => f.iso > iso || (f.iso === iso && f.slot >= slot);
 return availability(mode, from).find(after) ?? null;
}

/** Whole days between the hour asked for and the hour offered. Never negative; may be zero, which
    is a same-day offer and is not the same fact as "no wait" — the hour is shown either way. */
export function waitDays(iso: string, found: FreeSlot): number {
 const asked = new Date(`${iso}T00:00:00Z`).getTime();
 const offered = new Date(`${found.iso}T00:00:00Z`).getTime();
 return Math.max(0, Math.round((offered - asked) / 86_400_000));
}

/* ---- What happens to the visit -----------------------------------------------------------------
   Three outcomes and no fourth. Either an interpreter is free at the hour chosen and the visit is
   confirmed with them named on it, or one is free later and the visit is held with that hour shown,
   or nobody is and the visit is held with the contract's sentence about not knowing. There is no
   branch that returns a dispatchable visit without an interpreter. */
export type InterpreterOutcome =
 | { kind: 'matched'; mode: string; found: FreeSlot }
 | { kind: 'held'; mode: string; found: FreeSlot; days: number }
 | { kind: 'held-unknown'; mode: string; found: null };

export function resolve(mode: string, iso: string, slot: string, from: Date = new Date()): InterpreterOutcome {
 const exact = freeAt(mode, iso, slot, from);
 if (exact) return { kind: 'matched', mode, found: exact };
 const next = firstFree(mode, iso, slot, from);
 if (!next) return { kind: 'held-unknown', mode, found: null };
 return { kind: 'held', mode, found: next, days: waitDays(iso, next) };
}

/* The status a held visit carries. The word itself is a literal in the Visit type in
   ./scheduling.ts — a status has to be a literal for the type to be worth anything — and
   scripts/check-boundaries.mjs fails the build if that literal and the contract stop matching, so
   there is one word and one place to change it. */
export const holdStatus = hold.status as Visit['status'];
/** Matched keeps whatever status the booking already had; the other two are held, and a held visit
    is not dispatched. There is no branch here that returns a dispatchable visit without one. */
export const statusFor = (outcome: InterpreterOutcome, ifMatched: Visit['status']): Visit['status'] =>
 outcome.kind === 'matched' ? ifMatched : holdStatus;
export const isHeld = (outcome: InterpreterOutcome) => outcome.kind !== 'matched';

/* The wait, as a sentence, or the admission that there is not one. Callers render whichever comes
   back; there is no third form and no number to fall through to. */
export function waitSentence(outcome: InterpreterOutcome, longDate: (iso: string) => string): string {
 if (outcome.kind === 'held-unknown') return estimate.unknown;
 return `${estimate.knownPrefix} ${outcome.found.interpreter.name}, ${longDate(outcome.found.iso)} at ${outcome.found.slot}.`;
}

/** Today's ISO date in Johannesburg, so a caller does not have to reach past this module for it. */
export const todayIso = () => isoIn(new Date());
