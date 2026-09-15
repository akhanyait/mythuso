import { Suspense, lazy, useState } from 'react';
import { CircleAlert, Ear, Globe, Languages, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { capability } from '../lib/capabilities';
import { clinicalRule, fallbackRule, locales, sets, signLanguage, translationHonesty } from '../lib/i18n';
import { Interpreting } from './Interpreting';
/* Language and access, as a screen rather than as a paragraph in a settings dialog.
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
export function Access() {
 const drafted = locales.filter(locale => !locale.reviewed);
 return <>
  <div className="page-intro"><div className="eyebrow">LANGUAGE AND ACCESS</div><h1>Twelve official languages, and what is honestly on offer in each</h1><p>{translationHonesty}</p></div>

  <section className="panel">
   <SectionTitle title="Written languages"/>
   <p className="muted">{fallbackRule}</p>
   <div className="table-scroll">
    <table className="language-table">
     <caption className="visually-hidden">Every interface language, what it covers, whether a person who speaks it has read it, and which language its clinical wording appears in</caption>
     <thead><tr><th scope="col">Language</th><th scope="col">Covers</th><th scope="col">Read by a person</th><th scope="col">Clinical wording</th></tr></thead>
     <tbody>{locales.map(locale => <tr key={locale.code}>
      <th scope="row">{locale.native} <small className="muted">{locale.code}</small></th>
      <td>{sets.filter(set => locale.sets.includes(set.id)).map(set => set.name).join(', ')}</td>
      <td><span className={`review-pill ${locale.reviewed ? 'checked' : 'drafted'}`}>{locale.reviewed ? <ShieldCheck size={14}/> : <CircleAlert size={14}/>}{locale.reviewLabel}</span></td>
      <td>{locale.clinicallyReviewed ? locale.native : 'English'}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <div className="privacy-note"><Languages size={21}/>{drafted.length} of the {locales.length} written languages were drafted by software and have been read by nobody who speaks them. They are offered because a reader given nothing in their language is worse served than one given a draft and told it is a draft — and every screen that offers them says so.</div>
  </section>

  <section className="panel">
   <SectionTitle title="Clinical wording stays in English"/>
   <p>{clinicalRule.sentence}</p>
   <p className="muted">{clinicalRule.mechanism}</p>
   <div className="privacy-note"><Stethoscope size={21}/>{clinicalRule.refusal}</div>
  </section>

  <section className="panel">
   <SectionTitle title={signLanguage.name}/>
   <p className="muted">{signLanguage.status}</p>
   <p>{signLanguage.whyNotInTheList}</p>
   <div className="setting-row"><span><strong>{signLanguage.requirement.label}</strong><small>{signLanguage.requirement.detail}</small></span><span className="review-pill checked"><Ear size={14}/>{signLanguage.requirement.cost}</span></div>
   <h3 className="access-subheading">What a visit and a call must do</h3>
   {signLanguage.mustHappen.map(rule => <div className="access-rule" key={rule.id}><Globe size={19}/><span><strong>{rule.title}</strong>{rule.sentence}</span></div>)}
   <div className="privacy-note"><ShieldCheck size={21}/>{signLanguage.teleconsult.sentence}</div>
   <h3 className="access-subheading">What must never happen</h3>
   {signLanguage.mustNeverHappen.map(rule => <div className="access-rule never" key={rule.id}><X size={19}/><span>{rule.sentence}</span></div>)}
   <div className="empty-note">{signLanguage.notYetBuilt}</div>
  </section>

  <UssdEntry/>

  {/* The accommodation itself, on the same page as the guidance that describes it. Two screens
      would let the promise and the arrangement drift apart, which is precisely the failure the
      paragraph above spent six sentences on. */}
  <Interpreting/>
 </>;
}

/* Booking by USSD sits with language and access because it is the way in for somebody with no smartphone and no data.
   This page is on the patient's first load, so what is here is the capability's name, its notice and one button; the
   menu, its words and the booking rules arrive on a dynamic import when the button is pressed. */
const UssdSimulator = lazy(() => import('./UssdSimulator').then(m => ({ default: m.UssdSimulator })));
function UssdEntry() {
 const [open, setOpen] = useState(false);
 const booking = capability('ussd-booking');
 if (open) return <Suspense fallback={<p className="helper" role="status">{booking.name}</p>}><UssdSimulator/></Suspense>;
 return <section className="panel">
  <SectionTitle title={booking.name}/>
  <NotConnected of={booking.id} tone="inline"/>
  <button type="button" className="secondary" onClick={() => setOpen(true)}>Open the USSD simulator</button>
 </section>;
}
