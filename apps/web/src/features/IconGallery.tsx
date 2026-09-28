/* The MyThuso icon family, laid out to be looked at: every icon of packages/catalog/icons.json at 24
   and 48 pixels with its signal pulsing, and the sentence that says when it is used.

   Development builds only. App.tsx reaches this behind `import.meta.env.DEV` and a dynamic import,
   so a production build never emits it and the patient's first view never pays for it. It is not a
   screen of the product — no icon is wired into one yet — and it is not the Control Tower's, which
   another wave is changing. It is what tests/icons.spec.ts opens, and what a person opens to see
   the family on the real tokens rather than in a design file. */
import { myThusoIcons } from '../ui/icons/MyThusoIcons.generated';
import './icon-gallery.css';

const SIZES = [24, 48] as const;

export function IconGallery() {
 return <section className="glass icon-gallery" aria-labelledby="icon-gallery-heading" data-icon-gallery>
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
 </section>;
}
