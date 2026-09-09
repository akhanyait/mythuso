import { Ambulance, Activity, Ban, ChevronRight, Languages, MessageCircle, Stethoscope } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Metric, Metrics } from '../surface/Surface';
import { blockedBy } from '../lib/capabilities';
import { liveServices, money, services } from '../lib/catalog';
import { windowHours, windowSentence } from '../lib/cancelling';

/* "Not sure what you need? Chat to our care team."
 *
 * That row sat at the foot of the booking catalogue and opened the four-step booking modal for
 * Vitals & chronic check. It was the only *blocking* row in docs/FLOW-COMPLETENESS.md, and the
 * reason it was blocking rather than merely unfinished is worth writing down: a person who has just
 * said they do not know what to book was silently handed a booking. Not a wrong screen — a wrong
 * answer, given confidently, to a health question, on behalf of somebody who had asked for help.
 *
 * There is no care-team chat and `messaging` is not connected, so the honest close is not a chat
 * window with a fictional agent in it. It is this: what a care team would actually do, said plainly
 * enough that a reader can tell whether they are missing something; the contract's own sentence
 * about why nothing is sent; and then the three things that do exist — the emergency pathway, the
 * catalogue, and the interpreter request — each of which is a real screen this one hands over to.
 *
 * The lead panel is the useful part, and it is useful because it is true: choosing the wrong visit
 * is not the trap the question implies. A nurse assesses what she finds rather than what was
 * booked, a doctor reviews what she found, and the visit can be moved or stood down inside the
 * window the cancellation contract declares. Three figures, all derived, all of them the ones
 * somebody hesitating over a catalogue is actually weighing. */

/* What a coordinator would do before you booked. Written as what the work *is* rather than as a
   feature list, because the point of the section is to let a reader judge what they are without —
   and "24/7 support" tells nobody that. */
const whatACareTeamWouldDo = [
 ['Read what is already on your record', 'Your last readings, what the doctor said about them, and what you were told to watch for — before asking you to describe it again.'],
 ['Ask what changed, and how long it has been going on', 'Two questions that decide most of it: whether this is a check-up, a wound that is not closing, or something that should not wait for a home visit at all.'],
 ['Say which visit fits — or say that none of them does', 'The useful half of this is the second one. A care team that can only sell you a visit is a sales desk.'],
 ['Stay with it', 'The same person answering when you write back the next day, rather than a queue that starts you again.']
] as const;

export function GettingHelp({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 /* The catalogue decides both figures. "Nine services" typed here is nine services until somebody
    adds a tenth, and the cheapest visit is the number a person hesitating is actually weighing. */
 const cheapest = Math.min(...liveServices.map(s => s.price));
 return <>
  <div className="page-intro"><div className="eyebrow">HELP &amp; SUPPORT</div>
   <h1>Not sure what you need?</h1>
   <p>What MyThuso can answer today, what a care team would answer, and where to go when it will not wait.</p></div>
  <NotConnected of="messaging"/>

  <section className="panel glass lead rise-2">
   <div className="lead-head"><div>
    <h2>You do not have to get this right</h2>
    <p>A nurse assesses what she finds at the door, not what was written on the booking. A doctor reviews what she found.</p>
   </div></div>
   <Metrics>
    <Metric value={String(liveServices.length)} label="Visits you can book today" chip={`of ${services.length} in the plan`}/>
    <Metric prefix="R" value={String(cheapest)} label="The least a visit costs" chip="From"/>
    <Metric value={String(windowHours)} unit="h" label="To move it or stand it down" chip="Before the visit"/>
   </Metrics>
   <p className="helper">{windowSentence}</p>
  </section>

  <SectionTitle title="What a care team would be"/>
  <div className="panel">
   <dl className="stated">{whatACareTeamWouldDo.map(([what, why]) =>
    <div key={what}><dt>{what}</dt><dd>{why}</dd></div>)}</dl>
   {/* Why it is not here, from the capability contract rather than from a sentence of this
       screen's own. One line, and it is a supplier and not a design decision — which is worth a
       reader knowing, because it says what would have to change. */}
   <div className="privacy-note alert"><Ban size={19}/>
    <span>None of that is built. {blockedBy('messaging').join(' ')} Nothing on this screen opens a conversation, joins a queue or tells anybody you were here.</span>
   </div>
  </div>

  <SectionTitle title="What you can do now"/>
  <div className="menu-list">
   {/* Emergency first, and first by a distance. Somebody who cannot decide what to book is
       occasionally somebody who should not be booking at all, and the screen behind this row leads
       with 10177 and says in its first line that MyThuso is not an ambulance service. */}
   <button className="menu-row" onClick={() => open('Emergency & urgent care')}>
    <span className="tile-icon"><Ambulance size={19}/></span>
    <span><strong>If it will not wait</strong><small>Ambulance numbers first, then what MyThuso can and cannot do about it</small></span>
    <ChevronRight size={17}/></button>
   <button className="menu-row" onClick={() => navigate('Book a nurse')}>
    <span className="tile-icon"><Stethoscope size={19}/></span>
    <span><strong>Read what each visit is for</strong><small>{liveServices.length} bookable now, each one saying what it covers and what it costs — from {money(cheapest)}</small></span>
    <ChevronRight size={17}/></button>
   <button className="menu-row" onClick={() => navigate('Health Passport')}>
    <span className="tile-icon"><Activity size={19}/></span>
    <span><strong>Look at your own record first</strong><small>Your last readings and what the doctor said about them — often the answer to “has this changed?”</small></span>
    <ChevronRight size={17}/></button>
   {/* The one request on this screen that a person can actually make of MyThuso, so it belongs
       here rather than only in the settings foot. */}
   <button className="menu-row" onClick={() => navigate('Language & access')}>
    <span className="tile-icon"><Languages size={19}/></span>
    <span><strong>Ask for an interpreter, or a language you read</strong><small>Eleven written languages, and a sign-language interpreter asked for by the hour</small></span>
    <ChevronRight size={17}/></button>
  </div>

  <div className="privacy-note"><MessageCircle size={19}/>When messaging is connected this screen gains a way to write to somebody. Until it does, it stays a screen that tells you what is here — which is the only version of it that is not a fiction.</div>
 </>;
}
