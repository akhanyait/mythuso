import { useLayoutEffect, useMemo, useState, type CSSProperties, type ComponentType } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Check, ChevronRight, HeartHandshake, Home, Info, MapPin, User, Video } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Badge, Textarea } from '../ui';
import { HOME_SUBURB } from '../lib/arrival';
import { nameOf, PREVIEW_VIEWER, previewHousehold } from '../lib/household';
import { endTime, isoIn, offeredDays, slots } from '../lib/scheduling';
import './book-care.css';

/* Book care for the Wednesday demo: six questions, one screen each, then a simulated confirmation.
 *
 * This is not features/Booking.tsx. That flow is the product's booking, with its own tests, and this
 * screen must not change what those tests walk. Answers live in React state for as long as the screen
 * is open and nowhere else — no storage, no request, no payment. Nothing here is a clinical judgement:
 * the three kinds of care are ways a nurse visit can be asked for, not a triage.
 *
 * The household chooser is the preview roster from lib/household.ts (the domain's own members), not
 * personOptions. personOptions is who may be asked for as a nurse. Offering a nurse's name as "someone
 * I care for" would be the wrong person in the wrong role. */

/* The patient shell is signed in as Lerato Molefe. She is not a row of the household contract's
   preview roster — that roster is opened by Thando — so "Myself" is the shell's person and the
   other rows are the roster's, each marked demo data. */
const ACCOUNT_HOLDER = 'Lerato Molefe';

const STEPS = [
 { title: 'Who is this care for?' },
 { title: 'What do you need?' },
 { title: 'When suits you?' },
 { title: 'Where should care happen?' },
 { title: 'Anything your nurse should know?' },
 { title: 'Check and confirm' }
] as const;

const WHO = 0;
const WHAT = 1;
const WHEN = 2;
const WHERE = 3;
const NOTES = 4;
const CONFIRM = 5;

type WhoChoice = 'myself' | 'other';
type WhatId = 'home' | 'online' | 'followup';
type WhereId = 'home' | 'elsewhere' | 'online';

/* A home or follow-up visit happens at an address. An online consult does not, so a where-answer
   from the other kind is dropped the moment "what" changes — otherwise Confirm would describe a
   video call at a street address, or a nurse sent to a link. */
function whereFits(what: WhatId | null, where: WhereId | null): boolean {
 if (!what || !where) return false;
 if (what === 'online') return where === 'online';
 return where === 'home' || where === 'elsewhere';
}

const SERVICES: { id: WhatId; title: string; detail: string; Icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
 { id: 'home', title: 'Home visit', detail: 'A nurse comes to you', Icon: Home },
 { id: 'online', title: 'Online consult', detail: 'Talk with a professional online', Icon: Video },
 { id: 'followup', title: 'Follow-up', detail: 'Schedule a check-in', Icon: Calendar }
];

/* One hour, from the gap between the first two offered slots, so the window is the catalogue's
   spacing and not a duration typed here. The lunch break is later in the list; the morning slots
   are an hour apart. */
function slotMinutes(list: readonly string[]): number {
 const [a, b] = list;
 if (!a || !b) return 60;
 const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };
 const gap = minutes(b) - minutes(a);
 return gap > 0 ? gap : 60;
}

type Window = { id: string; title: string; detail: string };

/* The next four offered days, each at the first slot. A card is a day plus a time, computed in
   Africa/Johannesburg by lib/scheduling, so nothing here names a date. "Tomorrow" is the first
   offered day when that day is actually tomorrow. */
function offeredWindows(now: Date): Window[] {
 const tomorrow = isoIn(new Date(now.getTime() + 86_400_000));
 const start = slots[0]!;
 const end = endTime(start, slotMinutes(slots));
 return offeredDays(now).slice(0, 4).map(day => ({
  id: `${day.iso}T${start}`,
  title: day.iso === tomorrow ? 'Tomorrow' : `${day.weekday} ${day.day} ${day.month}`,
  detail: `${day.weekday} ${day.day} ${day.month} · ${start}–${end}`
 }));
}

const caredFor = previewHousehold().members
 .filter(member => member.memberSubjectRef !== PREVIEW_VIEWER)
 .map(member => ({ id: member.memberSubjectRef, name: nameOf(member.memberSubjectRef) }));

const HOME_ADDRESS = `Home visit · ${HOME_SUBURB}`;

/* While this screen is mounted the floating assistant stands down. AssistantLauncher reads
   data-consult-live — the same attribute the simulated consult sets — so the two screens share
   one flag. The confirmation is still this screen, so the orb stays down until the flow is left. */
