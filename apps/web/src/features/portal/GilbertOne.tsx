import { G1Mark } from '../../components/G1Mark';
import { portalContract, portalRefusal } from '../../lib/portal';
import { Frame } from './Frame';
import { BuildWord, Empty, Region, RovingList } from './Parts';

/* GilbertOne API Administration, as Phase 3 is allowed to draw it: the category, its mark, and a written
 * statement that it is not built — Phase 4, behind gates G29 to G32, G35, G14 and G10.
 *
 * The seven sub-screens are listed by name with the contract each would read and the gate it waits on,
 * so the category says what it will be. None of them is drawn, and this file renders no control: no
 * key field, no provider switch, no dark-mode button. The assistant is live in production, and a screen
 * that looked as if it could configure it — or switch it off — would be the most dangerous thing in the
 * portal to mistake for real. scripts/check-boundaries.mjs fails the build if a sub-screen appears
 * under apps/web/src before Phase 4. */
export function GilbertOneCategory() {
 const g1 = portalContract.gilbertone;
 return <Frame>
  <div className="pt-g1-state">
   <G1Mark className="pt-g1-large" title="GilbertOne"/>
   <div><BuildWord id={g1.status}/><p>{g1.sentence}</p></div>
  </div>
  <Empty heading={portalRefusal('no-gilbertone-sub-screen-before-phase-4')}>{g1.why}</Empty>
  <Region title="The seven sub-screens Phase 4 would build" count={g1.subScreens.length}>
   <RovingList label={`${g1.subScreens.length} sub-screens, none of them built`} rows={g1.subScreens.map(s => ({
    key: s.id,
    content: <><strong>{s.label}</strong><BuildWord id={g1.status}/><span>Gate {s.gate} · reads <code>{s.contract}</code></span></>
   }))}/>
  </Region>
 </Frame>;
}
