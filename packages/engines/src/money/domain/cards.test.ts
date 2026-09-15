import test from 'node:test';
import assert from 'node:assert/strict';
import { carriesACard, luhn } from './cards.ts';

/* Card detection, held to every format the review found missed and every reference it found refused.
   No card number is written in this file: each is built from a prefix and a computed check digit, so
   the repository holds no string a scanner would take for a real one. */
const withCheckDigit = (body: string) => {
 for (let d = 0; d < 10; d += 1) if (luhn(body + d)) return body + d;
 throw new Error('No check digit makes this body pass Luhn.');
};
const card = withCheckDigit('4' + '2'.repeat(14));
const groups = (digits: string, separator: string) => digits.match(/.{1,4}/g)!.join(separator);
const inBlock = (digits: string, zero: number) => [...digits].map(c => String.fromCodePoint(zero + Number(c))).join('');

test('a card number is found written with dots, slashes, double and non-breaking spaces, in other scripts, and as a number', () => {
 const shaped = [
  groups(card, '.'), groups(card, '  '), groups(card, '/'), groups(card, ' '), groups(card, ' - '), groups(card, ' '),
  inBlock(card, 0xff10), inBlock(card, 0x660), inBlock(card, 0x6f0), card
 ];
 for (const value of shaped) assert.equal(carriesACard({ idempotencyKey: `key ${value} end` }), true, JSON.stringify(value));
 assert.equal(carriesACard({ amountCents: Number(card) }), true, 'a card sent as a JSON number');
 assert.equal(carriesACard({ amountCents: BigInt(card) }), true, 'a card sent as a big integer');
});

test('a card number is found at any depth, in lists, and under any declared field name whatever it holds', () => {
 let deep: unknown = { note: groups(card, ' ') };
 for (let i = 0; i < 12; i += 1) deep = { next: deep };
 assert.equal(carriesACard(deep), true, 'nested twelve deep');
 assert.equal(carriesACard({ items: ['nothing', ['still nothing', groups(card, '-')]] }), true, 'inside a list');
 for (const name of ['ccnum', 'number', 'lastFour', 'cardNumber', 'pan', 'last4', 'cvv']) assert.equal(carriesACard({ [name]: 'x' }), true, name);
 const cyclic: Record<string, unknown> = { a: 1 };
 cyclic['self'] = cyclic;
 assert.equal(carriesACard(cyclic), false, 'a cycle ends rather than looping');
});

test('references, dates, attempt numbers and identity numbers are not card numbers', () => {
 const references = ['PB-appt-2026-09-16-0930-1', 'MT-VITALS-2026-09-16-0900-12', 'PAY-MT-VITALS-2026-09-16-0900-1', 'MT-VITALS-2026-09-16-0900-LERATO:card:1', 'PAY-PB-appt-1-1'];
 for (const value of references) {
  assert.equal(carriesACard({ idempotencyKey: value }), false, `${value} as free text`);
  assert.equal(carriesACard({ payableRef: value, paymentRef: value, appointmentRef: value }), false, `${value} as a reference`);
 }
 const identityNumber = withCheckDigit('800101500908');
 assert.equal(carriesACard({ idempotencyKey: `id ${identityNumber}` }), false, 'a South African identity number, which uses the same check digit, is not a card');
 assert.equal(carriesACard({ amountCents: 24900, method: 'card' }), false);
 const notLuhn = card.slice(0, 15) + String((Number(card[15]) + 1) % 10);
 assert.equal(carriesACard({ idempotencyKey: notLuhn }), false, 'sixteen digits that fail Luhn are not an issued card');
 assert.equal(carriesACard({ payableRef: groups(card, ' ') }), true, 'a reference field holding only a card number is still a card');
});
