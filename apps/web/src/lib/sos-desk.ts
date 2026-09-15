import { useSyncExternalStore } from 'react';
import closedLoop from '../../../../packages/catalog/closed-loop.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { MINUTE, deskRoles, type Refusal, type Result } from '../../../../packages/engines/src/safety/domain/rules.ts';
import {
 alertAgain, areaFor, firstAttempts, nextOfKin, nominate, nominationPurposes, raiseSos, sosDesk, standDownReasons, standDownSos, sweepArea, withdrawNomination,
 type Attempt, type Nomination, type Sos, type SosAnswers, type SosDeskRow
} from '../../../../packages/engines/src/safety/domain/sos.ts';
import { zones } from './geography';
import { sosSettingsNow } from './settings';

/* Patient SOS and next of kin in the web preview: one store, in memory, for the patient's SOS screen, their next-of-kin
 * settings and the desk that reads both.
 *
 * Every rule is the engine's. This file holds the presses, the nominations and the attempts, and hands every act to
 * packages/engines/src/safety/domain/sos.ts, which routes a press, refuses what it refuses in the route's own sentence,
 * keeps an area for its window and records every next-of-kin attempt as not sent. It holds them in memory and nowhere
 * else: this app may not persist anything, so a reload forgets every press and every nomination, which is true of the
 * preview and would be a defect in the product.
 *
 * THE SETTINGS ARE THE ONES IN FORCE, READ ONCE. A press is made with sosSettingsNow(), from lib/settings.ts, which the
 * back office's Configuration tab changes, and keeps what it was handed: the area window, the alert window and the
 * tries. So a change reaches the next press and never one already on the desk, and no minute or try is typed here.
 *
 * THE DESK IS SEEDED BY RUNNING THE DOMAIN AT EARLIER TIMES, for somebody who is not the patient this preview opens as —
 * one press a few minutes ago and one stood down this morning — so the ages, the windows and the tries on the board
 * are arithmetic, and the patient's own settings start empty.
 *
 * A NAME IS THE PREVIEW'S ONLY. The engine holds a contact reference and never a name; the identity service would hold
 * the name. Here the name a patient types is kept beside the reference in this tab's memory, so their own settings can
 * say who they nominated, and the desk is never shown it.
 *
 * Nothing crosses tabs or devices, nobody is told anything, and nobody is sent. */
export type SosDeskState = {
 readonly presses: readonly Sos[];
 readonly nominations: readonly Nomination[];
 readonly attempts: readonly Attempt[];
 readonly names: Readonly<Record<string, string>>;
 readonly now: number;
};

/** The patient this preview opens as, and the somebody else the desk's seeded presses belong to. Neither is a person. */
export const PATIENT_REF = 'patient-preview';
const SEEDED_PATIENT = 'patient-preview-desk';
const GUARDIAN = vetting.roles.find(role => role.id === 'guardian')!.id;
const PATIENT_ROLE = 'patient';
const DESK_ROLE = deskRoles[0]!;
const CLOCK_MS = closedLoop.preview.tickEverySeconds * 1000;

let state: SosDeskState | undefined;
let serial = 214;
const listeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;
const nextRef = (prefix: string) => `${prefix}-${String(++serial).padStart(4, '0')}`;

const seeded = <T>(result: Result<T>): T => {
 if (!result.ok) throw new Error(`The seeded SOS desk was refused by the engine: ${result.refusal.statement}`);
 return result.value;
};

function seed(now: number): SosDeskState {
 const settings = sosSettingsNow();
 const nomination = seeded(nominate({
  nominationRef: nextRef('NOK'), actorRole: PATIENT_ROLE, patientRef: SEEDED_PATIENT, contactRef: nextRef('contact-preview'),
  purpose: nominationPurposes[0], consentVersion: nextOfKin.consent.version, consentGiven: true
 }, now - 7 * MINUTE - 1));
 const press = (at: number, zoneId: string) => seeded(raiseSos({
  sosRef: nextRef('SOS'), patientRef: SEEDED_PATIENT, channel: 'app', answers: { conditionTicked: false, zoneId, callbackAvailable: true }, undeclared: []
 }, at, settings));
 const recently = press(now - 7 * MINUTE, zones[1]?.id ?? zones[0]!.id);
 const morning = now - 200 * MINUTE;
 const stood = seeded(standDownSos(press(morning, zones[0]!.id), { patientRef: SEEDED_PATIENT, reasonCode: standDownReasons[0]!.id }, morning + 3 * MINUTE));
 const attempts = [...firstAttempts(stood, [nomination], () => nextRef('NTF'), morning), ...firstAttempts(recently, [nomination], () => nextRef('NTF'), recently.raisedAt)];
 return { presses: [stood, recently].map(p => sweepArea(p, now)), nominations: [nomination], attempts, names: {}, now };
}

const current = () => (state ??= seed(Date.now()));
const commit = (next: SosDeskState) => {
 state = next;
 for (const listener of listeners) listener();
};
/* The clock moving: every area swept once its window has closed, so nothing keeps where somebody was, and the ages move. */
const subscribe = (listener: () => void) => {
 listeners.add(listener);
 clock ??= setInterval(() => {
  const now = Date.now();
  const s = current();
  commit({ ...s, presses: s.presses.map(p => sweepArea(p, now)), now });
 }, CLOCK_MS);
 return () => {
  listeners.delete(listener);
  if (!listeners.size && clock) { clearInterval(clock); clock = undefined; }
 };
};
export const useSosDesk = () => useSyncExternalStore(subscribe, current, current);

