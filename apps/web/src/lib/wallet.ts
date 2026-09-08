import { services } from './catalog';
/* The wallet's one number.
 *
 * "Balance R500.00" was typed on the wallet screen and typed again in the booking's payment list, so
 * a change to one would have left the other quietly wrong — the drift this repository writes a build
 * check for everywhere a contract reaches. There is no wallet contract in packages/catalog yet, so
 * this is the smallest honest version of one: the credit is written down once, the ledger is built
 * from it and from the catalogue's own price for the visit it names, and every screen reads it here.
 *
 * The visit line is a charge that was settled on a card at the time — the booking flow's default —
 * rather than money taken out of the wallet, which is why the balance is the credit rather than the
 * credit less the visit. When a payment provider exists this file is where the real balance arrives,
 * and nothing that renders it has to change. */
export const credit = 500;
export const balance = credit;
export const activity = [
 { name: 'Family care credit', delta: credit, date: '8 September', note: 'Sent by a family member' },
 { name: services[0].name, delta: -services[0].price, date: '28 August', note: 'Paid on a card at the time' }
] as const;
/* The three amounts the top-up screen offers. Two round figures a person would actually choose, and
   the credit itself, so the largest option is a number this app has already shown them. */
export const topUpAmounts = [100, 250, credit] as const;
