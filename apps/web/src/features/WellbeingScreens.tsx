/* Live well, the journal, and what was brought to a visit, behind a dynamic import since the design handoff of 28 September
   2026: none of it is on a patient's first view. Wellbeing.tsx keeps the names the application imports and hands
   each screen over on the first press — see deferred.tsx. */
import { useId, useRef, useState } from 'react';
import { ArrowRight, Ban, CalendarDays, Moon, MessageSquareQuote, NotebookPen, PersonStanding, Tablets, Trash2, Utensils } from 'lucide-react';
import { EmptyNote, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import {
 capabilityId, dayLabelOf, days, habitById, habits, refusal, refusalsElsewhere,
 takingItToAClinician, timeOf, timeline, whatItIs, type Entry
} from '../lib/wellbeing';

/* Live well — the healthy-living tab, and the only screen in MyThuso that talks to somebody about
 * their own body with no clinician in the room.
 *
 * It is drawn out of what it will not draw, and the absences are deliberate enough to be worth
 * naming, because every one of them is a normal product decision anywhere else:
 *
 *   Nothing on this page is a figure. No count of days written, no proportion of habits filled in,
 *   no line through a week. The rest of the patient app is built on the reference's signature move
 *   — a large thin numeral with a small label under it — and this is the one screen that does not
 *   get one. There is nothing here that could honestly be set in that type, and a figure invented
 *   so the screen would look like the others is exactly the harm: a body's week with a line of best
 *   fit through it is an interpretation, and an interpretation of somebody's health is a clinical
 *   act that nobody in this product performed.
 *
 *   Nothing on this page says how the reader is doing. No tick, no encouragement, no nudge about a
 *   day nothing was written. Silence is the respectful default, and it is respectful for a specific
 *   reason: cheerfulness aimed at somebody whose condition is getting worse reads as a product that
 *   has not noticed.
 *
 *   The days with something on them are the only days drawn. A day nobody wrote on is not a row, an
 *   outline, a faded tile or a dash. It is absent, which is what a day is.
 *
 * The habit is chosen before the field is typed in, so the field has exactly one prompt above it
 * and that prompt is the contract's. Five stacked boxes would have been the obvious build and it is
 * the wrong one twice over: it reads as a form somebody is expected to complete, which makes four
 * empty boxes a judgement, and it takes the person's own words and files them under five headings
 * before they have written anything.
 *
 * Every sentence with a refusal in it comes from packages/catalog/wellbeing.json and is rendered
 * word for word. The capability notice comes from capabilities.json through NotConnected, and says
 * the one thing this screen most has to be honest about: nothing typed here is stored. */

const habitIcons: Record<string, typeof PersonStanding> = {
 /* Moving is a person, not a footprint: a footprint is a step, a step is a count, and a count is
    the first thing somebody assumes this screen is doing. */
 moving: PersonStanding, eating: Utensils, sleeping: Moon, feeling: MessageSquareQuote, medicines: Tablets
};

type Props = {
 entries: Entry[];
 onWrite: (habit: string, words: string) => void;
 onRemove: (id: string) => void;
 /** The reference of the next visit, or nothing when none is booked. */
 nextVisit: string | null;
 viewVisit: (id: string) => void;
 navigate: (page: string) => void;
};

export function LiveWell({ entries, onWrite, onRemove, nextVisit, viewVisit, navigate }: Props) {
 return <>
  <div className="page-intro"><div className="eyebrow">LIVE WELL</div>
   <h1>In your own words</h1>
   <p>{whatItIs.statement}</p></div>
  <NotConnected of={capabilityId}/>
  <section className="wb-atmosphere"><span aria-hidden="true"><Moon size={28}/></span><div><h2>A moment to check in.</h2><p>Choose a topic below and write what matters to you today.</p></div></section>
  <div className="wb-columns">
   <div className="wb-main">
    {/* The sentence the whole feature stands on, above the field rather than in the small print
        under the thing somebody has already typed into it. */}
    <div className="privacy-note wb-standing"><Ban size={19}/>
     <span>{refusal('no-diagnosis')} {whatItIs.isNot}</span>
    </div>
    <Composer onWrite={onWrite}/>
    <SectionTitle title="What you have written"/>
    <p className="helper wb-record-lead"><CalendarDays size={16}/><span>{timeline.statement}</span></p>
    <Record entries={entries} onRemove={onRemove}/>
   </div>
   <div className="wb-side">
    {/* The useful thing a diary does is get read out loud in a room with a nurse in it. So the whole
        of this is a door to the visit, and the sentence under it is the contract's own account of
        how little happens: nothing is copied anywhere until a clinician records it. */}
    <div className="panel wb-bring">
     <div className="wb-bring-head"><span className="tile-icon"><NotebookPen size={19}/></span>
      <div><h3>{takingItToAClinician.statement}</h3><p>{takingItToAClinician.howItWorks}</p></div></div>
     {/* Secondary, both of them. The lime pill is the one bright thing on a screen and it belongs to
         the field: a second one here would have a person choosing between writing something down
         and leaving, with the two offers shouting equally. */}
     {nextVisit
      ? <button className="secondary" onClick={() => viewVisit(nextVisit)}>Open my next visit<ArrowRight size={17}/></button>
      : <button className="secondary" onClick={() => navigate('Book a nurse')}>Book a visit<ArrowRight size={17}/></button>}
    </div>
    <SectionTitle title="What MyThuso will not do here"/>
    {/* Seven of the ten. The other three are rendered where each of them bites — beside the heading,
        beside the field, and above the record — because a refusal read at the foot of a page by
        somebody who has already typed is a refusal that arrived late. */}
    <div className="wb-refusals">{refusalsElsewhere.map(r =>
     <div className="wb-refusal" key={r.id}><Ban size={18}/><p>{r.sentence}</p></div>)}</div>
   </div>
  </div>
 </>;
}

function Composer({ onWrite }: { onWrite: (habit: string, words: string) => void }) {
 const [habit, setHabit] = useState(habits[0].id);
 const [words, setWords] = useState('');
 /* One live region for both things this panel has to say, and neither of them is praise. "Written
    down" is feedback that a control did something, which a screen reader needs and a sighted reader
    gets from the record moving; "nothing in the box" is the only correction on the page and it is
    about the box. */
 const [said, setSaid] = useState('');
 const field = useRef<HTMLTextAreaElement>(null);
 const fieldId = useId();
 const chosen = habitById(habit);
 const submit = () => {
  if (!words.trim()) { setSaid('There is nothing in the box to write down yet.'); field.current?.focus(); return; }
  onWrite(habit, words);
  setWords('');
  setSaid('Written down. It is at the top of your record.');
  field.current?.focus();
 };
 return <section className="panel glass lead wb-write rise-2">
  <fieldset className="wb-choose">
   <legend>What do you want to write down?</legend>
   <div className="wb-habits">{habits.map(h => {
    const Icon = habitIcons[h.id];
    return <label key={h.id} className={`wb-habit${h.id === habit ? ' selected' : ''}`}>
     <input type="radio" name="wb-habit" value={h.id} checked={h.id === habit}
      onChange={event => { setHabit(event.currentTarget.value); setSaid(''); }}/>
     <Icon size={18} aria-hidden="true"/><span>{h.name}</span>
    </label>;
   })}</div>
  </fieldset>
  {/* The prompt is the field's label rather than a heading above it, so a screen reader hears the
      question the contract asks instead of "text field". */}
  <label className="wb-prompt" htmlFor={fieldId}>{chosen.prompt}</label>
  <textarea id={fieldId} ref={field} value={words}
   onChange={event => { setWords(event.currentTarget.value); setSaid(''); }}/>
  <div className="wb-write-foot">
   <button className="primary" onClick={submit}>Write this down<ArrowRight size={17}/></button>
   <p className="wb-said" role="status">{said}</p>
  </div>
  <p className="helper wb-private"><Ban size={16}/><span>{refusal('no-sharing-by-default')}</span></p>
 </section>;
}

function Record({ entries, onRemove }: { entries: Entry[]; onRemove: (id: string) => void }) {
 const grouped = days(entries);
 return <div className="wb-record">
  {/* Above the record and not below it, because it is the sentence that makes an empty stretch
      readable — and an empty record is exactly when somebody needs to be told that nothing was
      lost. */}
  <p className="helper wb-gap"><Ban size={16}/><span>{refusal('no-punished-gap')}</span></p>
  {grouped.length === 0
   ? <EmptyNote>Nothing is written down yet. Whatever you write appears here, newest first, and stays for as long as this window is open.</EmptyNote>
   : grouped.map(day => <section className="wb-day" key={day.offset}>
      <h3>{day.label}</h3>
      <ul>{day.entries.map(entry => <li className="wb-entry" key={entry.id}>
       <div className="wb-entry-head"><strong>{habitById(entry.habit).name}</strong><small>{timeOf(entry.at)}</small>
        {/* At the trailing edge, and the word rather than the icon alone: somebody who cannot take
            back a sentence they wrote about their own body has been given a file rather than a
            diary, and somebody who deletes one by brushing past a bin has been given neither. */}
        <button className="text-button wb-remove" onClick={() => onRemove(entry.id)}
         aria-label={`Remove what you wrote about ${habitById(entry.habit).name.toLowerCase()} at ${timeOf(entry.at)}`}>
         <Trash2 size={15} aria-hidden="true"/>Remove
        </button></div>
       <p>{entry.words}</p>
      </li>)}</ul>
     </section>)}
 </div>;
}

/** What somebody wrote, on the visit's own screen — the other half of "bring this to your next
    visit". It renders nothing when there is nothing, because a heading over an empty list on a
    visit screen is a place a person is being told they should have written something. */
export function BroughtToTheVisit({ entries }: { entries: Entry[] }) {
 if (!entries.length) return null;
 return <>
  <SectionTitle title="What you wrote in Live well"/>
  <div className="panel wb-brought">
   <p className="helper"><NotebookPen size={16}/><span>{takingItToAClinician.howItWorks}</span></p>
   <ul>{days(entries).map(day => <li key={day.offset}>
    <span className="wb-brought-day">{dayLabelOf(day.offset)}</span>
    {day.entries.map(entry => <p key={entry.id}><strong>{habitById(entry.habit).name}.</strong> {entry.words}</p>)}
   </li>)}</ul>
  </div>
 </>;
}
