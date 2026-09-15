/* Patient SOS and next of kin on the Safety engine: the arithmetic, with no store, no bus and no clock of its own.
 *
 * WHAT A PRESS IS. A patient pressed SOS in the app and answered the three routing questions — any of the eight
 * conditions, the area from the list, a phone to ring — and that is all an SOS carries. routeOf() is
 * packages/catalog/sos.json's routing and not triage: a ticked condition is emergency services before the area is
 * read; the area, the hours and the callback decide an urgent visit or cannot-help; nothing is scored. Whether a
 * cleared nurse can be found is Care's to answer when it hears sos.raised@2, never Safety's to guess.
 *
 * WHAT IS SENT WITHOUT A HUMAN, AND WHAT IS NOT. sos.json engine.dispatchWithoutAHuman says it in words: an
 * urgent-visit offer, through Care's gates, when a person pressed SOS in the app and the door is an urgent visit.
 * A band on its own and a fall a phone noticed are refused before anything is recorded, in the route's own
 * sentences, because neither is a person pressing and neither shows that a patient is unresponsive.
 *
 * NO PLAN, NO PRIORITY. Nothing here reads a plan, and a request that names one is refused rather than ignored.
 * Premium's priority SOS is an undecided founder question; until it is answered an SOS from anybody is routed,
 * offered and shown to the desk the same way.
 *
 * THE AREA IS KEPT FOR A WINDOW AND THEN NOT AT ALL. The area chosen from the list — a suburb, never a point, and
 * never read from a device — is shared with the desk until the area window in force when SOS was pressed, or the
 * stand-down if that comes first. areaFor() is the only way to it and refuses after either; sweepArea() drops it,
 * and the engine drops it from its store on the tick.
 *
 * NEXT OF KIN ARE TOLD NOTHING, BECAUSE NOTHING CAN TELL THEM. No SMS provider is connected. Every attempt is
 * recorded as not sent, with the reason, in the words sos.json nextOfKin holds, and there is no status in this file
 * that says anybody was reached — so no route and no screen can say it either. What an attempt would say is
 * nextOfKin.alertSays with the time filled in and the name left for the identity service, which holds it: plain
 * words, and never what was ticked, why, where or anything from the record.
 *
 * A GUARDIAN IS REFUSED FIRST. docs/governance/INFORMATION-OFFICER.md D-10 is open and guardian authority is not
 * proven, so a guardian nominating, withdrawing or alerting a next of kin for somebody else is refused before
 * anything else is asked.
 *
 * A LIVE SOS KEEPS ITS SETTINGS. raiseSos() is handed the area window, the alert window and the tries in force,
 * writes their ends and the settings version onto the SOS, and nothing reads the settings again for it.
 *
 * Every refusal is the route's own sentence, or an engine refusal whose answeredBy names the route, read from
 * packages/catalog/apis/safety.json by refuseOn(); an id the route cannot answer throws, because the runtime would
 * answer it with a fault. Zero dependencies and apps/api's type-stripping rules. Nothing here is a real service. */
import sosContract from '../../../../catalog/sos.json' with { type: 'json' };
import consent from '../../../../catalog/consent.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import api from '../../../../catalog/apis/safety.json' with { type: 'json' };
import { localTimeOf } from '../../settings/shape.ts';
import { MINUTE, clockOf, done, fill, instant, type Refusal, type Refused, type Result } from './rules.ts';
import type { SosSettings } from './settings.ts';

export const SOS_ROUTES = {
 raise: 'POST /v1/safety/sos@2',
 standDown: 'POST /v1/safety/sos/{sosRef}/stand-down@1',
 list: 'GET /v1/safety/sos@1',
 area: 'GET /v1/safety/sos/{sosRef}/area@1',
 nominate: 'POST /v1/safety/next-of-kin@2',
 nominations: 'GET /v1/safety/next-of-kin@1',
 withdraw: 'POST /v1/safety/next-of-kin/{nominationRef}/withdraw@1',
 alert: 'POST /v1/safety/next-of-kin/{nominationRef}/alert@2'
} as const;
export type SosRoute = keyof typeof SOS_ROUTES;

