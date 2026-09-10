/**
 * A simulated session broker: a consultation that connects, with nothing opened at either end.
 *
 * ── The line this one must not cross ─────────────────────────────────────────────────────────
 *
 * `teleconsultation` is blocked on a media stack, and the sentence the product says about itself is
 * that this build has never asked either device for a camera or a microphone. Several other notices
 * are special cases of it — the voice capability's "nothing here has a microphone" is that same
 * fact — and scripts/check-boundaries.mjs refuses an undeclared permission on either platform.
 *
 * So the thing being simulated is deliberately not media. **A session is a session object**: who
 * joined, when, on which rung of the connection ladder, and when it ended. That is the whole of what
 * a broker tells a product about a call, and it is enough to walk a consultation end to end. There
 * is no getUserMedia here, no peer connection, no track, no permission and nothing that would make
 * either native app declare one — and the way that is kept true is not this paragraph. It is that
 * the simulation directory is scanned for a media API by name, that the teleconsultation capability
 * is held to declaring no permission while it is simulated, and that a caller asking this module for
 * a camera is refused in the capability's own words rather than quietly given a session anyway.
 *
 * ── Why the line quality is drawn from the ladder, and drawn badly ───────────────────────────
 *
 * packages/catalog/teleconsult.json orders the four connection states by fidelity and says what each
 * one permits a doctor to conclude, and it says of the best of them that it is "the rarest of the
 * four on a South African mobile network at five in the afternoon". A simulator that opened every
 * call on video would be a simulator that produced a product working in Sandton: every screen built
 * against the ladder would be built against its top rung, and sound-only — which is how most of this
 * country would actually hold this call — would stay the path nobody tries. So a rung is drawn with
 * a weight taken off its own fidelity: the worse it is, the likelier it is. Nothing above the
 * ladder's top rung can be produced at all, and a caller asking for one is refused, because a
 * simulated line better than the design admits is a doctor being shown a set of conclusions the real
 * call would never have permitted.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────────────────────
 *
 * The whole call is scripted from the visit reference alone, once, before any event is produced. The
 * same consultation drops in the same place on every machine and on the third run of the same test,
 * which is what makes a dropped line something a screen can be built against rather than something
 * that happens to a demonstration.
 */
import teleconsult from '../../../../packages/catalog/teleconsult.json' with { type: 'json' };
import { MAX_DEPTH, canonical, feedById } from '../feeds/index.ts';
/* The forbidden index is built by the contract reader rather than by this file, because it is where
   the one spelling rule lives: patientId, patient_id and "Patient Id" are one field, and a second
   spelling of a spelling rule is the drift the whole repository is arranged against. */
