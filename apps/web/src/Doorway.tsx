import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import App from './App';
import { RoleContext } from './features/DemoLogin';
import { roleFromSearch, roleOf, searchForRole, type RoleId } from './lib/roles';

/* One address, and a role you pick.
 *
 * There were four entries with a door each. The founder's instruction was one: "create auto logins
 * for all the user roles instead of creating different entry points". This is that — and the part
 * worth reading is what it deliberately did *not* do, which is put four applications in one bundle.
 *
 * apps/web/vite.config.ts argues at length that the split exists so a patient on a mid-range phone
 * on metered data does not download a dispatch board, a vetting queue and an operations console in
 * order to look at her own visits. Merging the addresses does not change a word of that. So the
 * patient application is the entry — it is what the address means with no role on it, and it is
 * therefore what must never wait for anything — and the two other surfaces arrive on a dynamic
 * import when somebody asks for them, stylesheets included. Measured, gzipped, at the entry's own
 * first load: 287.2 kB before the merge and 286.6 kB after it, with the clinical workspaces (32.5
 * kB of shell, 38.5 kB of screens, 10.0 kB of stylesheet) and the back office (6.8 kB) behind the
 * dynamic import. It is not a saving worth celebrating; it is the number that had to not move, and
 * the only reason to write it down is that this is the change where it could quietly have.
 *
 * The role lives in the address bar and nowhere else. No storage: the rule that keeps patient data
 * out of this preview covers which workspace somebody was last looking at. What that buys, besides
 * obedience, is that a role becomes a link — /app/?role=doctor opens the review queue — which is
 * what makes this an auto login rather than a menu.
 */

/* Two chunks, not five. The four clinical roles are one application wearing four sets of navigation,
   so they share a chunk; the back office is a different audience and a different set of screens.
   Named imports would defeat the split, so these are the whole modules. */
const ClinicalWorkspace = lazy(() => import('./shells/StaffShell'));
const BackOffice = lazy(() => import('./shells/AdminShell'));

export default function Doorway() {
 const [role, setRoleState] = useState<RoleId>(() => roleFromSearch(window.location.search));
 /* Back and forward have to work. A role is a URL, so a reader who presses Back after opening the
    dispatch board expects her own visits again, and a switcher that only wrote forward would give
    her a page that did not change. */
 useEffect(() => {
  const onPop = () => setRoleState(roleFromSearch(window.location.search));
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
 }, []);
 const setRole = useCallback((next: RoleId) => {
  setRoleState(current => {
   if (current === next) return current;
   /* pushState rather than replaceState, so the switch is a place a person can come back from. */
   window.history.pushState(null, '', `${window.location.pathname}${searchForRole(window.location.search, next)}${window.location.hash}`);
   return next;
  });
 }, []);
 const { surface, workspace } = roleOf(role);
 return <RoleContext.Provider value={{ role, setRole }}>
  {surface === 'patient' ? <App/>
   : <Suspense fallback={<Opening role={role}/>}>
      {workspace ? <ClinicalWorkspace role={workspace}/> : <BackOffice/>}
     </Suspense>}
 </RoleContext.Provider>;
}

/* What a person sees while a workspace is on its way.
 *
 * It says the true thing rather than spinning: this code was not downloaded until you asked for it,
 * which is why there is a wait at all and why there was not one on the screen before. On a fast
 * connection it is one frame; on the connection this product is designed for it is the difference
 * between a blank screen and an explained one. Nothing here animates — a spinner that runs forever
 * is the one piece of motion this codebase refuses outright. */
function Opening({ role }: { role: RoleId }) {
 const { label, opensTo } = roleOf(role);
 /* No `.clinical` and no `.aurora`: both live in the sheet that travels with the workspace, so a
     fallback wearing them would be unstyled for exactly as long as it is on the screen. */
 return <div className="opening">
  <div className="opening-card" role="status">
   <p className="eyebrow">OPENING</p>
   <h1>{label}</h1>
   <p className="muted">{opensTo}</p>
   <p className="helper">This workspace is downloading now. It is not part of what the patient application loads, which is why it was not already here.</p>
  </div>
 </div>;
}
