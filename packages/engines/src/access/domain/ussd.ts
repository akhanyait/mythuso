/* A USSD booking session: the menu in packages/catalog/ussd.json, walked one reply at a time, booking through the
   same rules POST /v1/access/bookings@2 answers with.

   ── Why it is a pure walk and not a route ────────────────────────────────────────────────────────

   A USSD session would reach MyThuso through the ussd-session door in packages/catalog/feeds.json, and that door
   refuses every payload: no aggregator is contracted and no code is assigned. So there is no route to bind and
   nothing here is served. What can be built before the aggregator exists is the walk itself — the screens, the
   words, what a reply may and may not be, and the booking at the end of it — as a function of a session and a
   reply, which the web's simulator runs in the tab and node:test runs beside it. The day an adapter is written it
   hands this the reply the door read, and the rules do not change.

   ── What a reply may be ──────────────────────────────────────────────────────────────────────────

   A number beside a choice, and nothing else. USSD travels in the clear and the aggregator and the network operator
   read every reply, so the menu never asks why a visit is needed, for an identity number or for a card number, and
   a reply that is not a choice is refused in the contract's sentence for what it looks like — an identity number, a
   card, anything with a letter in it — and dropped. It is not kept on the session, not logged and not published:
   the session holds which refusal was said and nothing of what was typed.

   ── Time ─────────────────────────────────────────────────────────────────────────────────────────

   A session keeps the wait in force when it was dialled (Access's setting ussd-session-timeout-seconds), and a reply
   after the wait ends the session with nothing booked. It never finishes a booking somebody walked away from.

   ── The booking ──────────────────────────────────────────────────────────────────────────────────

   For the person whose phone dialled, as the booking route's patient, for whoever is nearest and cleared, with the
   session's reference as the idempotency key. requestBooking in ./booking.ts decides every refusal, and a refusal is
   shown in the route's own sentence. */
import ussd from '../../../../catalog/ussd.json' with { type: 'json' };
import booking from '../../../../catalog/booking.json' with { type: 'json' };
import accessApi from '../../../../catalog/apis/access.json' with { type: 'json' };
import apis from '../../../../catalog/apis.json' with { type: 'json' };
import sos from '../../../../catalog/sos.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import { offeredDays, offeredSlots, requestBooking, type Booking, type Ledger } from './booking.ts';
import { ROUTES, simulatedRef, type AccessEvent } from './contract.ts';

export const ussdContract = ussd;
export const MAX_CHARACTERS: number = ussd.screen.maxCharacters;

type Choice = { readonly key: string; readonly label: string; readonly next: string | null };
type ListOf = 'services' | 'zones' | 'days' | 'hours';
type MenuNode = { readonly id: string; readonly text?: string; readonly textFrom?: string; readonly choices?: readonly Choice[]; readonly listOf?: ListOf; readonly itemLabel?: string; readonly pageSize?: number; readonly next?: string };
const NODES = ussd.menu.nodes as readonly MenuNode[];
const nodeOf = (id: string): MenuNode => {
 const found = NODES.find(n => n.id === id);
 if (!found) throw new Error(`packages/catalog/ussd.json has no menu screen "${id}".`);
 return found;
};
export const menuNodes = NODES;

export type ChannelRefusalId = 'no-identity-number' | 'no-card-details' | 'no-clinical-detail' | 'not-a-choice';
export type Picks = { readonly serviceId?: string; readonly zoneId?: string; readonly date?: string; readonly start?: string };
export type Session = {
 readonly sessionRef: string;
 readonly subjectRef: string;
 /** The wait in force when the session was dialled, kept for the whole session. */
 readonly timeoutSeconds: number;
 readonly lastAt: number;
 readonly nodeId: string;
 readonly page: number;
 readonly picks: Picks;
 /** Which refusal the screen is showing, never what was typed. */
 readonly refusal: ChannelRefusalId | null;
 readonly bookingRef: string | null;
 readonly bookingRefusal: string | null;
 readonly ended: 'ended' | 'timed-out' | null;
};
export type Booked = { readonly ledger: Ledger; readonly booking: Booking; readonly events: readonly AccessEvent[] };
export type Step = { readonly session: Session; readonly screen: string; readonly booked: Booked | null };
export type Context = { readonly now: Date; readonly ledger: Ledger; readonly namedNurseFallback: string };

/* ---- Words ----------------------------------------------------------------------------------------- */

