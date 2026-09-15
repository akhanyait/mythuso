import { useState } from 'react';
import { Clock3, ShieldAlert, UserRound } from 'lucide-react';
import closedLoop from '../../../../packages/catalog/closed-loop.json' with { type: 'json' };
import coreApi from '../../../../packages/catalog/apis/core.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { nextHolder, postOf, stateCodeOf, towerOrder, type Loop } from '../../../../packages/engines/src/core/domain/loops.ts';
import { apiRoutes } from '../lib/apis.generated';
import { closeConcern, useConcerns, type Skipped } from '../lib/closed-loop';
import { roleOf } from '../lib/roles';
import { escalationRotaNow } from '../lib/settings';
import { subjectById } from '../lib/vetting-fixtures';

/* The Control Tower's concerns on the escalation rota: who holds each post of the rota in force, and for each
 * open concern who holds it now, which rung of the rota it has reached, when it moves up if nobody takes it
 * on, what it skipped on the way, and when it ran out of people.
 *
 * Every word is packages/catalog/closed-loop.json's screen, and every post, role and minute of a concern is
 * the rota the concern kept — never the rota in force now, which may say something different about a concern
 * opened before an admin changed it. The posts list above the concerns is the rota in force, because it
 * answers a different question: who a concern opened now would go to. So nothing here names a post, a role or
 * a time, and the board reads the same arithmetic the engine does: packages/engines/src/core/domain/loops.ts
 * decides whether anybody comes after the holder, and the order is its towerOrder, exhausted first.
 *
 * CLOSING. The Control Tower closes a concern with one of the outcomes the closed loop lists, refused by the
 * same closeRefusal the engine's close route asks, in that route's own sentences. Who may close is that route's
 * callers, read from the generated contract, and the workspace's role is read from the door's own table and
 * the vetting register rather than typed. A close is held in this tab's memory and sends nothing to anybody,
 * and the board says so beside every concern it closed. Taking a concern on stays the engine's alone: an
 * acknowledgement here would stop a clock that pages nobody while saying it had. */
const say = closedLoop.screen;
const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const clockOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: scheduling.timezone });
const roleName = (id: string) => vetting.roles.find(role => role.id === id)?.name ?? id;
const engineName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const postLabel = (loop: Loop, id: string) => loop.rota.posts.find(post => post.id === id)?.label ?? id;
const outcomes = closedLoop.outcomes.value;
const outcomeLabel = (id: string | null) => outcomes.find(outcome => outcome.id === id)?.label ?? id ?? '';

/* The close route the board follows, and the sentence it refuses each id in. */
const closeRoute = apiRoutes.postCoreLoopsByLoopRefCloseV2;
const closeSentence = (id: string) => coreApi.routes
 .find(route => route.method === closeRoute.method && route.path === closeRoute.path && route.version === closeRoute.version)
 ?.refusals.find(refusal => refusal.id === id)?.statement ?? id;

/* The role this workspace opens as, from the party the door signs it in as. */
const workspaceParty = roleOf('control-tower').subjectId;
const workspaceRole = workspaceParty ? subjectById(workspaceParty)?.roleId ?? null : null;

export function ConcernBoard() {
 const s = useConcerns();
 const rows = towerOrder(s.loops);
 const closed = s.loops.filter(loop => loop.closedAt !== null);
 const exhausted = rows.filter(loop => loop.exhaustedAt !== null).length;
 const mayClose = workspaceRole !== null && (closeRoute.callers as readonly string[]).includes(workspaceRole);
 const posts = escalationRotaNow().posts;
 return <section className="cl-board" aria-labelledby="cl-board-title">
  <div className="cl-board-head">
   <h2 id="cl-board-title">{say.heading}</h2>
   <p>{fill(say.count, { open: String(rows.length), exhausted: String(exhausted) })}</p>
  </div>
  <p className="cl-intro">{say.intro}</p>
  <div className="cl-posts">
   <h3 id="cl-posts-title">{say.postsHeading}</h3>
   <ul aria-labelledby="cl-posts-title">{posts.map(post => <li key={post.id}>
    {post.role ? fill(say.postHeld, { post: post.label, role: roleName(post.role) }) : fill(say.postNotHeld, { post: post.label })}
   </li>)}</ul>
  </div>
  {rows.length === 0 && <p className="cl-empty">{say.empty}</p>}
  <ol className="cl-list">{rows.map(loop => <ConcernRow key={loop.loopRef} loop={loop} skipped={s.skipped[loop.loopRef] ?? []} byRole={mayClose ? workspaceRole : null}/>)}</ol>
  {closed.map(loop => <p className="cl-closed" role="status" key={loop.loopRef}>
   {fill(say.closed, { loopRef: loop.loopRef, at: clockOf(loop.closedAt!), outcome: outcomeLabel(loop.outcomeCode) })}
  </p>)}
  {!mayClose && <p className="cl-row-note">{say.closeNotYours}</p>}
  <p className="cl-preview" role="note">{say.preview}</p>
 </section>;
}

function ConcernRow({ loop, skipped, byRole }: { loop: Loop; skipped: readonly Skipped[]; byRole: string | null }) {
 const [closing, setClosing] = useState(false);
 const [chosen, setChosen] = useState('');
 const [refusal, setRefusal] = useState<string | null>(null);
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
 const legend = fill(say.closeLegend, { loopRef: loop.loopRef });
 const confirm = () => {
  const refused = byRole ? closeConcern(loop.loopRef, chosen, byRole) : null;
  setRefusal(refused ? closeSentence(refused) : null);
 };
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
  {byRole && !closing && <button type="button" className="secondary cl-close" onClick={() => setClosing(true)}>{say.close}</button>}
  {byRole && closing && <div className="cl-close-form">
   <fieldset className="cf-choices">
    <legend>{legend}</legend>
    {outcomes.map(outcome => <label className="cf-choice" key={outcome.id}>
     <input type="radio" name={`close-${loop.loopRef}`} checked={chosen === outcome.id} onChange={() => { setChosen(outcome.id); setRefusal(null); }}/>{outcome.label}
    </label>)}
   </fieldset>
   {refusal && <p className="cl-refusal" role="alert">{refusal}</p>}
   <div className="cl-close-actions">
    <button type="button" onClick={confirm}>{say.confirmClose}</button>
    <button type="button" className="secondary" onClick={() => { setClosing(false); setChosen(''); setRefusal(null); }}>{say.cancelClose}</button>
   </div>
  </div>}
 </li>;
}
