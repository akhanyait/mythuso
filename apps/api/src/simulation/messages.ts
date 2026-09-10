/**
 * A simulated delivery channel, and the sign-in that depends on one.
 *
 * ── Why this is the first of the three ───────────────────────────────────────────────────────
 *
 * `accounts` is blocked on an SMS provider and everything else in the product is blocked on
 * `accounts`. Nobody can look at a household, a record or a payout without first getting past a
 * screen that asks for a one-time code, so a preview with no channel behind it has to fake the one
 * screen everybody meets first — which is how `code === '240924'` ends up typed into three
 * applications. This replaces that with something that behaves like a provider: it issues a code it
 * keeps, it hands the channel a message, and the channel comes back with a receipt that sometimes
 * says the message did not arrive.
 *
 * **The failure is the point.** feeds.json's switch-on condition for this seam says a provider that
 * reports only success turns every silence into a success by default, "and the silences are the
 * entire population of people who cannot sign in". A simulator that always delivers teaches the
 * product exactly that. So roughly one send in four fails here, deterministically, and a failed
 * delivery does not reveal its code — because a person whose message never arrived does not have
 * one, and a screen that showed it anyway would be simulating a provider nobody has.
 *
 * ── The two suppliers on one door ────────────────────────────────────────────────────────────
 *
 * `message-delivery` answers for two capabilities and they are different things. `messaging` is the
 * channel: something asks it to carry a message and it reports whether it arrived. `accounts` is
 * the sign-in office: it decides what the message says, keeps the credential, and is the only thing
 * that can say whether a code somebody typed is the one it issued. The office asks the channel, the
 * way it would ask a provider. Only the channel is in the registry — see `standIn` in contract.ts
 * for why the second one is deliberately not.
 *
 * ── What never enters a payload ──────────────────────────────────────────────────────────────
 *
 * The feed's `neverAccepts` list refuses the code, the message text and the mobile number, and this
 * produces none of the three. The code is what makes that worth stating: it is the credential, and
 * a delivery log carrying it would be a list of live sign-in codes. It is returned by `codeFor`,
 * which is a call a screen makes, not a field a supplier sends.
 */