import { forbiddenIndex } from '../feeds/contract.ts';
import { refusalSaying, simulationOf } from './contract.ts';
import {
 isRefusal, produced, refuse, register, seeded,
 type SimulatedEvent, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';

const CAPABILITY = 'teleconsultation';
const FEED = feedById('media-session')!;
const FORBIDDEN = forbiddenIndex(FEED);

const OPEN_A_CAMERA = refusalSaying(CAPABILITY, /a microphone/);
const DECLARE_A_PERMISSION = refusalSaying(CAPABILITY, /native app/);
const BETTER_THAN_THE_LADDER = refusalSaying(CAPABILITY, /ladder permits/);

/**
 * The six lifecycle events this feed carries.
 *
 * The feed's own vocabulary, which packages/catalog/feeds.json states in the `why` beside the
 * `event` field — "waiting, joining, joined, left, dropped or ended". They are written here because
 * there is nowhere else in the catalogue that holds them as data, and a boundary check reads them
 * back out of that sentence so the two cannot drift into a seventh event nobody handles.
 */
export const MEDIA_EVENTS = ['waiting', 'joining', 'joined', 'left', 'dropped', 'ended'] as const;
export type MediaEvent = typeof MEDIA_EVENTS[number];

/* A role and never a name. Who may see and hear the patient is consented to per participant and the
   roster is the product's rather than the vendor's, so a broker is told a role and nothing more
   about the person holding it. Looked up rather than typed, so that a participant renamed in the
   contract stops this module rather than producing a role no screen has a consent question for. */
const roleNamed = (id: string): string => {
 const found = teleconsult.participants.find(participant => participant.id === id);
 if (!found) throw new Error(`packages/catalog/teleconsult.json has no participant "${id}", so a simulated session would name somebody who is not in the room.`);
 return found.id;
};
const PATIENT = roleNamed('patient');
const DOCTOR = roleNamed('doctor');
const LADDER = teleconsult.connection;
const TOP_RUNG = Math.max(...LADDER.map(rung => rung.fidelity));
/* Every rung but the one that is the absence of a line. A call does not open on 'dropped'. */
const OPENING_RUNGS = LADDER.filter(rung => rung.fidelity > 0);
const rungById = (id: string) => LADDER.find(rung => rung.id === id) ?? null;

/* What a caller may not ask a session broker for. None of it is in a contract, because no contract
   has a list of ways to ask for a camera — these are the field names somebody reaches for at the
   moment they want the simulated call to be a real one, canonicalised the way the ingestion
   boundary canonicalises a field so that media_stream, mediaStream and "Media Stream" are one ask. */
const ASKS_FOR_MEDIA = new Set([
 'camera', 'microphone', 'mic', 'mediastream', 'stream', 'tracks', 'track',
 'getusermedia', 'capture', 'recorder', 'audiotrack', 'videotrack'
]);
const ASKS_FOR_A_PERMISSION = new Set(['permission', 'permissions', 'declarepermission', 'requirespermissions', 'usespermission']);

const namesOneOf = (detail: Record<string, unknown>, names: Set<string>): boolean =>
 Object.keys(detail).some(key => names.has(canonical(key)));

/** Any field this feed refuses, at any depth — a recording, a transcript, a join link, a diagnosis. */
function namesAForbiddenField(value: unknown, depth = 0): boolean {
 if (depth > MAX_DEPTH) return false;
 if (Array.isArray(value)) return value.some(item => namesAForbiddenField(item, depth + 1));
 if (typeof value !== 'object' || value === null) return false;
 const entries = Object.entries(value as Record<string, unknown>);
 if (entries.some(([key]) => FORBIDDEN.has(canonical(key)))) return true;
 return entries.some(([, nested]) => namesAForbiddenField(nested, depth + 1));
}

/** One step of a consultation: what happened, to whom, how far in, and on which rung. */
export type SessionStep = { event: MediaEvent; participantRole: string; secondsIn: number; connectionId?: string };

/**
 * The whole call, scripted from the reference before anything is produced.
 *
 * The shape is the one teleconsult.json designs: the nurse asks, the patient waits, a doctor joins
 * within the fifteen minutes the contract allows a visit to wait, and the line is what it is. A
 * drop is scripted rather than injected, so the ninety-second hold and the encounter that stays open
 * through it are things a screen can be walked through rather than things a tester has to arrange.
 */
export function scriptFor(visitReference: string): SessionStep[] {
 const rand = seeded(`media-session:${visitReference}`);
 const waitDraw = rand();
 const rungDraw = rand();
 const dropDraw = rand();
 const dropWhenDraw = rand();
 /* A weight off the rung's own fidelity: the worse the line, the likelier it is. Nothing above the
    ladder's top rung exists to be drawn, because the ladder is the whole of what a line can be. */
 const weighted = OPENING_RUNGS.flatMap(rung => Array.from({ length: TOP_RUNG + 1 - rung.fidelity }, () => rung));
 const rung = weighted[Math.min(weighted.length - 1, Math.floor(rungDraw * weighted.length))]!;
 const waitSeconds = Math.round(waitDraw * teleconsult.waitingRoom.maximumWaitMinutes * 60);
 const joined = waitSeconds + 12;
 const steps: SessionStep[] = [
  { event: 'waiting', participantRole: PATIENT, secondsIn: 0 },
  { event: 'joining', participantRole: DOCTOR, secondsIn: waitSeconds },
  { event: 'joined', participantRole: DOCTOR, secondsIn: joined, connectionId: rung.id },
  { event: 'joined', participantRole: PATIENT, secondsIn: joined, connectionId: rung.id }
 ];
 /* One call in four loses the line. The hold is the contract's ninety seconds and the doctor calls
    back, so the rejoin is scripted at the far end of it rather than at some kinder moment. */
 if (dropDraw < 0.25) {
  const droppedAt = joined + 60 + Math.round(dropWhenDraw * 240);
  const dropped = LADDER.find(state => state.fidelity === 0)!;
  steps.push({ event: 'dropped', participantRole: PATIENT, secondsIn: droppedAt, connectionId: dropped.id });
  steps.push({ event: 'joined', participantRole: PATIENT, secondsIn: droppedAt + teleconsult.reconnect.holdSeconds, connectionId: rung.id });
 }
 const last = steps[steps.length - 1]!;
 steps.push({ event: 'ended', participantRole: DOCTOR, secondsIn: last.secondsIn + 300, connectionId: rung.id });
 return steps;
}

export const mediaSession: Simulator = {
 id: 'media-session',
 feed: 'media-session',
 capability: CAPABILITY,
 supplier: simulationOf(CAPABILITY).supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  const detail = request.detail ?? {};
  /* A recording URL, a transcript, a join link or a diagnosis in a request is somebody asking this
     broker to be a media stack. Refused in the camera's own words rather than in a fourth sentence,
     because all four of them mean the same thing: media was opened somewhere and this is where it
     would arrive. */
  if (namesAForbiddenField(detail) || namesOneOf(detail, ASKS_FOR_MEDIA)) return refuse(mediaSession, request, OPEN_A_CAMERA);
  /* Declaring a permission is not a build step. It is a decision about pointing a camera at somebody
     in their own home, and it belongs in the capability contract beside what is blocking the
     feature — not in a simulator's request. */
  if (namesOneOf(detail, ASKS_FOR_A_PERMISSION)) return refuse(mediaSession, request, DECLARE_A_PERMISSION);
  if (typeof detail.connectionId === 'string' && !rungById(detail.connectionId)) return refuse(mediaSession, request, BETTER_THAN_THE_LADDER);
  if (typeof detail.fidelity === 'number' && detail.fidelity > TOP_RUNG) return refuse(mediaSession, request, BETTER_THAN_THE_LADDER);
  const script = scriptFor(request.subject);
  const index = typeof detail.step === 'number' && Number.isInteger(detail.step) ? detail.step : 0;
  const step = script[Math.min(Math.max(0, index), script.length - 1)]!;
  const at = request.at ?? new Date();
  const payload: Record<string, unknown> = {
   visitReference: request.subject,
   event: step.event,
   participantRole: step.participantRole,
   at: new Date(at.getTime() + step.secondsIn * 1000).toISOString()
  };
  /* Which rung the line was on. The contract calls it clinical information about the encounter
     rather than a quality metric, because what a doctor may conclude shrinks with it. */
  if (step.connectionId) payload.connectionId = step.connectionId;
  return produced(mediaSession, request, payload);
 }
};
register(mediaSession);

/** The whole consultation, in order. What a screen walks to show a call connecting. */
export function sessionFor(visitReference: string, at: Date = new Date()): SimulatedEvent[] {
 return scriptFor(visitReference)
  .map((_step, index) => mediaSession.produce({ subject: visitReference, at, detail: { step: index } }))
  .filter((answer): answer is SimulatedEvent => !isRefusal(answer));
}