type ApiRefusal = { readonly id: string; readonly status: number; readonly statement: string; readonly answeredBy?: readonly string[] };
type ApiRoute = { readonly method: string; readonly path: string; readonly version: number; readonly refusals: readonly ApiRefusal[] };

/** The sentence a route refuses with: its own, or an engine refusal that names it. Throws for anything else. */
export function sosRefusal(route: SosRoute, id: string): Refusal {
 const key = SOS_ROUTES[route];
 const declared = (api.routes as readonly ApiRoute[]).find(r => `${r.method} ${r.path}@${r.version}` === key);
 if (!declared) throw new Error(`packages/catalog/apis/safety.json does not declare ${key}.`);
 const found = declared.refusals.find(r => r.id === id) ?? (api.refusals as readonly ApiRefusal[]).find(r => r.id === id && (r.answeredBy ?? []).includes(key));
 if (!found) throw new Error(`${key} cannot answer the refusal "${id}": neither the route nor an engine refusal naming it declares one.`);
 return { id, status: found.status, statement: found.statement };
}
export const refuseOn = (route: SosRoute, id: string): Refused => ({ ok: false, refusal: sosRefusal(route, id) });

/* ── What the contracts say ─────────────────────────────────────────────────────────────────────────── */

const named = <T extends { readonly id: string }>(list: readonly T[], id: string, where: string): T => {
 const found = list.find(entry => entry.id === id);
 if (!found) throw new Error(`packages/catalog/sos.json ${where} has lost "${id}".`);
 return found;
};
export const sosEngine = sosContract.engine;
export const nextOfKin = sosContract.nextOfKin;
export const standDownReasons = sosContract.standDown.reasons;
export type SosChannel = { readonly id: string; readonly label: string; readonly raises: boolean; readonly refusal: string | null; readonly why: string };
export const sosChannels = sosContract.engine.channels as readonly SosChannel[];

const DOOR = {
 emergency: named(sosContract.outcomes, 'emergency-services', 'outcomes').id,
 visit: named(sosContract.outcomes, 'urgent-visit', 'outcomes').id,
 cannot: named(sosContract.outcomes, 'cannot-help', 'outcomes').id
};
const FAILURE = {
 coverage: named(sosContract.failures, 'outside-coverage', 'failures').id,
 hours: named(sosContract.failures, 'outside-hours', 'failures').id,
 callback: named(sosContract.failures, 'no-callback', 'failures').id
};
const STATE = { raised: named(sosContract.engine.states, 'raised', 'engine.states').id, stoodDown: named(sosContract.engine.states, 'stood-down', 'engine.states').id };
/* The one status this build can record, and the one reason. There is deliberately no status for a next of kin
   who was reached: while no SMS provider is connected, a status that could say so is a status somebody sets. */
const NOT_SENT = named(sosContract.nextOfKin.statuses, 'not-sent', 'nextOfKin.statuses').id;
const NO_SMS = named(sosContract.nextOfKin.notSent, 'sms-not-integrated', 'nextOfKin.notSent').id;

/** Whether the door sends anybody: only an urgent visit does, as sos.json outcomes says. */
export const offersVisit = (routedTo: string): boolean => sosContract.outcomes.some(o => o.id === routedTo && o.offersVisit === true);
/** No ambulance partner is contracted, and the emergency-acknowledgement door refuses every payload by construction. */
export const partnerConnected = false;

const zoneById = (id: string) => geography.zones.find(zone => zone.id === id);
const covered = new Set<string>(sosContract.coverage.areas);

