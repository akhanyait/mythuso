import { ArrowRight, Ban, EyeOff, HandCoins, LockKeyhole, UserRoundCheck } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Avatar, AvatarFallback, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui';
import { OfficeFacts, OfficeFigure, OfficeHead, OfficeNote, OfficeSection } from '../surface/Office';
import { scopes } from './Guardian';
import { money } from '../lib/catalog';
import {
 amountOnlyDetail, cannotRequireDetail, day, left, namedDetail, namingNote,
 payingIsNotPermission, readableLines, serviceIsNamed, serviceNameOf, setAside, sponsorContract,
 sponsorshipLink, sponsorshipStateOf, used, visitsPaidFor
} from '../lib/sponsorship';
import { previewHousehold, sponsorWords } from '../lib/household';

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

export function SponsoredCare({ person, relation, navigate, open }: {
 person: string; relation: string; navigate: (page: string) => void; open: (modal: string) => void;
}) {
 const first = person.split(' ')[0];
 /* Her switch, as she has it set. Both wordings are the contract's two line-detail entries, so the
    screen has nothing of its own to say about either. */
 const named = serviceIsNamed;
 const detail = named ? namedDetail : amountOnlyDetail;
 /* The sponsorship as a link into the household, and the lines the Access domain lets through. The
    screen is never handed a service to leave out: statementFor removed it before it got here if her
    line detail says so, which is why the table below can render what it was given without a guard. */
 const link = sponsorshipLink(previewHousehold().householdRef);
 const shown = readableLines(link);
 const standing = sponsorshipStateOf(link.stateCode);
 return <div className="oi-screen sponsor-screen">
  <OfficeHead eyebrow="Thuso Family" title="Care you pay for." lead="What has been used, what it cost, and what paying for it does and does not let you see."/>
  <NotConnected of="payments"/>

  {/* Who, and the three figures a person opening a statement is looking for. The figures are the
      handoff's metric cards on the ground rather than a tinted glass slab around them: three cards in
      one frame would be cards inside a card. */}
  <section className="oi-stack sponsor-lead" aria-label={`Care for ${person}`}>
   <div className="sponsor-who">
    <Avatar size="lg"><AvatarFallback initials={person.split(' ').map(p => p[0]).slice(0, 2).join('')}/></Avatar>
    <div><p className="oi-subtitle">{person}</p><p className="oi-help">{relation}</p></div>
    <Badge variant="accent">Sponsored care</Badge>
   </div>
   <div className="oi-figures">
    <OfficeFigure lead label="You set aside" value={money(setAside)} note="For her care"/>
    <OfficeFigure label="Used so far" value={money(used)} note={`${visitsPaidFor} ${visitsPaidFor === 1 ? 'visit' : 'visits'}`}/>
    <OfficeFigure label="Left to draw on" value={money(left)} note={left > 0 ? 'Available' : 'Nothing left'}/>
   </div>
  </section>

  {/* An amount and a date on every line, and the service only because she has switched that on. */}
  <OfficeSection title="What has been drawn">
   <Card>
    <div className="oi-table-wrap">
     <table className="oi-table sponsor-statement">
      <caption className="visually-hidden">Care paid for out of what you set aside, by date and amount.</caption>
      <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col" className="is-figure">Amount</th></tr></thead>
      <tbody>{shown.map(line => <tr key={line.paidOnDay + line.amountCents}>
       <th scope="row">{day(line.paidOnDay)}</th>
       <td>{serviceNameOf(line.serviceId) ?? 'Care was given'}</td>
       <td className="is-figure">{money(line.amountCents / 100)}</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row" colSpan={2}>Drawn from what you set aside</th><td className="is-figure">{money(used)}</td></tr></tfoot>
     </table>
    </div>
    {/* Not a control. Which of the two settings is on belongs to her, and a switch here — even a
        disabled one — implies it is a thing a sponsor could be given. */}
    <div className="oi-row oi-row--plain sponsor-switch">
     <EyeOff aria-hidden="true"/>
     <div className="oi-row__body"><p className="oi-row__title">{detail.name}</p><span className="oi-row__meta">{detail.detail}</span>
      <span className="oi-row__meta">{first} decides this, in her own account. It is not a setting on this screen and there is no way to ask for it.</span></div>
    </div>
    {named && <CardContent><p className="oi-help">{namingNote}</p></CardContent>}
   </Card>
  </OfficeSection>

  {/* The link itself, said plainly. A sponsorship names a member of a household rather than a person
      typed into a form, which is what version two of the sponsors route exists for. */}
  <Card>
   <CardHeader><CardTitle>{sponsorWords.heading}</CardTitle><CardDescription>{sponsorWords.intro}</CardDescription></CardHeader>
   <CardContent className="oi-card-body">
    <OfficeFacts facts={[
     [sponsorWords.linkedTo.replace('{household}', link.householdRef), link.sponsoredSubjectRef],
     [sponsorWords.stateLabel, standing.name],
     [sponsorWords.detailLabel, detail.name]
    ]}/>
    <p className="oi-help">{sponsorWords.detailIsHers.replace('{who}', first)}</p>
   </CardContent>
  </Card>

  {/* The two lists, side by side and the same size. This is the screen. */}
  <OfficeSection title="What a sponsor sees, and what a sponsor never sees">
   <div className="oi-pair sponsor-columns">
    <Card><CardHeader><CardTitle>What you see</CardTitle></CardHeader>
     <ul className="oi-rows">{sponsorContract.sees.map(s =>
      <li key={s.what}><div className="oi-row"><div className="oi-row__body"><p className="oi-row__title">{s.what}</p><span className="oi-row__meta">{s.why}</span></div></div></li>)}</ul></Card>
    <Card className="sponsor-never"><CardHeader><CardTitle>What you never see</CardTitle></CardHeader>
     <ul className="oi-rows">{sponsorContract.neverSees.map(s =>
      <li key={s.what}><div className="oi-row oi-row--mark"><Ban aria-hidden="true"/><div className="oi-row__body"><p className="oi-row__title">{s.what}</p><span className="oi-row__meta">{s.why}</span></div></div></li>)}</ul></Card>
   </div>
   <OfficeNote refusal icon={<Ban aria-hidden="true"/>}>{cannotRequireDetail.sentence}</OfficeNote>
  </OfficeSection>

  {/* Where the line actually is, joined to the model that draws it. The least MyThuso can grant
      anybody is bookings and payments, and a sponsorship is not even that — it grants nothing, and
      what it would take to grant something is a decision made by her, on her side, with a scope and
      an end date on it. */}
  <OfficeSection title="Paying for care is not access to it">
   <Card><ul className="oi-rows">
    <li><div className="oi-row"><div className="oi-row__body"><p className="oi-row__title">{payingIsNotPermission.title}</p><span className="oi-row__meta">{payingIsNotPermission.sentence}</span></div></div></li>
    <li><div className="oi-row"><div className="oi-row__body"><p className="oi-row__title">The least anybody can be given is more than this</p>
     <span className="oi-row__meta">{scopes[0].title} — {scopes[0].body}</span>
     <span className="oi-row__meta">And that is granted by {first}, from her own account, with an end date on it. A sponsorship grants nothing at all, so there is nothing here to widen.</span></div></div></li>
   </ul></Card>
   <Button variant="secondary" className="oi-full" onClick={() => navigate('My family')} leadingIcon={<LockKeyhole aria-hidden="true"/>}>See what you may see of {first}</Button>
  </OfficeSection>

  <OfficeSection title="How it starts, and how she stops it">
   <Card>
    <div className="oi-row oi-row--plain"><UserRoundCheck aria-hidden="true"/><div className="oi-row__body"><p className="oi-row__title">{sponsorContract.consent.headline}</p><span className="oi-row__meta">{sponsorContract.consent.detail}</span></div></div>
    <CardContent><p className="oi-help">{sponsorContract.consent.withdrawal}</p></CardContent>
   </Card>
  </OfficeSection>

  <div className="oi-stack">
   <Button variant="primary" size="lg" className="oi-full" onClick={() => open('Sponsor care')} leadingIcon={<HandCoins aria-hidden="true"/>}>Add to what you set aside</Button>
   <Button variant="secondary" className="oi-full" onClick={() => navigate('Thuso Wallet')} trailingIcon={<ArrowRight aria-hidden="true"/>}>Open Thuso Wallet</Button>
  </div>
 </div>;
}
