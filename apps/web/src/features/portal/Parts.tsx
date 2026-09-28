import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, Info } from 'lucide-react';
import { buildWordOf, portalContract, statusOf } from '../../lib/portal';
import { Badge, type BadgeVariant } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { MetricCard } from '../../ui/MetricCard';
import { Spinner } from '../../ui/Spinner';
import { Tab, TabsList } from '../../ui/Tabs';
import { cx } from '../../ui/cx';

/* The portal's shared parts: the tab list, the roving list, the tree, the status word, the written
   empty state and the loading state. Every category draws with these, which is the whole of what
   "one navigation pattern" and "one status vocabulary" (§5.2) mean in code — a category cannot grow a
   second way of saying either without writing a second component, and the build would see it.

   The keyboard rules are docs/control-tower-accessibility.md's, and they are the reason this file
   exists rather than each screen handling its own keys: a tab list is one Tab stop with the arrows
   moving between tabs and activating them, Home and End at the ends, focus wrapping; a list is one
   Tab stop with Up and Down moving between rows. Nothing here sets a positive tabindex, and nothing
   sets outline: none.

   Since the Lovable identity (28 September 2026, wave 4e) the parts are drawn with the shared components
   of apps/web/src/ui — a section is a Card, a figure a MetricCard, a status a Badge, a category's own tabs
   the handoff's Tabs — and what this file keeps is the behaviour the handoff's components do not carry:
   the roving keys, the ids a tab panel is labelled by, the count in a list's name. Individual files are
   imported rather than the barrel, so a category's chunk carries the components it draws and no others. */

const ARROWS_NEXT = new Set(['ArrowRight', 'ArrowDown']);
const ARROWS_PREVIOUS = new Set(['ArrowLeft', 'ArrowUp']);

/** Where a key moves a roving focus, or null for a key that is not ours. Wraps at both ends. */
export function nextIndex(key: string, current: number, count: number, vertical = true, horizontal = true): number | null {
 if (!count) return null;
 if ((vertical && key === 'ArrowDown') || (horizontal && key === 'ArrowRight')) return (current + 1) % count;
 if ((vertical && key === 'ArrowUp') || (horizontal && key === 'ArrowLeft')) return (current - 1 + count) % count;
 if (key === 'Home') return 0;
 if (key === 'End') return count - 1;
 return null;
}

export type TabItem = { readonly id: string; readonly label: string; readonly icon?: ReactNode };

/* The WAI-ARIA tabs pattern with automatic activation. Both arrow pairs move, whatever the
   orientation: the category list is a column on a wide screen and a strip on a phone, and a reader
   who has learnt one pair should not find it dead on the other layout.

   Two looks, one behaviour. A category's own tabs are the handoff's Tabs — peer views of one thing, a
   muted track with the chosen tab raised on white. The categories themselves are the portal's primary
   navigation, which the handoff draws as NavigationItem and says tabs must never be; so `look="nav"` wears
   the navigation item's face (the aqua tint and the heavier word for the one you are in) while keeping the
   tab semantics, the ids and the roving keys the accessibility floor and the journeys hold. Each tab's own
   key handler moves first and prevents the default, so TabsList's second handler stands down. */
