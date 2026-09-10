/**
 * The half of "publish the chain head" that can be built without a second organisation.
 *
 * ── What is absent, and stays absent ─────────────────────────────────────────────────────────
 *
 * docs/PRIVACY-AND-SECURITY.md lists **publishing the chain head somewhere the operator does not
 * control** as absent, and gives the right reason: the whole value of it is that the place is not
 * MyThuso's. A second table, a second file or a second box on the same account is the operator
 * publishing to the operator, which is a longer way of not publishing. That needs a notary, a
 * regulator, a partner or a public transparency log — an agreement, not a function.
 *
 * **Nothing in this file publishes anything.** There is no recipient, no schedule, no upload and no
 * configuration for one. That gap is unchanged and it is still absent.
 *
 * ── What was missing that is not an agreement ────────────────────────────────────────────────
 *
 * The other half. A head written down somewhere is worth exactly nothing until something can take it
 * back and ask whether this chain is still the same chain — and there was no way to ask. `head()`
 * existed, `verify()` existed, and between them they answer "is the log I have now internally
 * consistent", which an attacker with the database file and no key satisfies trivially: they delete
 * everything. audit.ts says so in its own header. **An empty log verifies, because there is nothing
 * left to contradict.**
 *
 * So this file is the question, not the answer:
 *
 *  · `statement()` takes the chain's current length and head and renders them as a short block of
 *    text meant to leave the machine — printed, read down a phone, pasted into an email, signed by
 *    somebody's own key if they have one. It is deliberately plain: sixty-four hex characters, a
 *    count and a time, in a format a person can read aloud without losing anything.
 *  · `parse()` reads one back, strictly, so that a statement handed over months ago can be typed in
 *    again by whoever kept it.
 *  · `stillExtends()` is the part that was actually missing. Given a statement from the past and the
 *    chain as it stands, it answers whether this chain is still that chain grown longer — and names
 *    which way it is not.
 *
 * ── Why that is a real control and not theatre ───────────────────────────────────────────────
 *
 * The threat this whole chain is built against is somebody with the database file and not the key.
 * They cannot append and they cannot rewrite, because every hash is an HMAC. Truncation is the one
 * move left to them, and truncation is the one thing `verify()` cannot see. Against a head somebody
 * else is holding, it becomes the most visible thing there is:
 *
 *  · Truncated to nothing, or to anything shorter than the witnessed length — refused, because the
 *    chain is now shorter than something already vouched for.
 *  · Truncated to a prefix and then grown again with real entries — refused, because the entry at
 *    the witnessed position no longer hashes to the witnessed head.
 *  · Edited anywhere at all — refused, because `verify()` breaks first.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────────────
 *
 * It is not publication. It is not a notary, a timestamp authority or a transparency log, it proves
 * nothing about *when* a statement was made, and a statement MyThuso wrote and MyThuso kept proves
 * nothing at all — the check is only worth what the independence of whoever holds the paper is
 * worth. **If the same operator holds both the database and the only copy of the statement, this
 * file establishes nothing.** It is the thing that makes an agreement worth making, built so that
 * the day somebody does agree to hold a head, there is something to hand them and something to do
 * with it when they hand it back.
 *
 * Pure: no clock of its own, no database, no HTTP, and it never touches a key.
 */
import { GENESIS } from './audit.ts';

/** What a chain looked like at a moment, small enough to read down a telephone. */
export type Witness = {
 /** Which log. There is more than one chain in this service and a head is meaningless without it. */
 log: string;
 /** How many entries the chain held. The position the head belongs at. */
 length: number;
 /** What the last entry hashed to — sixty-four hex characters, and nothing else. */
 head: string;
 /** When the statement was made, in MyThuso's own words. It is a claim by MyThuso and nothing more. */
 at: string;
};

export type WitnessVerdict =
 | { holds: true; grownBy: number }
 | { holds: false; because: string };