import { canonical, feedById, type Feed } from '../feeds/index.ts';
import {
 pick, produced, refuse, register, seeded,
 type SimulatedRefusal, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';
import { flatten, refusesTo, simulationOf, standIn } from './contract.ts';

const feed: Feed = feedById('message-delivery')!;

/**
 * The two numbers a one-time code is, and the one place they are allowed to be a second copy.
 *
 * `apps/api/src/config.ts` holds them as `limits.codeLength` and `limits.codeTtlSeconds` for the
 * real identity service. This file cannot read them: config.ts reaches node:crypto through
 * sensitive.ts, and this module is imported by the browser. So they are restated here and
 * `scripts/check-boundaries.mjs` fails the build when the two disagree — the same arrangement the
 * native apps are under for every number they cannot read out of a JSON file at runtime.
 */
export const CODE_LENGTH = 6;
export const CODE_LIFE_SECONDS = 10 * 60;

/** What a message is for. The channel treats them alike; the product does not. */
export type MessageKind = 'sign-in-code' | 'visit-reminder' | 'family-invitation';

/** queued, sent, delivered or failed — the feed's four, and a receipt is one of them. */
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';

type Carried = { kind: MessageKind; about: string; status: DeliveryStatus; failureReason: string | null };

/**
 * What this channel has carried, for as long as the process lives.
 *
 * A Map and nothing else, on purpose. `accounts` refuses to "survive a restart as a real account
 * would", and the way to enforce that refusal is to have nowhere to survive in: there is no file,
 * no table and no cache here, so a restart takes every challenge with it and `verify` says so in
 * the contract's own words rather than failing as though the code were wrong.
 */
const carried = new Map<string, Carried>();
const challenges = new Map<string, { code: string; messageId: string; expiresAt: number }>();

/**
 * Somewhere to reach a person, in any of the spellings this seam knows.
 *
 * Derived from the feed's own `phone` entry rather than typed beside it, then widened by the three
 * kinds of address an SMS contract had no reason to name. The channel stands in for push and email
 * too, and a simulator that refuses a mobile number while accepting a device token is refusing the
 * spelling rather than the disclosure.
 */
const ADDRESS_SPELLINGS = new Set<string>([
 ...(feed.neverAccepts.find(never => never.field === 'phone')?.also ?? []).map(canonical),
 canonical('phone'),
 'email', 'address', 'pushtoken', 'devicetoken'
]);

/* A South African mobile number, in the two forms a person or a caller writes one: 0821234567 and
   +27821234567. Matched against values as well as keys, because `{ note: '0821234567' }` discloses
   exactly what `{ phone: '0821234567' }` does and only one of them is caught by reading names. */
const MOBILE = /(?:\+27|\b0)\s?\d{2}\s?\d{3}\s?\d{4}\b/;

/** Was this caller handing the channel somewhere to reach, by name or by value? */
function handedAnAddress(request: SimulationRequest): boolean {
 const { keys, values } = flatten({ subject: request.subject, ...(request.detail ?? {}) });
 if (keys.some(key => ADDRESS_SPELLINGS.has(canonical(key)))) return true;
 return values.some(value => MOBILE.test(value));
}

/* In words, not a code. feeds.json is explicit about it: a person who did not get their code is
   shown a sentence, and a sentence assembled from a provider's numeric code is a sentence written
   by a lookup table. These are the three honest ways a message does not arrive. */
const FAILURES = [
 'The handset could not be reached. It may be switched off, or out of coverage.',
 'The network turned the message away. The number may no longer be in use.',
 'The message expired before the network delivered it.'
] as const;

/** Our own reference for one send. Ours, never a provider's — the feed says why. */
const messageIdFor = (about: string): string => `MSG-${Math.floor(seeded(`message:${about}`)() * 900000 + 100000)}`;

/**
 * Ask the channel to carry one message.
 *
 * Two refusals live here. It will not be handed somewhere to reach, because a simulated channel that
 * accepts an address is one edit away from being a channel that uses it. And it will not carry the
 * same message twice: a retry is how a chosen failure gets quietly turned into a success, and the
 * product's answer to a message that did not arrive is a new message, not the same one again.
 */
export function send(request: SimulationRequest): SimulatorAnswer {
 if (handedAnAddress(request)) return refuse(messageChannel, request, refusesTo('messaging', /address outside this machine/));
 const messageId = messageIdFor(request.subject);
 if (carried.has(messageId)) return refuse(messageChannel, request, refusesTo('messaging', /^Retry/));

 const rand = seeded(`delivery:${messageId}`);
 /* One in eight. Which sends land on which side of it is then a fact about the seed rather than a
    choice anybody makes per run, which is what lets a journey be walked the same way twice — and it
    means the first sign-in anybody tries in the preview is one of the ones that does not arrive.
    That is left alone rather than tuned away. The screen behind it is the reason this seam has a
    simulator at all, and a rate picked so that nobody meets it is a rate picked to look good. */
 const failed = rand() < 0.125;
 carried.set(messageId, {
  kind: (request.detail?.['kind'] as MessageKind | undefined) ?? 'sign-in-code',
  about: request.subject,
  status: failed ? 'failed' : 'delivered',
  failureReason: failed ? pick(rand, FAILURES) : null
 });
 return messageChannel.produce({ subject: messageId, at: request.at });
}

/** What the channel carried, if it carried it. */
export const carriedMessage = (messageId: string): Readonly<Carried> | null => carried.get(messageId) ?? null;

/**
 * The channel: a receipt for one message, and nothing about the message itself.
 *
 * `produce` is asked about a messageId rather than about a person, which is the whole shape of a
 * delivery receipt. A messageId it never carried is refused rather than answered, because a channel
 * that will report on a send it did not make is a channel whose receipts mean nothing.
 */
export const messageChannel: Simulator = {
 id: 'message-channel',
 feed: feed.id,
 capability: 'messaging',
 supplier: simulationOf('messaging').supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  const record = carried.get(request.subject);
  if (!record) return refuse(messageChannel, request, refusesTo('messaging', /did not simulate/));
  const at = (request.at ?? new Date()).toISOString();
  return produced(messageChannel, request, {
   messageId: request.subject,
   status: record.status,
   at,
   /* Absent rather than empty on a delivery: the schema at this door is closed, and a field a
      provider always sends is a field nobody can tell apart from a field that means something. */
   ...(record.failureReason ? { failureReason: record.failureReason } : {}),
   providerReference: `SIM-${request.subject}`
  });
 }
};
register(messageChannel);