const GUARDIAN = vetting.roles.find(role => role.id === 'guardian')?.id;
if (!GUARDIAN) throw new Error('packages/catalog/vetting.json has lost the guardian role, whose authority next of kin wait on.');
const nextOfKinRole = consent.grants.recipientRoles.find(role => role.id === 'next-of-kin');
if (!nextOfKinRole) throw new Error('packages/catalog/consent.json has lost the next-of-kin recipient role, which a nomination takes its purpose and its ceiling from.');
/** The purposes consent.json allows a next-of-kin grant, and the longest it runs. */
export const nominationPurposes: readonly string[] = nextOfKinRole.allowedPurposes;
/* A day as a unit, written the way packages/engines/src/settings/shape.ts writes it. */
const DAY_MS = 86_400_000;
const nominationLasts = nextOfKinRole.maxExpiryDays * DAY_MS;

/* Words that ask for a place in a queue. An undeclared field is only ever seen by name, so a name is what is read. */
const ASKS_FOR_PRIORITY = /plan|priority|premium|tier|queue|first/i;

/* ── The press ──────────────────────────────────────────────────────────────────────────────────────── */

export type Sos = {
 readonly sosRef: string;
 readonly patientRef: string;
 readonly channel: string;
 /** Whether a condition was ticked, as a yes or a no, for the record. Never which, and never sent anywhere. */
 readonly conditionTicked: boolean;
 readonly routedTo: string;
 readonly failureCode: string | null;
 /** The area chosen from the list while it is shared; null once its window ends, at the stand-down, or when none was chosen. */
 readonly zoneId: string | null;
 readonly raisedAt: number;
 /** The settings version it was pressed under. The ends below are already worked out from it. */
 readonly settingsVersion: number;
 readonly areaSharedUntil: number | null;
 readonly alertWindowEndsAt: number;
 readonly attemptsAllowed: number;
 readonly stoodDown: { readonly at: number; readonly reasonCode: string } | null;
};
export type SosAnswers = { readonly conditionTicked: boolean; readonly zoneId: string | null; readonly callbackAvailable: boolean };

/** Whether the urgent-visit rota runs at a moment, in the timezone the rota is kept in. */
export const isOpenAt = (at: number): boolean => {
 const { time } = localTimeOf(at);
 return time >= sosContract.coverage.hours.opensAt && time < sosContract.coverage.hours.closesAt;
};

/* Routing, not triage, in the order sos.json asks it: a condition first, before anything else is read. */
export function routeOf(answers: SosAnswers, at: number): { readonly routedTo: string; readonly failureCode: string | null } {
 if (answers.conditionTicked) return { routedTo: DOOR.emergency, failureCode: null };
 const zone = answers.zoneId === null ? undefined : zoneById(answers.zoneId);
 if (!zone || !covered.has(zone.name)) return { routedTo: DOOR.cannot, failureCode: FAILURE.coverage };
 if (!isOpenAt(at)) return { routedTo: DOOR.cannot, failureCode: FAILURE.hours };
 if (!answers.callbackAvailable) return { routedTo: DOOR.cannot, failureCode: FAILURE.callback };
 return { routedTo: DOOR.visit, failureCode: null };
}

export type RaiseInput = {
 readonly sosRef: string;
 readonly patientRef: string;
 readonly channel: unknown;
 readonly answers: { readonly conditionTicked: unknown; readonly zoneId: unknown; readonly callbackAvailable: unknown };
 /** The names of anything sent beside the declared fields. Never their values. */
 readonly undeclared: readonly string[];
};

