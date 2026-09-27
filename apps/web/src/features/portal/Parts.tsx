import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { buildWordOf, portalContract, statusOf } from '../../lib/portal';

/* The portal's shared parts: the tab list, the roving list, the tree, the status word, the written
   empty state and the loading state. Every category draws with these, which is the whole of what
   "one navigation pattern" and "one status vocabulary" (§5.2) mean in code — a category cannot grow a
   second way of saying either without writing a second component, and the build would see it.

   The keyboard rules are docs/control-tower-accessibility.md's, and they are the reason this file
   exists rather than each screen handling its own keys: a tab list is one Tab stop with the arrows
   moving between tabs and activating them, Home and End at the ends, focus wrapping; a list is one
   Tab stop with Up and Down moving between rows. Nothing here sets a positive tabindex, and nothing
   sets outline: none — the ring is core.css's two-ring :focus-visible, drawn from the tokens. */

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
   who has learnt one pair should not find it dead on the other layout. */
export function Tablist({ label, items, selected, onSelect, idPrefix, panelId, orientation = 'horizontal', className = '' }: {
 label: string; items: readonly TabItem[]; selected: string; onSelect: (id: string) => void;
 idPrefix: string; panelId: string; orientation?: 'horizontal' | 'vertical'; className?: string;
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
 return <div role="tablist" aria-label={label} aria-orientation={orientation} className={`pt-tablist ${orientation} ${className}`}>
  {items.map((item, index) => {
   const current = item.id === selected;
   return <button key={item.id} ref={el => { refs.current[index] = el; }} type="button" role="tab" id={`${idPrefix}-${item.id}`}
    aria-selected={current} aria-controls={panelId} tabIndex={current ? 0 : -1} className="pt-tab"
    onClick={() => onSelect(item.id)} onKeyDown={event => onKeyDown(event, index)}>
    {item.icon}<span>{item.label}</span>
   </button>;
  })}
 </div>;
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

/* A service's state: the word first and the colour second, so nothing is carried by colour alone.
   The sentence is the contract's own. */
export function Status({ id, withSentence = false }: { id: string; withSentence?: boolean }) {
 const word = statusOf(id);
 return <span className="pt-status-wrap">
  <span className={`pt-status is-${word.id}`}>{word.id}</span>
  {withSentence && <span className="pt-status-sentence">{word.sentence}</span>}
 </span>;
}
/* How far a thing is built, in the plan's §2 words. */
export function BuildWord({ id }: { id: string }) {
 const word = buildWordOf(id);
 return <span className={`pt-build is-${word.id}`} title={word.sentence}>{word.id}</span>;
}

/* A written empty state: a sentence that says why there is nothing, never a blank region (§5.2). */
export function Empty({ children, heading }: { children: ReactNode; heading?: string }) {
 return <div className="pt-empty" role="note">{heading && <strong>{heading}</strong>}<p>{children}</p></div>;
}

/* A panel on its way. aria-busy on its region and an accessible name, and nothing that animates —
   a spinner that runs forever is the one piece of motion this codebase refuses outright. */
export function Loading({ label }: { label?: string }) {
 return <div className="pt-loading" role="status" aria-busy="true" aria-label={label ?? portalContract.loading.sentence}>
  <span className="pt-skeleton" aria-hidden="true"/><span className="pt-skeleton short" aria-hidden="true"/>
  <p>{portalContract.loading.sentence}</p>
 </div>;
}

/* A section of a category screen: a region with a heading, which is the landmark shape the
   accessibility floor asks for. */
export function Region({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
 const id = `pt-r-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
 return <section className="pt-region" aria-labelledby={id}>
  <h2 id={id}>{title}{count !== undefined && <span className="pt-count"> · {count}</span>}</h2>
  {children}
 </section>;
}

/* ---- Figures -------------------------------------------------------------------------------------
   The portal's figure card: one large numeral, its name under it, a small chip above and, where the
   figure is a share of something a contract or a register actually holds, a ring drawing that share.
   A card never carries a number the caller did not count; this file draws what it is handed.

   The tints are the name's, never the position's. core.css records why the old tint-1/2/3 rotation
   went: colour chosen by an index is decoration in the shape of meaning, and a reordered strip
   recoloured everything. A tint chosen from the figure's own name is at least stable — "Open
   incidents" is the same colour on every screen that draws it and wherever it moves in a strip — and
   it is never the only thing that tells two figures apart: the name is always written under the
   numeral. The one figure a screen is about is the dark card instead, which is emphasis, not a tint. */
/* Mint, lavender, peach and pale green — the reference's four, from the design tokens themselves rather
   than from the clinical shell's remapped studio colours (portal.css, "The card tints"). */
export type Tint = 'mint' | 'lavender' | 'peach' | 'lime';
const TINTS: readonly Tint[] = ['mint', 'lavender', 'peach', 'lime'];
const hashOf = (name: string) => [...name].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 7);
/* The tints of a set of figures shown together. Each name starts at its own tint and, if a name before
   it alphabetically already holds that one, takes the next free; so two cards side by side are never
   the same colour, and what decides a card's colour is the set of names on the screen and never the
   order they are drawn in. */
export function tintsFor(names: readonly string[]): ReadonlyMap<string, Tint> {
 const taken = new Set<Tint>();
 const tints = new Map<string, Tint>();
 for (const name of [...names].sort()) {
  const start = hashOf(name) % TINTS.length;
  const tint = TINTS.map((_, step) => TINTS[(start + step) % TINTS.length]!).find(t => !taken.has(t)) ?? TINTS[start]!;
  taken.add(tint);
  tints.set(name, tint);
 }
 return tints;
}

/* A share drawn as a ring. It is presentation only — aria-hidden, because the numeral and the chip beside
   it say the same arithmetic in words — and it rises once from empty when the card arrives, on
   stroke-dashoffset alone, only while the portal's motion is on; reduced motion draws it where it ends. */
export function Ring({ share, size = 64 }: { share: number; size?: number }) {
 const drawn = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
 return <svg className="pt-ring" viewBox="0 0 36 36" width={size} height={size} aria-hidden="true" focusable="false">
  <circle className="pt-ring-track" cx="18" cy="18" r="15" pathLength={100}/>
  {drawn > 0 && <circle className="pt-ring-fill" cx="18" cy="18" r="15" pathLength={100} style={{ strokeDashoffset: 100 - drawn * 100 }}/>}
 </svg>;
}

export type FigureItem = { readonly name: string; readonly value: string; readonly chip?: string; readonly note?: string; readonly share?: number; readonly lead?: boolean };
export function Figures({ label, items }: { label: string; items: readonly FigureItem[] }) {
 const tints = tintsFor(items.filter(f => !f.lead).map(f => f.name));
 return <ul className="pt-figures" aria-label={label}>
  {items.map(f => <li key={f.name} className="pt-figure" data-tint={f.lead ? 'night' : tints.get(f.name)}>
   <span className="pt-figure-top"><span className="pt-dot" aria-hidden="true"/>{f.chip && <span className="pt-figure-chip">{f.chip}</span>}</span>
   <span className="pt-figure-body">
    <strong className="pt-figure-value">{f.value}</strong>
    {f.share !== undefined && <Ring share={f.share}/>}
   </span>
   <span className="pt-figure-name">{f.name}</span>
   {f.note && <small className="pt-figure-note">{f.note}</small>}
  </li>)}
 </ul>;
}
