import { Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, LogOut, Search, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Alert } from '../ui';
import { clockOf, fieldSafety, fill } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { standingOf } from '../../../../packages/engines/src/safety/domain/checkins.ts';
import { NURSE_ON_SHIFT, useFieldSafety } from '../lib/field-safety';
import { preview as carePreview, tick as careTick, useCareVisit } from '../lib/care-visit';
import { services } from '../lib/catalog';
import { ShellPanicPressed } from '../features/FieldSafety';

/* The staff shell's top bar and the band above every page, taken from the Lovable export's arrangement
 * and drawn with what this build can honestly say.
 *
 * THE SEARCH IS A JUMP, NOT A SEARCH. The export's field read "Search patients, records or protocols…" and
 * searched nothing. This one finds the screens of the workspace you are in by their names and goes to the
 * one you pick — the one thing a search box here can do without pretending to hold an index of patients
 * it does not have — and it says so under the list.
 *
 * THE PROFILE IS A DISCLOSURE, NOT A MENU. What it opens is a statement (who the workspace thinks you
 * are, and the credential line the dispatch board gates on) and one way out. A role="menu" would promise
 * arrow-key menu behaviour over a paragraph; a button with aria-expanded over a panel promises only what
 * it does. It closes on Escape, which returns focus to the chip, and on a press outside it.
 *
 * THE BAND SAYS WHAT IS WAITING, OR IS NOT THERE. The export drew a device alarm above every page. Device
 * alarms are refused here; what the preview does hold in memory is a nurse's own visit past its check-out,
 * a care offer waiting for her answer, and a Sentinel tier a clinician raised by hand. Each item is drawn
 * only while that state is true, in its contract's own sentence where the contract has one, with a way to
 * the screen it is handled on. Nothing waiting is no band at all — not a reassurance that everything is
 * fine, which would be a claim about devices nobody is watching. */

export type Destination = { readonly id: string; readonly group: string; readonly icon: LucideIcon };

/* ---- Jump to --------------------------------------------------------------------------------------- */

export function JumpTo({ destinations, go, className }: { destinations: readonly Destination[]; go: (id: string) => void; className?: string }) {
 const id = useId();
 const [query, setQuery] = useState('');
 const [open, setOpen] = useState(false);
 const [active, setActive] = useState(0);
 const q = query.trim().toLowerCase();
 /* A name that starts with what was typed first, then a word in it that does, then anywhere in it, then
    the group it sits in — so "ac" is Academy before it is every screen under Practice. */
 const rank = (d: Destination) => { const name = d.id.toLowerCase();
  return name.startsWith(q) ? 0 : name.split(/[^a-z0-9]+/).some(w => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : d.group.toLowerCase().includes(q) ? 3 : 4; };
 const matches = q ? destinations.map(d => [d, rank(d)] as const).filter(([, r]) => r < 4).sort((a, b) => a[1] - b[1]).map(([d]) => d) : destinations;
 const at = Math.min(active, Math.max(0, matches.length - 1));
 const choose = (to: string) => { setQuery(''); setOpen(false); setActive(0); go(to); };
 const move = (by: number) => { setOpen(true); if (matches.length) setActive((at + by + matches.length) % matches.length); };
 return <div className={`staff-jump${className ? ` ${className}` : ''}`}>
  <Search size={18} aria-hidden="true" className="staff-jump__icon"/>
  <input className="ui-control ui-input staff-jump__input" type="text" role="combobox" autoComplete="off" spellCheck={false}
         aria-label="Jump to a screen in this workspace" placeholder="Jump to…"
         aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
         aria-activedescendant={open && matches[at] ? `${id}-o${at}` : undefined}
         value={query}
         onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
         onFocus={() => setOpen(true)}
         onBlur={() => setOpen(false)}
         onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); move(open ? 1 : 0); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
          else if (e.key === 'Enter') { if (open && matches[at]) { e.preventDefault(); choose(matches[at].id); } }
          else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); } else setQuery(''); }
         }}/>
  <div className="staff-jump__panel" hidden={!open}>
   <ul role="listbox" id={`${id}-list`} aria-label="Screens in this workspace" className="staff-jump__list">{matches.map((d, i) =>
    /* Pressed rather than clicked: a click lands after the input's blur has already closed the list. */
    <li key={d.id} id={`${id}-o${i}`} role="option" aria-selected={i === at} className="staff-jump__option"
        onMouseDown={e => e.preventDefault()} onClick={() => choose(d.id)} onMouseMove={() => setActive(i)}>
     <d.icon size={18} strokeWidth={1.8}/><span>{d.id}</span><small>{d.group}</small>
    </li>)}</ul>
   {!matches.length && <p className="staff-jump__empty" role="status">No screen in this workspace is called “{query.trim()}”.</p>}
   <p className="staff-jump__note">Finds this workspace’s screens by name. It does not search patients, records or messages.</p>
  </div>
 </div>;
}

/* ---- The profile chip ------------------------------------------------------------------------------ */

type Who = { initials: string; name: string; roleName: string; reference: string; credential: string; stopped: boolean; due: boolean };

