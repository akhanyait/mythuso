import { ArrowRight, History } from 'lucide-react';
import portal from '../../../../../packages/catalog/control-tower-portal.json' with { type: 'json' };
import { ROLE_PARAM, slugOfSection } from '../../lib/roles';

/* The parallel run's one sentence, on the two old surfaces while they are kept for comparison.
 *
 * docs/control-tower-cutover.md: for one release cycle the Control Tower workspace and the back office
 * stay reachable at an explicit address and nowhere else, read-only, and a control that would act is
 * refused with this sentence and a link to the same place in the portal. The sentence is the plan's own,
 * held in packages/catalog/control-tower-portal.json so that it is written once.
 *
 * The link names the section the old way — ?category=vetting-queue — and the portal resolves it through
 * its legacy address table. That is deliberate: it is the same path an old bookmark written by hand
 * would take, so the notice exercises the thing it promises. */
export default function LegacyNotice({ surface, section }: { surface: 'control-tower' | 'back-office'; section: string }) {
 const href = `${window.location.pathname}?${ROLE_PARAM}=${surface}&${portal.context.categoryParam}=${slugOfSection(section)}`;
 return <p className="legacy-notice" role="note">
  <History size={18} aria-hidden="true"/>
  <span>{portal.legacy.sentence}</span>
  <a href={href}>{portal.legacy.linkLabel}<ArrowRight size={16} aria-hidden="true"/></a>
 </p>;
}
