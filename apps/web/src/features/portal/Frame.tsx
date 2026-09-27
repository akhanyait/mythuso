import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionTitle } from '../../components/UI';
import { G1Mark } from '../../components/G1Mark';
import { categoryById, headingOf, tabOf, tabsOf } from '../../lib/portal';
import { roleOf } from '../../lib/roles';
import { usePortal } from './context';
import { PageHead, Tablist } from './Parts';

/* Every category screen, framed the same way: the category as the eyebrow, the tab as the one <h1>
   with a sentence saying what it is for, the tabs as one tab list, and the category's More tools as
   a list of links at the foot. It is the "one header" of §5.2 below the portal's own top bar — the two
   surfaces this replaced headed their screens three different ways.

   A tab whose screen heads itself (the dispatch board, the vetting queue, Quality) gets the eyebrow
   and nothing else, because two <h1> elements on one page is a reader having to guess which one is
   the page. */
export function Frame({ blurb, status, children }: { blurb?: string; status?: ReactNode; children: ReactNode }) {
 const { place, go, open } = usePortal();
 const category = categoryById(place.category);
 const tab = tabOf(category, place.tab);
 const tabs = tabsOf(category);
 const sentence = tab.blurb ?? blurb;
 const tools = (category as { tools?: string[] }).tools ?? [];
 const marked = (category as { mark?: string }).mark === 'G1';
 return <>
  {/* Whose screen, then which category: the Control Tower is what both old roles open now, so the eyebrow
      says it on every category the way the workspace said it on every section. The head is Parts.tsx's
      PageHead, the one every screen wears; `status` is the category's own line — GilbertOne's build word. */}
  <PageHead className="page-intro pt-intro"
   eyebrow={<><span>{roleOf('control-tower').label.toUpperCase()}</span><span aria-hidden="true">·</span>{marked && <G1Mark className="pt-g1"/>}<span>{category.label}</span></>}
   title={tab.headsItself ? undefined : headingOf(tab)} lead={sentence} status={status}
   nav={tabs.length > 1 ? <Tablist label={`${category.label} tabs`} items={tabs} selected={tab.id}
    onSelect={id => go(category.id, id)} idPrefix="pt-sub" panelId="pt-subpanel" className="pt-subtabs"/> : undefined}/>
  {/* pt-stagger: what a screen draws arrives in three short steps when the screen opens, and a strip of
      figures or a list of rows inside it does the same card by card (portal.css, "Every screen arrives"). */}
  <div className="pt-panel pt-stagger" id="pt-subpanel" role={tabs.length > 1 ? 'tabpanel' : undefined}
   aria-labelledby={tabs.length > 1 ? `pt-sub-${tab.id}` : undefined}>{children}</div>
  {tools.length > 0 && <>
   <SectionTitle title="More tools"/>
   <div className="tool-links">{tools.map(tool =>
    <button className="tool-link" key={tool} onClick={() => open(tool)}>{tool}<ArrowUpRight size={16}/></button>)}</div>
  </>}
 </>;
}
