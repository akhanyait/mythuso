/* A hospital admission heard from Record, as Care acts on it (Wave 5, the HL7 v2 bridge).
 *
 * NOBODY IS AT HOME. A patient a hospital has admitted is not behind the door a nurse would drive to, so every offer
 * still open for that patient's visits is withdrawn: no nurse accepts a visit to an empty house, and the tick never
 * passes one on. That is all this does.
 *
 * WHAT IT LEAVES FOR A PERSON. A visit a nurse already accepted, as a stood-down SOS leaves one: she may already be on
 * her way, and telling her not to travel is a person's call with the patient's circumstances in front of them. Nothing
 * is cancelled, rebooked or charged, and nothing about the admission — which hospital, why, for how long — is kept,
 * because Care needs none of it to stop offering a visit.
 */
import type { Offer } from './offers.ts';

/** The offers an admission withdraws: every one still open, and none a nurse accepted. */
export const withdrawnOnAdmission = (offers: readonly Offer[]): Offer[] => offers.filter(offer => offer.state === 'open');
