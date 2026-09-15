import { Clock3, ShieldAlert, UserRound } from 'lucide-react';
import closedLoop from '../../../../packages/catalog/closed-loop.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { nextHolder, postOf, stateCodeOf, towerOrder, type Loop } from '../../../../packages/engines/src/core/domain/loops.ts';
import { useConcerns, type Skipped } from '../lib/closed-loop';

/* The Control Tower's concerns on the escalation rota: for each open concern, who holds it now, which rung of
 * the rota it has reached, when it moves up if nobody takes it on, what it skipped on the way, and when it
 * ran out of people.
 *
 * Every word is packages/catalog/closed-loop.json's screen, and every post, role and minute is the rota the
 * concern kept — never the rota in force now, which may say something different about a concern opened
 * before an admin changed it. So nothing here names a post, a role or a time, and the board reads the same
 * arithmetic the engine does: packages/engines/src/core/domain/loops.ts decides whether anybody comes after
 * the holder, and the order is its towerOrder, exhausted first.
 *
 * Read-only on purpose. Taking a concern on and closing it with an outcome are the engine's routes, and a
 * button here that pretended to do either would page nobody while saying it had. */
const say = closedLoop.screen;
const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const clockOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: scheduling.timezone });
const roleName = (id: string) => vetting.roles.find(role => role.id === id)?.name ?? id;
const engineName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const postLabel = (loop: Loop, id: string) => loop.rota.posts.find(post => post.id === id)?.label ?? id;

export function ConcernBoard() {
 const s = useConcerns();
 const rows = towerOrder(s.loops);
 const exhausted = rows.filter(loop => loop.exhaustedAt !== null).length;
 return <section className="cl-board" aria-labelledby="cl-board-title">
  <div className="cl-board-head">
   <h2 id="cl-board-title">{say.heading}</h2>
   <p>{fill(say.count, { open: String(rows.length), exhausted: String(exhausted) })}</p>
  </div>
  <p className="cl-intro">{say.intro}</p>
  {rows.length === 0 && <p className="cl-empty">{say.empty}</p>}
  <ol className="cl-list">{rows.map(loop => <ConcernRow key={loop.loopRef} loop={loop} skipped={s.skipped[loop.loopRef] ?? []}/>)}</ol>
  <p className="cl-preview" role="note">{say.preview}</p>
 </section>;
}

function ConcernRow({ loop, skipped }: { loop: Loop; skipped: readonly Skipped[] }) {
 const state = stateCodeOf(loop);
 const post = postOf(loop);
 const where = loop.holder.kind === 'post' ? fill(say.onRung, { rung: String(loop.holder.index + 1), rungs: String(loop.rota.posts.length) })
  : loop.holder.kind === 'fallback' ? say.withFallback : loop.holder.kind === 'every-post' ? say.everyPost : say.withOwner;
 const holds = loop.holder.kind === 'every-post'
  ? (loop.alerted ?? []).map(id => postLabel(loop, id)).join(', ')
  : post ? fill(say.holds, { holder: post.label, role: roleName(loop.ownerRole) }) : roleName(loop.ownerRole);
 const next = state === 'exhausted' ? fill(say.exhausted, { at: clockOf(loop.exhaustedAt!) })
  : state === 'acknowledged' ? fill(say.acknowledged, { at: clockOf(loop.acknowledgedAt!) })
  : nextHolder(loop, loop.dueBy).holder ? fill(say.movesUp, { at: clockOf(loop.dueBy) }) : fill(say.lastRung, { at: clockOf(loop.dueBy) });
 return <li className={'cl-row is-' + state}>
  <div className="cl-row-line">
   <span className="cl-row-ref">{loop.loopRef}</span>
   <span className="cl-row-from">{fill(say.from, { engine: engineName(loop.sourceEngine) })}</span>
   <span className="cl-row-rung">{where}</span>
  </div>
  <p className="cl-row-holds"><UserRound size={14} aria-hidden="true"/>{holds}</p>
  <p className="cl-row-next">{state === 'exhausted' ? <ShieldAlert size={14} aria-hidden="true"/> : <Clock3 size={14} aria-hidden="true"/>}{next}</p>
  {skipped.map(skip => <p className="cl-row-note" key={`${skip.post}-${skip.at}`}>
   {skip.because === 'off-duty' ? fill(say.skippedOffDuty, { post: postLabel(loop, skip.post), at: clockOf(skip.at) }) : fill(say.skippedNoRole, { post: postLabel(loop, skip.post) })}
  </p>)}
  <p className="cl-row-version">{fill(say.rotaVersion, { version: String(loop.rota.settingsVersion) })}</p>
 </li>;
}