export function Tablist({ label, items, selected, onSelect, idPrefix, panelId, orientation = 'horizontal', look = 'tabs', className = '' }: {
 label: string; items: readonly TabItem[]; selected: string; onSelect: (id: string) => void;
 idPrefix: string; panelId: string; orientation?: 'horizontal' | 'vertical'; look?: 'tabs' | 'nav'; className?: string;
}) {
 const refs = useRef<(HTMLButtonElement | null)[]>([]);
 const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
  if (!ARROWS_NEXT.has(event.key) && !ARROWS_PREVIOUS.has(event.key) && event.key !== 'Home' && event.key !== 'End') return;
  const next = nextIndex(event.key, index, items.length);
  if (next === null) return;
  event.preventDefault();
  onSelect(items[next]!.id);
  refs.current[next]?.focus();
 };
 if (look === 'nav')
  return <div role="tablist" aria-label={label} aria-orientation={orientation} className={cx('pt-tablist', 'pt-navlist', orientation, className)}>
   {items.map((item, index) => {
    const current = item.id === selected;
    return <button key={item.id} ref={el => { refs.current[index] = el; }} type="button" role="tab" id={`${idPrefix}-${item.id}`}
     aria-selected={current} aria-controls={panelId} tabIndex={current ? 0 : -1} className={cx('pt-tab', 'ui-nav-item', current && 'ui-nav-item--active')}
     onClick={() => onSelect(item.id)} onKeyDown={event => onKeyDown(event, index)}>
     {item.icon}<span className="ui-nav-item__label">{item.label}</span>
    </button>;
   })}
  </div>;
 return <TabsList aria-label={label} aria-orientation={orientation} className={cx('pt-tablist', orientation, className)}>
  {items.map((item, index) => {
   const current = item.id === selected;
   return <Tab key={item.id} ref={el => { refs.current[index] = el; }} id={`${idPrefix}-${item.id}`} active={current}
    aria-controls={panelId} className="pt-tab" onClick={() => onSelect(item.id)} onKeyDown={event => onKeyDown(event, index)}>
    {item.icon}<span>{item.label}</span>
   </Tab>;
  })}
 </TabsList>;
}

/* A list that is one Tab stop. Up and Down move between rows, Home and End go to the ends, and a
   row's own links are reached with Tab once the row is focused. The count is part of the list's
   name, so a screen reader hears "14 open gates" before the first of them. Rows are not buttons:
   nothing here acts, and a row that looked pressable and did nothing would be the lie §5.2 asks
   the portal to stop telling. */
export function RovingList({ label, rows, className = '' }: { label: string; rows: readonly { key: string; content: ReactNode }[]; className?: string }) {
 const [active, setActive] = useState(0);
 const refs = useRef<(HTMLLIElement | null)[]>([]);
 const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
  const next = nextIndex(event.key, active, rows.length, true, false);
  if (next === null) return;
  event.preventDefault();
  setActive(next);
  refs.current[next]?.focus();
 };
 return <ul className={`pt-list ${className}`} aria-label={label} onKeyDown={onKeyDown}>
  {rows.map((row, index) => <li key={row.key} ref={el => { refs.current[index] = el; }} tabIndex={index === active ? 0 : -1}
   onFocus={() => setActive(index)} className="pt-row">{row.content}</li>)}
 </ul>;
}

/* The tree pattern, for the Configuration tree: one Tab stop, Up and Down between nodes, Home and End,
   and selection following focus the way the tabs' does. Every node is always open — there are eight
   of them, and a tree that hid wards inside sites would be hiding the one fact both say, which is
   that neither exists. */
export type TreeNode = { readonly id: string; readonly label: string; readonly level: number };
export function Tree({ label, nodes, selected, onSelect, panelId }: {
 label: string; nodes: readonly TreeNode[]; selected: string; onSelect: (id: string) => void; panelId: string;
}) {
 const refs = useRef<(HTMLLIElement | null)[]>([]);
 const index = Math.max(0, nodes.findIndex(n => n.id === selected));
 const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(nodes[index]!.id); return; }
  const next = nextIndex(event.key, index, nodes.length, true, false);
  if (next === null) return;
  event.preventDefault();
  onSelect(nodes[next]!.id);
  refs.current[next]?.focus();
 };
 return <ul role="tree" aria-label={label} className="pt-tree" onKeyDown={onKeyDown}>
  {nodes.map((node, i) => {
   const current = node.id === selected;
   const next = nodes[i + 1];
   return <li key={node.id} ref={el => { refs.current[i] = el; }} role="treeitem" aria-level={node.level} aria-selected={current}
    aria-expanded={next && next.level > node.level ? true : undefined}
    aria-controls={panelId} tabIndex={current ? 0 : -1} className={`pt-node level-${node.level}`} onClick={() => onSelect(node.id)}>
    <span>{node.label}</span>
   </li>;
  })}
 </ul>;
}

