import { useSyncExternalStore } from 'react';
import care from '../../../../packages/catalog/care.json' with { type: 'json' };
import trustContract from '../../../../packages/catalog/trust.json' with { type: 'json' };
import {
 careContract, checklistFor, instantAt, locationShare, OfferDesk, TrustCache, VisitDesk, HEARD,
 type Answer, type Candidate, type Offer, type Visit, type ChecklistView
} from '../../../../packages/engines/src/care/domain/index.ts';
import { rosterNurses, mayTakeAVisit } from './roster';
import { zoneById } from './geography';
import { signOffFor, snapshot as queueSnapshot, subscribe as subscribeQueue } from './visit-queue';

/* The Care engine's domain, driven in the browser for the one visit the nurse workspace walks.
 *
 * Not a copy of the engine: the same OfferDesk, VisitDesk and TrustCache the runtime binds to its
 * store, imported from packages/engines, so an offer the preview makes is made by the arithmetic the
 * routes run and refused in the sentences the routes answer with. What stands in for the rest of the
 * platform is said where it stands:
 *
 *   Verify      The preview's own vetting gate issues each roster nurse a badge event of the shape
 *               person.trust_updated carries — the lowest tier trust.json lets anybody hold, and
 *               hard gates passed only where lib/roster's gate says so. A nurse the gate refuses has
 *               no current badge and is withheld by the matcher, not by this file.
 *   The record  An encounter is complete and signed when the visit assessment for this visit has
 *               been signed off on this device. That is the one fact the preview's record holds, so
 *               handover and completion are both answered by it until a gateway answers them apart.
 *   The bus     Nothing is published. The events each act produced are kept on the view so a screen
 *               can say what would have been told to whom, and nothing leaves the tab.
 *
 * Module-level and in memory, as lib/visit-queue.ts is and for the same reason: a visit that lives in
 * a screen's state is lost by walking to the next screen, and nothing in apps/web/src may write to the
 * browser's storage. Closing the tab ends the preview visit. */

export const preview = care.preview;
export const stages = care.stages;
export const sentences = {
 declined: care.offers.declined,
 lapsed: care.offers.lapsed,
 distanceBasis: care.offers.distanceBasis,
 withheldIsNotLast: care.offers.withheldIsNotLast.statement,
 whileShared: care.position.whileShared,
 record: care.record.sentence,
 queued: care.handover.queued,
 billable: care.complete.billable
};
export const markerFor = (continuity: Offer['continuity']) => care.offers.order.find(o => o.id === continuity)?.marker ?? null;

export type StageId = typeof care.stages[number]['id'];
export type CareView = {
 /** The newest offer made to this nurse for the preview visit, in whatever state it is now. */
 offer: Offer | null;
 visit: Visit | null;
 /** When the visit is held for, as the booking asked for it. Known before it is accepted; where is not. */
 scheduledFor: string | null;
 /** Where the workspace has walked the visit to. The domain's state decides what is allowed; this only remembers where she is looking. */
 stage: StageId;
 /** The last refusal, in the route's words, for the act that produced it. */
 refusal: { act: string; statement: string } | null;
 /** Why the matcher did not offer this nurse the visit, when it did not. */
 withheld: string | null;
 /** The events the acts so far produced, as type@version, oldest first. Nothing was sent. */
 told: string[];
 checklist: ChecklistView;
 location: { shared: true } | { shared: false; statement: string };
 signedOff: boolean;
 now: number;
};

const me = { clinicianRef: preview.clinicianRef };
const encounterSigned = (ref: string) => ref === preview.encounterRef && Boolean(signOffFor(queueSnapshot(), preview.appointmentRef));
/* The tier a hard-gates pass earns. trust.json's other tiers need weights nobody has decided, so no
   badge event in this preview names them. */
const verifiedTier = trustContract.tiers.find(tier => tier.needs === 'hard-gates')!.id;

let desks: { offers: OfferDesk; visits: VisitDesk; trust: TrustCache } | null = null;
let stage: StageId = 'route';
let refusal: CareView['refusal'] = null;
let told: string[] = [];
let view: CareView | null = null;
const listeners = new Set<() => void>();

function build(now: Date) {
 const trust = new TrustCache(careContract.badgeTiers);
 for (const nurse of rosterNurses) {
  trust.learn({ ...HEARD, subjectRef: nurse.id, occurredAt: now.toISOString(), payload: { badgeTier: verifiedTier, hardGatesPassed: mayTakeAVisit(nurse).allowed } });
 }
 const candidates: Candidate[] = rosterNurses.map(n => ({ clinicianRef: n.id, roleId: 'nurse', scope: n.scope, base: n.zone?.at ?? null }));
 const offers = new OfferDesk({ contract: careContract, trust, candidates: () => candidates });
 offers.register({
  appointmentRef: preview.appointmentRef, subjectRef: preview.subjectRef, serviceId: preview.serviceId,
  zone: zoneById(preview.zone)?.at ?? null,
  scheduledFor: instantAt(now, preview.dayOffset, preview.slot, careContract.timezone),
  namedClinicianRef: preview.namedClinicianRef, previousClinicianRefs: preview.previousClinicianRefs
 });
 const visits = new VisitDesk({ contract: careContract, record: { encounterComplete: encounterSigned, encounterSigned } });
 const made = offers.offer({ idempotencyKey: `preview-${preview.appointmentRef}`, appointmentRef: preview.appointmentRef, serviceId: preview.serviceId }, now);
 if (made.ok) told = made.events.map(e => `${e.type}@${e.version}`);
 return { offers, visits, trust };
}