export function raiseSos(input: RaiseInput, now: number, settings: SosSettings): Result<Sos> {
 /* Everything that could make a press more than a press is refused before anything is recorded: a plan asking to
    go first, anything else sent with it, a channel nobody pressed. */
 if (input.undeclared.some(name => ASKS_FOR_PRIORITY.test(name))) return refuseOn('raise', 'no-priority-by-plan');
 if (input.undeclared.length) return refuseOn('raise', 'sos-carries-nothing-else');
 const channel = sosChannels.find(entry => entry.id === input.channel);
 if (!channel) return refuseOn('raise', 'sos-channel-unknown');
 if (!channel.raises) return refuseOn('raise', channel.refusal ?? 'sos-channel-unknown');
 const zoneId = typeof input.answers.zoneId === 'string' && input.answers.zoneId ? input.answers.zoneId : null;
 if (zoneId !== null && !zoneById(zoneId)) return refuseOn('raise', 'sos-area-not-on-the-list');
 const { routedTo, failureCode } = routeOf({ conditionTicked: input.answers.conditionTicked === true, zoneId, callbackAvailable: input.answers.callbackAvailable === true }, now);
 const pressed: Sos = {
  sosRef: input.sosRef, patientRef: input.patientRef, channel: channel.id, conditionTicked: input.answers.conditionTicked === true,
  routedTo, failureCode, zoneId, raisedAt: now, settingsVersion: settings.settingsVersion,
  areaSharedUntil: zoneId === null ? null : now + settings.areaWindowMinutes * MINUTE,
  alertWindowEndsAt: now + settings.alertWindowMinutes * MINUTE,
  attemptsAllowed: 1 + settings.alertRetries,
  stoodDown: null
 };
 /* The area goes on the bus only when the door sends somebody, and only as the suburb chosen from the list. */
 return done(pressed, [{ type: 'sos.raised', version: 2, payload: { sosRef: pressed.sosRef, channel: channel.id, routedTo, ...(offersVisit(routedTo) && zoneId !== null ? { zoneId } : {}) } }]);
}

export const sosStateOf = (sos: Sos): string => sos.stoodDown ? STATE.stoodDown : STATE.raised;

/* ── Standing it down ───────────────────────────────────────────────────────────────────────────────── */

export function standDownSos(sos: Sos, request: { readonly patientRef: string; readonly reasonCode: unknown }, now: number): Result<Sos> {
 if (sos.patientRef !== request.patientRef) return refuseOn('standDown', 'no-sos-of-yours');
 if (sos.stoodDown) return refuseOn('standDown', 'sos-already-stood-down');
 const reason = standDownReasons.find(entry => entry.id === request.reasonCode);
 if (!reason) return refuseOn('standDown', 'stand-down-without-reason');
 /* Standing down ends sharing in the same instant, so the area goes with it rather than waiting for a sweep. */
 const stood: Sos = { ...sos, zoneId: null, stoodDown: { at: now, reasonCode: reason.id } };
 return done(stood, [{ type: 'sos.stood_down', version: 1, payload: { sosRef: sos.sosRef, reasonCode: reason.id, stoodDownAt: instant(now) } }]);
}

/* ── The area ───────────────────────────────────────────────────────────────────────────────────────── */

/** When the desk stops seeing the area: its window, or the stand-down if that came first. Null when none was chosen. */
export const areaSharingEndsAt = (sos: Sos): number | null =>
 sos.areaSharedUntil === null ? null : Math.min(sos.areaSharedUntil, sos.stoodDown?.at ?? Number.POSITIVE_INFINITY);
export const isAreaShared = (sos: Sos, now: number): boolean => {
 const ends = areaSharingEndsAt(sos);
 return ends !== null && sos.zoneId !== null && now < ends;
};

/** What the desk may see now: the area, or the refusal that says there is none or that it is no longer kept. */
export function areaFor(sos: Sos, now: number): Result<{ readonly zoneId: string; readonly sharedUntil: number }> {
 if (sos.areaSharedUntil === null) return refuseOn('area', 'area-not-chosen');
 if (!isAreaShared(sos, now)) return refuseOn('area', 'location-kept-after-the-window');
 return done({ zoneId: sos.zoneId!, sharedUntil: areaSharingEndsAt(sos)! });
}

/** Forget the area once its window has closed. Safe to call on every tick. */
export const sweepArea = (sos: Sos, now: number): Sos => sos.zoneId !== null && !isAreaShared(sos, now) ? { ...sos, zoneId: null } : sos;