/**
 * The sign-in office: what the message says, and the only thing that can check it.
 *
 * `produce` issues a challenge and asks the channel to carry it. What comes back is the channel's
 * receipt, restamped as the office's own — the screen that renders it is a sign-in screen, and the
 * notice it must show is the one `accounts` carries rather than the one `messaging` does.
 */
export const signInCodes: Simulator = standIn({
 id: 'sign-in-codes',
 feed: feed.id,
 capability: 'accounts',
 supplier: simulationOf('accounts').supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  /* The first refusal, and the one the whole arrangement rests on: the office is never told where
     to send. A screen knows the number a person typed and keeps it; what reaches here is a handle
     for the attempt. Nothing that leaves this machine exists, because nothing to leave for does. */
  if (handedAnAddress(request)) return refuse(signInCodes, request, refusesTo('accounts', /handset/));

  /* The channel's refusal is passed through as the channel's, not restamped as the office's. They
     are different capabilities with different lists of what they will not do, and a `messaging`
     sentence wearing the `accounts` label would send a screen looking for a notice that does not
     describe what happened. A sign-in that failed because the channel refused to retry is a fact
     about the channel, and the screen should say so. */
  const carriedBy = send({ subject: `sign-in:${request.subject}`, at: request.at, detail: { kind: 'sign-in-code' } });
  if ('refused' in carriedBy) return carriedBy;

  const at = request.at ?? new Date();
  const issued = produced(signInCodes, request, carriedBy.payload);
  const rand = seeded(`code:${issued.reference}`);
  challenges.set(issued.reference, {
   code: String(Math.floor(rand() * 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0'),
   messageId: carriedBy.payload['messageId'] as string,
   expiresAt: at.getTime() + CODE_LIFE_SECONDS * 1000
  });
  return issued;
 }
});

/**
 * The code, for the screen that shows it — never for a payload.
 *
 * Null when the message did not arrive, and that is not a nicety. A person whose code was never
 * delivered does not have one; a preview that showed it anyway would be demonstrating a channel
 * that always works, which is the thing this file exists not to be.
 */
export function codeFor(challengeId: string): string | null {
 const challenge = challenges.get(challengeId);
 if (!challenge) return null;
 return carried.get(challenge.messageId)?.status === 'delivered' ? challenge.code : null;
}

export type Verified = { verified: true; challenge: string; at: string };

/**
 * Is this the code this office issued for this challenge?
 *
 * The two refusals are told apart on purpose. A challenge nobody here has heard of is not a wrong
 * code — it is a process that has been restarted, and saying "that code doesn't match" to somebody
 * holding the right code is the sort of small lie a simulator should not teach a product to tell.
 */
export function verify(challengeId: string, code: string, at?: Date): Verified | SimulatedRefusal {
 const request: SimulationRequest = { subject: challengeId, at };
 const challenge = challenges.get(challengeId);
 if (!challenge) return refuse(signInCodes, request, refusesTo('accounts', /restart/));
 const now = (at ?? new Date()).getTime();
 if (now > challenge.expiresAt || code !== challenge.code) return refuse(signInCodes, request, refusesTo('accounts', /did not itself produce/));
 return { verified: true, challenge: challengeId, at: new Date(now).toISOString() };
}

/** Everything this process remembers about messages, which is everything a restart takes away. */
export function forgetEverything(): void {
 carried.clear();
 challenges.clear();
}
