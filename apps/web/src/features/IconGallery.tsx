/* The MyThuso icon family, laid out to be looked at: every icon of packages/catalog/icons.json at 24
   and 48 pixels with its signal pulsing, and the sentence that says when it is used.

   Development builds only. App.tsx reaches this behind `import.meta.env.DEV` and a dynamic import,
   so a production build never emits it and the patient's first view never pays for it. It is not a
   screen of the product — no icon is wired into one yet — and it is not the Control Tower's, which
   another wave is changing. It is what tests/icons.spec.ts opens, and what a person opens to see
   the family on the real tokens rather than in a design file.

   Since 30 September 2026 it carries the rest of the handoff's iconography page, below the family and
   outside its section, so the family's own counts are untouched: the official GilbertOne logo with its
   usage rule, the Lucide utility set the family's own rule reserves Lucide for, and one family icon at
   the four sizes a screen may wear it. The logo's rule is the handoff's design guidelines' paragraph,
   in packages/catalog/gilbertone-logo.json, a copy the build holds to the paragraph word for word; the
   family's four rules are icons.json's. The utility set is only icons none of the family's entries names
   as a concept it owns (icons.json's neverBeside), because the build refuses a file that imports a family icon beside a Lucide one for the same idea. */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Copy, Download, ExternalLink, Filter, Minus, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import icons from '../../../../packages/catalog/icons.json' with { type: 'json' };
import logo from '../../../../packages/catalog/gilbertone-logo.json' with { type: 'json' };
import { MyThusoHealthIcon, myThusoIcons } from '../ui/icons/MyThusoIcons.generated';
import './icon-gallery.css';

const SIZES = [24, 48] as const;
const STANDARD = [16, 20, 24, 32] as const;
const UTILITY = { Search, X, Download, Copy, ExternalLink, Filter, Plus, Minus, MoreHorizontal, ChevronDown, ChevronRight, ArrowLeft, ArrowRight, ArrowUp, ArrowDown };
/* The guidelines' paragraph about the official logo — packages/catalog/gilbertone-logo.json's checked copy, since no
   screen may load a file from the handoff — and the verbs its "never" clause names. */
const logoRule = logo.usage;
const nevers = (logoRule.match(/never ([^;.]+?) the character/)?.[1] ?? '').split(/,\s*(?:or\s+)?|\s+or\s+/).map(v => v.trim()).filter(Boolean);

export function IconGallery() {
 return <>
  <section className="glass icon-gallery" aria-labelledby="icon-gallery-heading" data-icon-gallery>
   <h1 id="icon-gallery-heading">MyThuso icon family</h1>
   <p className="helper">Development only. Each icon at 24 and 48 pixels, its signal pulsing as it would for something live. Nothing on this page is a screen a patient will see.</p>
   <ul className="icon-gallery-list">
    {myThusoIcons.map(({ id, name, meaning, Icon }) => <li key={id} data-gallery-icon={id}>
     <span className="icon-gallery-sizes">{SIZES.map(size => <Icon key={size} width={size} height={size} animated aria-label={`${name}, ${size} pixels`}/>)}</span>
     {/* Beside its name, the way a screen will wear it: decorative, unlabelled, and so hidden from assistive technology by default. */}
     <strong><Icon width={16} height={16} data-decorative/> {name}</strong>
     <small>{meaning}</small>
    </li>)}
   </ul>
  </section>

  <section className="icon-gallery icon-gallery-more" aria-label="Logo, utility icons and sizes">
   <h2>The rules</h2>
   <ul className="icon-gallery-rules">{icons.rules.map(rule => <li key={rule.id}>{rule.sentence}</li>)}</ul>

   <h2>GilbertOne, the official logo</h2>
   <div className="icon-gallery-logo">
    <div className="icon-gallery-logo-plate">
     <img src="/lovable/gilbertone-logo-360.webp" srcSet="/lovable/gilbertone-logo-360.webp 360w, /lovable/gilbertone-logo-720.webp 720w" sizes="240px" alt="GilbertOne" width="360" height="270"/>
    </div>
    <div className="icon-gallery-logo-rules">
     <p>{logoRule}</p>
     {nevers.length > 0 && <ul>{nevers.map(verb => <li key={verb}>Never {verb}</li>)}</ul>}
    </div>
   </div>

   <h2>Utility icons (Lucide)</h2>
   <ul className="icon-gallery-utility">{Object.entries(UTILITY).map(([name, Icon]) => <li key={name}><Icon aria-hidden="true" size={24}/><code>{name}</code></li>)}</ul>

   <h2>Standard sizes</h2>
   <ul className="icon-gallery-standard">{STANDARD.map(size => <li key={size}><MyThusoHealthIcon width={size} height={size} data-decorative/><code>{size} px</code></li>)}</ul>
  </section>
 </>;
}