const fill = (text: string, values: Readonly<Record<string, string>>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const lines = (text: string, choices: readonly { key: string; label: string }[]) => [text, ...choices.map(c => `${c.key} ${c.label}`)].join(ussd.screen.lineBreak);
const rand = (price: number) => `R${price}`;

/* A day as a USSD screen names it: "Wed 16 Sep", with no punctuation a small handset might wrap on. The weekday is the
   date's place in the week, named from packages/catalog/ussd.json, and the day and month are formatted in UTC from the
   date alone. Nothing here asks a clock what time it is in a timezone: the offered days are already Johannesburg dates
   from booking.ts, a calendar date has one weekday wherever it is read, and the Access domain keeps no clock of its own
   beside the shared rota rule in packages/engines/src/settings/shape.ts. */
const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
export const dayLabel = (isoDate: string) => {
 const date = new Date(`${isoDate}T12:00:00Z`);
 return `${ussd.screen.dayNames[date.getUTCDay()]} ${dayMonth.format(date)}`;
};

/* The sentence a textFrom names, filled with the numbers in packages/catalog/sos.json. Only booking.json is read from,
   because the one sentence borrowed is the emergency numbers Gilbert gives out of hours. */
function borrowed(pointer: string): string {
 const [file, path] = pointer.split('#');
 if (file !== 'packages/catalog/booking.json' || !path) throw new Error(`packages/catalog/ussd.json borrows "${pointer}", which the USSD walk does not read.`);
 let value: unknown = booking;
 for (const key of path.split('.')) value = (value as Record<string, unknown>)?.[key];
 if (typeof value !== 'string') throw new Error(`packages/catalog/ussd.json borrows "${pointer}", which is not a sentence.`);
 return value.replace(/\{(\w+)\}/g, (whole, id: string) => sos.emergency.numbers.find(n => n.id === id)?.number ?? whole);
}

export const channelSentence = (id: ChannelRefusalId): string => {
 const found = ussd.channelRefusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/ussd.json has no channel refusal "${id}".`);
 return found.sentence;
};

/* ---- What a reply looks like ----------------------------------------------------------------------- */

const luhn = (digits: string) => {
 let sum = 0;
 for (let i = 0; i < digits.length; i++) {
  let d = Number(digits[digits.length - 1 - i]);
  if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
  sum += d;
 }
 return sum % 10 === 0;
};
const startsWithADate = (digits: string) => {
 const yy = Number(digits.slice(0, 2)), mm = Number(digits.slice(2, 4)), dd = Number(digits.slice(4, 6));
 if (mm < 1 || mm > 12 || dd < 1) return false;
 return dd <= new Date(Date.UTC(2000 + yy, mm, 0)).getUTCDate();
};

/**
 * Which refusal a reply that is not a choice is answered with, in packages/catalog/ussd.json's order. Separators are
 * dropped before digits are counted. A USSD reply is GSM 7-bit text, whose only digits are 0 to 9, so no other
 * script's digits are read.
 */
export function classifyReply(typed: string): ChannelRefusalId {
 const digits = typed.replace(/[\s.\-]/g, '');
 if (/^\d+$/.test(digits)) {
  if (digits.length === 13 && startsWithADate(digits)) return 'no-identity-number';
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'no-card-details';
  return 'not-a-choice';
 }
 if (/\p{L}/u.test(typed)) return 'no-clinical-detail';
 return 'not-a-choice';
}

/* ---- The lists ------------------------------------------------------------------------------------- */

type Item = { readonly value: string; readonly label: string };
function itemsOf(node: MenuNode, picks: Picks, now: Date, namedNurseFallback: string): Item[] {
 const label = node.itemLabel ?? '{name}';
 if (node.listOf === 'services') return services.filter(s => s.phase === 1).map(s => ({ value: s.id, label: fill(label, { name: s.name, price: rand(s.price) }) }));
 if (node.listOf === 'zones') return geography.zones.map(z => ({ value: z.id, label: fill(label, { name: z.name }) }));
 if (node.listOf === 'days') return offeredDays(now).map(day => ({ value: day, label: fill(label, { day: dayLabel(day) }) }));
 if (node.listOf === 'hours' && picks.serviceId && picks.date) {
  return offeredSlots({ now, serviceId: picks.serviceId, kind: 'scheduled', choice: { kind: 'nearest' }, holds: [], namedNurseFallback })
   .filter(slot => slot.date === picks.date).map(slot => ({ value: slot.start!, label: fill(label, { hour: slot.start! }) }));
 }
 return [];
}
const pageOf = (node: MenuNode, items: readonly Item[], page: number) => {
 const size = node.pageSize ?? items.length;
 return { shown: items.slice(page * size, (page + 1) * size), more: items.length > (page + 1) * size };
};
const pick = (node: MenuNode, picks: Picks, value: string): Picks =>
 node.listOf === 'services' ? { serviceId: value } : node.listOf === 'zones' ? { ...picks, zoneId: value } : node.listOf === 'days' ? { ...picks, date: value, start: undefined } : { ...picks, start: value };
/* Back from the first page of a list is the screen that led to it. */
const previousOf = (id: string) => NODES.find(n => n.next === id || n.choices?.some(c => c.next === id))?.id ?? ussd.menu.start;

/* ---- A screen -------------------------------------------------------------------------------------- */

function valuesOf(session: Session): Record<string, string> {
 const service = services.find(s => s.id === session.picks.serviceId);
 return {
  service: service?.name ?? '', price: service ? rand(service.price) : '', zone: geography.zones.find(z => z.id === session.picks.zoneId)?.name ?? '',
  day: session.picks.date ? dayLabel(session.picks.date) : '', hour: session.picks.start ?? '',
  bookingRef: session.bookingRef ?? '', refusal: session.bookingRefusal ?? ''
 };
}

/** What the handset shows for a session, now. */
export function screenOf(session: Session, now: Date, namedNurseFallback: string): string {
 if (session.ended === 'timed-out') return ussd.session.timedOut;
 if (session.ended === 'ended') return ussd.session.ended;
 if (session.refusal) return lines(channelSentence(session.refusal), [ussd.refusalBack]);
 const node = nodeOf(session.nodeId);
 const values = valuesOf(session);
 if (node.listOf) {
  const { shown, more } = pageOf(node, itemsOf(node, session.picks, now, namedNurseFallback), session.page);
  return lines(fill(node.text ?? '', values), [...shown.map((item, i) => ({ key: String(i + 1), label: item.label })), ...(more ? [ussd.menu.list.more] : []), ussd.menu.list.back]);
 }
 return lines(node.textFrom ? borrowed(node.textFrom) : fill(node.text ?? '', values), node.choices ?? []);
}

/* ---- The walk -------------------------------------------------------------------------------------- */

export function startSession(input: { sessionRef: string; subjectRef: string; now: Date; timeoutSeconds: number; namedNurseFallback: string }): Step {
 const session: Session = {
  sessionRef: input.sessionRef, subjectRef: input.subjectRef, timeoutSeconds: input.timeoutSeconds, lastAt: input.now.getTime(),
  nodeId: ussd.menu.start, page: 0, picks: {}, refusal: null, bookingRef: null, bookingRefusal: null, ended: null
 };
 return { session, screen: screenOf(session, input.now, input.namedNurseFallback), booked: null };
}

/** One reply. What was typed is read here and goes nowhere: the session answered keeps which screen it is on. */
export function reply(session: Session, typed: string, ctx: Context): Step {
 const shown = (next: Session, booked: Booked | null = null): Step => ({ session: next, screen: screenOf(next, ctx.now, ctx.namedNurseFallback), booked });
 if (session.ended) return shown(session);
 if (ctx.now.getTime() - session.lastAt > session.timeoutSeconds * 1000) return shown({ ...session, ended: 'timed-out', refusal: null });
 const input = typed.trim();
 const at: Session = { ...session, lastAt: ctx.now.getTime() };
 const refused = () => shown({ ...at, refusal: classifyReply(input) });

 if (session.refusal) return input === ussd.refusalBack.key ? shown({ ...at, refusal: null }) : refused();

 const node = nodeOf(session.nodeId);
 if (node.listOf) {
  const { shown: onPage, more } = pageOf(node, itemsOf(node, session.picks, ctx.now, ctx.namedNurseFallback), session.page);
  if (more && input === ussd.menu.list.more.key) return shown({ ...at, page: session.page + 1 });
  if (input === ussd.menu.list.back.key) return shown(session.page > 0 ? { ...at, page: session.page - 1 } : { ...at, nodeId: previousOf(node.id), page: 0 });
  const item = /^[1-9]$/.test(input) ? onPage[Number(input) - 1] : undefined;
  if (!item) return refused();
  return shown({ ...at, picks: pick(node, session.picks, item.value), nodeId: node.next!, page: 0 });
 }

 const choice = node.choices?.find(c => c.key === input);
 if (!choice) return refused();
 if (choice.next === null) return shown({ ...at, ended: 'ended' });
 if (node.id === 'review' && choice.next === 'booked') return book(at, ctx);
 return shown({ ...at, nodeId: choice.next, page: 0, ...(choice.next === ussd.menu.start ? { picks: {}, bookingRef: null, bookingRefusal: null } : {}) });
}

/* The booking rules decide, and a refusal is shown in the route's words. An hour no longer offered is sent as a
   reference that claims nothing, so the rules refuse it rather than the menu deciding it for them. */
function book(session: Session, ctx: Context): Step {
 const { serviceId = '', zoneId = '', date, start } = session.picks;
 const slot = offeredSlots({ now: ctx.now, serviceId, kind: 'scheduled', choice: { kind: 'nearest' }, holds: [], namedNurseFallback: ctx.namedNurseFallback })
  .find(s => s.date === date && s.start === start);
 const outcome = requestBooking(ctx.ledger,
  { idempotencyKey: `ussd:${session.sessionRef}`, subjectRef: session.subjectRef, serviceId, mode: 'home', slotRef: slot?.slotRef ?? 'never-offered', zoneId, actorRole: ussd.booking.actorRole },
  { now: ctx.now, candidates: [], namedNurseFallback: ctx.namedNurseFallback });
 if (outcome.refused) return { session: { ...session, nodeId: 'refused', page: 0, bookingRefusal: outcome.statement }, screen: screenOf({ ...session, nodeId: 'refused', page: 0, bookingRefusal: outcome.statement }, ctx.now, ctx.namedNurseFallback), booked: null };
 const next: Session = { ...session, nodeId: 'booked', page: 0, bookingRef: outcome.value.booking.bookingRef };
 return { session: next, screen: screenOf(next, ctx.now, ctx.namedNurseFallback), booked: { ledger: outcome.value.ledger, booking: outcome.value.booking, events: outcome.events } };
}

/* ---- Every screen, for the build ------------------------------------------------------------------- */

const longest = (values: readonly string[]) => values.reduce((a, b) => (b.length > a.length ? b : a), '');

/**
 * Every screen the menu can show from `now`: every page of every list, for every service and offered day, and
 * every other screen filled with the longest words the catalogues can put into it — the longest service and price,
 * suburb, hour, any day's label across a year, a reference, and every refusal the booking route can answer with.
 * scripts/check-boundaries.mjs holds each of them to the contract's maximum.
 */
export function everyScreen(now: Date, namedNurseFallback: string): { where: string; text: string }[] {
 const out: { where: string; text: string }[] = [];
 const blank: Session = { sessionRef: 'build', subjectRef: 'build', timeoutSeconds: 1, lastAt: now.getTime(), nodeId: ussd.menu.start, page: 0, picks: {}, refusal: null, bookingRef: null, bookingRefusal: null, ended: null };
 const phaseOne = services.filter(s => s.phase === 1);
 for (const node of NODES) {
  if (node.listOf) {
   const pickSets: Picks[] = node.listOf === 'hours' ? phaseOne.flatMap(s => offeredDays(now).map(date => ({ serviceId: s.id, date }))) : [{}];
   for (const picks of pickSets) {
    const items = itemsOf(node, picks, now, namedNurseFallback);
    const pages = Math.max(1, Math.ceil(items.length / (node.pageSize ?? Math.max(1, items.length))));
    for (let page = 0; page < pages; page++) out.push({ where: `${node.id} page ${page + 1}${picks.date ? ` (${picks.serviceId}, ${picks.date})` : ''}`, text: screenOf({ ...blank, nodeId: node.id, page, picks }, now, namedNurseFallback) });
   }
   continue;
  }
  out.push({ where: node.id, text: screenOf({ ...blank, nodeId: node.id }, now, namedNurseFallback) });
 }
 /* The templated screens, filled with the longest of everything. */
 const yearOfDays = Array.from({ length: 366 }, (_, i) => new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10));
 const bookRoute = accessApi.routes.find(r => `${r.method} ${r.path}@${r.version}` === ROUTES.book)!;
 const longestService = phaseOne.reduce((a, b) => (`${b.name} ${rand(b.price)}`.length > `${a.name} ${rand(a.price)}`.length ? b : a));
 const worst: Record<string, string> = {
  service: longestService.name, price: rand(Math.max(...phaseOne.map(s => s.price))), zone: longest(geography.zones.map(z => z.name)),
  day: longest(yearOfDays.map(dayLabel)), hour: longest(scheduling.offer.slots), bookingRef: simulatedRef('BKG', 'build'),
  refusal: longest([...bookRoute.refusals, ...(apis.sharedRefusals as { statement: string }[])].map(r => r.statement))
 };
 for (const id of ['review', 'booked', 'refused']) {
  const node = nodeOf(id);
  out.push({ where: `${id} with the longest words`, text: lines(fill(node.text ?? '', worst), node.choices ?? []) });
 }
 for (const refusal of ussd.channelRefusals) out.push({ where: `channel refusal ${refusal.id}`, text: screenOf({ ...blank, refusal: refusal.id as ChannelRefusalId }, now, namedNurseFallback) });
 out.push({ where: 'timed out', text: ussd.session.timedOut }, { where: 'ended', text: ussd.session.ended });
 return out;
}