const HEX_64 = /^[0-9a-f]{64}$/;
const MARKER = 'MyThuso chain witness';

/** The statement a person is handed. Deterministic, so the same chain state renders the same block. */
export function statement(log: string, chain: { length: number; head: string }, at: string): Witness {
 if (!HEX_64.test(chain.head)) throw new Error(`A chain head is sixty-four hex characters. "${chain.head.slice(0, 16)}…" is not one, so there is nothing here worth writing down.`);
 return { log, length: chain.length, head: chain.head, at };
}

/**
 * Rendered for a human being rather than for a parser, and parseable anyway.
 *
 * The last line is the point of the whole format: a statement that does not say what it is worth
 * will be filed by somebody who thinks it is worth more.
 */
export function render(witness: Witness): string {
 return [
  `${MARKER} — ${witness.log}`,
  `entries: ${witness.length}`,
  `head: ${witness.head}`,
  `at: ${witness.at}`,
  'This is a claim by MyThuso about MyThuso. It is worth what the independence of whoever holds it',
  'is worth, and nothing if MyThuso holds the only copy.'
 ].join('\n');
}

/** One back, strictly. A statement that does not parse is refused rather than half-read. */
export function parse(text: string): Witness | null {
 const lines = text.split('\n').map(line => line.trim());
 const marker = lines.find(line => line.startsWith(MARKER));
 const field = (name: string) => lines.find(line => line.startsWith(`${name}: `))?.slice(name.length + 2);
 const log = marker?.slice(MARKER.length + 3).trim();
 const length = Number(field('entries'));
 const head = field('head');
 const at = field('at');
 if (!log || !head || !at) return null;
 if (!Number.isInteger(length) || length < 0) return null;
 if (!HEX_64.test(head)) return null;
 return { log, length, head, at };
}

/**
 * Is this chain still the chain that statement was made about?
 *
 * `hashAt` is a lookup by position — one-based, matching the `length` in a statement — and returns
 * null where the chain is not that long. It is passed in rather than read here so that this file
 * stays away from the store and the key: what it needs is one hash, and asking for one hash is a
 * strictly smaller thing to be able to do than reading the log.
 *
 * The order of the three refusals is the order of how badly wrong each one is.
 */
export function stillExtends(
 current: { intact: boolean; length: number; head: string },
 hashAt: (position: number) => string | null,
 previous: Witness
): WitnessVerdict {
 if (!current.intact) {
  return { holds: false, because: 'The chain does not verify against itself, so nothing can be said about whether it still contains what was witnessed. An entry has been altered, removed or reordered, and verify() names the first one.' };
 }
 if (previous.length === 0) {
  /* A witness over an empty chain commits to nothing, and saying so is better than answering yes.
     It is the state the whole file exists to make visible, so it must not be the state it blesses. */
  return { holds: false, because: 'That statement was made over an empty chain, which vouches for nothing. A witness is worth something only from the first entry onwards.' };
 }
 if (current.length < previous.length) {
  return { holds: false, because: `The chain now holds ${current.length} entries and ${previous.length} were witnessed. Entries that somebody else has a record of have gone, which is the one thing a hash chain cannot show on its own and the whole reason a head is written down.` };
 }
 const at = hashAt(previous.length);
 if (at === null) {
  return { holds: false, because: `The chain has no entry at position ${previous.length}, although it is long enough to have one. The log has been rebuilt rather than appended to.` };
 }
 if (at !== previous.head) {
  return { holds: false, because: `Entry ${previous.length} now hashes to ${at.slice(0, 16)}… and ${previous.head.slice(0, 16)}… was witnessed. This chain was truncated at or before that point and grown again, so it is a different chain wearing the same length.` };
 }
 return { holds: true, grownBy: current.length - previous.length };
}

/** The head of an empty chain, so a caller does not have to know what it is called. */
export const EMPTY_HEAD = GENESIS;
