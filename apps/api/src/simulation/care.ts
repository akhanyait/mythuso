/**
 * The care and dispatch seams, registered.
 *
 * Four simulators stand behind four of the locked doors — a roster so a visit can be booked
 * against somebody, positions so a nurse moves toward a house, answers from the issuing authorities
 * so a vetting check resolves, and a session broker so a consultation connects. Importing this
 * registers all four, which is the only reason it exists: a caller that wanted the whole journey and
 * imported three of them would get a journey that stops in the middle for no visible reason.
 *
 * Nothing here is reachable over HTTP and that is load-bearing rather than a detail of packaging.
 * The feed routes go on refusing every payload; a simulated event enters through `emit`, a
 * different function with a different signature; and scripts/check-boundaries.mjs fails the build if
 * server.ts or any feed module reaches into this directory at all.
 */
export { nurseRoster, rosterFor, shiftOn, isoIn, SIMULATED_NURSES, nurseById, standingFor, zoneNamed } from './roster.ts';
export { nursePosition, positionOn, deviceOf, arrivalFrom } from './positions.ts';
export { credentialAnswer, answersFor, outcomeFor, enquiryReference } from './credentials.ts';
export { mediaSession, sessionFor, scriptFor, MEDIA_EVENTS } from './sessions.ts';
export type { SimulatedNurse, Zone } from './roster.ts';
export type { MediaEvent, SessionStep } from './sessions.ts';