/* ── Next of kin ────────────────────────────────────────────────────────────────────────────────────── */

export type Nomination = {
 readonly nominationRef: string;
 readonly patientRef: string;
 readonly contactRef: string;
 readonly purpose: string;
 readonly consentVersion: number;
 readonly nominatedAt: number;
 readonly expiresAt: number;
 readonly withdrawnAt: number | null;
};

export function nominate(input: {
 readonly nominationRef: string; readonly actorRole: string; readonly patientRef: string; readonly contactRef: string;
 readonly purpose: unknown; readonly consentVersion: unknown; readonly consentGiven: unknown;
}, now: number): Result<Nomination> {
 if (input.actorRole === GUARDIAN) return refuseOn('nominate', 'guardian-authority-not-proven');
 /* Consent to the version of the wording on the screen, ticked by the patient, or no nomination. */
 if (input.consentGiven !== true || input.consentVersion !== nextOfKin.consent.version) return refuseOn('nominate', 'nomination-without-consent');
 if (typeof input.purpose !== 'string' || !nominationPurposes.includes(input.purpose)) return refuseOn('nominate', 'nomination-purpose-not-allowed');
 return done({
  nominationRef: input.nominationRef, patientRef: input.patientRef, contactRef: input.contactRef, purpose: input.purpose,
  consentVersion: nextOfKin.consent.version, nominatedAt: now, expiresAt: now + nominationLasts, withdrawnAt: null
 });
}

/* Withdrawal takes one action and no reason, and withdrawing again is the same withdrawal. */
export function withdrawNomination(nomination: Nomination | undefined, request: { readonly actorRole: string; readonly patientRef: string }, now: number): Result<Nomination> {
 if (request.actorRole === GUARDIAN) return refuseOn('withdraw', 'guardian-authority-not-proven');
 if (!nomination || nomination.patientRef !== request.patientRef) return refuseOn('withdraw', 'no-nomination-of-yours');
 if (nomination.withdrawnAt !== null) return done(nomination);
 return done({ ...nomination, withdrawnAt: now });
}

export type NominationState = 'in-force' | 'withdrawn' | 'expired';
export const nominationStateOf = (nomination: Nomination, now: number): NominationState =>
 nomination.withdrawnAt !== null ? 'withdrawn' : now >= nomination.expiresAt ? 'expired' : 'in-force';

/** An attempt to tell a next of kin about an SOS. On this build it is always not sent, and always says why. */
export type Attempt = {
 readonly notificationRef: string;
 readonly sosRef: string;
 readonly nominationRef: string;
 readonly attempt: number;
 readonly at: number;
 readonly statusCode: string;
 readonly reasonCode: string;
};
const notSent = (notificationRef: string, sos: Sos, nomination: Nomination, attempt: number, at: number): Attempt =>
 ({ notificationRef, sosRef: sos.sosRef, nominationRef: nomination.nominationRef, attempt, at, statusCode: NOT_SENT, reasonCode: NO_SMS });

/** The attempt recorded at the press, one for each of the patient's nominations in force. */
export function firstAttempts(sos: Sos, nominations: readonly Nomination[], nextRef: () => string, now: number): Attempt[] {
 return nominations.filter(n => n.patientRef === sos.patientRef && nominationStateOf(n, now) === 'in-force').map(n => notSent(nextRef(), sos, n, 1, now));
}

/* The desk trying again. Who is asking comes first, then what was sent beside the two references, then whether
   there is anything to try, and only then the SOS's own window and tries — so a withdrawn nomination is refused
   as withdrawn however many tries are left, and nothing the desk typed reaches a family. */
