import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import type { Thread } from '../../../../packages/engines/src/access/domain/thread.ts';
import { closedSentence } from '../../../../packages/engines/src/access/domain/thread.ts';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button } from '../ui';
import { MyThusoMessagesIcon } from '../ui/icons/MyThusoIcons.generated';
import { nurseOfVisit } from '../lib/arrival';
import { fill, thread as words } from '../lib/booking';
import { longDateOf } from '../lib/scheduling';
import { useSettingsHistories } from '../lib/settings';
import { VisitThread, threadForRow } from './VisitAccess';
import type { VisitRow } from './Pages';
import { PatientHeader } from './PatientHeader';

/* Messages — the export's two panes (patient-space.tsx, Messages), over the only conversations this preview
 * actually has: one thread per visit, between the patient and the nurse on it.
 *
 * The export's page is an inbox: a search, six conversations with doctors, a clinic and a lab, unread dots,
 * and on the right a doctor saying the latest results are within the normal range, with a video button, a
 * phone button and a paperclip. None of that exists. There is no inbox, no doctor channel, no result that
 * arrives as a message, and no call — and a message from a doctor about a result is the one sentence a
 * health product must never invent.
 *
 * So the left pane is the visits, each opening its own thread, and the right pane is that thread — the same
 * component and the same memory the visit dialog uses (VisitAccess.tsx; the state is held in App.tsx), so a
 * word written here is in the visit and a word written in the visit is here. What each row previews is what
 * the thread would say about itself: its last message, why it closed, until when it stays open, or that it
 * is empty. No row is marked unread, because nothing is ever delivered to be unread, and no row carries a
 * call or an attachment, because the route refuses one.
 *
 * WHAT STAYS ON THE SCREEN. The messaging capability's notice above the list, and inside every thread the
 * sentences VisitThread already draws — not a record, words only, and above the field that nobody watches it
 * for emergencies, with the numbers. Nothing here removes, moves or shortens one of them. */

const timeOf = (instant: string) =>
 new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));

/* What a thread says about itself when it is not open: the same four answers the visit's own door gives. */
const previewOf = (thread: Thread) => {
 const last = thread.messages[thread.messages.length - 1];
 return thread.state === 'closed' && thread.closedBecause ? closedSentence(thread.closedBecause)
  : last ? last.message
  : thread.closesAt ? fill(words.openAfterVisit, { closes: timeOf(thread.closesAt) })
  : words.empty;
};

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase();

/* Two panes on a wide screen, so the first visit's thread is open beside the list. On a phone the list comes
   first and a thread replaces it, because two panes at 390px is two columns nobody can read. */
const widePanes = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;

export function PatientMessages({ rows, threads, onThread, view, navigate }: {
 rows: VisitRow[];
 threads: Record<string, Thread>;
 onThread: (id: string, next: Thread) => void;
 view: (id: string) => void;
 navigate: (page: string) => void;
}) {
 useSettingsHistories();
 const [query, setQuery] = useState('');
 const [openId, setOpenId] = useState<string | null>(() => widePanes() ? (rows.find(row => row.group === 'upcoming') ?? rows[0])?.id ?? null : null);
 const now = new Date();
 const entries = rows.map(row => {
  const thread = threadForRow(row, threads[row.id], now);
  const nurse = nurseOfVisit(row.visit);
  return { row, thread, nurse, preview: previewOf(thread) };
 });
 const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const shown = entries.filter(({ row, nurse, thread }) => {
  const haystack = [row.id, row.visit.service.name, row.visit.person, nurse.name, row.status, ...thread.messages.map(m => m.message)].join(' ').toLowerCase();
  return terms.every(term => haystack.includes(term));
 });
 const open = entries.find(entry => entry.row.id === openId) ?? null;
 /* The thread moves focus to its own heading when it opens, which is right when somebody chose it and wrong
    when the page merely opened on a wide screen with the first thread already beside the list: arriving on a
    page should not drop a reader into the middle of it. So the first, automatic opening gives focus back. */
 const autoOpened = useRef(openId !== null);
 useEffect(() => {
  if (!autoOpened.current) return;
  autoOpened.current = false;
  const active = document.activeElement as HTMLElement | null;
  if (active?.closest('.ps-inbox-thread')) active.blur();
 }, []);

 return <div className="ps-screen">
  <PatientHeader icon={<MyThusoMessagesIcon width={22} height={22}/>} eyebrow="Your care" title="Messages"
   lead="One thread for each visit, between you and the nurse on it, about getting there and getting in. There is no other inbox: no doctor, clinic or laboratory writes to you here."/>
  <NotConnected of="messaging"/>

  {rows.length === 0
   ? <div className="ps-empty"><h2>No visits, so no messages yet.</h2><p>A thread opens with each visit you book, and closes with it.</p>
     <Button variant="primary" onClick={() => navigate('Book a nurse')} trailingIcon={<ArrowRight size={16}/>}>Book a nurse</Button></div>
   : <div className={`ps-inbox${open ? ' has-open' : ''}`}>
    <div className="ps-inbox-list">
     <label className="ps-search">
      <Search size={17} aria-hidden="true"/>
      <span className="visually-hidden">Search your visit messages</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by visit, nurse or message"/>
     </label>
     {shown.length === 0
      ? <p className="ps-inbox-none" role="status">No visit matches that search. Try the nurse’s name, the service or a word you wrote.</p>
      : <ul className="ps-conversations" aria-label="Your visits">
       {shown.map(({ row, nurse, preview }) => <li key={row.id}>
        <button type="button" className="ps-conversation" aria-current={row.id === openId ? 'true' : undefined} onClick={() => setOpenId(row.id)}>
         <span className="ps-initials" aria-hidden="true">{initialsOf(nurse.name)}</span>
         <span className="ps-conversation-text">
          <span className="ps-conversation-top"><strong>{nurse.name}</strong><Badge variant="neutral" size="sm">{row.status}</Badge></span>
          <small className="ps-conversation-what">{row.visit.service.name}{row.visit.date ? ` · ${longDateOf(row.visit.date)}` : ''}</small>
          <small className="ps-conversation-preview">{preview}</small>
         </span>
        </button>
       </li>)}
      </ul>}
    </div>
    <div className="ps-inbox-thread">
     {open
      ? <>
       <div className="ps-thread-head">
        <button type="button" className="text-button ps-back ps-thread-list" onClick={() => setOpenId(null)}><ArrowLeft size={16} aria-hidden="true"/>All your messages</button>
        <h2>{open.nurse.name}</h2>
        <p>{open.row.visit.service.name} for {open.row.visit.person}{open.row.visit.date ? ` · ${longDateOf(open.row.visit.date)}` : ''} · {open.row.id}</p>
       </div>
       <VisitThread key={open.row.id} thread={open.thread} nurseName={open.nurse.name}
        onChange={next => onThread(open.row.id, next)} onBack={() => view(open.row.id)}/>
      </>
      : <div className="ps-thread-none"><MyThusoMessagesIcon width={24} height={24}/><p>Choose a visit to read its thread.</p></div>}
    </div>
   </div>}
 </div>;
}
