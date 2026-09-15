import contract from '../../../../packages/catalog/booking.json';
import trust from '../../../../packages/catalog/trust.json';
import { distanceKm } from '../../../../packages/geo/index.ts';
import type { Candidate, PersonChoice } from '../../../../packages/engines/src/access/domain/booking.ts';
import { zones } from './geography';
import { mayTakeAVisit, refusalFor, rosterNurses } from './roster';
import { numberById } from './sos';

/* The web's side of booking with a person in it.

   The arithmetic is not here. Whether an hour was offered, whether a nurse may be asked for, what state a
   booking is in and what a visit thread refuses are packages/engines/src/access/domain — the same files the
   Access engine runs behind its routes — and the screens import them directly. What this module adds is the
   one thing the domain may not know: this browser's own vetting register. A badge is current when the
   take-visit gate says yes for her today, and the reason she is not offered is the roster's own sentence, so
   a nurse suspended in the console is refused here by the same arithmetic and in the same words.

   It is only ever imported by screens that arrive on a dynamic import. A patient who never books never
   downloads the booking contract, the trust tiers or the roster arithmetic below. */

export const person = contract.person;
export const time = contract.time;
export const review = contract.review;
export const statusHeading = contract.statusHeading;
export const statusWords = contract.statusWords;
export const acceptedBy = contract.acceptedBy;
export const asapStaysRequested = contract.asapStaysRequested;
export const bookingStates = contract.states;

/* {ambulance} and {mobile} are sos.json's, filled rather than typed. */
export const thread = {
 ...contract.thread,
 nobodyWatches: contract.thread.nobodyWatches.replace(/\{(ambulance|mobile)\}/g, (_, id: string) => numberById(id).number)
};

/* The badge's name and sentence are the verified tier's in trust.json; booking.json only says which tier. */
const tier = trust.tiers.find(t => t.id === contract.person.badge.tier)!;
export const badge = { name: tier.name, sentence: tier.sentence };

export const optionWords = (id: PersonChoice['kind']) => contract.person.options.find(o => o.id === id)!;
export const fill = (text: string, values: Record<string, string>) =>
 text.replace(/\{([a-zA-Z]+)\}/g, (token, key: string) => values[key] ?? token);

/** The covered suburb an address names, if it names one. "Home visit · Melville" and "12 Main Road, Soweto" both do. */
export const zoneInAddress = (address: string) => zones.find(z => address.toLowerCase().includes(z.name.toLowerCase()));

/** Every nurse on the roster, as the domain needs to see her for a visit at this address. */
export function candidatesFor(address: string): Candidate[] {
 const here = zoneInAddress(address);
 return rosterNurses.map(nurse => ({
  nurseRef: nurse.id,
  name: nurse.name,
  zone: nurse.zoneName,
  covered: Boolean(nurse.zone),
  badgeCurrent: mayTakeAVisit(nurse).allowed,
  notOfferedBecause: refusalFor(nurse),
  distanceKm: here && nurse.zone ? distanceKm(nurse.zone.at, here.at) : null
 }));
}
