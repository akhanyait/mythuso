import { useState } from 'react';
import { Ban, Building2, HandCoins, Info, LogOut } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Button, Card, CardContent } from '../ui';
import { OfficeHead, OfficeSection } from '../surface/Office';
import './group-claims.css';
import {
 agree, employerWords, groupName, groupWords, leave, noPooledMoney, payThroughGroup, say, useGroupAdmin, useMembership
} from '../lib/groups';
import type { GroupLineDetail } from '../../../../packages/engines/src/money/domain/groups.ts';


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
 return <div className="oi-screen group-admin">
  <OfficeHead eyebrow="Thuso Money" title={words.heading} lead={words.intro}/>
  <NotConnected of="payments"/>
  <p className="oi-note"><Info aria-hidden="true"/><span className="group-holds-nothing">{noPooledMoney}</span></p>

  <Card padding="md" className="oi-card-body">
   <div className="oi-figures group-figures">
    <div className="group-figure"><span className="oi-eyebrow">{words.kindLabel}</span><strong>{view.kindName}</strong></div>
    {view.agreed ? <div className="group-figure"><span className="oi-eyebrow">{words.membersHeading}</span><strong>{view.agreed}</strong></div> : null}
    {view.monthTotal ? <div className="group-figure"><span className="oi-eyebrow">{words.monthTotal}</span><strong className="group-total">{view.monthTotal}</strong></div> : null}
   </div>
   {view.waiting ? <p className="oi-help">{view.waiting}</p> : null}
   {/* An employer's screen says what it is not shown, and why, rather than leaving a blank somebody goes and asks about. */}
   {view.employer ? <p className="oi-note oi-note--refusal group-employer" role="note"><Ban aria-hidden="true"/>
    <span>{employerWords.statement}{view.monthTotal === null ? ` ${employerWords.floorWords}` : ''}</span></p> : null}
   <div className="oi-actions">
    <Button variant="secondary" aria-pressed={asEmployer} onClick={() => setAsEmployer(!asEmployer)} leadingIcon={<Building2 aria-hidden="true"/>}>{words.employerPreview}</Button>
   </div>
  </Card>

  {view.employer ? null : <OfficeSection title={words.membersHeading}>
   <Card><ul className="oi-rows group-members">{view.rows.map(row => <li key={row.membershipRef}><div className="oi-row group-member-row" data-membership={row.membershipRef}>
    <div className="oi-row__body"><p className="oi-row__title">{row.name}</p><span className="oi-row__meta">{row.stateWords}</span>{row.detail ? <span className="oi-row__meta">{row.detail}</span> : null}</div>
    {row.lines.length
     ? <ul className="group-lines">{row.lines.map(line => <li key={line.day + line.amount}><span>{line.day}</span><strong>{line.amount}</strong></li>)}</ul>
     : <p className="oi-row__meta">{row.detailId === 'month-total-only' ? words.memberTotalOnly : words.noLines}</p>}
   </div></li>)}</ul></Card>
  </OfficeSection>}

  <OfficeSection title={words.neverHeading}>
   <Card><ul className="oi-rows group-never">{words.never.map(sentence => <li key={sentence}><div className="oi-row oi-row--mark"><Ban aria-hidden="true"/><p className="oi-row__title">{sentence}</p></div></li>)}</ul></Card>
   <p className="oi-help">{groupWords.preview}</p>
  </OfficeSection>
 </div>;
}

export function GroupMembership() {
 const view = useMembership();
 const words = groupWords.member;
 const [choice, setChoice] = useState<GroupLineDetail>(view.offered[0]!.id as GroupLineDetail);
 return <div className="oi-screen group-member">
  <OfficeHead eyebrow="Thuso Money" title={words.heading} lead={words.intro}/>
  <NotConnected of="payments"/>

  <Card>
   <CardContent className="oi-card-body">
    <p className="oi-subtitle">{groupName}</p>
    <p className="group-state" role="status">{view.words}</p>
    <p className="oi-help">{view.limit}</p>

    {view.stateCode === 'invited' ? <>
     <fieldset className="oi-choices group-choice">
      <legend>{words.choose}</legend>
      {view.offered.map(detail => <label key={detail.id} className="oi-radio">
       <input type="radio" name="line-detail" value={detail.id} checked={choice === detail.id} onChange={() => setChoice(detail.id as GroupLineDetail)}/>
       <span><strong>{detail.name}</strong><small>{detail.detail}</small></span>
      </label>)}
      {/* An employee is offered one way of reading it, and the reason is on the screen rather than in a refusal she meets. */}
      {view.offered.length === 1 ? <p className="oi-help">{words.employerOnly}</p> : null}
     </fieldset>
     <Button variant="primary" size="lg" className="oi-full" onClick={() => agree(choice)} leadingIcon={<HandCoins aria-hidden="true"/>}>{say(words.agree)}</Button>
    </> : null}

    {view.stateCode === 'member' ? <div className="oi-actions">
     {view.owed ? <Button variant="primary" onClick={payThroughGroup}>{say(words.payWith)} · {view.owed.amount}</Button> : null}
     <Button variant="secondary" onClick={leave} leadingIcon={<LogOut aria-hidden="true"/>}>{say(words.leave)}</Button>
    </div> : null}

    {view.said ? <p className="oi-note group-said" role="status"><Info aria-hidden="true"/><span>{view.said}</span></p> : null}
   </CardContent>
  </Card>
  <p className="oi-help">{groupWords.preview}</p>
 </div>;
}
