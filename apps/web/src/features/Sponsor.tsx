import { ArrowRight, Ban, EyeOff, HandCoins, LockKeyhole, UserRoundCheck } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Metric, Metrics } from '../surface/Surface';
import { scopes } from './Guardian';
import { money } from '../lib/catalog';
import {
 amountOnlyDetail, cannotRequireDetail, day, left, lines, namedDetail, namingNote,
 payingIsNotPermission, serviceIsNamed, setAside, sponsorContract, used, visitsPaidFor
} from '../lib/sponsorship';

/* What you are paying for, and what paying for it does not buy you.
 *
 * "Sponsored care" has been a word under a family member's name on the home screen since the family
 * screens were written, and there has never been anything behind it. The back office could see a
 * sponsor's statement; the person actually paying could not see what they had bought, what was left,
 * or — the part this screen exists for — where the line is between the two.
 *
 * The design decision worth defending is that the refusal is not a footnote. Two columns, equal
 * weight, side by side: what you see, and what you never see. A screen that lists the four things a
 * sponsor is shown and then mentions in grey underneath that the clinical record is off limits has
 * ordered those two facts by how comfortable they are, and the second one is the one somebody is
 * going to test.
 *
 * The recipient's switch is here as a fact and not as a control. Whether the statement names the
 * service is hers to decide, per sponsor, from her own account — "a line reading sexual health
 * screening discloses more than most diagnoses do" — so this screen shows which way it is set and
 * offers no way to change it. A disabled toggle would have been worse than none: it says the sponsor
 * is the sort of person who might be allowed to turn it on.
 *
 * Every sentence is packages/catalog/programmes.json's. Every amount is a service's own price out of
 * services.json, because a sponsored visit is not a different visit and there is nowhere in the
 * contract to type a figure. Nothing is paid, no statement is issued, and no sponsorship exists. */

/* The figure without its symbol, so a metric can set the R small and leading the way the design
   language asks. Derived from money() rather than formatted again — the grouping and the rounding
   stay the catalogue's. */
const figure = (n: number) => money(n).replace(/^R\s*/, '');

export function SponsoredCare({ person, relation, navigate, open }: {
 person: string; relation: string; navigate: (page: string) => void; open: (modal: string) => void;
}) {
 const first = person.split(' ')[0];
 /* Her switch, as she has it set. Both wordings are the contract's two line-detail entries, so the
    screen has nothing of its own to say about either. */
 const named = serviceIsNamed;
 const detail = named ? namedDetail : amountOnlyDetail;
 return <>
  <div className="page-intro"><div className="eyebrow">THUSO FAMILY</div>
   <h1>Care you pay for.</h1>
   <p>What has been used, what it cost, and what paying for it does and does not let you see.</p></div>
  <NotConnected of="payments"/>

  {/* Who, and the three figures a person opening a statement is looking for. */}
  <section className="panel glass lead sponsor-lead rise-2">
   <div className="lead-head">
    <div className="sponsor-who">
     <span className="avatar peach">{person.split(' ').map(p => p[0]).slice(0, 2).join('')}</span>
     <div><strong>{person}</strong><small>{relation}</small></div>
    </div>
    <Pill tone="teal">Sponsored care</Pill>
   </div>
   <Metrics>
    <Metric prefix="R" value={figure(setAside)} label="You set aside" chip="For her care"/>
    <Metric prefix="R" value={figure(used)} label="Used so far" chip={`${visitsPaidFor} ${visitsPaidFor === 1 ? 'visit' : 'visits'}`}/>
    <Metric prefix="R" value={figure(left)} label="Left to draw on" chip={left > 0 ? 'Available' : 'Nothing left'}/>
   </Metrics>
  </section>

  {/* An amount and a date on every line, and the service only because she has switched that on. */}
  <SectionTitle title="What has been drawn"/>
  <div className="panel">
   <div className="table-scroll">
    <table className="chart-table fact-table sponsor-statement">
     <caption className="visually-hidden">Care paid for out of what you set aside, by date and amount.</caption>
     <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Amount</th></tr></thead>
     <tbody>{lines.map(line => <tr key={line.on + line.service}>
      <th scope="row">{day(line.on)}</th>
      <td>{named ? line.service : 'Care was given'}</td>
      <td>{money(line.amount)}</td>
     </tr>)}</tbody>
     <tfoot><tr><th scope="row" colSpan={2}>Drawn from what you set aside</th><td>{money(used)}</td></tr></tfoot>
    </table>
   </div>
   {/* Not a control. Which of the two settings is on belongs to her, and a switch here — even a
       disabled one — implies it is a thing a sponsor could be given. */}
   <div className="record-row static sponsor-switch">
    <span className="service-icon"><EyeOff size={20}/></span>
    <span><strong>{detail.name}</strong><small>{detail.detail}</small>
     <small>{first} decides this, in her own account. It is not a setting on this screen and there is no way to ask for it.</small></span>
   </div>
   {named && <p className="helper">{namingNote}</p>}
  </div>

  {/* The two lists, side by side and the same size. This is the screen. */}
  <SectionTitle title="What a sponsor sees, and what a sponsor never sees"/>
  <div className="sponsor-columns">
   <div className="panel"><h3>What you see</h3>
    <dl className="stated">{sponsorContract.sees.map(s =>
     <div key={s.what}><dt>{s.what}</dt><dd>{s.why}</dd></div>)}</dl></div>
   <div className="panel sponsor-never"><h3>What you never see</h3>
    <dl className="stated">{sponsorContract.neverSees.map(s =>
     <div key={s.what}><dt>{s.what}</dt><dd>{s.why}</dd></div>)}</dl></div>
  </div>
  <div className="privacy-note alert"><Ban size={19}/>{cannotRequireDetail.sentence}</div>

  {/* Where the line actually is, joined to the model that draws it. The least MyThuso can grant
      anybody is bookings and payments, and a sponsorship is not even that — it grants nothing, and
      what it would take to grant something is a decision made by her, on her side, with a scope and
      an end date on it. */}
  <SectionTitle title="Paying for care is not access to it"/>
  <div className="panel"><dl className="stated">
   <div><dt>{payingIsNotPermission.title}</dt><dd>{payingIsNotPermission.sentence}</dd></div>
   <div><dt>The least anybody can be given is more than this</dt>
    <dd>{scopes[0].title} — {scopes[0].body}</dd>
    <small>And that is granted by {first}, from her own account, with an end date on it. A sponsorship grants nothing at all, so there is nothing here to widen.</small></div>
  </dl></div>
  <button className="secondary full" onClick={() => navigate('My family')}><LockKeyhole size={16}/>See what you may see of {first}</button>

  <SectionTitle title="How it starts, and how she stops it"/>
  <div className="panel">
   <div className="record-row static">
    <span className="service-icon"><UserRoundCheck size={20}/></span>
    <span><strong>{sponsorContract.consent.headline}</strong><small>{sponsorContract.consent.detail}</small></span>
   </div>
   <p className="helper">{sponsorContract.consent.withdrawal}</p>
  </div>

  <button className="primary full" onClick={() => open('Sponsor care')}><HandCoins size={17}/>Add to what you set aside</button>
  <button className="secondary full" onClick={() => navigate('Thuso Wallet')}>Open Thuso Wallet<ArrowRight size={17}/></button>
 </>;
}