function useStandDownAssistant() {
 useLayoutEffect(() => {
  const root = document.documentElement;
  const mark = (live: boolean) => {
   if (live) root.setAttribute('data-consult-live', '');
   else root.removeAttribute('data-consult-live');
   /* Synchronous, so the launcher's listener runs inside this layout effect and React
      paints the step without the orb. A mutation observer would arrive a frame later. */
   root.dispatchEvent(new Event('mythuso:consult-live'));
  };
  mark(true);
  return () => mark(false);
 }, []);
}

type OptionProps = {
 name: string;
 value: string;
 checked: boolean;
 onSelect: () => void;
 icon: ComponentType<{ size?: number; strokeWidth?: number }>;
 title: string;
 detail?: string;
 badge?: string;
};

function Option({ name, value, checked, onSelect, icon: Icon, title, detail, badge }: OptionProps) {
 return <label className="bc-card">
  <input type="radio" name={name} value={value} checked={checked} aria-checked={checked} onChange={onSelect}/>
  <span className="bc-card__icon" aria-hidden="true"><Icon size={26} strokeWidth={1.75}/></span>
  <span className="bc-card__copy">
   <span className="bc-card__title">{title}</span>
   {detail && <span className="bc-card__detail">{detail}</span>}
   {badge && <Badge size="sm" variant="neutral">{badge}</Badge>}
  </span>
  <span className="bc-check" aria-hidden="true"><Check size={16} strokeWidth={3}/></span>
 </label>;
}