export function alertAgain(input: {
 readonly actorRole: string; readonly sos: Sos | undefined; readonly nomination: Nomination | undefined;
 readonly attemptsSoFar: number; readonly undeclared: readonly string[]; readonly notificationRef: string;
}, now: number): Result<Attempt> {
 if (input.actorRole === GUARDIAN) return refuseOn('alert', 'guardian-authority-not-proven');
 if (input.undeclared.length) return refuseOn('alert', 'next-of-kin-see-clinical-detail');
 const { sos, nomination } = input;
 if (!nomination) return refuseOn('alert', 'no-such-nomination');
 if (!sos) return refuseOn('alert', 'no-such-sos');
 if (nomination.patientRef !== sos.patientRef) return refuseOn('alert', 'nomination-not-for-this-sos');
 if (nomination.withdrawnAt !== null) return refuseOn('alert', 'nomination-withdrawn');
 if (now >= nomination.expiresAt) return refuseOn('alert', 'nomination-expired');
 if (sos.stoodDown) return refuseOn('alert', 'alert-after-stand-down');
 if (now >= sos.alertWindowEndsAt) return refuseOn('alert', 'alert-window-closed');
 if (input.attemptsSoFar >= sos.attemptsAllowed) return refuseOn('alert', 'alert-tries-used');
 return done(notSent(input.notificationRef, sos, nomination, input.attemptsSoFar + 1, now));
}

/** What an attempt would have said: the contract's sentence, the time filled in, the name left for the identity service. */
export const wouldSay = (at: number): string => fill(nextOfKin.alertSays, { at: clockOf(at) });
export const statusLabel = (statusCode: string): string => sosContract.nextOfKin.statuses.find(s => s.id === statusCode)?.label ?? statusCode;
export const notSentSentence = (reasonCode: string): string => sosContract.nextOfKin.notSent.find(r => r.id === reasonCode)?.sentence ?? reasonCode;

/* ── The desk ───────────────────────────────────────────────────────────────────────────────────────── */

/* Exactly what GET /v1/safety/sos@1 carries: never the patient, never the answers, never a plan, and never the area,
   which is read only through areaFor(). */
export type SosDeskRow = {
 readonly sosRef: string;
 readonly raisedAt: number;
 readonly ageMinutes: number;
 readonly stateCode: string;
 readonly channel: string;
 readonly routedTo: string;
 readonly failureCode: string | null;
 readonly areaShared: boolean;
 readonly areaSharedUntil: number | null;
 readonly stoodDown: { readonly at: number; readonly reasonCode: string } | null;
 readonly settingsVersion: number;
 readonly nextOfKin: readonly { readonly nominationRef: string; readonly statusCode: string; readonly reasonCode: string; readonly attempts: number; readonly attemptsAllowed: number; readonly windowEndsAt: number }[];
};

/* Open first, oldest first inside each, and nothing else: no order a plan could change. */
export function sosDesk(presses: readonly Sos[], attempts: readonly Attempt[], now: number): SosDeskRow[] {
 return presses.map((sos): SosDeskRow => {
  const tried = attempts.filter(a => a.sosRef === sos.sosRef);
  const byNomination = [...new Set(tried.map(a => a.nominationRef))].map(ref => {
   const mine = tried.filter(a => a.nominationRef === ref).sort((a, b) => a.attempt - b.attempt);
   const latest = mine.at(-1)!;
   return { nominationRef: ref, statusCode: latest.statusCode, reasonCode: latest.reasonCode, attempts: mine.length, attemptsAllowed: sos.attemptsAllowed, windowEndsAt: sos.alertWindowEndsAt };
  });
  return {
   sosRef: sos.sosRef, raisedAt: sos.raisedAt, ageMinutes: Math.max(0, Math.floor((now - sos.raisedAt) / MINUTE)), stateCode: sosStateOf(sos),
   channel: sos.channel, routedTo: sos.routedTo, failureCode: sos.failureCode, areaShared: isAreaShared(sos, now), areaSharedUntil: areaSharingEndsAt(sos),
   stoodDown: sos.stoodDown, settingsVersion: sos.settingsVersion, nextOfKin: byNomination
  };
 }).sort((a, b) => Number(a.stoodDown !== null) - Number(b.stoodDown !== null) || a.raisedAt - b.raisedAt);
}