/* A word's badge, from the word and nothing else: the portal's six service states, the plan's five build
   words and the registry's eight card states each map to one of the handoff's Badge variants. The word is
   the state; the variant is its second channel, so two words that share a variant — dark and not
   configured, both neutral — are still told apart by what they say. */
const TONES: Readonly<Record<string, BadgeVariant>> = {
 connected: 'success', built: 'success',
 configured: 'primary', gated: 'primary',
 degraded: 'warning', 'key-expiring': 'warning', 'rate-limited': 'warning',
 disconnected: 'danger', error: 'danger', 'named-but-absent': 'danger',
 dark: 'neutral', 'not-configured': 'neutral', proposed: 'neutral'
};
export const toneOf = (id: string): BadgeVariant => TONES[id] ?? 'neutral';

/* A service's state: the word first and the colour second, so nothing is carried by colour alone.
   The sentence is the contract's own. The dot says it is a live state rather than a label. */
export function Status({ id, withSentence = false }: { id: string; withSentence?: boolean }) {
 const word = statusOf(id);
 return <span className="pt-status-wrap">
  <Badge variant={toneOf(word.id)} size="sm" dot className={`pt-status is-${word.id}`}>{word.id}</Badge>
  {withSentence && <span className="pt-status-sentence">{word.sentence}</span>}
 </span>;
}
/* How far a thing is built, in the plan's §2 words. */
export function BuildWord({ id }: { id: string }) {
 const word = buildWordOf(id);
 return <Badge variant={toneOf(word.id)} size="sm" className={`pt-build is-${word.id}`} title={word.sentence}>{word.id}</Badge>;
}

/* A written empty state: a sentence that says why there is nothing, never a blank region (§5.2). One with
   a heading is a refusal — the heading is the contract's refusal — and wears the stop mark and the warning
   wash; one without is "nothing yet", with the information mark on the raised ground. The mark and the
   heading say which it is, so the ground is never the only difference. */
export function Empty({ children, heading }: { children: ReactNode; heading?: string }) {
 const Mark = heading ? Ban : Info;
 return <div className="pt-empty" role="note">
  <Mark className="pt-empty-mark" aria-hidden="true"/>
  <div>{heading && <strong>{heading}</strong>}<p>{children}</p></div>
 </div>;
}

/* A panel on its way. aria-busy on its region and an accessible name, the handoff's spinner — which in
   this build turns once as it arrives and then rests — and two still skeleton lines. The spinner is
   hidden from assistive technology because the region already says the same thing. */
export function Loading({ label }: { label?: string }) {
 return <div className="pt-loading" role="status" aria-busy="true" aria-label={label ?? portalContract.loading.sentence}>
  <Spinner size="sm" tone="accent" aria-hidden="true" role={undefined}/>
  <span className="pt-skeleton" aria-hidden="true"/><span className="pt-skeleton short" aria-hidden="true"/>
  <p>{portalContract.loading.sentence}</p>
 </div>;
}

/* A section of a category screen: a region with a heading, which is the landmark shape the accessibility
   floor asks for, drawn as the handoff's Card on the page's ground (portal.css, "One settings page"). The
   card's title is the region's name; `why`, where a screen has one, is the one line under it that says what
   the section is for, in the caller's contract's words. A Card is a <div>, so the region is named by role
   and label rather than by a <section> element — the same landmark to a screen reader. */
