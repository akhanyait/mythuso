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