function compose(now: Date): CareView {
 const d = desks ??= build(now);
 const offer = d.offers.latestFor(preview.clinicianRef);
 const visit = d.visits.visit(preview.appointmentRef);
 const mine = d.offers.withheldFor(preview.appointmentRef).find(w => w.candidate.clinicianRef === preview.clinicianRef);
 const share = locationShare(careContract, visit, now);
 return {
  offer: offer ? { ...offer } : null,
  visit: visit ? structuredClone(visit) : null,
  scheduledFor: d.offers.appointment(preview.appointmentRef)?.scheduledFor ?? null,
  stage, refusal, told: [...told],
  withheld: mine?.statement ?? null,
  checklist: checklistFor(careContract, preview.serviceId),
  location: share.ok ? { shared: true } : { shared: false, statement: share.statement },
  signedOff: Boolean(signOffFor(queueSnapshot(), preview.appointmentRef)),
  now: now.getTime()
 };
}

function changed(now = new Date()) {
 view = compose(now);
 listeners.forEach(listener => listener());
}

/* An act's answer, kept: its events are added to what would have been told, and its refusal is what the
   screen says next. A refusal is never cleared by time passing — only by the next act. */
function settle<T>(act: string, answer: Answer<T>): answer is Extract<Answer<T>, { ok: true }> {
 if (answer.ok) { refusal = null; told = [...told, ...answer.events.map(e => `${e.type}@${e.version}`)]; }
 else refusal = { act, statement: answer.statement };
 return answer.ok;
}

const subscribe = (listener: () => void) => {
 listeners.add(listener);
 /* A sign-off in the visit queue changes what handover and completion will answer, so the view is
    recomposed when the queue moves. */
 const offQueue = subscribeQueue(() => changed());
 return () => { listeners.delete(listener); offQueue(); };
};
const read = () => view ??= compose(new Date());

export const useCareVisit = (): CareView => useSyncExternalStore(subscribe, read, read);

/** Time passing: an offer past its expiry lapses and passes on. Called on the screen's own tick. */
export function tick() {
 const now = new Date();
 if (!desks) return;
 const passed = desks.offers.lapse(now);
 for (const p of passed) if (p.next.ok) told = [...told, ...p.next.events.map(e => `${e.type}@${e.version}`)];
 changed(now);
}

export function accept() {
 const now = new Date();
 const d = desks ??= build(now);
 const offer = d.offers.latestFor(preview.clinicianRef);
 if (!offer) return;
 const answer = d.offers.accept({ idempotencyKey: `accept-${offer.offerRef}`, offerRef: offer.offerRef }, me, now);
 if (settle('accept', answer)) {
  d.visits.hold(d.offers.booking(preview.appointmentRef)!, preview.visitCode);
  stage = 'route';
 }
 changed(now);
}

export function decline() {
 const now = new Date();
 const d = desks ??= build(now);
 const offer = d.offers.latestFor(preview.clinicianRef);
 if (!offer) return;
 const answer = d.offers.decline({ idempotencyKey: `decline-${offer.offerRef}`, offerRef: offer.offerRef }, me, now);
 if (settle('decline', answer) && answer.ok && answer.value.next?.ok) told = [...told, ...answer.value.next.events.map(e => `${e.type}@${e.version}`)];
 changed(now);
}

export function goTo(next: StageId) { stage = next; refusal = null; changed(); }

export function start(visitCode: string) {
 const now = new Date();
 if (!desks) return;
 if (settle('start', desks.visits.start({ appointmentRef: preview.appointmentRef, visitCode }, me, now))) stage = 'checklist';
 changed(now);
}

/** The readings the signed assessment sealed, attached by reference. Care never holds their values. */
export function attachReadings() {
 const now = new Date();
 if (!desks) return;
 const refs = queueSnapshot().filter(p => p.visit === preview.appointmentRef && p.kind === 'observations').flatMap(p => (p.readings ?? []).map(r => r.id));
 if (settle('capture', desks.visits.capture({ appointmentRef: preview.appointmentRef, observationRefs: refs }, me))) stage = 'handover';
 changed(now);
}

export function handOver() {
 const now = new Date();
 if (!desks) return;
 if (settle('handover', desks.visits.handover({ appointmentRef: preview.appointmentRef, encounterRef: preview.encounterRef }, me, now))) stage = 'complete';
 changed(now);
}

export function complete(visitCode: string) {
 const now = new Date();
 if (!desks) return;
 settle('complete', desks.visits.complete({ appointmentRef: preview.appointmentRef, visitCode, encounterRef: preview.encounterRef }, me, now));
 changed(now);
}