/* ── The patient ────────────────────────────────────────────────────────────────────────────────────── */

export type Pressed = { readonly ok: true; readonly sos: Sos } | { readonly ok: false; readonly refusal: Refusal };
export function pressSos(answers: SosAnswers, now = Date.now()): Pressed {
 const s = current();
 const pressed = raiseSos({ sosRef: nextRef('SOS'), patientRef: PATIENT_REF, channel: 'app', answers, undeclared: [] }, now, sosSettingsNow());
 if (!pressed.ok) return pressed;
 const attempts = firstAttempts(pressed.value, s.nominations, () => nextRef('NTF'), now);
 commit({ ...s, presses: [...s.presses, pressed.value], attempts: [...s.attempts, ...attempts], now });
 return { ok: true, sos: pressed.value };
}

export function standDownPress(sosRef: string, reasonCode: string, now = Date.now()): Refusal | null {
 const s = current();
 const found = s.presses.find(p => p.sosRef === sosRef);
 if (!found) return null;
 const stood = standDownSos(found, { patientRef: PATIENT_REF, reasonCode }, now);
 if (!stood.ok) return stood.refusal;
 commit({ ...s, presses: s.presses.map(p => p.sosRef === sosRef ? stood.value : p), now });
 return null;
}

/* The patient nominates for themselves. Acting as a guardian for somebody else is offered too, so the refusal a guardian
   is given can be read in its own words rather than described. */
export function nominateNextOfKin(request: { readonly name: string; readonly consentGiven: boolean; readonly asGuardian?: boolean }, now = Date.now()): Refusal | null {
 const s = current();
 const contactRef = nextRef('contact-preview');
 const made = nominate({
  nominationRef: nextRef('NOK'), actorRole: request.asGuardian ? GUARDIAN : PATIENT_ROLE, patientRef: PATIENT_REF, contactRef,
  purpose: nominationPurposes[0], consentVersion: nextOfKin.consent.version, consentGiven: request.consentGiven
 }, now);
 if (!made.ok) return made.refusal;
 commit({ ...s, nominations: [...s.nominations, made.value], names: { ...s.names, [contactRef]: request.name.trim() }, now });
 return null;
}

export function withdrawNextOfKin(nominationRef: string, now = Date.now()): Refusal | null {
 const s = current();
 const withdrawn = withdrawNomination(s.nominations.find(n => n.nominationRef === nominationRef), { actorRole: PATIENT_ROLE, patientRef: PATIENT_REF }, now);
 if (!withdrawn.ok) return withdrawn.refusal;
 commit({ ...s, nominations: s.nominations.map(n => n.nominationRef === nominationRef ? withdrawn.value : n), now });
 return null;
}

export const patientNominations = (s: SosDeskState) => s.nominations.filter(n => n.patientRef === PATIENT_REF).slice().reverse();
export const nameOf = (s: SosDeskState, nominationRef: string): string | null => {
 const nomination = s.nominations.find(n => n.nominationRef === nominationRef);
 return nomination ? s.names[nomination.contactRef] ?? null : null;
};

/* ── The desk ───────────────────────────────────────────────────────────────────────────────────────── */

export const deskRowsOf = (s: SosDeskState): SosDeskRow[] => sosDesk(s.presses, s.attempts, s.now);
export const readArea = (sosRef: string, now = Date.now()) => {
 const found = current().presses.find(p => p.sosRef === sosRef);
 return found ? areaFor(found, now) : null;
};
export const zoneName = (zoneId: string) => zones.find(zone => zone.id === zoneId)?.name ?? zoneId;

export function tryNextOfKinAgain(sosRef: string, nominationRef: string, now = Date.now()): Refusal | null {
 const s = current();
 const tried = alertAgain({
  actorRole: DESK_ROLE, sos: s.presses.find(p => p.sosRef === sosRef), nomination: s.nominations.find(n => n.nominationRef === nominationRef),
  attemptsSoFar: s.attempts.filter(a => a.sosRef === sosRef && a.nominationRef === nominationRef).length, undeclared: [], notificationRef: nextRef('NTF')
 }, now);
 if (!tried.ok) return tried.refusal;
 commit({ ...s, attempts: [...s.attempts, tried.value], now });
 return null;
}

/* The concern Core holds for an SOS, as the desk reads it: owned by the role closed-loop.json proposes, for the time of
   the ladder rung it names, then its fallback; or closed with the outcome the stand-down reason maps to. Worked out from
   the contract rather than kept, so it cannot disagree with Core's arithmetic. */
const rung = closedLoop.ladder.rungs.find(r => r.rung === closedLoop.sos.ladderRung.value);
if (!rung) throw new Error('packages/catalog/closed-loop.json gives an SOS a ladder rung the ladder does not hold.');
const SPAN_MS = rung.acknowledgeWithinMinutes.value * MINUTE;
const roleName = (id: string) => (vetting.roles.find(role => role.id === id)?.name ?? id).toLowerCase();
export type Concern = { readonly open: true; readonly owner: string; readonly fallback: string; readonly until: number } | { readonly open: false; readonly outcome: string };
export function concernOf(row: SosDeskRow): Concern {
 if (row.stoodDown) {
  const code = (closedLoop.sosStoodDown.closesAs.value as Record<string, string>)[row.stoodDown.reasonCode];
  return { open: false, outcome: closedLoop.outcomes.value.find(o => o.id === code)?.label ?? String(code) };
 }
 return { open: true, owner: roleName(closedLoop.sos.ownerRole.value), fallback: roleName(closedLoop.sos.fallbackRole.value), until: row.raisedAt + SPAN_MS };
}