export function BookCare({ navigate }: { navigate: (page: string) => void }) {
 useStandDownAssistant();
 const windows = useMemo(() => offeredWindows(new Date()), []);
 const [step, setStep] = useState(0);
 const [confirmed, setConfirmed] = useState(false);
 const [who, setWho] = useState<WhoChoice | null>(null);
 const [otherId, setOtherId] = useState<string | null>(null);
 const [what, setWhat] = useState<WhatId | null>(null);
 const [whenId, setWhenId] = useState<string | null>(null);
 const [where, setWhere] = useState<WhereId | null>(null);
 const [notes, setNotes] = useState('');

 /* An online consult has one place it can happen, and the card arrives already chosen so Next is
    not waiting on a question that has only one answer. */
 if (step === WHERE && what === 'online' && where !== 'online') setWhere('online');

 const question = STEPS[step]!.title;
 const other = caredFor.find(person => person.id === otherId) ?? null;
 const service = SERVICES.find(item => item.id === what) ?? null;
 const chosenWhen = windows.find(item => item.id === whenId) ?? null;
 const whoLine = who === 'myself' ? 'Myself' : other?.name ?? '';
 const whoName = who === 'myself' ? ACCOUNT_HOLDER : other?.name ?? '';
 const ready = step === WHO ? who === 'myself' || (who === 'other' && otherId !== null)
  : step === WHAT ? what !== null
  : step === WHEN ? whenId !== null
  : step === WHERE ? where !== null
  : step === NOTES ? true
  : false;

 const selectWhat = (id: WhatId) => {
  setWhat(id);
  setWhere(current => whereFits(id, current) ? current : null);
 };
 const back = () => {
  if (confirmed || step === WHO) { navigate('Overview'); return; }
  setStep(step - 1);
 };
 const whereLine = where === 'home' ? `At home · ${HOME_ADDRESS}`
  : where === 'elsewhere' ? 'Somewhere else'
  : where === 'online' ? 'Online'
  : '';

 if (confirmed && service && chosenWhen) {
  return <div className="bc">
   <header className="bc-bar">
    <button type="button" className="bc-back" onClick={() => navigate('Overview')} aria-label="Back to home"><ArrowLeft size={22} aria-hidden="true"/></button>
    <span className="bc-brand">MyThuso</span>
   </header>
   <div className="success bc-done">
    <div className="success-icon"><Check size={30}/></div>
    <h3>Visit confirmed (simulated)</h3>
    <p>{service.title} for {whoName.split(' ')[0]}</p>
    <p className="success-when">{chosenWhen.detail}</p>
    <p className="helper">{whereLine}{where === 'home' ? ' · Demo data' : ''}</p>
    {notes.trim() && <p className="helper">{notes.trim()}</p>}
    <NotConnected of="payments"/>
    <NotConnected of="booking"/>
    <button type="button" className="primary full space-top" onClick={() => navigate('Overview')}>Back to home<ArrowRight size={17}/></button>
   </div>
  </div>;
 }

 return <div className="bc">
  <header className="bc-bar">
   <button type="button" className="bc-back" onClick={back} aria-label={step === WHO ? 'Back to home' : 'Back'}><ArrowLeft size={22} aria-hidden="true"/></button>
   <span className="bc-brand">MyThuso</span>
   <span className="bc-bar__step">Step {step + 1} of 6</span>
  </header>

  <div className="bc-progress" role="group" aria-label={`Step ${step + 1} of 6: ${question}`} style={{ '--bc-fill': step / (STEPS.length - 1) } as CSSProperties}>
   <div className="bc-progress__line" aria-hidden="true"><span className="bc-progress__fill"/></div>
   <ol className="bc-progress__nodes" aria-hidden="true">
    {STEPS.map((item, index) => <li key={item.title} className={`bc-node${index < step ? ' is-done' : ''}${index === step ? ' is-now' : ''}`}/>)}
   </ol>
   <p className="bc-progress__count">Step {step + 1} of 6</p>
  </div>

  <h1 className="bc-title" id="bc-question">{question}</h1>
  {step === WHO && <p className="bc-kicker">One question per step.<span className="bc-kicker__rule" aria-hidden="true"/></p>}

  {step === WHO && <>
   <div role="radiogroup" aria-labelledby="bc-question" className="bc-options">
    <Option name="bc-who" value="myself" checked={who === 'myself'} onSelect={() => setWho('myself')} icon={User} title="Myself"/>
    <Option name="bc-who" value="other" checked={who === 'other'} onSelect={() => setWho('other')} icon={HeartHandshake} title="Someone I care for"/>
   </div>
   {who === 'other' && <div role="radiogroup" aria-label="Someone you care for" className="bc-people">
    {caredFor.map(person => <label key={person.id} className="bc-person">
     <input type="radio" name="bc-person" value={person.id} checked={otherId === person.id} aria-checked={otherId === person.id} onChange={() => setOtherId(person.id)}/>
     <span className="bc-person__name">{person.name}</span>
     <Badge size="sm" variant="neutral">Demo data</Badge>
    </label>)}
   </div>}
  </>}

  {step === WHAT && <div role="radiogroup" aria-labelledby="bc-question" className="bc-options">
   {SERVICES.map(item => <Option key={item.id} name="bc-what" value={item.id} checked={what === item.id} onSelect={() => selectWhat(item.id)} icon={item.Icon} title={item.title} detail={item.detail}/>)}
  </div>}

  {step === WHEN && <div role="radiogroup" aria-labelledby="bc-question" className="bc-options">
   {windows.map(item => <Option key={item.id} name="bc-when" value={item.id} checked={whenId === item.id} onSelect={() => setWhenId(item.id)} icon={Calendar} title={item.title} detail={item.detail}/>)}
  </div>}

  {step === WHERE && <div role="radiogroup" aria-labelledby="bc-question" className="bc-options">
   {what === 'online'
    ? <Option name="bc-where" value="online" checked={where === 'online'} onSelect={() => setWhere('online')} icon={Video} title="Online" detail="A secure video link (simulated in this preview)"/>
    : <>
     <Option name="bc-where" value="home" checked={where === 'home'} onSelect={() => setWhere('home')} icon={Home} title="At home" detail={HOME_ADDRESS} badge="Demo data"/>
     <Option name="bc-where" value="elsewhere" checked={where === 'elsewhere'} onSelect={() => setWhere('elsewhere')} icon={MapPin} title="Somewhere else" detail="Tell your nurse in the next step"/>
    </>}
  </div>}

  {step === NOTES && <div className="bc-notes">
   <Textarea aria-labelledby="bc-question" aria-describedby="bc-notes-help" placeholder="For example: symptoms, allergies or how to find your home" value={notes} onChange={event => setNotes(event.target.value)}/>
   <p className="bc-notes__help" id="bc-notes-help">Optional. Your nurse reads this before the visit.</p>
  </div>}

  {step === CONFIRM && <>
   <div className="bc-summary">
    {([
     ['Who', whoLine, WHO],
     ['What', service?.title ?? '', WHAT],
     ['When', chosenWhen?.detail ?? '', WHEN],
     ['Where', whereLine, WHERE],
     ['Notes', notes.trim() || 'None', NOTES]
    ] as const).map(([label, value, index]) => <div className="bc-summary__row" key={label}>
     <span className="bc-summary__label">{label}</span>
     <span className="bc-summary__value">{value}{label === 'Where' && where === 'home' ? ' · Demo data' : ''}</span>
     <button type="button" className="bc-change" onClick={() => setStep(index)}>Change<span className="visually-hidden"> {label}</span></button>
    </div>)}
   </div>
   <p className="not-connected bc-notice" role="note">
    <Info size={17} aria-hidden="true"/>
    <span>This is a simulated booking. Nothing is booked and no payment is taken.</span>
   </p>
  </>}

  {step === CONFIRM
   ? <button type="button" className="bc-next" onClick={() => setConfirmed(true)}>Confirm booking</button>
   : <button type="button" className="bc-next" disabled={!ready} onClick={() => setStep(step + 1)}>Next<ChevronRight size={20} aria-hidden="true"/></button>}

  <p className="bc-hint"><Info size={16} aria-hidden="true"/>One question per step</p>
 </div>;
}
