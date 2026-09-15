import { useState } from 'react';
import { Ban, Building2, HandCoins, Info, LogOut } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
import {
 agree, employerWords, groupName, groupWords, leave, noPooledMoney, payThroughGroup, say, useGroupAdmin, useMembership
} from '../lib/groups';
import type { GroupLineDetail } from '../../../../packages/engines/src/money/domain/groups.ts';
import './group-claims.css';

/* A group that pays for its members, from both sides.
 *
 * THE TREASURER'S SCREEN SHOWS AMOUNTS AND NOTHING ELSE. Every row is what the ledger answered for this group: who
 * agreed, and — only for a member who chose that — the day and the amount of each payment. There is nowhere on this
 * screen for a service, because the answer it draws has no field for one; that is the design rather than a filter.
 *
 * WHAT THE GROUP NEVER HOLDS IS SAID FIRST, not in a footnote. A treasurer opening a screen called "a group that pays
 * for its members" is looking for a balance, and there is none: the group's own account is charged one payment at a
 * time. The sentence is packages/catalog/groups.json's, word for word.
 *
 * "SEE IT AS AN EMPLOYER" IS THE SAME SCREEN WITH ALMOST NOTHING ON IT. An employer is handed no member rows at all,
 * and no count or total until as many employees have agreed as the employer programmes' suppression floor. It is worth
 * being able to look at, because the emptiness is the feature.
 *
 * THE MEMBER'S SCREEN IS WHERE AGREEING HAPPENS. A group invites; nobody is made a member. She chooses how the group's
 * screen reads what it paid for her, from what her group's kind offers, and may leave. Nothing is charged: the preview
 * runs Money's ledger in this tab and the payments capability's notice is on both screens. */

export function GroupAdmin() {
 const [asEmployer, setAsEmployer] = useState(false);
 const view = useGroupAdmin(asEmployer);
 const words = groupWords.admin;
 return <div className="group-admin">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>{words.heading}</h1>
   <p>{words.intro}</p></div>
  <NotConnected of="payments"/>
  <p className="group-holds-nothing"><Info size={15} aria-hidden="true"/>{noPooledMoney}</p>

  <section className="panel">
   <div className="group-figures">
    <div><small>{words.kindLabel}</small><strong>{view.kindName}</strong></div>
    {view.agreed ? <div><small>{words.membersHeading}</small><strong>{view.agreed}</strong></div> : null}
    {view.monthTotal ? <div><small>{words.monthTotal}</small><strong className="group-total">{view.monthTotal}</strong></div> : null}
   </div>
   {view.waiting ? <p className="helper">{view.waiting}</p> : null}
   {/* An employer's screen says what it is not shown, and why, rather than leaving a blank somebody goes and asks about. */}
   {view.employer ? <p className="group-employer" role="note"><Ban size={16} aria-hidden="true"/>
    <span>{employerWords.statement}{view.monthTotal === null ? ` ${employerWords.floorWords}` : ''}</span></p> : null}
  </section>

  <div className="button-row">
   <button className="secondary" aria-pressed={asEmployer} onClick={() => setAsEmployer(!asEmployer)}>
    <Building2 size={16} aria-hidden="true"/>{words.employerPreview}</button>
  </div>

  {view.employer ? null : <>
   <SectionTitle title={words.membersHeading}/>
   <ul className="group-members">{view.rows.map(row => <li key={row.membershipRef} className="group-member-row" data-membership={row.membershipRef}>
    <div><strong>{row.name}</strong><small>{row.stateWords}</small>{row.detail ? <small>{row.detail}</small> : null}</div>
    {row.lines.length
     ? <ul className="group-lines">{row.lines.map(line => <li key={line.day + line.amount}><span>{line.day}</span><strong>{line.amount}</strong></li>)}</ul>
     : <p className="helper">{row.detailId === 'month-total-only' ? words.memberTotalOnly : words.noLines}</p>}
   </li>)}</ul>
  </>}

  <SectionTitle title={words.neverHeading}/>
  <ul className="group-never">{words.never.map(sentence => <li key={sentence}><Ban size={15} aria-hidden="true"/>{sentence}</li>)}</ul>
  <p className="helper">{groupWords.preview}</p>
 </div>;
}

export function GroupMembership() {
 const view = useMembership();
 const words = groupWords.member;
 const [choice, setChoice] = useState<GroupLineDetail>(view.offered[0]!.id as GroupLineDetail);
 return <div className="group-member">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>{words.heading}</h1>
   <p>{words.intro}</p></div>
  <NotConnected of="payments"/>

  <section className="panel">
   <strong>{groupName}</strong>
   <p className="group-state" role="status">{view.words}</p>
   <p className="helper">{view.limit}</p>

   {view.stateCode === 'invited' ? <>
    <fieldset className="group-choice">
     <legend>{words.choose}</legend>
     {view.offered.map(detail => <label key={detail.id}>
      <input type="radio" name="line-detail" value={detail.id} checked={choice === detail.id} onChange={() => setChoice(detail.id as GroupLineDetail)}/>
      <span><strong>{detail.name}</strong><small>{detail.detail}</small></span>
     </label>)}
     {/* An employee is offered one way of reading it, and the reason is on the screen rather than in a refusal she meets. */}
     {view.offered.length === 1 ? <p className="helper">{words.employerOnly}</p> : null}
    </fieldset>
    <button className="primary full" onClick={() => agree(choice)}><HandCoins size={17} aria-hidden="true"/>{say(words.agree)}</button>
   </> : null}

   {view.stateCode === 'member' ? <div className="button-row">
    {view.owed ? <button className="primary" onClick={payThroughGroup}>{say(words.payWith)} · {view.owed.amount}</button> : null}
    <button className="secondary" onClick={leave}><LogOut size={16} aria-hidden="true"/>{say(words.leave)}</button>
   </div> : null}

   {view.said ? <p className="group-said" role="status"><Info size={15} aria-hidden="true"/>{view.said}</p> : null}
  </section>
  <p className="helper">{groupWords.preview}</p>
 </div>;
}
