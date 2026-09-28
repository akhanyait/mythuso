import { Suspense, lazy, useState } from 'react';
import { CircleAlert, Ear, Globe, Languages, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { capability } from '../lib/capabilities';
import { clinicalRule, fallbackRule, locales, sets, signLanguage, translationHonesty } from '../lib/i18n';
import { Interpreting } from './Interpreting';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui';
import { OfficeHead, OfficeNote } from '../surface/Office';
/* Language and access, as a screen rather than as a paragraph in a settings dialog. On the identity of
 * 28 September 2026 (wave 4d), and behind a dynamic import: Access.tsx is the name App.tsx imports, and it
 * is now only the door to this file, so the language table, the interpreter roster and the components
 * they wear are fetched by a reader who opens the page rather than by every patient on her first view.
 *
 *
 * Three things are on this page because they are the three things MyThuso currently owes a reader
 * and cannot yet deliver, and each of them is worse hidden than shown.
 *
 * Eleven written languages, ten of them drafted by software and read by nobody who speaks them. The
 * table says so in each language's own row, because a footnote at the bottom of a page is where a
 * claim goes to avoid being read. It is deliberately not possible to present a language as reviewed
 * here: the state comes from packages/catalog/locales.json, and the build fails if a locale claims
 * a review without naming the person who did it and the day they did it.
 *
 * The clinical language rule, which is a mechanism rather than a policy — there is no clinical key
 * in the locale contract, so a dose or a reference range has nothing to be translated into.
 *
 * And South African Sign Language, which is not in the table above it and says why. What is owed to
 * a Deaf patient is arrangements — a booking that will not complete without an interpreter, a nurse
 * told before she leaves, an interpreter named on the call roster — and six things that must never
 * happen. Writing down what is owed before it exists is the only way the shape of it survives
 * contact with a deadline, and the section under this one is what was written down being carried
 * out: a vetted interpreter, a roster, a visit held rather than dispatched, and a wait that says
 * when it does not know. What is still not built is said there rather than here.
 */
export function AccessPage() {
 const drafted = locales.filter(locale => !locale.reviewed);
 return <div className="oi-screen oi-access">
  <OfficeHead eyebrow="Language and access" title="Twelve official languages, and what is honestly on offer in each" lead={translationHonesty}/>

  <Card>
   <CardHeader><CardTitle>Written languages</CardTitle><CardDescription>{fallbackRule}</CardDescription></CardHeader>
   <div className="oi-table-wrap">
    <table className="oi-table language-table">
     <caption className="visually-hidden">Every interface language, what it covers, whether a person who speaks it has read it, and which language its clinical wording appears in</caption>
     <thead><tr><th scope="col">Language</th><th scope="col">Covers</th><th scope="col">Read by a person</th><th scope="col">Clinical wording</th></tr></thead>
     <tbody>{locales.map(locale => <tr key={locale.code}>
      <th scope="row">{locale.native} <span className="oi-row__meta">{locale.code}</span></th>
      <td>{sets.filter(set => locale.sets.includes(set.id)).map(set => set.name).join(', ')}</td>
      {/* The state in words, with a mark that differs by shape: a shield for read, a warning for drafted. */}
      <td><Badge variant={locale.reviewed ? 'success' : 'warning'} className="review-pill">{locale.reviewed ? <ShieldCheck aria-hidden="true" className="oi-badge-mark"/> : <CircleAlert aria-hidden="true" className="oi-badge-mark"/>}{locale.reviewLabel}</Badge></td>
      <td>{locale.clinicallyReviewed ? locale.native : 'English'}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <CardContent><OfficeNote icon={<Languages aria-hidden="true"/>}>{drafted.length} of the {locales.length} written languages were drafted by software and have been read by nobody who speaks them. They are offered because a reader given nothing in their language is worse served than one given a draft and told it is a draft — and every screen that offers them says so.</OfficeNote></CardContent>
  </Card>

  <Card>
   <CardHeader><CardTitle>Clinical wording stays in English</CardTitle></CardHeader>
   <CardContent className="oi-card-body">
    <p className="oi-lead oi-lead--ink">{clinicalRule.sentence}</p>
    <p className="oi-help">{clinicalRule.mechanism}</p>
    <OfficeNote refusal icon={<Stethoscope aria-hidden="true"/>}>{clinicalRule.refusal}</OfficeNote>
   </CardContent>
  </Card>

  <Card>
   <CardHeader><CardTitle>{signLanguage.name}</CardTitle><CardDescription>{signLanguage.status}</CardDescription></CardHeader>
   <CardContent className="oi-card-body">
    <p className="oi-lead oi-lead--ink">{signLanguage.whyNotInTheList}</p>
    <div className="oi-row oi-row--plain oi-row--boxed"><Ear aria-hidden="true"/><div className="oi-row__body"><p className="oi-row__title">{signLanguage.requirement.label}</p><span className="oi-row__meta">{signLanguage.requirement.detail}</span><span className="oi-row__meta oi-row__meta--strong">{signLanguage.requirement.cost}</span></div></div>
    <h3 className="oi-subtitle">What a visit and a call must do</h3>
    <ul className="oi-rows oi-rows--flush">{signLanguage.mustHappen.map(rule => <li key={rule.id}><div className="oi-row oi-row--plain access-rule"><Globe aria-hidden="true"/><div className="oi-row__body"><p className="oi-row__title">{rule.title}</p><span className="oi-row__meta">{rule.sentence}</span></div></div></li>)}</ul>
    <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{signLanguage.teleconsult.sentence}</OfficeNote>
    <h3 className="oi-subtitle">What must never happen</h3>
    <ul className="oi-rows oi-rows--flush">{signLanguage.mustNeverHappen.map(rule => <li key={rule.id}><div className="oi-row oi-row--mark access-rule never"><X aria-hidden="true"/><p className="oi-row__title">{rule.sentence}</p></div></li>)}</ul>
    <OfficeNote icon={<CircleAlert aria-hidden="true"/>}>{signLanguage.notYetBuilt}</OfficeNote>
   </CardContent>
  </Card>

  <UssdEntry/>

  {/* The accommodation itself, on the same page as the guidance that describes it. Two screens
      would let the promise and the arrangement drift apart, which is precisely the failure the
      paragraph above spent six sentences on. */}
  <Interpreting/>
 </div>;
}

/* Booking by USSD sits with language and access because it is the way in for somebody with no smartphone and no data.
   What is here is the capability's name, its notice and one button; the menu, its words and the booking rules arrive
   on a dynamic import of their own when the button is pressed. */
const UssdSimulator = lazy(() => import('./UssdSimulator').then(m => ({ default: m.UssdSimulator })));
function UssdEntry() {
 const [open, setOpen] = useState(false);
 const booking = capability('ussd-booking');
 if (open) return <Suspense fallback={<p className="oi-help" role="status">{booking.name}</p>}><UssdSimulator/></Suspense>;
 return <Card>
  <CardHeader><CardTitle>{booking.name}</CardTitle></CardHeader>
  <CardContent className="oi-card-body">
   <NotConnected of={booking.id} tone="inline"/>
   <div className="oi-actions"><Button variant="secondary" onClick={() => setOpen(true)}>Open the USSD simulator</Button></div>
  </CardContent>
 </Card>;
}