export function Region({ title, children, count, why }: { title: string; children: ReactNode; count?: number; why?: ReactNode }) {
 const id = `pt-r-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
 return <Card role="region" aria-labelledby={id} padding="md" className="pt-region pt-section">
  <h2 id={id} className="ui-card__title">{title}{count !== undefined && <span className="pt-count"> · {count}</span>}</h2>
  {why && <p className="pt-section-why">{why}</p>}
  {children}
 </Card>;
}

/* The one head every Control Tower screen wears, the settings screens and the founder's door included: an
   eyebrow saying whose screen and which area, the one <h1>, one lead sentence, and — where the screen has
   one — the status line of the gate or the build that holds it. A screen that heads itself (the dispatch
   board, the vetting queue) passes no title and keeps the eyebrow, because two <h1> elements on one page is
   a reader having to guess which one is the page. Every word is the caller's contract's; this draws them. */
export function PageHead({ eyebrow, title, titleId, lead, nav, status, className = '' }: {
 eyebrow: ReactNode; title?: string; titleId?: string; lead?: string; nav?: ReactNode; status?: ReactNode; className?: string;
}) {
 return <header className={`pt-head ${className}`}>
  <div>
   <div className="eyebrow pt-head-eyebrow">{eyebrow}</div>
   {title && <h1 id={titleId}>{title}</h1>}
   {title && lead && <p className="pt-head-lead">{lead}</p>}
  </div>
  {/* A category's own tabs sit above its status line, so on a phone the way to the next screen is never
      under a paragraph about the category. */}
  {nav}
  {status && <div className="pt-head-status">{status}</div>}
 </header>;
}

/* ---- Figures -------------------------------------------------------------------------------------
   The portal's figure card is the handoff's MetricCard: its name as the label, one numeral as the value,
   the chip beside the label as a Badge and, where there is one, the note under the numeral. A card never
   carries a number the caller did not count; this file draws what it is handed.

   The pastel tints the figures wore until 28 September 2026 are retired with the rest of the pastel
   system: every figure is a white card, and the one a screen is about is the elevated card with the
   primary rule along its top — emphasis by elevation, not by a colour chosen for it. The name under
   every numeral is what tells two figures apart, as it always was.

   The note sits in MetricCard's trend slot, which is the line under the value; a note is not a trend, so
   portal.css sets it in the muted ink rather than the trend's green, which would say "up" about a count
   that went nowhere. */

/* A share drawn as a ring. It is presentation only — aria-hidden, because the numeral and the chip beside
   it say the same arithmetic in words — and it rises once from empty when the card arrives, on
   stroke-dashoffset alone, only while the portal's motion is on; reduced motion draws it where it ends.
   Inside a figure it sits in the card's corner (portal.css), laid over the card rather than inside
   MetricCard, which has no slot for a drawing. */
export function Ring({ share, size = 64 }: { share: number; size?: number }) {
 const drawn = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
 return <svg className="pt-ring" viewBox="0 0 36 36" width={size} height={size} aria-hidden="true" focusable="false">
  <circle className="pt-ring-track" cx="18" cy="18" r="15" pathLength={100}/>
  {drawn > 0 && <circle className="pt-ring-fill" cx="18" cy="18" r="15" pathLength={100} style={{ strokeDashoffset: 100 - drawn * 100 }}/>}
 </svg>;
}

export type FigureItem = { readonly name: string; readonly value: string; readonly chip?: string; readonly note?: string; readonly share?: number; readonly lead?: boolean };
export function Figures({ label, items }: { label: string; items: readonly FigureItem[] }) {
 return <ul className="pt-figures" aria-label={label}>
  {items.map(f => <li key={f.name} className={cx('pt-figure', f.lead && 'is-lead', f.share !== undefined && 'has-ring')}>
   <MetricCard label={f.name} value={f.value} trend={f.note} variant={f.lead ? 'elevated' : 'default'}
    icon={f.chip ? <Badge variant={f.lead ? 'primary' : 'neutral'} size="sm" className="pt-figure-chip">{f.chip}</Badge> : undefined}/>
   {f.share !== undefined && <Ring share={f.share} size={56}/>}
  </li>)}
 </ul>;
}
