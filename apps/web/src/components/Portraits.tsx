/* The design calls for photography. docs/ARCHITECTURE.md forbids real patient or staff photos in
   the preview, so every photo slot is filled with a flat illustration instead. The originals live in
   packages/illustrations and are rasterised into the iOS and Android bundles by
   scripts/render-illustrations.mjs, so all three apps show the same artwork. Each slot is a drop-in
   point: swap the source for licensed, consented photography and the layout does not change. */
import nurse from '../../../../packages/illustrations/nurse.svg';
import patient from '../../../../packages/illustrations/patient.svg';
import family from '../../../../packages/illustrations/family.svg';
export function NursePortrait() {
 return <img src={nurse} alt="Illustration of a registered nurse" className="portrait-nurse"/>;
}
export function PatientPortrait() {
 return <img src={patient} alt="" className="portrait-round"/>;
}
export function FamilyScene() {
 return <img src={family} alt="Illustration of a family" className="portrait-family"/>;
}
/* Service-card artwork. Deliberately abstract rather than a stock photo: a soft tinted panel with
   the service's own symbol, so the grid keeps the mockup's visual rhythm without inventing people. */
const tints = [['#e2f1ec', '#0e7c6b'], ['#fbeee3', '#b5814f'], ['#f6e9f0', '#a97392'], ['#e6eefa', '#5c81ab']];
export function CardArt({ index, children }: { index: number; children?: React.ReactNode }) {
 const [bg, fg] = tints[index % tints.length];
 return <span className="card-photo" aria-hidden="true">
  <svg viewBox="0 0 74 74" preserveAspectRatio="none">
   <rect width="74" height="74" fill={bg}/>
   <circle cx="60" cy="14" r="26" fill={fg} opacity=".12"/>
   <circle cx="14" cy="62" r="18" fill={fg} opacity=".08"/>
  </svg>
  <span className="card-photo-mark" style={{ color: fg }}>{children}</span>
 </span>;
}
