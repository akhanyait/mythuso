/* The thread between a patient and the nurse on one visit.

   Four refusals, and together they are what makes a message thread safe to put in a health product
   that has no messaging provider, no clinical review of what is said in it and no one watching it.

   Words only. A photo of a wound sent to a nurse's phone is a clinical record kept on a personal
   device with no consent behind it and no way to take it back, and whether a visit photo may travel
   over any channel is an open decision in packages/catalog/capabilities.json. So an attachment is
   refused by count, before its content is looked at, because there is nothing to look at it with.

   Short. A long message is a history being written in the wrong place; the length is booking.json's.

   Only the two people the visit brings together. The patient — or somebody booking on their behalf —
   and the nurse the booking names. Nobody is added, and a stranger is told the thread is not theirs
   rather than whether it exists.

   Closed with the visit. A thread left open after the visit is a private line to a nurse outside any
   rota and after her shift. It closes when the visit is completed or the booking is cancelled, and
   what was said stays readable — a thread that vanished would be a conversation nobody can ask about.

   It publishes nothing. A message is words between two people about one visit; no engine acts on it,
   and free text on the bus is where health information goes when nobody meant it to. And it is not a
   clinical record, which the screen says, because a thread treated as one makes a message about a
   parking space special personal information held in the wrong place. */
import contract from '../../../../catalog/booking.json' with { type: 'json' };
import { ROUTES, accept, nowInstant, routeRefusal, simulatedRef, type Outcome } from './contract.ts';
import type { Booking } from './booking.ts';

export type ThreadRole = 'patient' | 'caregiver' | 'guardian' | 'nurse';
export type ClosedBecause = 'visit-completed' | 'booking-cancelled';

export type ThreadMessage = {
 readonly messageRef: string;
 readonly fromRole: ThreadRole;
 readonly message: string;
 readonly at: string;
 /* While messaging is simulated nothing is delivered, and the code never says otherwise. */
 readonly deliveryCode: 'kept-not-delivered';
};

export type Thread = {
 readonly bookingRef: string;
 readonly subjectRef: string;
 /** The nurse the booking names, or null while it is whoever is nearest and Care has assigned nobody. */
 readonly nurseRef: string | null;
 readonly state: 'open' | 'closed';
 readonly closedBecause: ClosedBecause | null;
 readonly messages: readonly ThreadMessage[];
 readonly keys: readonly string[];
};

export const MAX_CHARACTERS = contract.thread.maxCharacters;

/** A booking's thread. A booking already cancelled has a closed one. */
export function threadFor(booking: Booking, nurseRef: string | null = booking.slot.nurseRef): Thread {
 const cancelled = booking.state === 'cancelled';
 return { bookingRef: booking.bookingRef, subjectRef: booking.subjectRef, nurseRef, state: cancelled ? 'closed' : 'open', closedBecause: cancelled ? 'booking-cancelled' : null, messages: [], keys: [] };
}

export const closeThread = (thread: Thread, because: ClosedBecause): Thread =>
 thread.state === 'closed' ? thread : { ...thread, state: 'closed', closedBecause: because };

export type Actor = { readonly role: ThreadRole; readonly ref: string };

/* A patient, a caregiver or a guardian acts for the subject the booking is about; a nurse is the one
   the booking names. A nurse on a nearest-nurse booking nobody has assigned yet is nobody's nurse. */
const isParty = (thread: Thread, actor: Actor) =>
 actor.role === 'nurse' ? thread.nurseRef !== null && actor.ref === thread.nurseRef : actor.ref === thread.subjectRef;

export type Post = { readonly idempotencyKey: string; readonly actor: Actor; readonly message: string; readonly attachments?: number; readonly now: Date };

export function postMessage(thread: Thread, post: Post): Outcome<{ thread: Thread; message: ThreadMessage }> {
 if (!isParty(thread, post.actor)) return routeRefusal(ROUTES.write, 'not-on-this-visit');
 if (thread.state === 'closed') return routeRefusal(ROUTES.write, 'thread-closed');
 if ((post.attachments ?? 0) > 0) return routeRefusal(ROUTES.write, 'no-attachments');
 if (!post.idempotencyKey) return routeRefusal(ROUTES.write, 'idempotency-key-required');
 const words = post.message.trim();
 if (!words) return routeRefusal(ROUTES.write, 'required-field-missing');
 if ([...words].length > MAX_CHARACTERS) return routeRefusal(ROUTES.write, 'message-too-long');
 const messageRef = simulatedRef('MSG', `${thread.bookingRef}|${post.idempotencyKey}`);
 const sent = thread.messages.find(m => m.messageRef === messageRef);
 if (sent) return accept({ thread, message: sent });
 const message: ThreadMessage = { messageRef, fromRole: post.actor.role, message: words, at: nowInstant(post.now), deliveryCode: 'kept-not-delivered' };
 return accept({ thread: { ...thread, messages: [...thread.messages, message], keys: [...thread.keys, post.idempotencyKey] }, message });
}

/** GET /v1/access/visit-threads/{bookingRef}. A stranger is told it is not theirs, never whether it exists. */
export function readThread(thread: Thread, actor: Actor): Outcome<{ threadStateCode: Thread['state']; messages: readonly ThreadMessage[] }> {
 if (!isParty(thread, actor)) return routeRefusal(ROUTES.readThread, 'not-on-this-visit');
 return accept({ threadStateCode: thread.state, messages: thread.messages });
}

export const closedSentence = (because: ClosedBecause) => contract.thread.closedBecause.find(c => c.id === because)!.sentence;
