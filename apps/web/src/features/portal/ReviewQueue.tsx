import queue from '../../../../../packages/catalog/clinical-review-queue.json' with { type: 'json' };
import protocols from '../../../../../packages/catalog/protocols.json' with { type: 'json' };
import { fill, portalContract, portalRefusal } from '../../lib/portal';
import { Empty, Region, RovingList } from './Parts';

/* The Clinician Review Queue, read from its contract (§6.2).
 *
 * The queue is the one door through which a change to clinical behaviour may move, and today nothing
 * has moved through it: no route has a handler, no entry exists, and the governance board and the
 * Medical Director who would sign an entry are recorded in packages/catalog/protocols.json#governance as
 * not formed and not appointed. So the screen is the contract read aloud — its entries (none), who would
 * sign (nobody yet, and it says so in the record's own state words), the states an entry would move
 * through, what may be proposed, and what the queue refuses.
 *
 * THIS FILE HAS NO BUTTON AND NO HANDLER, and scripts/check-boundaries.mjs fails the build if it grows
 * either while the board is not formed. A sign, ratify, reject or roll-back control on a queue nobody
 * is authorised to sign is the borrowed authority the queue's own refusals exist to refuse — and a
 * disabled one would say nothing about why, which is what the sentence below does instead. */

const board = protocols.governance.board;
const director = protocols.governance.medicalDirector;
const words = portalContract.reviewQueue;
const wordFor = (state: string) => (words.boardWords as Record<string, string>)[state] ?? state;

export function ClinicianReviewQueue() {
 /* The queue has no runtime, so there is no list of entries to read: the contract's own preview is
    the entries section, word for word. */
 const entries: readonly unknown[] = [];
 return <>
  <Empty heading={portalRefusal('no-signature-while-board-not-formed')}>
   {fill(words.noSignature, { board: wordFor(board.status), director: wordFor(director.status) })}
  </Empty>
  <Region title={words.entriesHeading} count={entries.length}>
   <Empty>{queue.preview}</Empty>
  </Region>
  <Region title={words.boardHeading}>
   <dl className="pt-facts">
    <dt>Clinical governance board</dt><dd>{wordFor(board.status)}</dd>
    <dt>Medical Director</dt><dd>{wordFor(director.status)}</dd>
    <dt>Signing capability</dt><dd><code>{queue.capability}</code></dd>
   </dl>
   <p className="helper">{protocols.governance.ratificationProcess.note}</p>
  </Region>
  <Region title={words.statesHeading} count={queue.states.length}>
   <RovingList label={`${queue.states.length} states an entry moves through`} rows={queue.states.map(s => ({
    key: s.id,
    content: <><strong>{s.label}</strong><span>{s.sentence}</span></>
   }))}/>
   <p className="helper">{queue.transitions.appendOnly}</p>
  </Region>
  <Region title={words.tiersHeading} count={queue.tiers.length}>
   <RovingList label={`${queue.tiers.length} kinds of change the queue takes`} rows={queue.tiers.map(tier => ({
    key: String(tier.id),
    content: <><strong>{tier.label}</strong><span>{tier.sentence}</span></>
   }))}/>
  </Region>
  <Region title={words.refusalsHeading} count={queue.refusals.length}>
   <ul className="pt-refusals">{queue.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
