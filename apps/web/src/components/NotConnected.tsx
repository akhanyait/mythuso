import { Info } from 'lucide-react';
import { noticeFor } from '../lib/capabilities';
/* The one way a screen says it is not wired to anything yet.
 *
 * It renders nothing when the capability is connected, which is the whole point: nobody has to
 * remember to go and delete a banner when an integration lands, because there is no banner to
 * delete. There is a boolean in packages/catalog/capabilities.json and a build that refuses to let
 * it be flipped without evidence.
 *
 * One per screen. The nurse's schedule carried three — a pill, an eyebrow and a paragraph, filling
 * the space above the first visit of her day — and a reader told the same thing three times has
 * been told it none. */

type Props = {
 /** An id in packages/catalog/capabilities.json. Unknown ids throw rather than render nothing. */
 of: string;
 /** `inline` for inside a card or a list row; the default sits above a screen's content. */
 tone?: 'block' | 'inline';
};

export function NotConnected({ of, tone = 'block' }: Props) {
 const notice = noticeFor(of);
 if (!notice) return null;
 /* role="note" rather than "status": it is true when the screen loads and does not change, so
    announcing it as a live update would interrupt a screen reader mid-sentence for old news. */
 return (
  <p className={`not-connected ${tone}`} role="note">
   <Info size={tone === 'inline' ? 14 : 17} aria-hidden="true"/>
   <span>{notice}</span>
  </p>
 );
}
