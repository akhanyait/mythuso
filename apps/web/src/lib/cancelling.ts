import contract from '../../../../packages/catalog/cancellation.json';
/* Cancelling a visit, and moving one.
 *
 * The web was the last of the three platforms without this. Both native apps promised a window on
 * the booking confirmation and offered no cancel control; the web grew the control first and never
 * mentioned the window. Neither half was wrong on its own — together they were a product that said
 * one thing on a phone and did another in a browser.
 *
 * Nothing here decides anything. The window, the states, the reasons and every sentence are the
 * contract's; this module is the arithmetic that says which state a particular visit is in, and it
 * is deliberately the only place that arithmetic exists. */

export const windowHours = contract.window.hoursBefore;
export const windowSentence = contract.window.sentence;
export const always = contract.always;
export const states = contract.states;
export const reasons = contract.reasons;
export const reasonsNote = contract.reasonsNote;
export const doesNotUndo = contract.doesNotUndo;
export const reschedule = contract.reschedule;
export const money = contract.money;
export const refusals = contract.refusals;
export const refusalById = (id: string) => refusals.find(r => r.id === id)!;
export const stateById = (id: string) => states.find(s => s.id === id)!;

export type CancelState = 'before-window' | 'inside-window' | 'in-progress';

/* Which side of the window a visit is on, worked out from the visit's own date and time rather than
   from a flag somebody set. A visit whose state is stored is a visit that is wrong the moment the
   clock passes it. */
export function stateOf(iso: string | undefined, start: string | undefined, now = new Date()): CancelState {
 /* A visit with no date is an as-soon-as-possible request. Nobody has been dispatched against a
    time, so it is always outside the window — there is no arrival to be close to. */
 if (!iso || !start) return 'before-window';
 const [hour, minute] = start.split(':').map(Number);
 const at = new Date(`${iso}T00:00:00Z`);
 at.setUTCHours(hour, minute, 0, 0);
 const hoursAway = (at.getTime() - now.getTime()) / 3_600_000;
 if (hoursAway <= 0) return 'in-progress';
 return hoursAway < windowHours ? 'inside-window' : 'before-window';
}

/** Whether a booking screen may end this visit at all. Only one state says no, and it says no
    because a visit that has begun is a clinical event rather than a booking. */
export const mayCancel = (state: CancelState) => !stateById(state).refusesCancellation;

/** The sentence a person reads on the screen where they are deciding. */
export const wordsFor = (state: CancelState) => stateById(state).patientWords;
