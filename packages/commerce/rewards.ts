import { CENTS_PER_POINT, earnReason, isMedicine, pointsEligible, productById, rewards, tierFor } from './contract.ts';
import { refuse, requireThat } from './guards.ts';
import type { Balance, LedgerEntry, LineItem, State, Track } from './types.ts';

const DAY = 86_400_000;
const addMonths = (iso: string, months: number) => { const d = new Date(iso); d.setMonth(d.getMonth() + months); return d.toISOString(); };

export const liveEntries = (state: State, shopperId: string, track: Track, now: string) =>
 state.ledger.filter(e => e.shopperId === shopperId && e.track === track && (!e.expiresAt || e.expiresAt > now));

export function balanceOf(state: State, shopperId: string, track: Track, now: string): Balance {
 const live = liveEntries(state, shopperId, track, now);
 const points = live.reduce((sum, e) => sum + e.points, 0);
 /* Twelve months of earning decides the tier, and nothing else does. `tierInputs` in the contract
    lists the inputs exhaustively and a boundary check holds this line to that list, because a tier
    quietly influenced by a suburb is redlining with a friendly name. */
 const year = new Date(new Date(now).getTime() - 365 * DAY).toISOString();
 const earnedThisYear = live.filter(e => e.points > 0 && e.at >= year).reduce((sum, e) => sum + e.points, 0);
 const soon = new Date(new Date(now).getTime() + rewards.warnBeforeExpiryDays * DAY).toISOString();
 return {
  track, points,
  tier: track === 'household' ? tierFor(earnedThisYear).id : rewards.tiers[0].id,
  expiringSoon: live.filter(e => e.points > 0 && e.expiresAt && e.expiresAt <= soon).reduce((sum, e) => sum + e.points, 0)
 };
}

/** The only way a row reaches the ledger. `note` is the reason's own `discloses` sentence out of
 *  the contract and never a string a caller passed in — a free text field here is where somebody
 *  would eventually write why the visit happened, and a points history is read casually, shown to
 *  family and screenshotted. */
export function write(state: State, shopperId: string, reasonId: string, points: number, now: string, expires: boolean): LedgerEntry {
 const reason = earnReason(reasonId);
 const entry: LedgerEntry = {
  sequence: state.ledger.length + 1, shopperId, track: reason.track as Track,
  reason: reason.id, note: reason.discloses, points, at: now,
  ...(expires && points > 0 ? { expiresAt: addMonths(now, rewards.expiryMonths) } : {})
 };
 state.ledger.push(entry);
 return entry;
}

export function accrue(state: State, shopperId: string, reasonId: string, now: string) {
 const reason = earnReason(reasonId);
 requireThat(typeof reason.points === 'number', 'That reason earns points per rand, and is awarded by an order rather than on its own.');
 if (reason.cap) {
  const since = new Date(new Date(now).getTime() - 365 * DAY).toISOString();
  const already = state.ledger.filter(e => e.shopperId === shopperId && e.reason === reason.id && e.at >= since).length;
  requireThat(already < reason.cap, `That is capped at ${reason.cap} a ${reason.capPeriod}.`);
 }
 write(state, shopperId, reason.id, reason.points as number, now, true);
}

/** Points earned on an order, line by line. A medicine earns nothing — section 18A — and the
 *  arithmetic is what enforces it, so a listing that ever slips into shop.json slips in inert. */
export function pointsForLines(lines: LineItem[]): number {
 const perRand = earnReason('goods-purchased').perRand ?? 0;
 return lines.reduce((sum, line) => {
  const product = productById(line.productId);
  if (!pointsEligible(product)) return sum;
  return sum + Math.floor(product.price * line.quantity * perRand);
 }, 0);
}

/** What a redemption may take off a bill. Never the delivery fee and never a medicine — so the
 *  ceiling is the eligible goods, not the total. */
export function redeemableCents(lines: LineItem[]): number {
 return lines.reduce((sum, line) => {
  const product = productById(line.productId);
  if (isMedicine(product)) return sum;
  return sum + product.price * 100 * line.quantity;
 }, 0);
}

export function spend(state: State, shopperId: string, points: number, lines: LineItem[], now: string): number {
 if (points <= 0) return 0;
 requireThat(Number.isInteger(points), 'Points are spent whole.');
 const available = balanceOf(state, shopperId, 'household', now).points;
 requireThat(points <= available, 'That is more points than this account has.');
 if (lines.some(line => isMedicine(productById(line.productId)))) refuse('refused', 'no-points-on-medicine');
 const cents = Math.min(points * CENTS_PER_POINT, redeemableCents(lines));
 requireThat(cents === points * CENTS_PER_POINT, 'That is more points than this order can take off.');
 write(state, shopperId, 'goods-purchased', -points, now, false);
 return cents;
}

/** Expiry is swept rather than silently observed, so the ledger says what happened and when.
 *  Silent expiry is how a loyalty scheme quietly takes back what it advertised.
 *
 *  The sweep and the balance filter must not both subtract the same points. They do not: the
 *  reversal row is written AND the original loses its expiry date in the same step, so an expired
 *  entry is either filtered out (never swept) or cancelled by its reversal (swept) — never both.
 *  That also makes the sweep idempotent, since a swept original no longer matches. */
export function expire(state: State, shopperId: string, now: string) {
 const stale = state.ledger.filter(e => e.shopperId === shopperId && e.points > 0 && e.expiresAt && e.expiresAt <= now);
 for (const entry of stale) {
  state.ledger.push({
   sequence: state.ledger.length + 1, shopperId, track: entry.track, reason: entry.reason,
   note: `expired: ${entry.note}`, points: -entry.points, at: now, expiredFrom: entry.sequence
  });
  delete entry.expiresAt;
 }
}