export function ProfileMenu({ who, onLeave }: { who: Who; onLeave: () => void }) {
 const id = useId();
 const [open, setOpen] = useState(false);
 const box = useRef<HTMLDivElement>(null);
 const chip = useRef<HTMLButtonElement>(null);
 useEffect(() => {
  if (!open) return;
  const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
  const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); chip.current?.focus(); } };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
 }, [open]);
 return <div className="staff-profile" ref={box}>
  <button ref={chip} type="button" className="staff-profile__chip" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
   <span className="avatar small" aria-hidden="true">{who.initials}</span>
   <span className="staff-profile__who"><strong>{who.name}</strong><small>{who.roleName}</small></span>
   <ChevronDown size={16} aria-hidden="true" className="staff-profile__chevron"/>
  </button>
  <div className="staff-profile__panel" id={`${id}-panel`} hidden={!open}>
   <p className="staff-profile__name"><strong>{who.name}</strong><small>{who.roleName} · {who.reference}</small></p>
   <p className={`staff-credential ${who.stopped ? 'stop' : who.due ? 'due' : ''}`}>
    {who.stopped ? <ShieldAlert size={15} aria-hidden="true"/> : <ShieldCheck size={15} aria-hidden="true"/>}<span>{who.credential}</span>
   </p>
   <button type="button" className="staff-profile__leave" onClick={onLeave}><LogOut size={18} aria-hidden="true"/>Leave this workspace</button>
  </div>
 </div>;
}

/* ---- What is waiting ------------------------------------------------------------------------------- */

export type Attention = { key: string; variant: 'info' | 'warning' | 'danger'; title: string; body: string; to: string; hideOn?: readonly string[] };

export function AttentionItems({ items, section, go }: { items: readonly Attention[]; section: string; go: (id: string) => void }) {
 const shown = items.filter(item => !item.hideOn?.includes(section));
 if (!shown.length) return null;
 return <>{shown.map(item =>
  <Alert key={item.key} variant={item.variant} title={item.title} className="staff-attention__item">
   <p>{item.body}</p>
   {item.to !== section && <button type="button" className="staff-attention__go" onClick={() => go(item.to)}>Go to {item.to}<ArrowRight size={16} aria-hidden="true"/></button>}
  </Alert>)}</>;
}

const timerSay = fieldSafety.nurse;
const overdueLabel = fieldSafety.states.timer.find(s => s.id === 'overdue')?.label ?? '';
const careService = services.find(s => s.id === carePreview.serviceId);
const clockAt = (iso: string) => clockOf(Date.parse(iso));

/* The nurse's two in-memory facts: her own visit past its check-out, and the care offer waiting for her.
   Another nurse's late visit is the desk's business, not hers, so only NURSE_ON_SHIFT's timers are read.
   The offer is the one her schedule draws, which lapses on its own tick — kept running here too, or an
   offer she walked away from would sit in the band after it had lapsed. */
function NurseAttention({ section, go }: { section: string; go: (id: string) => void }) {
 const s = useFieldSafety();
 const care = useCareVisit();
 useEffect(() => { const timer = window.setInterval(careTick, 15_000); return () => window.clearInterval(timer); }, []);
 const items: Attention[] = s.timers
  .filter(t => t.nurseRef === NURSE_ON_SHIFT && standingOf(t, s.now) === 'overdue')
  .map(t => ({ key: t.checkinRef, variant: 'danger', title: `${timerSay.heading} · ${overdueLabel}`,
               body: fill(timerSay.overdue, { since: clockOf(t.dueAt) }), to: 'Schedule' }));
 const offer = care.offer;
 if (offer?.state === 'open' && !care.visit && Date.parse(offer.expiresAt) > care.now) items.push({
  key: 'care-offer', variant: 'info', title: 'A visit offered to you', to: 'Schedule', hideOn: ['Schedule'],
  body: `${careService?.name ?? ''}${care.scheduledFor ? `, today at ${clockAt(care.scheduledFor)}` : ''}. Lapses at ${clockAt(offer.expiresAt)}.`
 });
 return <AttentionItems items={items} section={section} go={go}/>;
}

/* Sentinel's store arrives with the Sentinel screens, and no tier can have been raised before one of them
   was opened — the store starts with none. So the band's Sentinel half is only fetched once the shell has
   loaded that module for a screen, and never costs a first paint. */
const SentinelAttention = lazy(() => import('./SentinelAttention'));

export function StaffAttention({ role, section, go, sentinelLoaded }: { role: string; section: string; go: (id: string) => void; sentinelLoaded: boolean }) {
 if (role !== 'Nurse' && role !== 'Doctor') return null;
 return <div className="staff-attention" aria-label="Waiting for you" role="region">
  {/* A panic pressed from the top bar says what it did here, first, on whichever page she pressed it from. */}
  {role === 'Nurse' && <ShellPanicPressed/>}
  {role === 'Nurse' && <NurseAttention section={section} go={go}/>}
  {sentinelLoaded && <Suspense fallback={null}><SentinelAttention workspace={role === 'Nurse' ? 'nurse' : 'doctor'} section={section} go={go}/></Suspense>}
 </div>;
}
