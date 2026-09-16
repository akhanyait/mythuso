import { useSyncExternalStore } from 'react';
import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal, refusal } from '../../../../packages/engines/src/money/domain/contract.ts';
import { giftsContract } from '../../../../packages/engines/src/money/domain/gifts.ts';
import services from '../../../../packages/catalog/services.json' with { type: 'json' };
import { voucherExpiryYearsNow } from './settings';

/* Gift a visit, in the web preview: a giver's screen and a beneficiary's screen, both driven by Money's own
 * ledger in this tab, the way lib/groups.ts already drives a stokvel and lib/vouchers.ts a checkout code.
 *
 * ── Why one ledger, and why it is not a bearer code ──────────────────────────────────────────
 *
 * giftAVisit and bookGiftedVisit are the exact functions the engine binds to POST /v1/money/gifts@1 and stands
 * in with for the booking Care would otherwise cause; a screen that filtered or re-checked either would be a
 * second copy of "only she books it" that could disagree with the first. A gift carries no code at all — it is
 * made out to the beneficiary's own account from the moment it is given — so unlike a voucher there is nothing
 * to type at a till and nothing this module keeps besides the reference.
 *
 * ── Module-level and in memory ────────────────────────────────────────────────────────────────
 *
 * Nothing here writes to the browser's storage. A reload opens the preview afresh: no gift exists, nobody is
 * named and no visit is booked.
 */

export const giftWords = giftsContract.screen;
/** The route's own sentence, read once rather than typed on the screen: a gift never books a visit by itself. */
export const giftBooksForThem = refusal('gift-books-for-them').statement;
const preview = giftsContract.preview;

const GIVER = { role: preview.giverRole, subjectRef: preview.giverRef };
const BENEFICIARY = { role: 'patient', subjectRef: preview.beneficiarySubjectRef };
let keys = 0;
const key = () => `preview-gift-${++keys}`;

const serviceName = (id: string) => services.find(s => s.id === id)?.name ?? id;
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);

type World = { ledger: Money; said: string | null; version: number };
const open = (): World => ({ ledger: createMoney({ simulation: true, voucherExpiryYears: voucherExpiryYearsNow }), said: null, version: 0 });

let world: World | null = null;
const current = () => (world ??= open());
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const told = () => { const w = current(); world = { ...w, version: w.version + 1 }; for (const listener of listeners) listener(); };
const snapshot = () => current().version;

/* ---- The giver's screen -------------------------------------------------------------------------- */

export type GivenGift = { giftRef: string; service: string; stateCode: 'given' | 'booked'; words: string; expiresOn: string };
export type GiverScreen = { beneficiaryName: string; services: { id: string; name: string; price: number }[]; given: GivenGift[]; said: string | null };

const givenFor = (w: World, role: 'giver' | 'beneficiary'): GivenGift[] => w.ledger.giftsFor(role === 'giver' ? GIVER.subjectRef : BENEFICIARY.subjectRef)
 .map(g => ({
  giftRef: g.giftRef, service: serviceName(g.serviceId), stateCode: g.stateCode, expiresOn: g.expiresOn,
  words: fill(giftsContract.states.find(s => s.id === g.stateCode)![role === 'giver' ? 'giverWords' : 'beneficiaryWords'],
   { beneficiary: preview.beneficiaryName, giver: preview.giverName, service: serviceName(g.serviceId) })
 }));

function giverScreen(): GiverScreen {
 const w = current();
 return {
  beneficiaryName: preview.beneficiaryName,
  services: services.filter(s => s.phase === 1).map(s => ({ id: s.id, name: s.name, price: s.price })),
  given: givenFor(w, 'giver'),
  said: w.said
 };
}
export const useGiver = (): GiverScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return giverScreen(); };

/** The giver gives one visit to the preview's beneficiary. Never a booking, never her agreement: those are hers. */
export function giveGift(serviceId: string) {
 const w = current();
 const answer = w.ledger.giftAVisit(GIVER, { idempotencyKey: key(), beneficiarySubjectRef: BENEFICIARY.subjectRef, serviceId });
 world = { ...w, said: isRefusal(answer) ? answer.statement : fill(giftWords.giver.given, { beneficiary: preview.beneficiaryName }) };
 told();
}

/* ---- The beneficiary's screen --------------------------------------------------------------------- */

export type BeneficiaryScreen = { gifts: GivenGift[]; said: string | null };

function beneficiaryScreen(): BeneficiaryScreen {
 const w = current();
 return { gifts: givenFor(w, 'beneficiary'), said: w.said };
}
export const useBeneficiaryGifts = (): BeneficiaryScreen => { useSyncExternalStore(subscribe, snapshot, snapshot); return beneficiaryScreen(); };

/** She books it, in her own account. Nobody has booked anything for her until this. */
export function bookGift(giftRef: string) {
 const w = current();
 const answer = w.ledger.bookGiftedVisit(BENEFICIARY, { idempotencyKey: key(), giftRef });
 world = { ...w, said: isRefusal(answer) ? answer.statement : giftWords.beneficiary.booked };
 told();
}
